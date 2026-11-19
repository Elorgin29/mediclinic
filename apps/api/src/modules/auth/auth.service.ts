/**
 * Règles métier de l'authentification.
 *
 * Sécurité :
 *  - mots de passe hachés en bcrypt (12 rounds par défaut) ;
 *  - jetons d'accès JWT courts + jetons de rafraîchissement opaques, hachés en
 *    base et **à usage unique** (rotation systématique) ;
 *  - message d'erreur identique pour un email inconnu et un mot de passe
 *    erroné, et comparaison bcrypt systématique, afin de ne pas révéler
 *    l'existence d'un compte (protection contre l'énumération) ;
 *  - toutes les tentatives sont journalisées dans `audit_logs`.
 */

import {
  type AuthSession,
  type AuthTokens,
  type LoginInput,
  type RegisterPatientInput,
  type User,
} from '@mediclinic/shared';
import bcrypt from 'bcrypt';

import { env } from '../../config/env.js';
import {
  accessTokenTtlMs,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from '../../config/jwt.js';
import { AppError } from '../../utils/app-error.js';
import { writeAuditLog } from '../../utils/audit-logger.js';
import * as repository from './auth.repository.js';
import type { CredentialsRecord, UserRecord } from './auth.repository.js';

/** Contexte technique d'une tentative de connexion (journalisation). */
export interface AuthContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Condensat factice utilisé lorsque l'email est inconnu : la comparaison bcrypt
 * a lieu malgré tout, ce qui égalise le temps de réponse.
 */
const DUMMY_HASH = '$2b$12$2f9IKYQ7jtC9/VnBGH/JPucdDkFch2w6z9TlTpFc.iWqDgNF711d3.';

/** Découpe un `GROUP_CONCAT` en tableau. */
function splitList(value: string | null): string[] {
  return value ? value.split(',').filter((item) => item.length > 0) : [];
}

/** Convertit une ligne SQL en objet `User` exposé par l'API. */
export function toUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    first_name: record.first_name,
    last_name: record.last_name,
    phone: record.phone,
    is_active: Boolean(record.is_active),
    last_login_at: record.last_login_at === null ? null : String(record.last_login_at),
    created_at: String(record.created_at),
    roles: splitList(record.roles),
    permissions: splitList(record.permissions),
    patient_id: record.patient_id,
    doctor_id: record.doctor_id,
  };
}

/** Hache un mot de passe avec le nombre de rounds configuré. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

/** Émet un couple (jeton d'accès, jeton de rafraîchissement) pour un utilisateur. */
async function issueTokens(
  user: User,
  context: AuthContext,
): Promise<{ tokens: AuthTokens; refreshTokenHash: string }> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
  });

  const refresh = generateRefreshToken();

  await repository.insertRefreshToken({
    userId: user.id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  return {
    tokens: {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: accessTokenTtlMs,
    },
    refreshTokenHash: refresh.tokenHash,
  };
}

/** Construit une session complète à partir d'un identifiant utilisateur. */
export async function issueSession(userId: number, context: AuthContext): Promise<AuthSession> {
  const record = await repository.findUserById(userId);
  if (!record) throw AppError.unauthorized('Compte introuvable.', 'USER_NOT_FOUND');

  const user = toUser(record);
  const { tokens } = await issueTokens(user, context);
  return { user, tokens };
}

/**
 * Authentifie un utilisateur.
 * @throws AppError 401 si l'email est inconnu, le mot de passe erroné ou le compte désactivé.
 */
export async function login(input: LoginInput, context: AuthContext): Promise<AuthSession> {
  const record: CredentialsRecord | null = await repository.findUserByEmail(input.email);

  const passwordMatches = await bcrypt.compare(input.password, record?.password_hash ?? DUMMY_HASH);

  if (!record || !passwordMatches) {
    await writeAuditLog({
      userId: record?.id ?? null,
      action: 'LOGIN_FAILED',
      resource: 'auth',
      resourceId: record?.id ?? null,
      newValue: { email: input.email },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    throw AppError.unauthorized('Email ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }

  if (!record.is_active) {
    await writeAuditLog({
      userId: record.id,
      action: 'LOGIN_FAILED',
      resource: 'auth',
      resourceId: record.id,
      newValue: { email: input.email, reason: 'ACCOUNT_DISABLED' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    throw AppError.forbidden('Votre compte a été désactivé. Contactez l’administrateur.', 'ACCOUNT_DISABLED');
  }

  const user = toUser(record);
  const { tokens } = await issueTokens(user, context);

  await repository.touchLastLogin(user.id);
  await writeAuditLog({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    resource: 'auth',
    resourceId: user.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return { user: { ...user, last_login_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }, tokens };
}

/**
 * Rafraîchit une session à partir d'un jeton opaque.
 * Le jeton présenté est révoqué et remplacé (rotation à usage unique) : un
 * jeton volé ne peut donc pas être rejoué indéfiniment.
 */
export async function refresh(refreshToken: string, context: AuthContext): Promise<AuthSession> {
  const tokenHash = hashToken(refreshToken);
  const stored = await repository.findRefreshToken(tokenHash);

  if (!stored) {
    throw AppError.unauthorized('Jeton de rafraîchissement inconnu.', 'REFRESH_TOKEN_INVALID');
  }
  if (stored.revoked_at !== null) {
    // Réutilisation d'un jeton déjà consommé : on révoque toutes les sessions
    // de l'utilisateur par précaution (détection de vol de jeton).
    await repository.revokeAllRefreshTokens(stored.user_id);
    throw AppError.unauthorized(
      'Ce jeton a déjà été utilisé. Toutes vos sessions ont été révoquées.',
      'REFRESH_TOKEN_REUSED',
    );
  }
  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    await repository.revokeRefreshToken(tokenHash);
    throw AppError.unauthorized('Votre session a expiré, veuillez vous reconnecter.', 'REFRESH_TOKEN_EXPIRED');
  }

  const session = await issueSession(stored.user_id, context);
  await repository.revokeRefreshToken(tokenHash);
  return session;
}

/** Déconnecte l'utilisateur : révoque le jeton fourni. */
export async function logout(
  refreshToken: string | undefined,
  userId: number | null,
  context: AuthContext,
): Promise<void> {
  if (refreshToken) {
    await repository.revokeRefreshToken(hashToken(refreshToken));
  } else if (userId !== null) {
    await repository.revokeAllRefreshTokens(userId);
  }

  await writeAuditLog({
    userId,
    action: 'LOGOUT',
    resource: 'auth',
    resourceId: userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

/** Profil de l'utilisateur connecté. */
export async function getProfile(userId: number): Promise<User> {
  const record = await repository.findUserById(userId);
  if (!record) throw AppError.notFound('Utilisateur introuvable.', 'USER_NOT_FOUND');
  return toUser(record);
}

/** Inscription d'un nouveau patient : crée le compte et le dossier médical. */
export async function registerPatient(
  input: RegisterPatientInput,
  context: AuthContext,
): Promise<AuthSession> {
  const existing = await repository.findUserByEmail(input.email);
  if (existing) {
    throw AppError.conflict('Un compte existe déjà avec cet email.', 'EMAIL_ALREADY_USED');
  }

  const passwordHash = await hashPassword(input.password);

  const created = await repository.createPatientAccount({
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone ?? null,
    birthDate: input.birthDate,
    gender: input.gender,
    address: input.address ?? null,
    city: input.city ?? null,
    postalCode: input.postalCode ?? null,
    insuranceNumber: input.insuranceNumber ?? null,
  });

  await writeAuditLog({
    userId: created.userId,
    action: 'CREATE',
    resource: 'patient',
    resourceId: created.patientId,
    newValue: { email: input.email, source: 'inscription en ligne' },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return issueSession(created.userId, context);
}

/** Change le mot de passe de l'utilisateur connecté et révoque ses sessions. */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
  context: AuthContext,
): Promise<void> {
  const currentHash = await repository.findPasswordHash(userId);
  if (!currentHash) throw AppError.notFound('Utilisateur introuvable.', 'USER_NOT_FOUND');

  const matches = await bcrypt.compare(currentPassword, currentHash);
  if (!matches) {
    throw AppError.unauthorized('Le mot de passe actuel est incorrect.', 'INVALID_CURRENT_PASSWORD');
  }

  const sameAsBefore = await bcrypt.compare(newPassword, currentHash);
  if (sameAsBefore) {
    throw AppError.badRequest('Le nouveau mot de passe doit être différent de l’ancien.', 'PASSWORD_UNCHANGED');
  }

  await repository.updatePasswordHash(userId, await hashPassword(newPassword));
  await repository.revokeAllRefreshTokens(userId);

  await writeAuditLog({
    userId,
    action: 'UPDATE',
    resource: 'user',
    resourceId: userId,
    newValue: { field: 'password', sessionsRevoked: true },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

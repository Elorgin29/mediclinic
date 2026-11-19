/**
 * Routes du module d'authentification.
 *
 * Le limiteur de débit spécifique aux routes sensibles est appliqué au niveau
 * du routeur `app.ts` (`/api/auth`), en complément du limiteur global.
 */

import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

/** Connexion par email + mot de passe. */
authRouter.post('/login', controller.login);

/** Inscription en ligne d'un patient. */
authRouter.post('/register', controller.register);

/** Renouvellement de session (rotation du jeton de rafraîchissement). */
authRouter.post('/refresh', controller.refresh);

/** Déconnexion (révocation du jeton). */
authRouter.post('/logout', controller.logout);

/** Profil de l'utilisateur connecté. */
authRouter.get('/me', authenticate, controller.me);

/** Changement de mot de passe du compte connecté. */
authRouter.post('/change-password', authenticate, controller.changePassword);

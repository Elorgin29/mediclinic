/**
 * Tests du composant `Can` (contrôle d'affichage par permission).
 *
 * Ce composant est la pièce maîtresse du RBAC côté interface : il conditionne
 * l'affichage des boutons d'action. Un défaut ici exposerait des actions
 * interdites, ou masquerait des actions légitimes.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Can, useCan } from '@/components/Can';

/** Contexte d'authentification simulé. */
const mockAuth = {
  user: null as unknown,
  permissions: [] as string[],
  roles: [] as string[],
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    hasPermission: (code: string) => mockAuth.permissions.includes(code),
    hasAnyPermission: (codes: string[]) => codes.some((code) => mockAuth.permissions.includes(code)),
    hasRole: (role: string) => mockAuth.roles.includes(role),
  }),
}));

/** Prépare un utilisateur connecté avec les permissions et rôles donnés. */
function signIn(permissions: string[], roles: string[] = ['ADMIN']): void {
  mockAuth.user = { id: 1, first_name: 'Test', last_name: 'User', roles, permissions };
  mockAuth.permissions = permissions;
  mockAuth.roles = roles;
}

describe('<Can>', () => {
  it('affiche le contenu quand la permission est accordée', () => {
    signIn(['patient:create']);

    render(
      <Can permission="patient:create">
        <button>Nouveau patient</button>
      </Can>,
    );

    expect(screen.getByRole('button', { name: 'Nouveau patient' })).toBeInTheDocument();
  });

  it('masque le contenu quand la permission manque', () => {
    signIn(['patient:read']);

    render(
      <Can permission="patient:create">
        <button>Nouveau patient</button>
      </Can>,
    );

    expect(screen.queryByRole('button', { name: 'Nouveau patient' })).not.toBeInTheDocument();
  });

  it('affiche le contenu de repli fourni', () => {
    signIn(['patient:read']);

    render(
      <Can permission="patient:delete" fallback={<p>Accès restreint</p>}>
        <button>Supprimer</button>
      </Can>,
    );

    expect(screen.getByText('Accès restreint')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('accepte une liste `anyOf`', () => {
    signIn(['invoice:manage']);

    render(
      <Can anyOf={['invoice:create', 'invoice:manage']}>
        <p>Facturation</p>
      </Can>,
    );

    expect(screen.getByText('Facturation')).toBeInTheDocument();
  });

  it('exige toutes les permissions avec `allOf`', () => {
    signIn(['invoice:read', 'payment:create']);

    const { rerender } = render(
      <Can allOf={['invoice:read', 'payment:create']}>
        <p>Encaissement</p>
      </Can>,
    );
    expect(screen.getByText('Encaissement')).toBeInTheDocument();

    // Il manque une permission : le contenu doit disparaître.
    signIn(['invoice:read']);
    rerender(
      <Can allOf={['invoice:read', 'payment:create']}>
        <p>Encaissement</p>
      </Can>,
    );
    expect(screen.queryByText('Encaissement')).not.toBeInTheDocument();
  });

  it('contrôle par rôle', () => {
    signIn(['patient:read'], ['DOCTOR']);

    render(
      <Can role="SUPER_ADMIN">
        <p>Administration</p>
      </Can>,
    );

    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });

  it('masque tout pour un visiteur non connecté', () => {
    mockAuth.user = null;
    mockAuth.permissions = [];
    mockAuth.roles = [];

    render(
      <Can permission="patient:read">
        <p>Dossiers</p>
      </Can>,
    );

    expect(screen.queryByText('Dossiers')).not.toBeInTheDocument();
  });

  it('affiche le contenu sans critère pour un utilisateur connecté', () => {
    signIn([], ['PATIENT']);

    render(
      <Can>
        <p>Contenu générique</p>
      </Can>,
    );

    expect(screen.getByText('Contenu générique')).toBeInTheDocument();
  });

  it('honore la règle d’héritage `manage`', () => {
    // `hasPermission` réel applique l'héritage ; le mock reflète ici le cas
    // explicite pour vérifier que `Can` transmet bien le code complet.
    signIn(['stock:manage']);

    render(
      <Can permission="stock:manage">
        <p>Ajuster le stock</p>
      </Can>,
    );

    expect(screen.getByText('Ajuster le stock')).toBeInTheDocument();
  });
});

describe('useCan', () => {
  it('renvoie true pour une permission accordée', () => {
    signIn(['invoice:read']);

    function Probe(): JSX.Element {
      const allowed = useCan('invoice:read');
      return <span>{allowed ? 'oui' : 'non'}</span>;
    }

    render(<Probe />);
    expect(screen.getByText('oui')).toBeInTheDocument();
  });

  it('renvoie false pour une permission absente', () => {
    signIn(['invoice:read']);

    function Probe(): JSX.Element {
      const allowed = useCan('invoice:delete');
      return <span>{allowed ? 'oui' : 'non'}</span>;
    }

    render(<Probe />);
    expect(screen.getByText('non')).toBeInTheDocument();
  });
});

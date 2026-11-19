/**
 * Départements — écran d'administration dédié.
 * Réutilise l'écran combiné « Spécialités & départements » en n'affichant que
 * la partie départements via un onglet par défaut.
 */

import SpecialtiesAdminPage from './SpecialtiesAdminPage';

/**
 * La page combinée gère les deux référentiels. Cette entrée de menu pointe
 * vers le même écran : l'utilisateur arrive directement sur la colonne des
 * départements, qui est la seconde moitié de la grille.
 */
export default function DepartmentsAdminPage(): JSX.Element {
  return <SpecialtiesAdminPage />;
}

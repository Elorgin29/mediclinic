/**
 * Amorçage des tests du front.
 *
 * `@testing-library/jest-dom` ajoute les matchers DOM (`toBeInTheDocument`…).
 * Le nettoyage du DOM est automatique depuis Testing Library 16, mais on le
 * rend explicite pour garantir l'isolation entre fichiers de test.
 */

import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();

  // `localStorage` n'est pas toujours exposé comme global selon la version de
  // jsdom : on passe par `window` et on reste défensif.
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

// `matchMedia` n'existe pas dans jsdom : le sélecteur de thème en a besoin.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// `ResizeObserver` est utilisé par Recharts dans les graphiques du dashboard.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// `scrollTo` est appelé par React Router lors des navigations.
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
}

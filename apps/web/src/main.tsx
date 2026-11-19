/**
 * Point d'entrée de l'application React.
 *
 * Ordre des fournisseurs : requêtes → authentification → routeur → notifications.
 * L'ordre importe : le routeur consomme le contexte d'authentification, qui
 * lui-même n'a pas besoin du routeur.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';

import { AppRoutes } from '@/routes/AppRoutes';
import { AuthProvider } from '@/contexts/AuthContext';
import { queryClient } from '@/lib/queryClient';
import { themeStorage } from '@/lib/utils';

import './index.css';

// Le thème est appliqué avant le premier rendu pour éviter un flash blanc.
themeStorage.apply(themeStorage.get());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Élément #root introuvable dans index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{ duration: 4500 }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

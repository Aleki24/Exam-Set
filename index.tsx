
import React from 'react';
import { createRoot } from 'react-dom/client';
import RootLayout from './app/layout';
import Home from './app/page';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <RootLayout>
        <Home />
      </RootLayout>
    </React.StrictMode>
  );
}

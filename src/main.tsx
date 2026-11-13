import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, MemoryRouter } from 'react-router-dom';
import { AppProvider } from './lib/app';
import App from './App';
import { isDemo } from './lib/supabase';
import './styles.css';

// Some viewers (like the hosted demo preview) block confirm() dialogs; the demo skips them.
if (isDemo) window.confirm = () => true;

// The hosted demo page doesn't allow app paths in its address, so it keeps the current screen in memory.
const Router = isDemo ? MemoryRouter : HashRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AppProvider>
        <App />
      </AppProvider>
    </Router>
  </StrictMode>,
);

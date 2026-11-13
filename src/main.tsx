import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, MemoryRouter } from 'react-router-dom';
import { AppProvider } from './lib/app';
import App from './App';
import { ConfirmProvider } from './components/Confirm';
import { isDemo } from './lib/supabase';
import './styles.css';


// The hosted demo page doesn't allow app paths in its address, so it keeps the current screen in memory.
const Router = isDemo ? MemoryRouter : HashRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AppProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </AppProvider>
    </Router>
  </StrictMode>,
);

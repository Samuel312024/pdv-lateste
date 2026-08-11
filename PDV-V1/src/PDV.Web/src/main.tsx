import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ScannerSessionProvider } from './contexts/ScannerSessionContext';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import { theme } from './theme';

const RootBoundary = import.meta.env.DEV ? React.Fragment : React.StrictMode;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RootBoundary>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          body: {
            background:
              'radial-gradient(circle at top left, rgba(255, 199, 113, 0.24), transparent 35%), radial-gradient(circle at bottom right, rgba(25, 118, 210, 0.18), transparent 30%), linear-gradient(180deg, #f6f3ec 0%, #eef3f6 100%)',
            minHeight: '100vh'
          }
        }}
      />
      <SnackbarProvider maxSnack={3} autoHideDuration={3000} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <ScannerSessionProvider>
              <App />
            </ScannerSessionProvider>
          </AuthProvider>
        </BrowserRouter>
      </SnackbarProvider>
    </ThemeProvider>
  </RootBoundary>
);

void registerServiceWorker();

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) {
    return;
  }

  const hostname = window.location.hostname.toLowerCase();
  const isLocalDevelopmentHost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (import.meta.env.DEV && !isLocalDevelopmentHost) {
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Falha ao registrar o service worker do PDV.', error);
    }
  }
}

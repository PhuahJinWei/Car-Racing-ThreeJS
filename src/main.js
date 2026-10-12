import './style.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import { App } from './app.js';

const app = new App();
app.init();

if (import.meta.env.DEV) window.__app = app;

// Installable / offline-capable in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // a new version's worker takes over a few seconds after the page opens: reload once so it's what
  // you see (a first visit has no worker to replace, so no reload)
  const updating = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

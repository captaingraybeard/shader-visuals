import { App } from './app';

const app = new App();

app.init().catch((err) => {
  console.error('Failed to initialize app:', err);
  document.body.innerHTML = `
    <div style="color:#fff;font-family:system-ui;padding:2rem;text-align:center;">
      <h1>Failed to start</h1>
      <p>${err.message || 'Unknown error'}</p>
    </div>
  `;
});

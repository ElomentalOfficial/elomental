import { defineConfig, type Plugin } from 'vite';

/**
 * A beta build (VITE_ENV=beta: beta.elomental.online) installs as its own app: the beta
 * manifest and icons (public/beta, icons/build-app-icons.mjs), named "Elo Beta" on the home
 * screen and "Beta · Elomental" in the tab, so it is never taken for the live game. Live builds
 * leave index.html as it is.
 */
const betaHome = (): Plugin => ({
  name: 'beta-home',
  transformIndexHtml(html) {
    if (process.env.VITE_ENV !== 'beta') return html;
    return html
      .replace('href="./manifest.webmanifest"', 'href="./manifest.beta.webmanifest"')
      .replace('href="./apple-touch-icon.png"', 'href="./beta/apple-touch-icon.png"')
      .replace(/href="\.\/favicon-(\d+)\.png"/g, 'href="./beta/favicon-$1.png"')
      .replace('name="apple-mobile-web-app-title" content="Elomental"', 'name="apple-mobile-web-app-title" content="Elo Beta"')
      .replace('<title>Elomental</title>', '<title>Beta · Elomental</title>');
  },
});

export default defineConfig({
  // Relative base so the build works under GitHub Pages' /elomental/ path and locally.
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  plugins: [betaHome()],
});

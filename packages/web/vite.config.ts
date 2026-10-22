import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';

/**
 * The build's name: its number (the commits up to it, so it only goes up, and live and beta
 * built from the same code share it), the commit's date and short hash. Shown at the bottom of
 * Setup and published as build.json on each site, so "live is on 405, beta on 412" reads at a
 * glance (docs/BETA.md). The deploys check out the whole history for the count.
 */
const git = (args: string) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const BUILD = {
  number: git('rev-list --count HEAD') || '0',
  sha: git('rev-parse --short=7 HEAD') || 'local',
  date: git('log -1 --format=%cs') || new Date().toISOString().slice(0, 10),
};
process.env.VITE_BUILD_NUMBER = BUILD.number;
process.env.VITE_BUILD_SHA = BUILD.sha;
process.env.VITE_BUILD_DATE = BUILD.date;

/** build.json next to index.html: which build a site serves, and whether it's beta. */
const buildFile = (): Plugin => ({
  name: 'build-file',
  apply: 'build',
  generateBundle() {
    const env = process.env.VITE_ENV === 'beta' ? 'beta' : 'live';
    this.emitFile({ type: 'asset', fileName: 'build.json', source: `${JSON.stringify({ ...BUILD, number: Number(BUILD.number), env })}\n` });
  },
});

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
  plugins: [betaHome(), buildFile()],
});

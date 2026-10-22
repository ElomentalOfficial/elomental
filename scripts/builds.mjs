// Which build live and beta serve (their build.json, vite.config.ts), and how far apart they are.
// npm run builds
const SITES = { live: 'https://elomental.online/build.json', beta: 'https://beta.elomental.online/build.json' };

const read = async (url) => {
  try {
    const res = await fetch(`${url}?${Date.now()}`, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

const builds = Object.fromEntries(await Promise.all(Object.entries(SITES).map(async ([name, url]) => [name, await read(url)])));
for (const [name, b] of Object.entries(builds)) {
  console.log(`${name.padEnd(5)} ${b ? `build ${b.number} · ${b.date} · ${b.sha}` : 'no build.json yet (deployed before build names)'}`);
}
const { live, beta } = builds;
if (live && beta) {
  const ahead = beta.number - live.number;
  console.log(ahead > 0 ? `beta is ${ahead} commit${ahead === 1 ? '' : 's'} ahead of live` : ahead === 0 ? 'live and beta are on the same build' : `live is ${-ahead} ahead of beta`);
}

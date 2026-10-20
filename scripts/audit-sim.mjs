// Elomental progression audit: Monte Carlo of three player personas over 180 days, using
// the live rules (supabase/migrations/…_simple_economy.sql, …_elo_curve.sql,
// …_gentler_losses.sql, profile.ts tiers). Optionally with Stardust sinks (--sinks).
// `node scripts/audit-sim.mjs [players] [--sinks]` → writes docs/audit/sim.json
import { mkdirSync, writeFileSync } from 'node:fs';

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 10000);
const SINKS = process.argv.includes('--sinks');
const DAYS = 180;

// ---------------------------------------------------------------- rules (as live)
const DUST = { daily: 12, ranked: 20, easy: 4, medium: 8, hard: 15 };
const ODDS = [['common', 0.62], ['rare', 0.28], ['epic', 0.08], ['mythic', 0.02]];
const DUPE = { common: 20, rare: 50, epic: 120, mythic: 300 };
const COST = { common: 100, rare: 250, epic: 600, mythic: 1200 };
const SET = { common: 16, rare: 16, epic: 10, mythic: 6 };
const SLOTS_BY_RARITY = { // which slots each rarity's parts are in (per element ×4)
  common: ['backdrop', 'backdrop', 'frame', 'sigil'],
  rare: ['backdrop', 'frame', 'sigil', 'aura'],
};
const arg = (k, d) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1]);
const PARTS_PER_DAY = arg('cap', 30); // solves counted toward parts each day (live: 30)
const COSTX = arg('costx', 1);         // forge price multiplier (live: 1)
const lerp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
const K = [[600, 60], [1600, 28], [2400, 16], [3200, 10], [4800, 8]];
const LOSS = [[500, 0.5], [1200, 1], [1600, 1.25], [2400, 1.5], [3200, 2]];
function eloDelta(player, puzzle, won) {
  const e = 1 / (1 + 10 ** ((puzzle - player) / 400));
  const k = lerp(K, player);
  if (won) return Math.round(k * (1 - e));
  if (player < 500) return 0;
  return -Math.round(k * e * lerp(LOSS, player));
}
const TIERS = [['Apprentice', 600], ['Adept', 1200], ['Elementalist', 2000], ['Archmage', 3000]];

// ---------------------------------------------------------------- personas
let seed = 12345;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const PERSONAS = {
  casual: { games: [3, 5], ranked: 0.1, daily: 0.8, casualMix: { easy: 0.3, medium: 0.55, hard: 0.15 }, skill: [900, 300], solve: 0.9, missDaily: 0.35 },
  regular: { games: [10, 15], ranked: 0.5, daily: 0.95, casualMix: { easy: 0.1, medium: 0.5, hard: 0.4 }, skill: [1500, 400], solve: 0.93, missDaily: 0.1 },
  grinder: { games: [40, 50], ranked: 0.85, daily: 1, casualMix: { easy: 0, medium: 0.3, hard: 0.7 }, skill: [2300, 500], solve: 0.96, missDaily: 0.02 },
};
const pick = (mix) => { let x = rnd(); for (const [k, p] of Object.entries(mix)) { if (x < p) return k; x -= p; } return Object.keys(mix).at(-1); };

// ---------------------------------------------------------------- sinks (proposed, --sinks)
// spending policy: keep a reserve for the next part, then buy what the persona cares about
const POLISH = [200, 400, 800, 1600, 3200]; // per owned part, levels I–V
const PLATES = [1000, 2500, 6000, 12000];  // name plate: Bronze, Silver, Gold, Starlit
const STAR = 2500;                           // a season star, unlimited
const MEND = 300;                            // restore a missed Daily, max 3 a month

function simulate(name, p) {
  const out = { day: { stardust: [], owned: [], elo: [] }, firsts: [], tierDays: [], ends: [] };
  for (let d = 0; d < DAYS; d++) { out.day.stardust.push([]); out.day.owned.push([]); out.day.elo.push([]); }
  for (let n = 0; n < N; n++) {
    const skill = p.skill[0] + p.skill[1] * gauss();
    let elo = 100, dust = 0, crowns = 0, crownPity = 0, progress = 0, pityE = 0, pityM = 0;
    const owned = { common: 0, rare: 0, epic: 0, mythic: 0 };
    const ownedSlots = new Set();
    let first = { rare: null, epic: null, mythic: null, avatar: null, full: null, forge: null };
    const tierDay = {};
    let earned = 0, spent = { forge: 0, sinks: 0 }, sunk = { polish: 0, plates: 0, stars: 0, mends: 0 };
    let partsOwnedList = 0, mendsThisMonth = 0;
    for (let day = 0; day < DAYS; day++) {
      if (day % 30 === 0) mendsThisMonth = 0;
      const games = p.games[0] + Math.floor(rnd() * (p.games[1] - p.games[0] + 1));
      let counted = 0;
      let missedDaily = rnd() < p.missDaily;
      for (let g = 0; g < games; g++) {
        let mode = g === 0 && !missedDaily && rnd() < p.daily ? 'daily' : rnd() < p.ranked ? 'ranked' : pick(p.casualMix);
        let won;
        if (mode === 'ranked') won = rnd() < 1 / (1 + 10 ** ((elo - skill) / 400));
        else won = rnd() < p.solve;
        if (mode === 'ranked') {
          let delta = eloDelta(elo, elo, won);
          if (won && delta > 0) delta = Math.round(delta * 1.1); // typical speed bonus
          elo = Math.max(0, elo + delta);
          for (const [t, at] of TIERS) if (tierDay[t] === undefined && elo >= at) tierDay[t] = day + 1;
        }
        if (!won) continue;
        const mistakes = rnd() < 0.5 ? 0 : rnd() < 0.7 ? 1 : 2, hints = rnd() < 0.8 ? 0 : 1;
        const base = DUST[mode] ?? DUST.medium;
        const got = Math.max(1, base - mistakes * 2 - hints);
        dust += got; earned += got;
        crownPity++; if (crownPity >= 40 || rnd() < 0.03) { crowns++; crownPity = 0; }
        if (counted >= PARTS_PER_DAY) continue;
        counted++;
        progress = (progress + 1) % 3;
        if (progress !== 0) continue;
        // a part
        let x = rnd(), r = 'common';
        for (const [k, q] of ODDS) { if (x < q) { r = k; break; } x -= q; }
        if (pityM + 1 >= 25 && r !== 'mythic') r = 'mythic';
        else if (pityE + 1 >= 10 && (r === 'common' || r === 'rare')) r = 'epic';
        pityE = r === 'epic' || r === 'mythic' ? 0 : pityE + 1;
        pityM = r === 'mythic' ? 0 : pityM + 1;
        if (first[r] === null && r !== 'common') first[r] = day + 1;
        const unowned = SET[r] - owned[r];
        // three times likelier to pick one you don't own
        const pNew = unowned === 0 ? 0 : (3 * unowned) / (3 * unowned + owned[r]);
        if (rnd() < pNew) { owned[r]++; partsOwnedList++; }
        else { dust += DUPE[r]; earned += DUPE[r]; }
      }
      // forge missing parts, cheapest first (mythic needs a crown)
      for (const r of ['common', 'rare', 'epic', 'mythic']) {
        while (owned[r] < SET[r] && dust >= COST[r] * COSTX && (r !== 'mythic' || crowns >= 1)) {
          dust -= COST[r] * COSTX; spent.forge += COST[r] * COSTX; owned[r]++; partsOwnedList++;
          if (r === 'mythic') crowns--;
          if (first.forge === null) first.forge = day + 1;
        }
      }
      // first avatar: a backdrop, sigil, frame and aura (any) — approximated by counts
      const total = owned.common + owned.rare + owned.epic + owned.mythic;
      if (first.avatar === null && owned.common >= 3 && (owned.rare >= 1 || owned.epic >= 1)) first.avatar = day + 1;
      if (first.full === null && total === 48) first.full = day + 1;
      // sinks (proposal), only once the set is worth little more
      if (SINKS) {
        if (missedDaily && mendsThisMonth < 3 && dust >= MEND + 200) { dust -= MEND; sunk.mends++; mendsThisMonth++; spent.sinks += MEND; }
        const reserve = total < 48 ? 1300 : 400;
        let guard = 0;
        while (dust > reserve && guard++ < 50) {
          // cheapest available upgrade first: polish levels across owned parts, then a plate, then stars
          const nextPolish = sunk.polish < total * 5 ? POLISH[Math.floor(sunk.polish / Math.max(total, 1))] : Infinity;
          const nextPlate = sunk.plates < PLATES.length ? PLATES[sunk.plates] : Infinity;
          // a name plate is a goal players save for: bought first when it's affordable; then polish; stars once all is polished to III
          const polishTo3 = sunk.polish >= total * 3;
          const options = [[nextPlate, 'plates'], [nextPolish, 'polish'], [total === 48 && polishTo3 ? STAR : Infinity, 'stars']];
          // (polish only from what's left over above the next plate's savings)
          const saving = nextPlate === Infinity ? 0 : nextPlate;
          const [cost, what] = options.find(([c, w]) => c !== Infinity && dust - c >= reserve + (w === 'plates' ? 0 : saving)) ?? [Infinity, null];
          if (cost === Infinity || dust - cost < reserve) break;
          dust -= cost; spent.sinks += cost; sunk[what]++;
        }
      }
      out.day.stardust[day].push(dust);
      out.day.owned[day].push(total);
      out.day.elo[day].push(elo);
    }
    out.firsts.push(first);
    out.tierDays.push({ ...tierDay, final: elo, skill });
    out.ends.push({ earned, spent, sunk, crowns });
  }
  return out;
}

// ---------------------------------------------------------------- summarise
const q = (arr, p) => { const a = arr.filter((v) => v !== null && v !== undefined).sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const share = (arr) => arr.filter((v) => v !== null && v !== undefined).length / arr.length;
const result = { players: N, sinks: SINKS, personas: {} };
for (const [name, p] of Object.entries(PERSONAS)) {
  const t0 = Date.now();
  const s = simulate(name, p);
  const at = (series, day, pct) => q(series[day - 1], pct);
  const firsts = (k) => ({ median: q(s.firsts.map((f) => f[k]), 0.5), worst10: q(s.firsts.map((f) => f[k]), 0.9), reached: share(s.firsts.map((f) => f[k])) });
  const tiers = Object.fromEntries(TIERS.map(([t]) => [t, { median: q(s.tierDays.map((x) => x[t]), 0.5), worst10: q(s.tierDays.map((x) => x[t]), 0.9), reached: share(s.tierDays.map((x) => x[t])) }]));
  result.personas[name] = {
    firsts: { rare: firsts('rare'), epic: firsts('epic'), mythic: firsts('mythic'), firstForge: firsts('forge'), firstAvatar: firsts('avatar'), fullSet: firsts('full') },
    stardust: Object.fromEntries([30, 90, 180].map((d) => [d, { p10: at(s.day.stardust, d, 0.1), median: at(s.day.stardust, d, 0.5), p90: at(s.day.stardust, d, 0.9) }])),
    owned: Object.fromEntries([7, 30, 90, 180].map((d) => [d, at(s.day.owned, d, 0.5)])),
    elo: Object.fromEntries([7, 30, 90, 180].map((d) => [d, at(s.day.elo, d, 0.5)])),
    tiers,
    earned180: q(s.ends.map((e) => e.earned), 0.5),
    sunk180: SINKS ? { polish: q(s.ends.map((e) => e.sunk.polish), 0.5), plates: q(s.ends.map((e) => e.sunk.plates), 0.5), stars: q(s.ends.map((e) => e.sunk.stars), 0.5), mends: q(s.ends.map((e) => e.sunk.mends), 0.5) } : null,
    curves: {
      stardust: s.day.stardust.map((day) => [q(day, 0.1), q(day, 0.5), q(day, 0.9)]),
      owned: s.day.owned.map((day) => [q(day, 0.1), q(day, 0.5), q(day, 0.9)]),
      elo: s.day.elo.map((day) => [q(day, 0.1), q(day, 0.5), q(day, 0.9)]),
    },
  };
  console.log(name, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
mkdirSync('docs/audit', { recursive: true });
const tag = process.argv.find((a) => a.startsWith('--tag='))?.split('=')[1] ?? (SINKS ? 'sinks' : 'live');
result.cap = PARTS_PER_DAY; result.costx = COSTX;
writeFileSync(`docs/audit/sim-${tag}.json`, JSON.stringify(result));
for (const [name, r] of Object.entries(result.personas)) {
  console.log(`\n== ${name}`);
  console.log(' firsts (day):', JSON.stringify(r.firsts));
  console.log(' stardust:', JSON.stringify(r.stardust));
  console.log(' parts owned (median):', JSON.stringify(r.owned), ' elo median:', JSON.stringify(r.elo));
  console.log(' tiers:', JSON.stringify(r.tiers));
  console.log(' earned 180d:', r.earned180, r.sunk180 ? ` sunk: ${JSON.stringify(r.sunk180)}` : '');
}

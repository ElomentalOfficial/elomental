// Elomental economy review sim (2026-10-20). A copy of scripts/audit-sim.mjs brought up to the
// LIVE rules (supabase/migrations through 20261020071349_leaderboard.sql; finish_game from
// 20261020054008_dev_mode.sql), kept outside the repo.
//
// Live rules modelled:
//   Stardust per solve: Casual 4/8/15, Daily 12, Ranked 20, minus 2 per mistake and 1 per hint (min 1)
//   Counted solves: the first 9 won squares of a UTC day. On each: Spirit roll (0.15%, guaranteed at 700),
//     then part progress; every 3rd counted solve drops one part.
//   Part rarity 62/28/8/2; Epic-or-better forced on the 10th part, Mythic on the 25th.
//   Part pick inside a rarity: ORDER BY rand() * (owned ? 1 : 3) * (own element ? 2 : 1) DESC LIMIT 1
//     (an argmax, not proportional sampling: modelled exactly).
//   Set: 11 avatars (Happy free + 5 Common, 3 Rare, 2 Epic, 1 Mythic) + 12 frames (Common/Rare/Epic per element).
//   Duplicates 20/50/120/300. Forge 100/250/600/1200.
//   Bring to life: 6000 Stardust + 1 Spirit, once per owned avatar (Happy included: 12 max).
//   Plates 1000/2500/6000/12000 in order. Fill in a missed Daily: 300, 3 a month.
//   Monthly affinity win: +300 to every contributor of the winning side (modelled as 1 in 4).
//   Elo: elo_k / elo_loss_multiplier curves, no loss below 500, target = clamp(elo, 150, 4800),
//     speed bonus ~ +10% on wins, hint cut 25% per hint.
//
// `node eco-sim.mjs <tag> [players] [--spirit=0.0015] [--spiritPity=700] [--cap=9]
//    [--summon=0] (Stardust price of "Call a Spirit", one a month; 0 = off)
//    [--mythicFrames=0] (Mythic frames added, one per element) [--active=1] (share of days played)`
// Writes <out>/sim-<tag>.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('.', import.meta.url));
const TAG = process.argv[2] ?? 'live';
const N = Number(process.argv.slice(3).find((a) => /^\d+$/.test(a)) ?? 10000);
const arg = (k, d) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1]);
const DAYS = 180;
const SPIRIT_P = arg('spirit', 0.0015);
const SPIRIT_PITY = arg('spiritPity', 700);
const CAP = arg('cap', 9);
const SUMMON = arg('summon', 0);
const SUMMON_STEP = arg('summonStep', 0); // > 0: no monthly limit, the price rises by this much per Spirit called this season
const MYTHIC_FRAMES = arg('mythicFrames', 0);
const ACTIVE = arg('active', 1);
const SEED = arg('seed', 12345);
const PROPORTIONAL = process.argv.includes('--proportional'); // pick a part with probability proportional to its weight (power(rand, 1/w))
const MONTH_NEED = arg('monthNeed', 30); // days (of 30) solved or filled in for a complete month
const MEND_EARLY = !process.argv.includes('--mendAtEnd'); // fill in as soon as a miss happens (while the month can still be completed)

// ---------------------------------------------------------------- rules (as live)
const DUST = { daily: 12, ranked: 20, easy: 4, medium: 8, hard: 15 };
const ODDS = [['common', 0.62], ['rare', 0.28], ['epic', 0.08], ['mythic', 0.02]];
const DUPE = { common: 20, rare: 50, epic: 120, mythic: 300 };
const COST = { common: 100, rare: 250, epic: 600, mythic: 1200 };
const LIFE = 6000;
const PLATES = [1000, 2500, 6000, 12000];
const MEND = 300;
const ELEMENTS = ['fire', 'water', 'earth', 'air'];

// the catalogue (craft parts of Season 0, as in the live DB)
const PARTS = [];
for (const [n, r] of [['bored', 'common'], ['calm', 'common'], ['upset', 'common'], ['sad', 'common'], ['disappointed', 'common'],
  ['silly', 'rare'], ['angry', 'rare'], ['tired', 'rare'], ['excited', 'epic'], ['scared', 'epic'], ['shocked', 'mythic']])
  PARTS.push({ id: `avatar-${n}`, slot: 'avatar', element: null, rarity: r });
for (const e of ELEMENTS) {
  PARTS.push({ id: `frame-${e}-1`, slot: 'frame', element: e, rarity: 'common' });
  PARTS.push({ id: `frame-${e}-2`, slot: 'frame', element: e, rarity: 'rare' });
  PARTS.push({ id: `frame-${e}-3`, slot: 'frame', element: e, rarity: 'epic' });
  if (MYTHIC_FRAMES) PARTS.push({ id: `frame-${e}-4`, slot: 'frame', element: e, rarity: 'mythic' });
}
PARTS.forEach((p, i) => (p.i = i));
const SETSIZE = PARTS.length;
const POOL = Object.fromEntries(['common', 'rare', 'epic', 'mythic'].map((r) => [r, PARTS.filter((p) => p.rarity === r)]));
const AVATARS = PARTS.filter((p) => p.slot === 'avatar').length + 1; // + Happy

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

// ---------------------------------------------------------------- personas (solves a day, per the brief)
let seed = SEED;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const PERSONAS = {
  casual: { solves: [3, 5], ranked: 0.1, missDaily: 0.2, casualMix: { easy: 0.3, medium: 0.55, hard: 0.15 }, skill: [900, 300], solve: 0.9 },
  regular: { solves: [10, 15], ranked: 0.5, missDaily: 0.1, casualMix: { easy: 0.1, medium: 0.5, hard: 0.4 }, skill: [1500, 400], solve: 0.93 },
  grinder: { solves: [40, 50], ranked: 0.85, missDaily: 0.02, casualMix: { easy: 0, medium: 0.3, hard: 0.7 }, skill: [2300, 500], solve: 0.96 },
};
const pick = (mix) => { let x = rnd(); for (const [k, p] of Object.entries(mix)) { if (x < p) return k; x -= p; } return Object.keys(mix).at(-1); };

function simulate(p) {
  const S = { stardust: [], owned: [], elo: [], lives: [], plates: [] };
  for (let d = 0; d < DAYS; d++) for (const k in S) S[k].push(new Float64Array(N));
  const per = [];
  for (let n = 0; n < N; n++) {
    const skill = p.skill[0] + p.skill[1] * gauss();
    const aff = ELEMENTS[Math.floor(rnd() * 4)];
    let elo = 100, dust = 0, spirits = 0, spiritPity = 0, progress = 0, pityE = 0, pityM = 0, plate = 0, lives = 0;
    const owned = new Uint8Array(SETSIZE); let ownedN = 0; const ownedAv = () => 1 + PARTS.filter((q) => q.slot === 'avatar' && owned[q.i]).length;
    const f = { rare: null, epic: null, mythic: null, full: null, spirit: null, life1: null, life2: null, life3: null, bronze: null, gold: null, top: null };
    const tierDay = {};
    let earned = 0, fromDupes = 0, spiritsEarned = 0, spiritsFromPity = 0, spiritsCalled = 0, epicPity = 0, mythicPity = 0, mythicDupes = 0, parts = 0;
    let mends = 0, monthsComplete = 0, missedThisMonth = 0, mendsThisMonth = 0, calledThisMonth = 0, playedMonth = false;
    let seasonStart = null, eloAt30 = null;
    for (let day = 0; day < DAYS; day++) {
      if (day % 30 === 0) {
        if (day > 0) {
          // month end: complete if every day solved or filled in
          if (missedThisMonth <= 30 - MONTH_NEED) monthsComplete++;
          if (playedMonth && rnd() < 0.25) { dust += 300; earned += 300; }
        }
        missedThisMonth = 0; mendsThisMonth = 0; calledThisMonth = 0; playedMonth = false;
      }
      const plays = rnd() < ACTIVE;
      let wins = 0;
      if (plays) {
        playedMonth = true;
        const target = p.solves[0] + Math.floor(rnd() * (p.solves[1] - p.solves[0] + 1));
        let attempts = 0, dailyDone = false;
        const dailyTry = rnd() >= p.missDaily;
        if (!dailyTry) missedThisMonth++;
        while (wins < target && attempts < target * 3) {
          attempts++;
          let mode;
          if (attempts === 1 && dailyTry) mode = 'daily';
          else mode = rnd() < p.ranked ? 'ranked' : pick(p.casualMix);
          let won, hints = rnd() < 0.8 ? 0 : 1;
          const mistakes = rnd() < 0.5 ? 0 : rnd() < 0.7 ? 1 : 2;
          if (mode === 'ranked') {
            const puzzle = Math.min(Math.max(elo, 150), 4800);
            won = rnd() < 1 / (1 + 10 ** ((puzzle - skill) / 400));
            let delta = eloDelta(elo, puzzle, won);
            if (won && delta > 0) delta = Math.round(delta * 1.1 * (1 - 0.25 * hints));
            if (seasonStart === null) seasonStart = elo;
            elo = Math.max(0, elo + delta);
            for (const [t, at] of TIERS) if (tierDay[t] === undefined && elo >= at) tierDay[t] = day + 1;
          } else won = rnd() < p.solve;
          if (mode === 'daily') { dailyDone = won; if (!won) missedThisMonth++; }
          if (!won) continue;
          const got = Math.max(1, DUST[mode] - mistakes * 2 - hints);
          dust += got; earned += got;
          const counted = wins < CAP; // solved_today < 9
          wins++;
          if (!counted) continue;
          // Spirit first (finish_game), then the part
          spiritPity++;
          if (spiritPity >= SPIRIT_PITY || rnd() < SPIRIT_P) {
            if (spiritPity >= SPIRIT_PITY) spiritsFromPity++;
            spirits++; spiritsEarned++; spiritPity = 0; if (f.spirit === null) f.spirit = day + 1;
          }
          progress = (progress + 1) % 3;
          if (progress !== 0) continue;
          parts++;
          let x = rnd(), r = 'common';
          for (const [k, q] of ODDS) { if (x < q) { r = k; break; } x -= q; }
          if (pityM + 1 >= 25 && r !== 'mythic') { r = 'mythic'; mythicPity++; }
          else if (pityE + 1 >= 10 && (r === 'common' || r === 'rare')) { r = 'epic'; epicPity++; }
          pityE = r === 'epic' || r === 'mythic' ? 0 : pityE + 1;
          pityM = r === 'mythic' ? 0 : pityM + 1;
          if (r !== 'common' && f[r] === null) f[r] = day + 1;
          let best = null, bs = -1;
          for (const q of POOL[r]) { const w = (owned[q.i] ? 1 : 3) * (q.element === aff ? 2 : 1); const s = PROPORTIONAL ? rnd() ** (1 / w) : rnd() * w; if (s > bs) { bs = s; best = q; } }
          if (owned[best.i]) { dust += DUPE[r]; earned += DUPE[r]; fromDupes += DUPE[r]; if (r === 'mythic') mythicDupes++; }
          else { owned[best.i] = 1; ownedN++; }
        }
      } else missedThisMonth++;
      // ---- spending, end of day
      // 1. forge what's missing, cheapest first
      for (const r of ['common', 'rare', 'epic', 'mythic']) for (const q of POOL[r]) if (!owned[q.i] && dust >= COST[r]) { dust -= COST[r]; owned[q.i] = 1; ownedN++; }
      if (f.full === null && ownedN === SETSIZE) f.full = day + 1;
      // 2. fill in missed Dailies, only when the month can still be completed (â‰¤ 3 missed)
      const shortfall = Math.max(0, missedThisMonth - (30 - MONTH_NEED));
      const monthEnd = day % 30 === 29;
      if ((MEND_EARLY && MONTH_NEED === 30) || monthEnd) {
        if (shortfall > 0 && shortfall <= 3 - mendsThisMonth && dust >= MEND * shortfall) {
          dust -= MEND * shortfall; mends += shortfall; mendsThisMonth += shortfall; missedThisMonth -= shortfall;
        }
      }
      // 3. call a Spirit (proposal), once a month, only above a life's worth
      const callCost = SUMMON + SUMMON_STEP * spiritsCalled;
      if (SUMMON && (SUMMON_STEP > 0 || calledThisMonth === 0) && lives + spirits < ownedAv() && dust >= callCost + LIFE) { dust -= callCost; spirits++; spiritsCalled++; calledThisMonth = 1; }
      // 4. bring avatars to life while there are Spirits and avatars left
      while (spirits > 0 && lives < ownedAv() && dust >= LIFE) {
        dust -= LIFE; spirits--; lives++;
        if (lives === 1) f.life1 = day + 1; if (lives === 2) f.life2 = day + 1; if (lives === 3) f.life3 = day + 1;
      }
      // 5. plates, from what's above a life reserve (a life is the headline goal)
      const reserve = lives < ownedAv() ? LIFE : 0;
      while (plate < 4 && dust - PLATES[plate] >= (ownedN === SETSIZE ? reserve : 1300)) {
        dust -= PLATES[plate]; plate++;
        if (plate === 1) f.bronze = day + 1; if (plate === 3) f.gold = day + 1; if (plate === 4) f.top = day + 1;
      }
      S.stardust[day][n] = dust; S.owned[day][n] = ownedN; S.elo[day][n] = elo; S.lives[day][n] = lives; S.plates[day][n] = plate;
      if (day === 29) eloAt30 = elo;
    }
    for (const [t] of TIERS) f[t] = tierDay[t] ?? null;
    per.push({ f, skill, elo, eloAt30, seasonGain: elo - (seasonStart ?? elo), earned, fromDupes, spiritsEarned, spiritsFromPity, spiritsCalled, epicPity, mythicPity, mythicDupes, parts, mends, monthsComplete, lives, plate, dust, spiritsHeld: spirits });
  }
  return { S, per };
}

// ---------------------------------------------------------------- summarise
const qa = (arr, p) => { const a = Float64Array.from(arr.filter((v) => v !== null && v !== undefined)).sort(); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const share = (arr) => arr.filter((v) => v !== null && v !== undefined).length / arr.length;
const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
const result = { tag: TAG, players: N, rules: { SPIRIT_P, SPIRIT_PITY, CAP, SUMMON, SUMMON_STEP, MYTHIC_FRAMES, ACTIVE, SETSIZE, MONTH_NEED, MEND_EARLY, PROPORTIONAL }, personas: {} };
for (const [name, p] of Object.entries(PERSONAS)) {
  const t0 = Date.now();
  const { S, per } = simulate(p);
  const firsts = (k) => ({ median: qa(per.map((x) => x.f[k]), 0.5), worst10: qa(per.map((x) => x.f[k]), 0.9), reached: +share(per.map((x) => x.f[k])).toFixed(3) });
  const at = (series, d, pct) => qa(Array.from(series[d - 1]), pct);
  const tri = (series, d) => ({ p10: at(series, d, 0.1), median: at(series, d, 0.5), p90: at(series, d, 0.9) });
  const r = {
    firsts: Object.fromEntries(['rare', 'epic', 'mythic', 'full', 'spirit', 'life1', 'life2', 'life3', 'bronze', 'gold', 'top', ...TIERS.map((t) => t[0])].map((k) => [k, firsts(k)])),
    stardust: Object.fromEntries([30, 90, 180].map((d) => [d, tri(S.stardust, d)])),
    owned: Object.fromEntries([7, 14, 30, 60, 90, 180].map((d) => [d, tri(S.owned, d)])),
    lives: Object.fromEntries([30, 60, 90, 180].map((d) => [d, tri(S.lives, d)])),
    plates: Object.fromEntries([30, 90, 180].map((d) => [d, tri(S.plates, d)])),
    elo: Object.fromEntries([7, 30, 90, 180].map((d) => [d, tri(S.elo, d)])),
    end: {
      earned: qa(per.map((x) => x.earned), 0.5), dupeShare: +(mean(per.map((x) => x.fromDupes)) / mean(per.map((x) => x.earned))).toFixed(3),
      spiritsEarned: { p10: qa(per.map((x) => x.spiritsEarned), 0.1), median: qa(per.map((x) => x.spiritsEarned), 0.5), p90: qa(per.map((x) => x.spiritsEarned), 0.9), mean: +mean(per.map((x) => x.spiritsEarned)).toFixed(2) },
      spiritsFromGuaranteeShare: +(mean(per.map((x) => x.spiritsFromPity)) / Math.max(1e-9, mean(per.map((x) => x.spiritsEarned)))).toFixed(3),
      spiritsCalled: +mean(per.map((x) => x.spiritsCalled)).toFixed(2),
      spiritsHeldUnused: +mean(per.map((x) => x.spiritsHeld)).toFixed(2),
      parts: qa(per.map((x) => x.parts), 0.5),
      epicGuaranteeShare: +(mean(per.map((x) => x.epicPity)) / mean(per.map((x) => x.parts))).toFixed(3),
      mythicGuaranteeHits: +mean(per.map((x) => x.mythicPity)).toFixed(2), mythicDupes: +mean(per.map((x) => x.mythicDupes)).toFixed(2),
      mends: qa(per.map((x) => x.mends), 0.5), monthsComplete: +mean(per.map((x) => x.monthsComplete)).toFixed(2),
      eloMinusSkill30: qa(per.map((x) => x.eloAt30 - x.skill), 0.5), eloMinusSkill180: qa(per.map((x) => x.elo - x.skill), 0.5),
      seasonGain: { median: qa(per.map((x) => x.seasonGain), 0.5), p90: qa(per.map((x) => x.seasonGain), 0.9) },
      // a veteran's season: Elo moved between day 30 and day 180 (already at their level)
      gain30to180: { p10: qa(per.map((x) => x.elo - x.eloAt30), 0.1), median: qa(per.map((x) => x.elo - x.eloAt30), 0.5), p90: qa(per.map((x) => x.elo - x.eloAt30), 0.9) },
    },
    curves: {
      stardust: S.stardust.map((d) => [qa(Array.from(d), 0.1), qa(Array.from(d), 0.5), qa(Array.from(d), 0.9)]),
      owned: S.owned.map((d) => [qa(Array.from(d), 0.1), qa(Array.from(d), 0.5), qa(Array.from(d), 0.9)]),
      lives: S.lives.map((d) => [qa(Array.from(d), 0.1), qa(Array.from(d), 0.5), qa(Array.from(d), 0.9)]),
      elo: S.elo.map((d) => [qa(Array.from(d), 0.1), qa(Array.from(d), 0.5), qa(Array.from(d), 0.9)]),
    },
  };
  result.personas[name] = r;
  console.log(`\n== ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const { curves, ...rest } = r;
  console.log(JSON.stringify(rest));
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/sim-${TAG}.json`, JSON.stringify(result));

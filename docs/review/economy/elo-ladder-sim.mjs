// Ranked ladder redesign (docs/review/elo-ladder-2026-10-21-economy.md): live rules vs the proposal.
//
//   node docs/review/economy/elo-ladder-sim.mjs [players per persona = 10000] [days = 180]
//
// Players are modelled by technique, not by a hidden Elo: each persona has a per-step success
// chance for each technique family (1 intersections: pointing/claiming; 2 subsets: pairs and
// triples; 3 basic fish and wings: X-Wing, XY-Wing, Swordfish, XYZ-Wing, quads; 4 links and
// chains: Skyscraper, Kite, W-Wing, colouring, X/XY-Chain, ALS, Finned X-Wing; 5 big finned
// fish) and a scanning skill that falls with fewer clues. A square's win chance is
//   (1 - scanning failure at its clue count) x product over its steps of q[family].
// Each player gets a skill multiplier (lognormal, sigma 0.3) so a persona is a spread, not a point.
//
// LIVE squares follow generator.ts ratedProfile(rankedTarget(elo)) with the grader's rating
// (100 + 45 x hardest weight + 6 x advanced effort) inverted into step counts.
// PROPOSED squares come from the stage table below (one shape per Elo band).
// Elo maths mirrors profile.ts eloDelta / finish_game: even match, speed bonus, hint cut.

const N = Number(process.argv[2]) || 10000;
const DAYS = Number(process.argv[3]) || 180;

function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const along = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x0, y0] = pts[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

// family weights (techniques.ts): intersections 4, subsets ~6.5, fish/wings ~15, chains ~24, finned big fish ~33
const W = [0, 4, 6.5, 15, 24, 33];

// ------------------------------------------------------------------ personas
// q[f]: chance of finding and using one step of family f. base/perClue: scanning failure (3
// mistakes or concede) at 38 clues and per clue below 38. hint: share of wins using one hint.
// ceiling: the hardest family they solve reliably (learning variant: the next one up can be learnt).
const PERSONAS = {
  casual: { label: 'Casual (singles only)', q: [1, 0.6, 0.25, 0.04, 0.01, 0.005], base: 0.015, perClue: 0.012, hint: 0.2, ceiling: 0, share: 0.5 },
  medium: { label: 'Newspaper medium (pointing, pairs)', q: [1, 0.96, 0.85, 0.3, 0.08, 0.03], base: 0.01, perClue: 0.007, hint: 0.1, ceiling: 2, share: 0.35 },
  enthusiast: { label: 'Enthusiast (X-Wing, XY-Wing)', q: [1, 0.99, 0.97, 0.88, 0.4, 0.15], base: 0.005, perClue: 0.004, hint: 0.05, ceiling: 3, share: 0.12 },
  diehard: { label: 'Diehard (chains)', q: [1, 0.995, 0.99, 0.97, 0.88, 0.7], base: 0.002, perClue: 0.002, hint: 0.02, ceiling: 4, share: 0.03 },
};

function makePlayer(persona, seed) {
  const r = rng32(seed);
  const m = Math.min(Math.max(Math.exp(0.3 * gauss(r)), 0.55), 1.8);
  return { m, q: persona.q.map((q) => q ** (1 / m)), base: persona.base / m, perClue: persona.perClue / m };
}

function pWin(pl, sq) {
  const scan = Math.max(0, 1 - pl.base - pl.perClue * Math.max(0, 38 - sq.clues));
  let p = scan;
  for (let f = 1; f <= 5; f++) if (sq.n[f]) p *= pl.q[f] ** sq.n[f];
  return p;
}

// ------------------------------------------------------------------ live rules
const LIVE = {
  name: 'live',
  start: 100,
  protectedBelow: 500,
  k: [[600, 60], [1600, 28], [2400, 16], [3200, 10], [4800, 8]],
  loss: [[500, 0.5], [1200, 1], [1600, 1.25], [2400, 1.5], [3200, 2]],
  opponent: (elo) => Math.min(Math.max(Math.round(elo), 150), 3000),
  div: 400,
  tiers: [['Novice', 0], ['Apprentice', 600], ['Adept', 1200], ['Elementalist', 2000], ['Archmage', 3000]],
  steps: [0, 200, 400, 600, 800, 1000, 1200, 1450, 1700, 2000, 2350, 2700, 3000], // divisions
  square: liveSquare,
};

function liveTarget(elo) {
  const e = Math.min(Math.max(Math.round(elo), 150), 3000);
  return e <= 1200 ? e : 1200 + Math.floor((e - 1200) / 3);
}

// ratedProfile(target) and the grader's rating, inverted into steps.
function liveSquare(elo, r) {
  const target = liveTarget(elo);
  const t = target + (r() * 200 - 100); // the generator's ±100 window
  let maxLevel, minClues;
  if (target < 260) [maxLevel, minClues] = [1, 30];
  else if (target < 650) [maxLevel, minClues] = [2, 24];
  else if (target < 1150) [maxLevel, minClues] = [3, 22];
  else if (target < 1600) [maxLevel, minClues] = [4, 17];
  else [maxLevel, minClues] = [5, 17];
  const n = [0, 0, 0, 0, 0, 0];
  const clues = minClues + int(r, 0, 3);
  if (maxLevel === 1) return { clues, n };
  // hardest family whose one-step rating fits under the window; sometimes the one below (give-back)
  const fits = [];
  for (let f = 1; f <= maxLevel; f++) if (100 + 51 * W[f] <= t + 100) fits.push(f);
  if (!fits.length) fits.push(1);
  let h = fits[fits.length - 1];
  if (fits.length > 1 && r() < 0.3) h = fits[fits.length - 2];
  n[h] = 1;
  let effort = (t - 100 - 45 * W[h]) / 6 - W[h];
  let guard = 0;
  while (effort > 2 && guard++ < 11) {
    const f = Math.max(1, h - (r() < 0.5 ? 1 : 0));
    n[f]++;
    effort -= W[f];
  }
  return { clues, n };
}

// ------------------------------------------------------------------ proposal
// Stage table: Elo floor, clue range, steps per family [min, max]. Mirrors the doc's table.
// Each rank's last stage (the "gate": A2 is Apprentice's first pointing, D4, M3) brings in the
// next rank's technique, so a player meets it before the rank needs it, and plateaus sit inside a
// rank rather than on its floor.
const STAGES = [
  { id: 'N1', from: 0, clues: [38, 40], steps: {} }, //                       Novice: singles, generous
  { id: 'N2', from: 200, clues: [34, 36], steps: {} },
  { id: 'A1', from: 300, clues: [30, 32], steps: {} }, //                     Apprentice: leaner singles
  { id: 'A2', from: 400, clues: [30, 32], steps: { 1: [1, 1] } }, //          one pointing/claiming
  { id: 'A3', from: 500, clues: [28, 30], steps: { 1: [2, 3] } },
  { id: 'D1', from: 600, clues: [28, 30], steps: { 2: [1, 1], 1: [0, 2] } }, // Adept: one pair
  { id: 'D2', from: 700, clues: [26, 28], steps: { 2: [1, 2], 1: [1, 3] } },
  { id: 'D3', from: 800, clues: [24, 26], steps: { 2: [2, 3], 1: [1, 3] } }, // pairs and triples
  { id: 'D4', from: 900, clues: [24, 26], steps: { 3: [1, 1], 2: [1, 2], 1: [0, 2] } }, // gate: one X-Wing / XY-Wing
  { id: 'M1', from: 1000, clues: [22, 24], steps: { 3: [1, 2], 2: [1, 3] } }, // Archmage: fish and wings
  { id: 'M2', from: 1150, clues: [22, 24], steps: { 3: [2, 3], 2: [1, 3] } },
  { id: 'M3', from: 1300, clues: [20, 22], steps: { 4: [1, 1], 3: [1, 2], 2: [0, 2] } }, // gate: one chain
  { id: 'E1', from: 1450, clues: [17, 20], steps: { 4: [1, 2], 3: [1, 2], 2: [0, 2] } }, // Elomental: chains
  { id: 'E2', from: 1600, clues: [17, 20], steps: { 5: [1, 1], 4: [1, 2], 3: [0, 2] } }, // finned big fish (bank)
];
const stageOf = (elo) => {
  let i = 0;
  while (i < STAGES.length - 1 && elo >= STAGES[i + 1].from) i++;
  return i;
};
// `down`: serve from that many stages lower (the comeback square, variant a)
function stageSquare(elo, r, down = 0) {
  const s = STAGES[Math.max(0, stageOf(elo) - down)];
  const n = [0, 0, 0, 0, 0, 0];
  for (const [f, [lo, hi]] of Object.entries(s.steps)) n[f] = int(r, lo, hi);
  return { clues: int(r, s.clues[0], s.clues[1]), n };
}
// the stages that bring a new technique family into the squares (milestones)
const NEW_FAMILY = new Set(['A2', 'D1', 'D4', 'M3', 'E2']);

const PROPOSAL = {
  name: 'proposal',
  start: 100,
  protectedBelow: 300,
  k: [[100, 40], [600, 32], [1000, 24], [1450, 18], [1600, 14], [2000, 10]],
  loss: [[300, 0.75], [500, 1.0], [1450, 1.0], [1600, 1.25]],
  opponent: (elo) => Math.min(Math.round(elo), 1600),
  div: 200,
  tiers: [['Novice', 0], ['Apprentice', 300], ['Adept', 600], ['Archmage', 1000], ['Elomental', 1450]],
  steps: [0, 300, 600, 1000, 1450],
  square: stageSquare,
  stages: true,
};
// The owner's idea taken literally: every number halved, squares still follow Elo as today.
const HALVED = {
  ...LIVE,
  name: 'halved',
  protectedBelow: 250,
  k: LIVE.k.map(([x, y]) => [x / 2, y / 2]),
  loss: LIVE.loss.map(([x, y]) => [x / 2, y]),
  opponent: (elo) => Math.min(Math.max(Math.round(elo), 75), 1500),
  div: 200,
  tiers: [['Novice', 0], ['Apprentice', 300], ['Adept', 600], ['Archmage', 1000], ['Elomental', 1450]],
  steps: [0, 300, 600, 1000, 1450],
  square: (elo, r) => liveSquare(elo * 2, r),
};
const VARIANTS = {
  live: LIVE,
  proposal: PROPOSAL,
  'owner idea literally: halve every number, squares still follow Elo': HALVED,
  'proposal, protected below 200 (owner)': { ...PROPOSAL, name: 'protect200', protectedBelow: 200 },
  'proposal, gentle losses (0.5 x stake at 300, as live)': {
    ...PROPOSAL,
    name: 'gentle',
    loss: [[300, 0.5], [1000, 0.75], [1450, 1.0], [1600, 1.25]],
  },
  'proposal + players learn the next technique': { ...PROPOSAL, name: 'learn', learn: 0.005 },
  // §4.6: levers on the win rate where players settle
  '(a) comeback square: after 2 losses in a row, one stage lower until a win': { ...PROPOSAL, name: 'comeback', comeback: true },
  '(b1) losses 1.5x the stake from 500 (300 0.75, 500 1.5, 1600 1.75)': {
    ...PROPOSAL, name: 'loss15', loss: [[300, 0.75], [500, 1.5], [1600, 1.75]],
  },
  '(b2) losses 2.0x the stake from 500 (300 0.75, 500 2.0, 1600 2.25)': {
    ...PROPOSAL, name: 'loss20', loss: [[300, 0.75], [500, 2.0], [1600, 2.25]],
  },
  '(c) comeback square + losses 1.5x': {
    ...PROPOSAL, name: 'comeback15', comeback: true, loss: [[300, 0.75], [500, 1.5], [1600, 1.75]],
  },
  'live + players learn the next technique': { ...LIVE, name: 'liveLearn', learn: 0.005 },
};

// ------------------------------------------------------------------ one player, one ruleset
function speedBonus(p, r) {
  const x = r();
  if (p > 0.9) return x < 0.3 ? 0.25 : x < 0.7 ? 0.15 : 0.1;
  if (p > 0.7) return x < 0.3 ? 0.15 : x < 0.7 ? 0.1 : 0;
  if (p > 0.5) return x < 0.3 ? 0.1 : x < 0.9 ? 0 : -0.25;
  return x < 0.7 ? 0 : -0.25;
}

function delta(rules, elo, won, bonus, hintCut) {
  const opp = rules.opponent(elo);
  const e = 1 / (1 + 10 ** ((opp - elo) / rules.div));
  const k = along(rules.k, elo);
  let d;
  if (won) d = Math.round(k * (1 - e));
  else if (elo < rules.protectedBelow) d = 0;
  else d = -Math.round(k * e * along(rules.loss, elo));
  if (won && d > 0) d = Math.round(d * (1 + bonus) * (1 - hintCut));
  return d;
}

const SNAP = [1, 3, 7, 14, 30, 60, 90, 180].filter((d) => d <= DAYS);

function play(rules, persona, seed) {
  const pl = makePlayer(persona, seed);
  const r = rng32(seed ^ 0x9e3779b9);
  let elo = rules.start;
  const tierDay = rules.tiers.map(() => Infinity);
  tierDay[0] = 0;
  const seenStage = new Set();
  let promos30 = 0, promos = 0, newTech = 0, lossGames14 = 0;
  let upDays30 = 0, downDays30 = 0, upDaysEnd = 0, downDaysEnd = 0;
  let winsEnd = 0, gamesEnd = 0, wins30 = 0, games30 = 0, eloEndSum = 0, protectionLostDay = Infinity;
  const snaps = {};
  const stepIndex = (x) => rules.steps.filter((s) => x >= s).length;
  const tierIndex = (x) => rules.tiers.filter(([, f]) => x >= f).length - 1;
  // demotions: the rank shown drops (no grace), or only once Elo is 50 under the rank's floor
  let shown = tierIndex(elo), graced = shown, demotions = 0, gracedDemotions = 0;
  // loss sizes, and the most Elo lost in one run of losses
  let lossRun = 0, lossSum = 0, lossCount = 0, streakDrop = 0, maxStreakDrop = 0, comebacks = 0, gamesAll = 0;
  for (let day = 1; day <= DAYS; day++) {
    const before = elo;
    const games = int(r, 2, 4);
    for (let g = 0; g < games; g++) {
      gamesAll++;
      const down = rules.comeback && lossRun >= 2 ? 1 : 0;
      if (down) comebacks++;
      const sq = rules.square(elo, r, down);
      const p = pWin(pl, sq);
      const won = r() < p;
      const d = delta(rules, elo, won, won ? speedBonus(p, r) : 0, won && r() < persona.hint ? 0.25 : 0);
      const was = elo;
      elo = Math.max(0, elo + d);
      if (won) { lossRun = 0; streakDrop = 0; }
      else {
        lossRun++;
        if (d < 0) { lossSum -= d; lossCount++; streakDrop -= d; }
        if (streakDrop > maxStreakDrop) maxStreakDrop = streakDrop;
      }
      if (d < 0 && day <= 14) lossGames14++;
      const ti = tierIndex(elo);
      if (ti < shown) demotions++;
      shown = ti;
      if (ti > graced) graced = ti;
      else if (graced > 0 && elo < rules.tiers[graced][1] - 50) { gracedDemotions++; graced = ti; }
      if (stepIndex(elo) > stepIndex(was)) {
        promos++;
        if (day <= 30) promos30++;
      }
      if (rules.stages) {
        const id = STAGES[stageOf(elo)].id;
        if (!seenStage.has(id)) {
          seenStage.add(id);
          if (NEW_FAMILY.has(id)) newTech++;
        }
      }
      if (protectionLostDay === Infinity && elo >= rules.protectedBelow) protectionLostDay = day;
      for (let t = 1; t < rules.tiers.length; t++) if (tierDay[t] === Infinity && elo >= rules.tiers[t][1]) tierDay[t] = day;
      if (day <= 30) { games30++; if (won) wins30++; }
      if (day > DAYS - 30) { gamesEnd++; if (won) winsEnd++; }
      if (rules.learn) {
        const f = persona.ceiling + 1;
        if (f <= 5 && sq.n[f]) pl.q[f] += (0.97 - pl.q[f]) * rules.learn * sq.n[f];
      }
    }
    if (day <= 30) { if (elo > before) upDays30++; if (elo < before) downDays30++; }
    if (day > DAYS - 30) { if (elo > before) upDaysEnd++; if (elo < before) downDaysEnd++; eloEndSum += elo; }
    if (SNAP.includes(day)) snaps[day] = elo;
  }
  return {
    m: pl.m, tierDay, snaps, final: elo, plateau: eloEndSum / 30, winEnd: winsEnd / gamesEnd, win30: wins30 / games30,
    promos30, promos, newTech, lossGames14, protectionLostDay, demotions, gracedDemotions,
    avgLoss: lossCount ? lossSum / lossCount : 0, maxStreakDrop, comebackShare: comebacks / gamesAll,
    upDays30: upDays30 / 30, downDays30: downDays30 / 30, upDaysEnd: upDaysEnd / 30, downDaysEnd: downDaysEnd / 30,
    tierEnd: rules.tiers.filter(([, f]) => elo >= f).length - 1,
  };
}

// ------------------------------------------------------------------ stats
const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmtDay = (x) => (x === Infinity ? '—' : String(Math.round(x)));
const pct = (x) => `${Math.round(x * 100)}%`;

function summarise(runs, rules) {
  const tiers = rules.tiers.map(([name], t) => {
    const days = runs.map((x) => x.tierDay[t]);
    const reached = days.filter((d) => d < Infinity).length / runs.length;
    return { name, reached, median: q(days, 0.5), p90: q(days, 0.9) };
  });
  const dist = rules.tiers.map((_, t) => runs.filter((x) => x.tierEnd === t).length / runs.length);
  return {
    tiers, dist,
    elo: Object.fromEntries(SNAP.map((d) => [d, Math.round(q(runs.map((x) => x.snaps[d]), 0.5))])),
    plateau: [0.1, 0.5, 0.9].map((p) => Math.round(q(runs.map((x) => x.plateau), p))),
    winEnd: mean(runs.map((x) => x.winEnd)),
    win30: mean(runs.map((x) => x.win30)),
    promos30: q(runs.map((x) => x.promos30), 0.5),
    promos: q(runs.map((x) => x.promos), 0.5),
    newTech: q(runs.map((x) => x.newTech), 0.5),
    lossGames14: q(runs.map((x) => x.lossGames14), 0.5),
    demotions: mean(runs.map((x) => x.demotions)),
    gracedDemotions: mean(runs.map((x) => x.gracedDemotions)),
    avgLoss: mean(runs.filter((x) => x.avgLoss > 0).map((x) => x.avgLoss)),
    streakP90: q(runs.map((x) => x.maxStreakDrop), 0.9),
    comebackShare: mean(runs.map((x) => x.comebackShare)),
    finals: runs.map((x) => x.final),
    protectionLost: q(runs.map((x) => x.protectionLostDay), 0.5),
    upDays30: mean(runs.map((x) => x.upDays30)),
    downDays30: mean(runs.map((x) => x.downDays30)),
    upDaysEnd: mean(runs.map((x) => x.upDaysEnd)),
    downDaysEnd: mean(runs.map((x) => x.downDaysEnd)),
  };
}

// win chance per stage / per live Elo for a median player of each persona (m = 1)
function winTable() {
  const r = rng32(7);
  const median = (persona) => ({ m: 1, q: persona.q, base: persona.base, perClue: persona.perClue });
  const avg = (pl, gen, elo) => {
    let s = 0;
    for (let i = 0; i < 4000; i++) s += pWin(pl, gen(elo, r));
    return s / 4000;
  };
  const live = [150, 250, 300, 400, 500, 600, 800, 1000, 1200, 1600, 2000, 2400, 3000].map((elo) => ({
    elo, target: liveTarget(elo), p: Object.fromEntries(Object.entries(PERSONAS).map(([k, v]) => [k, avg(median(v), liveSquare, elo)])),
  }));
  const stages = STAGES.map((s) => ({
    id: s.id, from: s.from, p: Object.fromEntries(Object.entries(PERSONAS).map(([k, v]) => [k, avg(median(v), stageSquare, s.from)])),
  }));
  return { live, stages };
}

// ------------------------------------------------------------------ run
const results = {};
const pairs = []; // [oldElo, newElo, day, weight] for the migration map (same player, both rulesets)
for (const [vname, rules] of Object.entries(VARIANTS)) {
  results[vname] = {};
  for (const [pk, persona] of Object.entries(PERSONAS)) {
    const runs = [];
    for (let i = 0; i < N; i++) {
      const seed = (Object.keys(PERSONAS).indexOf(pk) + 1) * 1_000_003 + i;
      runs.push(play(rules, persona, seed));
    }
    results[vname][pk] = summarise(runs, rules);
    if (vname === 'live') results[vname][pk]._runs = runs;
    if (vname === 'proposal') {
      const old = results.live[pk]._runs;
      for (let i = 0; i < N; i++)
        for (const d of SNAP) pairs.push([old[i].snaps[d], runs[i].snaps[d], d, persona.share / N]);
      delete results.live[pk]._runs;
    }
  }
}

// migration map: weighted median new Elo for each band of live Elo, young accounts (days 1-14) and all days
function mapTable(filter) {
  const knots = [100, 200, 300, 400, 500, 600, 700, 800, 1000, 1200, 1400, 1600, 2000, 2400, 3000];
  return knots.map((k, i) => {
    const lo = i === 0 ? 0 : (knots[i - 1] + k) / 2;
    const hi = i === knots.length - 1 ? Infinity : (k + knots[i + 1]) / 2;
    const xs = pairs.filter(([o, , d]) => o >= lo && o < hi && filter(d)).sort((a, b) => a[1] - b[1]);
    if (!xs.length) return { old: k, n: 0 };
    const total = xs.reduce((s, x) => s + x[3], 0);
    let acc = 0;
    const at = (p) => { acc = 0; for (const x of xs) { acc += x[3]; if (acc >= p * total) return x[1]; } return xs[xs.length - 1][1]; };
    return { old: k, n: xs.length, p25: Math.round(at(0.25)), median: Math.round(at(0.5)), p75: Math.round(at(0.75)) };
  });
}

const out = { N, DAYS, personas: PERSONAS, stages: STAGES, wins: winTable(), results,
  map: { young: mapTable((d) => d <= 14), all: mapTable(() => true) } };

// pooled tier shares at day 180 (persona mix = share)
const ABOVE = [900, 1000, 1300, 1450, 1500, 1550, 1600];
for (const v of Object.keys(VARIANTS)) {
  const rules = VARIANTS[v];
  out.results[v]._pooled = rules.tiers.map(([name], t) => [name, Object.entries(PERSONAS).reduce((s, [pk, p]) => s + p.share * results[v][pk].dist[t], 0)]);
  out.results[v]._above = ABOVE.map((x) => [x, Object.entries(PERSONAS).reduce((s, [pk, p]) => {
    const f = results[v][pk].finals;
    return s + (p.share * f.filter((e) => e >= x).length) / f.length;
  }, 0)]);
  for (const pk of Object.keys(PERSONAS)) delete results[v][pk].finals;
}

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
writeFileSync(fileURLToPath(new URL('./elo-ladder-sim.json', import.meta.url)), JSON.stringify(out, null, 1));

// ------------------------------------------------------------------ print
console.log(`Elo ladder sim: ${N} players per persona, ${DAYS} days, 2-4 Ranked games a day\n`);
console.log('Win chance of a median player (m = 1) on the squares served');
console.log('LIVE   elo  target  ' + Object.keys(PERSONAS).map((k) => k.padStart(10)).join(''));
for (const row of out.wins.live) console.log(`     ${String(row.elo).padStart(5)} ${String(row.target).padStart(6)}  ` + Object.values(row.p).map((p) => pct(p).padStart(10)).join(''));
console.log('PROPOSED stage from  ' + Object.keys(PERSONAS).map((k) => k.padStart(10)).join(''));
for (const row of out.wins.stages) console.log(`     ${row.id.padEnd(4)} ${String(row.from).padStart(5)}    ` + Object.values(row.p).map((p) => pct(p).padStart(10)).join(''));

for (const [v, byP] of Object.entries(results)) {
  const rules = VARIANTS[v];
  console.log(`\n== ${v}`);
  for (const [pk, s] of Object.entries(byP)) {
    if (pk.startsWith('_')) continue;
    console.log(`  ${PERSONAS[pk].label}`);
    console.log('    days to tier (median / worst 10%, reached by day ' + DAYS + '): ' +
      s.tiers.slice(1).map((t) => `${t.name} ${fmtDay(t.median)}/${fmtDay(t.p90)} (${pct(t.reached)})`).join(', '));
    console.log(`    median Elo by day: ${JSON.stringify(s.elo)}  plateau p10/50/90 ${s.plateau.join('/')}`);
    console.log(`    win rate days 1-30 ${pct(s.win30)}, last 30 days ${pct(s.winEnd)}; tier at day ${DAYS}: ` +
      rules.tiers.map(([n], t) => `${n} ${pct(s.dist[t])}`).join(', '));
    console.log(`    rank-ups first 30 days ${s.promos30} (all ${s.promos})${rules.stages ? `, new techniques met ${s.newTech}` : ''}; ` +
      `Elo-losing games in first 14 days ${s.lossGames14}; protection ends day ${fmtDay(s.protectionLost)}; ` +
      `days with Elo up/down: first 30 ${pct(s.upDays30)}/${pct(s.downDays30)}, last 30 ${pct(s.upDaysEnd)}/${pct(s.downDaysEnd)}; ` +
      `demotions in ${DAYS} days ${s.demotions.toFixed(1)} (with a 50 grace ${s.gracedDemotions.toFixed(1)})`);
    console.log(`    average loss ${s.avgLoss.toFixed(1)} Elo; worst run of losses (p90 of each player's largest) ${Math.round(s.streakP90)} Elo` +
      (rules.comeback ? `; comeback squares ${pct(s.comebackShare)} of games` : ''));
  }
  const mix = Object.values(PERSONAS).map((p) => Math.round(p.share * 100)).join('/');
  console.log(`  pooled tiers at day ${DAYS} (mix ${mix}): ` + out.results[v]._pooled.map(([n, x]) => `${n} ${(x * 100).toFixed(1)}%`).join(', '));
  console.log('  pooled share at or above: ' + out.results[v]._above.map(([e, x]) => `${e} ${(x * 100).toFixed(1)}%`).join(', '));
}

console.log('\nMigration: new Elo of the same player, by live Elo (weighted by persona mix)');
console.log('  live   young (days 1-14) p25/median/p75     all days p25/median/p75');
for (let i = 0; i < out.map.all.length; i++) {
  const y = out.map.young[i], a = out.map.all[i];
  const f = (x) => (x.n ? `${x.p25}/${x.median}/${x.p75}` : '—');
  console.log(`  ${String(a.old).padStart(5)}  ${f(y).padStart(22)}  ${f(a).padStart(26)}`);
}

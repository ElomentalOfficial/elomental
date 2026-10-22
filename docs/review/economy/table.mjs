import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const DIR = fileURLToPath(new URL('.', import.meta.url));
const tags = process.argv.slice(2);
const f = (o) => (o == null ? '–' : o.median == null ? `– (${Math.round(o.reached * 100)}%)` : `${o.median} / ${o.worst10}${o.reached < 0.995 ? ` (${Math.round(o.reached * 100)}%)` : ''}`);
const t = (o) => (o == null ? '–' : `${o.median} (${o.p10}–${o.p90})`);
for (const tag of tags) {
  const r = JSON.parse(readFileSync(`${DIR}/sim-${tag}.json`, 'utf8'));
  console.log(`\n##### ${tag} ${JSON.stringify(r.rules)}`);
  for (const [n, p] of Object.entries(r.personas)) {
    const F = p.firsts;
    console.log(`${n}: rare ${f(F.rare)} | epic ${f(F.epic)} | mythic ${f(F.mythic)} | full ${f(F.full)} | spirit ${f(F.spirit)} | life1 ${f(F.life1)} | life2 ${f(F.life2)} | life3 ${f(F.life3)} | bronze ${f(F.bronze)} | gold ${f(F.gold)} | top ${f(F.top)}`);
    console.log(`   tiers: App ${f(F.Apprentice)} | Adept ${f(F.Adept)} | Elem ${f(F.Elementalist)} | Arch ${f(F.Archmage)}`);
    console.log(`   dust 30 ${t(p.stardust[30])} | 90 ${t(p.stardust[90])} | 180 ${t(p.stardust[180])}`);
    console.log(`   owned 7 ${t(p.owned[7])} 14 ${t(p.owned[14])} 30 ${t(p.owned[30])} | lives 30 ${t(p.lives[30])} 60 ${t(p.lives[60])} 90 ${t(p.lives[90])} 180 ${t(p.lives[180])} | plates 30 ${t(p.plates[30])} 90 ${t(p.plates[90])} 180 ${t(p.plates[180])}`);
    console.log(`   elo 7 ${t(p.elo[7])} 30 ${t(p.elo[30])} 90 ${t(p.elo[90])} 180 ${t(p.elo[180])}`);
    console.log(`   end ${JSON.stringify(p.end)}`);
  }
}

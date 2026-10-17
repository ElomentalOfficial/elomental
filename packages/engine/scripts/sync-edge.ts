/**
 * Copies the engine into supabase/functions/_shared/engine so Edge Functions
 * (audit-solve) run exactly the code the app runs. Run after engine changes,
 * then redeploy the functions.
 *
 *   npm run sync-edge
 */
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const from = new URL('../src/', import.meta.url);
const to = new URL('../../../supabase/functions/_shared/engine/', import.meta.url);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((f) => f.endsWith('.ts'));
for (const file of files) cpSync(new URL(file, from), new URL(file, to));
writeFileSync(new URL('README.md', to), 'Copy of packages/engine/src made by `npm run sync-edge` (packages/engine). Do not edit here.\n');
console.log(`Copied ${files.length} engine files to supabase/functions/_shared/engine`);

/**
 * Copies the engine files the Edge Functions use into
 * supabase/functions/_shared/engine, so audit-solve runs exactly the code the
 * app runs. Only what the functions import (following engine imports from
 * there) is copied. Run after engine changes, then redeploy the functions.
 *
 *   npm run sync-edge
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const from = new URL('../src/', import.meta.url);
const functions = new URL('../../../supabase/functions/', import.meta.url);
const to = new URL('_shared/engine/', functions);

// Engine files named by the functions' entry points, then everything those import.
const needed = new Set<string>();
const queue: string[] = [];
for (const fn of readdirSync(functions)) {
  const entry = new URL(`${fn}/index.ts`, functions);
  if (fn.startsWith('_') || !existsSync(entry)) continue;
  for (const [, file] of readFileSync(entry, 'utf8').matchAll(/_shared\/engine\/([\w-]+\.ts)['"]/g)) queue.push(file);
}
while (queue.length) {
  const file = queue.pop()!;
  if (needed.has(file)) continue;
  needed.add(file);
  for (const [, dep] of readFileSync(new URL(file, from), 'utf8').matchAll(/from\s+['"]\.\/([\w-]+\.ts)['"]/g)) queue.push(dep);
}

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
const files = [...needed].sort();
for (const file of files) cpSync(new URL(file, from), new URL(file, to));
writeFileSync(
  new URL('README.md', to),
  'Copy of the packages/engine/src files the Edge Functions import, made by `npm run sync-edge` (packages/engine). Do not edit here.\n',
);
console.log(`Copied ${files.length} engine files to supabase/functions/_shared/engine: ${files.join(', ')}`);

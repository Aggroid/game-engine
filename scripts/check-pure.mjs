#!/usr/bin/env node
/**
 * Purity guardrail. This repo must stay a pure library:
 *   - a strict allowlist of runtime dependencies
 *   - no ambient time or randomness anywhere in src/
 *   - no I/O modules imported
 * Failing this is a design regression, not a lint nit.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ALLOWED_DEPS = new Set(['zod']);

const BANNED = [
  { re: /\bDate\.now\s*\(/,            why: 'Date.now() breaks determinism — pass time in via EngineContext' },
  { re: /\bnew\s+Date\s*\(\s*\)/,      why: 'new Date() breaks determinism — pass time in via EngineContext' },
  { re: /\bMath\.random\s*\(/,         why: 'Math.random() breaks replay — use the seeded PRNG in src/battle' },
  { re: /\bperformance\.now\s*\(/,     why: 'performance.now() is ambient time' },
  { re: /\bprocess\.env\b/,            why: 'process.env is I/O and config leakage' },
  { re: /require\(\s*['"]node:?(fs|http|https|net|child_process)/, why: 'I/O module import' },
  { re: /from\s+['"]node:?(fs|http|https|net|child_process)/,      why: 'I/O module import' },
];

let failed = false;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failed = true; };

// 1. dependency allowlist
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
const offenders = deps.filter((d) => !ALLOWED_DEPS.has(d));
if (offenders.length) {
  fail(`disallowed runtime dependencies: ${offenders.join(', ')}`);
  fail(`  allowlist is: ${[...ALLOWED_DEPS].join(', ')} — adding to it is an architectural decision`);
} else {
  console.log(`  ✓ runtime dependencies within allowlist (${deps.join(', ') || 'none'})`);
}

// 2. banned ambient primitives in src/
const walk = (dir) => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
});

const srcFiles = walk(join(ROOT, 'src')).filter((f) => !f.endsWith('.test.ts'));
let banHits = 0;
for (const file of srcFiles) {
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
    for (const { re, why } of BANNED) {
      if (re.test(line)) { fail(`${relative(ROOT, file)}:${i + 1} — ${why}`); banHits++; }
    }
  });
}
if (!banHits) console.log(`  ✓ no ambient time, randomness or I/O in ${srcFiles.length} source files`);

process.exit(failed ? 1 : 0);

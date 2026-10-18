#!/usr/bin/env node
// Enforces FR-045 (no source file > 300 lines under app/, server/, scripts/)
// and SC-008 (no directory named domain|application|infrastructure|repositories|factories
// under app/ or server/). Designed to run in CI ahead of unit tests.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const MAX_LINES = 300
const SOURCE_ROOTS = ['app', 'server', 'scripts']
const LAYER_ROOTS = ['app', 'server']
const FORBIDDEN_DIRS = new Set([
  'domain',
  'application',
  'infrastructure',
  'repositories',
  'factories',
])
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.vercel', 'migrations'])
const SOURCE_EXT = /\.(ts|js|mjs|cjs|vue)$/

const violations = []

function walk(dir, opts) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) }
  catch { return }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (opts.checkLayers && FORBIDDEN_DIRS.has(entry.name)) {
        violations.push({
          kind: 'forbidden-dir',
          path: relative(ROOT, full).split(sep).join('/'),
        })
      }
      walk(full, opts)
      continue
    }
    if (!entry.isFile()) continue
    if (!SOURCE_EXT.test(entry.name)) continue
    const text = readFileSync(full, 'utf8')
    const lines = text.split(/\r?\n/).length
    if (lines > MAX_LINES) {
      violations.push({
        kind: 'too-long',
        path: relative(ROOT, full).split(sep).join('/'),
        lines,
      })
    }
  }
}

for (const root of SOURCE_ROOTS) {
  const abs = join(ROOT, root)
  try { statSync(abs) } catch { continue }
  walk(abs, { checkLayers: LAYER_ROOTS.includes(root) })
}

if (violations.length === 0) {
  console.log('lint:layers OK — no violations')
  process.exit(0)
}

console.error(`lint:layers found ${violations.length} violation(s):`)
for (const v of violations) {
  if (v.kind === 'too-long') {
    console.error(`  FR-045: ${v.path} has ${v.lines} lines (max ${MAX_LINES})`)
  } else {
    console.error(`  SC-008: forbidden directory name '${v.path}'`)
  }
}
process.exit(1)

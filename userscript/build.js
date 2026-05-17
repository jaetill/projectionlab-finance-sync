#!/usr/bin/env node
// Concatenate userscript header + source into dist/pl-sync.user.js.
// Substitutes __VERSION__ in the header from .release-please-manifest.json (or package.json fallback).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

function readVersion() {
  const manifestPath = join(repoRoot, '.release-please-manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest['.']) return manifest['.'];
  }
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  return pkg.version;
}

function readUserscript() {
  // For now the entire userscript (including the metadata header) lives in pl-sync.user.js.
  // The build replaces the header lines [until // ==/UserScript==] with the substituted template.
  const source = readFileSync(join(here, 'pl-sync.user.js'), 'utf8');
  const headerEndMarker = '// ==/UserScript==';
  const markerIdx = source.indexOf(headerEndMarker);
  if (markerIdx === -1) {
    throw new Error('pl-sync.user.js is missing the // ==/UserScript== marker');
  }
  const body = source.slice(markerIdx + headerEndMarker.length);
  return body;
}

function main() {
  const version = readVersion();
  const headerTemplate = readFileSync(join(here, 'header.template.js'), 'utf8');
  const header = headerTemplate.replace('__VERSION__', version);
  const body = readUserscript();

  const distDir = join(repoRoot, 'dist');
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

  const out = `${header.trimEnd()}\n${body.replace(/^\n+/, '\n')}`;
  writeFileSync(join(distDir, 'pl-sync.user.js'), out, 'utf8');
  console.log(`[build] wrote dist/pl-sync.user.js @version ${version}`);
}

main();

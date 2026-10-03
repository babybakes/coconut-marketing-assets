// Builds dist/ from src/: a copy of the userscript, and a bookmarklet version of the same code.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const src = readFileSync('src/inline-amounts.user.js', 'utf8');
copyFileSync('src/inline-amounts.user.js', 'dist/inline-amounts.user.js');
const body = src.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');
// Strip full-line comments only (never inside strings), then encode.
const code = body.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.trim()).filter(Boolean).join('\n');
writeFileSync('dist/bookmarklet.txt', 'javascript:' + encodeURIComponent(code));
console.log('bookmarklet bytes:', ('javascript:' + encodeURIComponent(code)).length);

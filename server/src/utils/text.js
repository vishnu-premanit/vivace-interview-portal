'use strict';

const STOPWORDS = new Set(
  `a an the and or but if then else of to in on at by for with from as is are was were be been being it its this that these those
  i me my we our you your he she they them their his her what which who whom when where why how do does did done have has had
  can could should would will shall may might must not no so than too very just also into about over under up down out
  there here all any some such only own same each few more most other both again further once`.split(/\s+/)
);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Unicode-aware word tokenizer that keeps things like "c++", "o(n)", "node.js". */
function tokenize(text) {
  const norm = normalize(text);
  const matches = norm.match(/[\p{L}\p{N}][\p{L}\p{N}+#.&()-]*[\p{L}\p{N}+#)]|[\p{L}\p{N}]/gu);
  return matches ? matches.map((t) => t.replace(/\.$/, '')) : [];
}

/** Light suffix stemmer — good enough for keyword coverage, deliberately conservative. */
function stem(word) {
  let w = word;
  if (w.length <= 3 || /[^a-z]/.test(w)) return w;
  const rules = [
    [/ies$/, 'y'],
    [/ied$/, 'y'],
    [/(ss)es$/, '$1'],
    [/([^s])s$/, '$1'],
    [/ational$/, 'ate'],
    [/ization$/, 'ize'],
    [/isation$/, 'ize'],
    [/ising$/, 'ize'],
    [/izing$/, 'ize'],
    [/ised$/, 'ize'],
    [/ized$/, 'ize'],
    [/ness$/, ''],
    [/ment$/, ''],
    [/ingly$/, ''],
    [/edly$/, ''],
    [/ing$/, ''],
    [/ed$/, ''],
    [/ly$/, ''],
    [/er$/, ''],
    [/e$/, '']
  ];
  for (const [re, rep] of rules) {
    if (re.test(w)) {
      const next = w.replace(re, rep);
      if (next.length >= 3) w = next;
      if (re.source !== '([^s])s$') break;
    }
  }
  return w;
}

function contentTokens(text) {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

function stems(text) {
  return contentTokens(text).map(stem);
}

function sentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?।。])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(text) {
  return tokenize(text).length;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, n));
}

function round(n, digits = 1) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function mean(values) {
  const list = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
}

function stddev(values) {
  const list = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (list.length < 2) return 0;
  const m = mean(list);
  return Math.sqrt(list.reduce((acc, v) => acc + (v - m) ** 2, 0) / (list.length - 1));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { STOPWORDS, normalize, tokenize, stem, stems, contentTokens, sentences, wordCount, clamp, round, mean, stddev, escapeRegex };

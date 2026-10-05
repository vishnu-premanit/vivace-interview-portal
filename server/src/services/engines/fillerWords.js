'use strict';
const { round } = require('../../utils/text');

/**
 * Filler Word Heatmap.
 * Finds fillers with character offsets (so the UI can highlight them in the
 * transcript) and buckets them into equal slices of the answer to show *where*
 * the speaker loses fluency — usually the opening and the moment they get stuck.
 */

// Ordered longest-first so multi-word fillers win over their parts.
const FILLERS = [
  'you know what i mean',
  'if that makes sense',
  'you know',
  'i mean',
  'sort of',
  'kind of',
  'or something',
  'and stuff',
  'to be honest',
  'basically',
  'actually',
  'literally',
  'honestly',
  'obviously',
  'totally',
  'whatever',
  'umm',
  'um',
  'uhh',
  'uh',
  'erm',
  'er',
  'ah',
  'hmm',
  'matlab',
  'yaani',
  'like'
];

// "like" is only a filler when it isn't doing grammatical work.
const LIKE_KEEP_BEFORE = /\b(would|i|you|we|they|he|she|feel|feels|felt|looks?|sounds?|seems?|things?|something|anything|just|not|don't|didn't|really|more|less|much|exactly)\s+$/i;

const SENTENCE_START_FILLERS = ['so', 'okay so', 'well', 'right', 'alright'];

function findFillers(text) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const marks = [];
  const taken = new Array(lower.length).fill(false);

  for (const filler of FILLERS) {
    const re = new RegExp(`(^|[^\\p{L}])(${filler.replace(/ /g, '\\s+')})(?=$|[^\\p{L}])`, 'giu');
    let m;
    while ((m = re.exec(lower)) !== null) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (taken.slice(start, end).some(Boolean)) continue;
      if (filler === 'like' && LIKE_KEEP_BEFORE.test(lower.slice(Math.max(0, start - 20), start))) continue;
      if (filler === 'like' && /^like\s+(this|that|a|an|the)\b/.test(lower.slice(start, start + 12)) && !/,\s*$/.test(lower.slice(0, start))) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      marks.push({ start, end, word: filler });
    }
  }

  // Sentence-opening crutches ("So, …", "Well, …") — only counted when followed by a comma or another filler.
  for (const opener of SENTENCE_START_FILLERS) {
    const re = new RegExp(`(^|[.!?]\\s+)(${opener})(?=\\s*,)`, 'gi');
    let m;
    while ((m = re.exec(lower)) !== null) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (taken.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      marks.push({ start, end, word: opener });
    }
  }

  // Stutter repeats: "the the", "I I"
  const rep = /\b(\p{L}+)\s+\1\b/giu;
  let r;
  while ((r = rep.exec(lower)) !== null) {
    const start = r.index;
    const end = start + r[0].length;
    if (taken.slice(start, end).some(Boolean)) continue;
    if (['very', 'had', 'that', 'bye', 'no'].includes(r[1])) continue;
    for (let i = start; i < end; i++) taken[i] = true;
    marks.push({ start, end, word: 'repeat' });
  }

  return marks.sort((a, b) => a.start - b.start);
}

function analyzeFillers(text, { segments = 8, durationMs = 0 } = {}) {
  const source = String(text || '');
  const marks = findFillers(source);
  const wordMatches = [...source.matchAll(/\S+/g)];
  const words = wordMatches.length;
  const byWord = {};
  for (const m of marks) byWord[m.word] = (byWord[m.word] || 0) + 1;

  const sliceCount = Math.max(1, Math.min(segments, words || 1));
  const heatmap = [];
  for (let i = 0; i < sliceCount; i++) {
    const fromWord = Math.floor((i * words) / sliceCount);
    const toWord = Math.floor(((i + 1) * words) / sliceCount);
    const startChar = wordMatches[fromWord] ? wordMatches[fromWord].index : source.length;
    const endChar = toWord < words && wordMatches[toWord] ? wordMatches[toWord].index : source.length;
    const count = marks.filter((mk) => mk.start >= startChar && mk.start < endChar).length;
    const size = Math.max(1, toWord - fromWord);
    heatmap.push({ index: i, words: size, fillers: count, density: round(count / size, 3) });
  }

  const perHundred = words ? round((marks.length / words) * 100, 1) : 0;
  const perMinute = durationMs > 5000 ? round(marks.length / (durationMs / 60000), 1) : null;
  let level = 'clean';
  if (perHundred >= 8) level = 'heavy';
  else if (perHundred >= 4) level = 'noticeable';
  else if (perHundred >= 1.5) level = 'light';

  const top = Object.entries(byWord)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word, count]) => ({ word, count }));

  const hottest = heatmap.reduce((best, seg) => (seg.density > best.density ? seg : best), heatmap[0] || { density: 0, index: 0 });
  let where = null;
  if (marks.length >= 2 && hottest && hottest.density > 0) {
    const pos = hottest.index / Math.max(1, sliceCount - 1);
    where = pos < 0.25 ? 'opening' : pos > 0.75 ? 'closing' : 'middle';
  }

  return { total: marks.length, words, perHundred, perMinute, level, byWord, top, heatmap, hotspot: where, marks };
}

module.exports = { analyzeFillers, findFillers, FILLERS };

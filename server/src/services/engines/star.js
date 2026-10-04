'use strict';
const { sentences, clamp } = require('../../utils/text');

/**
 * STAR Answer Structure Analyzer.
 * Each sentence gets scored against cue lexicons for Situation, Task, Action and Result.
 * A sentence can carry more than one component, but we tag it with its strongest one.
 */

const CUES = {
  situation: [
    /\b(when i was|while i was|during (my|our|the)|at (my|our) (college|company|internship|previous)|in (my|our) (final|second|third|first) year|last (year|semester|summer)|back in|there was a time|we were (working|building)|the (team|company|project) (was|had)|context|background)\b/i,
    /\b(in \d{4}|internship at|project (called|on|for))\b/i
  ],
  task: [
    /\b(my (role|job|responsibility|task|goal) (was|is)|i was (responsible|asked|supposed|tasked|in charge)|we (needed|had) to|the goal was|objective|target was|challenge was|i had to|our aim)\b/i
  ],
  action: [
    /\b(i (built|created|designed|wrote|led|organi[sz]ed|analy[sz]ed|implemented|proposed|convinced|negotiated|set up|reached out|decided|started|introduced|automated|fixed|debugged|researched|talked|spoke|scheduled|coordinated|trained|tested|refactored|migrated|presented|split|prioriti[sz]ed|reviewed|mentored|called|planned|changed))\b/i,
    /\b(first,? i|then i|next,? i|so i|after that,? i|i started by|step one|my approach)\b/i
  ],
  result: [
    /\b(as a result|resulted in|which (led|meant|helped|reduced|increased|saved)|the outcome|in the end|finally|eventually|we (achieved|delivered|won|shipped|launched|finished|reduced|increased|saved|improved)|this (reduced|increased|saved|improved|cut|helped)|got (selected|promoted|an a|first)|learned|learnt|lesson)\b/i,
    /\b\d+(\.\d+)?\s?(%|percent|x|times|hours?|days?|weeks?|lakhs?|crores?|users|customers|students|people|members|clients|orders|downloads|marks|rank|grade)\b/i
  ]
};

const COMPONENTS = ['situation', 'task', 'action', 'result'];

function scoreSentence(sentence) {
  const scores = {};
  for (const comp of COMPONENTS) {
    scores[comp] = CUES[comp].reduce((acc, re) => acc + (re.test(sentence) ? 1 : 0), 0);
  }
  return scores;
}

function analyzeStar(text, { type = 'behavioral' } = {}) {
  const list = sentences(text);
  const tagged = list.map((s, index) => {
    const scores = scoreSentence(s);
    const best = COMPONENTS.reduce((a, b) => (scores[b] > scores[a] ? b : a), 'situation');
    return { index, text: s, tag: scores[best] > 0 ? best : null, scores };
  });

  // An untagged opening sentence in a story usually sets the scene.
  if (tagged.length > 2 && !tagged[0].tag && /\b(was|were|had)\b/i.test(tagged[0].text)) {
    tagged[0].tag = 'situation';
  }

  const components = {};
  for (const comp of COMPONENTS) {
    const hits = tagged.filter((t) => t.tag === comp || t.scores[comp] > 0);
    components[comp] = { present: hits.length > 0, sentences: hits.map((h) => h.index) };
  }

  const weights = { situation: 20, task: 20, action: 35, result: 25 };
  let score = COMPONENTS.reduce((acc, c) => acc + (components[c].present ? weights[c] : 0), 0);

  // Reward a sensible order: first S/T before first A before first R.
  const firstIdx = (c) => (components[c].sentences.length ? Math.min(...components[c].sentences) : null);
  const s = firstIdx('situation');
  const a = firstIdx('action');
  const r = firstIdx('result');
  const ordered = a !== null && r !== null && a <= r && (s === null || s <= a);
  if (!ordered && score > 50) score -= 10;

  // Quantified result is the hallmark of a strong STAR answer.
  const quantified = CUES.result[1].test(text);
  if (components.result.present && quantified) score = clamp(score + 5, 0, 100);

  const missing = COMPONENTS.filter((c) => !components[c].present);
  const tips = [];
  if (missing.includes('situation')) tips.push('Open with one sentence of context: where you were and what was going on.');
  if (missing.includes('task')) tips.push('Say what you specifically were responsible for — the goal or the problem you owned.');
  if (missing.includes('action')) tips.push('Use "I did…" statements to describe your own steps, not just what the team did.');
  if (missing.includes('result')) tips.push('Finish with the outcome, ideally a number: time saved, % improvement, grade, users.');
  else if (!quantified) tips.push('Your result is there — put a number on it to make it stick.');
  const weTalk = (text.match(/\bwe\b/gi) || []).length;
  const iTalk = (text.match(/\bi\b/gi) || []).length;
  if (weTalk > iTalk * 2 && weTalk > 3) tips.push('You said "we" far more than "I". Interviewers want to know your part.');

  return {
    applicable: type !== 'technical',
    score: clamp(Math.round(score)),
    components,
    missing,
    ordered,
    quantified,
    sentences: tagged.map(({ index, text: t, tag }) => ({ index, text: t, tag })),
    tips
  };
}

module.exports = { analyzeStar };

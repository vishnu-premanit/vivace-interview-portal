'use strict';
const gemini = require('./gemini');
const ml = require('../mlClient');
const { getStream, allQuestionsFor, PERSONAS, LANGUAGES, COMMON } = require('../data/streams');
const { translateQuestion, phrases, hasOfflineSupport } = require('../data/i18n');
const { evaluateAnswer, WEIGHTS } = require('../engines/evaluator');
const { decideCounterQuestion } = require('../engines/counterQuestion');
const { pickWeaknessQuestion, closestDifficulty } = require('../engines/profile');
const { jdQuestions } = require('../engines/jdMatch');
const { round, clamp } = require('../../utils/text');

/**
 * The interviewer: plans the session, chooses/writes each question, evaluates
 * answers and decides on counter-questions. Gemini writes and judges when it is
 * available; the offline engines always run underneath and take over seamlessly.
 */

const TECH_GROUPS = new Set(['Technology']);

function getPersona(id, stress) {
  if (stress) return PERSONAS.find((p) => p.id === 'skeptic');
  return PERSONAS.find((p) => p.id === id) || PERSONAS[0];
}

function languageName(code) {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? l.name : 'English';
}

function timeLimitFor(mode, stress) {
  if (stress) return mode === 'text' ? 120 : 75;
  return mode === 'text' ? 0 : 150;
}

function buildPlan({ questionCount = 6, streamId, hasResume, hasJd, focusWeaknesses, hasHistory }) {
  const n = clamp(questionCount, 3, 12);
  const stream = getStream(streamId);
  const techHeavy = stream && TECH_GROUPS.has(stream.group);
  const kinds = [];
  if (hasResume) kinds.push('resume');
  if (hasJd) kinds.push('jd');
  if (focusWeaknesses && hasHistory) kinds.push('weakness');
  const special = [...kinds, ...kinds]; // round-robin so every requested source gets a slot
  const core = [];
  for (let i = 0; core.length < n; i++) core.push(i % 3 === 2 ? 'behavioral' : techHeavy || i % 3 === 0 ? 'technical' : 'behavioral');

  const slots = ['intro'];
  const room = n - 1;
  const specials = special.slice(0, Math.ceil(room * 0.6));
  let si = 0;
  let ci = 0;
  while (slots.length < n) {
    // interleave: special, core, special, core …
    if (si < specials.length && (slots.length % 2 === 1 || ci >= core.length)) slots.push(specials[si++]);
    else slots.push(core[ci++]);
  }
  return slots;
}

function bankQuestion({ slot, streamId, difficulty, exclude }) {
  const pool = allQuestionsFor(streamId).filter((q) => !exclude.has(q.id));
  let candidates = pool;
  if (slot === 'technical') candidates = pool.filter((q) => q.type === 'technical' || (q.competency === 'domain'));
  if (slot === 'behavioral') candidates = pool.filter((q) => q.type !== 'technical');
  if (!candidates.length) candidates = pool;
  if (!candidates.length) candidates = COMMON;
  return closestDifficulty(candidates, difficulty);
}

function localise(question, language) {
  if (language === 'en') return { ...question, untranslated: false };
  const translated = translateQuestion(question.id, language, null);
  return translated ? { ...question, text: translated, untranslated: false } : { ...question, untranslated: true };
}

async function geminiQuestion({ session, slot, difficulty, context }) {
  const persona = getPersona(session.persona, session.stress);
  const stream = getStream(session.stream);
  const previous = context.previous.slice(-6).map((t) => `- [${t.competency}] ${t.text}`).join('\n') || 'none';
  const slotBrief = {
    intro: 'an opening question that invites the candidate to introduce themselves in relation to the role',
    technical: `a technical/domain question for a ${stream ? stream.name : 'graduate'} candidate`,
    behavioral: 'a behavioural question about a real past experience',
    resume: `a question that verifies this resume claim: "${context.claim ? context.claim.evidence || context.claim.keyword : ''}"`,
    jd: `a question that tests this job requirement: "${context.jdFocus || ''}"`,
    weakness: `a question that targets the candidate's weakest area: ${context.weakness || 'their weakest competency'}`
  }[slot];

  const data = await gemini.generateJson({
    system: `You are ${persona.name}, a ${persona.title} conducting a realistic job interview. Style: ${persona.style} Never reveal you are an AI model. Respond only with JSON.`,
    prompt: `Write the next interview question.
Candidate stream: ${stream ? stream.full : 'General'}; target role: ${session.role || 'graduate role'}.
Difficulty: ${difficulty} on a 1–5 scale (1 = warm-up, 5 = senior/stretch).
Question type needed: ${slotBrief}.
Language: write the question in ${languageName(session.language)}.
${session.stress ? 'Stress interview: be terse and slightly challenging.' : ''}
Already asked (do not repeat):
${previous}

Return JSON: {"text": string (one or two sentences, conversational, no numbering),
"competency": one of ["communication","domain","problemSolving","analytical","teamwork","leadership","adaptability","professionalism"],
"type": one of ["technical","behavioral","situational"],
"keyPoints": array of 3-5 short English phrases a strong answer would cover}`
  });
  if (!data || typeof data.text !== 'string' || data.text.length < 10) return null;
  const competency = ['communication', 'domain', 'problemSolving', 'analytical', 'teamwork', 'leadership', 'adaptability', 'professionalism'].includes(data.competency) ? data.competency : 'communication';
  const type = ['technical', 'behavioral', 'situational'].includes(data.type) ? data.type : 'behavioral';
  const keyPoints = Array.isArray(data.keyPoints) ? data.keyPoints.filter((k) => typeof k === 'string').slice(0, 6) : [];
  return { id: `ai-${Date.now().toString(36)}`, text: data.text.trim().slice(0, 600), competency, type, difficulty, keyPoints, source: 'gemini' };
}

/**
 * Choose the next main question for the session.
 * context: { previous: turns, history: past answered turns across sessions, mistakes, resumeClaims, jdMatch }
 */
async function nextQuestion(session, context) {
  const index = session.turns.filter((t) => t.kind === 'main').length;
  const slot = session.plan[index] || 'behavioral';
  const difficulty = session.difficulty;
  const exclude = new Set([...session.turns.map((t) => t.questionId), ...(context.recentIds || [])]);
  const usedClaims = new Set(session.turns.map((t) => t.claimId).filter(Boolean));
  const claim = slot === 'resume' ? (context.resumeClaims || []).find((c) => !usedClaims.has(c.id)) : null;
  const jdList = slot === 'jd' && context.jdMatch ? jdQuestions(context.jdMatch, 6).filter((q) => !exclude.has(q.id)) : [];
  const weak = slot === 'weakness' ? pickWeaknessQuestion({ streamId: session.stream, turns: context.history || [], difficulty, exclude, mistakes: context.mistakes }) : null;

  let question = null;
  let reason = null;

  if (gemini.isEnabled() && slot !== 'intro') {
    question = await geminiQuestion({
      session,
      slot,
      difficulty,
      context: { previous: session.turns, claim, jdFocus: jdList[0] ? jdList[0].text : null, weakness: weak ? weak.reason : null }
    });
    if (question && claim) question.claimId = claim.id;
    if (question && slot === 'weakness' && weak) reason = weak.reason;
  }

  if (!question) {
    if (slot === 'intro') {
      question = { ...COMMON.find((q) => q.id === 'hr-intro'), source: 'bank' };
    } else if (claim) {
      question = { id: `resume-${claim.id}`, text: claim.question, competency: claim.type === 'leadership' ? 'leadership' : 'domain', type: 'behavioral', difficulty, keyPoints: ['specific example|i did', 'how|steps|approach', 'tool|technology|method', 'result|outcome|number'], source: 'resume', claimId: claim.id };
    } else if (jdList.length) {
      question = { ...jdList[0], difficulty };
    } else if (weak) {
      question = { ...weak.question, source: 'weakness' };
      reason = weak.reason;
    } else {
      question = { ...bankQuestion({ slot, streamId: session.stream, difficulty, exclude }), source: 'bank' };
    }
    question = localise(question, session.language);
  }

  return {
    kind: 'main',
    slot,
    questionId: question.id,
    text: question.text,
    competency: question.competency,
    type: question.type,
    difficulty: question.difficulty || difficulty,
    keyPoints: question.keyPoints || [],
    source: question.source || 'bank',
    claimId: question.claimId || null,
    untranslated: Boolean(question.untranslated),
    targetReason: reason
  };
}

async function geminiEvaluate({ turn, answer, session }) {
  const data = await gemini.generateJson({
    system: 'You are a fair, experienced interview assessor. Score strictly but kindly. Respond only with JSON.',
    prompt: `Question (${turn.type}, difficulty ${turn.difficulty}/5): ${turn.text}
Key points a strong answer covers: ${(turn.keyPoints || []).join('; ') || 'use your judgement'}
Candidate answer (language ${session.language}): """${String(answer).slice(0, 4000)}"""

Score 0-10 for relevance, depth, structure, clarity, confidence.
Return JSON: {"scores":{"relevance":n,"depth":n,"structure":n,"clarity":n,"confidence":n},
"strengths":[up to 3 short sentences in English],
"improvements":[up to 3 short, specific sentences in English],
"missing":[key points not covered, short phrases],
"modelAnswer":[3-5 bullet strings outlining an excellent answer]}`,
    temperature: 0.2
  });
  if (!data || !data.scores) return null;
  const s = {};
  for (const k of Object.keys(WEIGHTS)) {
    const v = Number(data.scores[k]);
    if (!Number.isFinite(v)) return null;
    s[k] = clamp(v, 0, 10);
  }
  return {
    scores: s,
    strengths: Array.isArray(data.strengths) ? data.strengths.filter((x) => typeof x === 'string').slice(0, 3) : [],
    improvements: Array.isArray(data.improvements) ? data.improvements.filter((x) => typeof x === 'string').slice(0, 3) : [],
    missing: Array.isArray(data.missing) ? data.missing.filter((x) => typeof x === 'string').slice(0, 5) : [],
    modelAnswer: Array.isArray(data.modelAnswer) ? data.modelAnswer.filter((x) => typeof x === 'string').slice(0, 6) : []
  };
}

async function evaluate({ turn, answer, metrics, session }) {
  const base = evaluateAnswer({
    answer,
    question: turn.text,
    keyPoints: turn.keyPoints,
    type: turn.type,
    difficulty: turn.difficulty,
    metrics,
    mode: session.mode,
    language: session.language,
    timeLimitSec: timeLimitFor(session.mode, session.stress)
  });

  const [mlResult, ai] = await Promise.all([
    turn.keyPoints && turn.keyPoints.length ? ml.analyzeAnswer({ answer, question: turn.text, key_points: turn.keyPoints }) : null,
    gemini.isEnabled() ? geminiEvaluate({ turn, answer, session }) : null
  ]);

  if (mlResult && Array.isArray(mlResult.covered) && typeof mlResult.coverage === 'number') {
    base.gaps = { covered: mlResult.covered, missing: mlResult.missing, coverage: round(mlResult.coverage, 2), engine: 'ml-tfidf' };
    base.ml = { similarity: mlResult.similarity, keywords: mlResult.keywords, readability: mlResult.readability };
  }

  if (ai) {
    const blended = {};
    for (const k of Object.keys(WEIGHTS)) {
      const w = k === 'relevance' || k === 'depth' ? 0.7 : 0.5;
      blended[k] = round(ai.scores[k] * w + base.scores[k] * (1 - w));
    }
    base.scores = blended;
    base.overall = round(Object.entries(WEIGHTS).reduce((acc, [k, w]) => acc + blended[k] * w, 0));
    if (ai.strengths.length) base.feedback.strengths = ai.strengths;
    if (ai.improvements.length) base.feedback.improvements = ai.improvements;
    if (ai.modelAnswer.length) base.modelAnswer = ai.modelAnswer;
    if (ai.missing.length && base.gaps.unavailable) base.gaps = { covered: [], missing: ai.missing, coverage: round(1 - Math.min(1, ai.missing.length / Math.max(3, (turn.keyPoints || []).length || 4)), 2) };
    base.source = 'gemini';
  }
  return base;
}

async function counterQuestion({ session, parentTurn, answer, evaluation, followUpsSoFar, resumeClaims }) {
  const persona = getPersona(session.persona, session.stress);
  const decision = decideCounterQuestion({
    evaluation,
    answer,
    type: parentTurn.type,
    language: session.language,
    followUpsSoFar,
    maxFollowUps: session.stress ? 2 : persona.pressure >= 3 ? 2 : 1,
    pressure: persona.pressure,
    stress: session.stress,
    resumeClaims
  });
  if (!decision) return null;

  let text = decision.text;
  if (gemini.isEnabled()) {
    const data = await gemini.generateJson({
      system: `You are ${persona.name}, ${persona.title}. Style: ${persona.style} Respond only with JSON.`,
      prompt: `The candidate was asked: "${parentTurn.text}"
They answered: """${String(answer).slice(0, 2500)}"""
Write ONE short follow-up question in ${languageName(session.language)} that probes this: ${decision.reason} (${decision.focus}).
Refer to something specific they said. Return JSON {"text": string}.`,
      temperature: 0.5,
      timeoutMs: 8000
    });
    if (data && typeof data.text === 'string' && data.text.length > 8) text = data.text.trim().slice(0, 400);
  }
  return {
    kind: 'follow-up',
    slot: parentTurn.slot,
    questionId: `${parentTurn.questionId}-fu${followUpsSoFar + 1}`,
    text,
    competency: parentTurn.competency,
    type: parentTurn.type,
    difficulty: parentTurn.difficulty,
    keyPoints: decision.reason === 'missing-result' ? ['result|outcome', 'number|%|measur'] : parentTurn.keyPoints,
    source: 'counter',
    counterReason: decision.reason,
    claimId: decision.claimId || parentTurn.claimId || null
  };
}

const TRANSITIONS = {
  mentor: ['Thanks, that helps.', 'Good, let’s keep going.', 'Appreciate the detail.'],
  'tech-lead': ['Okay.', 'Got it. Next one.', 'Right, moving on.'],
  panel: ['Noted.', 'Thank you. Next question.', 'Very well.'],
  founder: ['Cool — next.', 'Okay, quick one.', 'Love it. Moving on.'],
  skeptic: ['Hm.', 'Fine. Next.', 'We’ll see. Next question.']
};

function transition(session, n) {
  if (session.language !== 'en') return '';
  const persona = getPersona(session.persona, session.stress);
  const list = TRANSITIONS[persona.id] || TRANSITIONS.mentor;
  return list[n % list.length];
}

function greeting(session, userName) {
  const persona = getPersona(session.persona, session.stress);
  return phrases(session.language).greeting(userName.split(' ')[0], persona.name);
}

function closing(session) {
  return phrases(session.language).closing;
}

module.exports = {
  buildPlan,
  nextQuestion,
  evaluate,
  counterQuestion,
  transition,
  greeting,
  closing,
  getPersona,
  timeLimitFor,
  hasOfflineSupport
};

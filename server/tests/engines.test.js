'use strict';
const { tokenize, stem, sentences, mean, stddev } = require('../src/utils/text');
const { analyzeFillers, findFillers } = require('../src/services/engines/fillerWords');
const { analyzeStar } = require('../src/services/engines/star');
const { detectGaps, similarity } = require('../src/services/engines/gapDetection');
const { analyzeResponseTime } = require('../src/services/engines/responseTime');
const { nextDifficulty } = require('../src/services/engines/difficulty');
const { evaluateAnswer } = require('../src/services/engines/evaluator');
const { decideCounterQuestion } = require('../src/services/engines/counterQuestion');
const { extractClaims, assessClaim, summarize } = require('../src/services/engines/resumeTruth');
const { matchResume, jdQuestions, extractRequirements } = require('../src/services/engines/jdMatch');
const { readiness, predictOutcome, outcomeFeatures } = require('../src/services/engines/scoring');
const { skillGapMap, digitalTwin, pickWeaknessQuestion, simulateScore } = require('../src/services/engines/profile');
const { analyzePresentation } = require('../src/services/engines/presentation');
const { compareAnswers } = require('../src/services/engines/abTest');
const { coachReply, detectIntent } = require('../src/services/engines/coach');
const { detectMistakes } = require('../src/services/engines/mistakeMemory');
const { extractSkills } = require('../src/services/data/skills');
const { STREAMS, COMMON, findQuestion, PERSONAS, LANGUAGES } = require('../src/services/data/streams');
const { phrases, translateQuestion, QUESTIONS } = require('../src/services/data/i18n');
const interviewer = require('../src/services/ai/interviewer');
const { extractJson } = require('../src/services/ai/gemini');

const STORY =
  'Last year during my final year project we were building a library app for our college. My role was to own the backend. ' +
  'A teammate wanted Firebase but I thought MongoDB fit better. I listened to his concerns, then I built two small prototypes and compared them. ' +
  'We agreed on MongoDB together. As a result we finished two weeks early and the app now serves 400 students.';

describe('text utils', () => {
  test('tokenize keeps technical tokens', () => {
    expect(tokenize('I used Node.js, C++ and o(n) loops')).toEqual(expect.arrayContaining(['node.js', 'c++', 'o(n)']));
  });
  test('stem collapses common suffixes', () => {
    expect(stem('testing')).toBe(stem('tested'));
    expect(stem('databases')).toBe(stem('database'));
  });
  test('sentences split on punctuation and Devanagari danda', () => {
    expect(sentences('One. Two! Three? चार। पाँच')).toHaveLength(5);
  });
  test('mean/stddev ignore non-numbers', () => {
    expect(mean([1, 2, 3, null])).toBe(2);
    expect(stddev([2, 2, 2])).toBe(0);
  });
});

describe('Filler Word Heatmap', () => {
  test('finds fillers with offsets and builds a heatmap', () => {
    const text = 'Um, so basically I, like, built the the API. You know, it was, uh, fast.';
    const r = analyzeFillers(text);
    expect(r.total).toBeGreaterThanOrEqual(5);
    const words = r.marks.map((m) => m.word);
    expect(words).toEqual(expect.arrayContaining(['um', 'basically', 'like', 'you know', 'uh', 'repeat']));
    for (const m of r.marks) expect(text.slice(m.start, m.end).length).toBeGreaterThan(0);
    expect(r.heatmap.length).toBeGreaterThan(1);
    expect(['noticeable', 'heavy']).toContain(r.level);
  });
  test('does not count grammatical "like"', () => {
    expect(findFillers('I would like to join. It looks like rain.').filter((m) => m.word === 'like')).toHaveLength(0);
  });
  test('clean answer is rated clean', () => {
    expect(analyzeFillers('I designed the schema and wrote the migration scripts myself.').level).toBe('clean');
  });
  test('locates the hotspot', () => {
    const r = analyzeFillers('Um uh um like basically so. ' + 'I built the payment service with retries and idempotency keys for safety. '.repeat(4));
    expect(r.hotspot).toBe('opening');
  });
});

describe('STAR analyzer', () => {
  test('detects all four components in a good story', () => {
    const r = analyzeStar(STORY);
    expect(r.missing).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.quantified).toBe(true);
  });
  test('flags a missing result', () => {
    const r = analyzeStar('During my internship the team had a problem. I built a script to fix it.');
    expect(r.missing).toContain('result');
    expect(r.tips.join(' ')).toMatch(/outcome/i);
  });
  test('technical answers are marked not applicable', () => {
    expect(analyzeStar('A hash map uses buckets.', { type: 'technical' }).applicable).toBe(false);
  });
});

describe('Answer Gap Detection', () => {
  test('covers key points with alternatives and stems', () => {
    const r = detectGaps('Passwords should be hashed with bcrypt and a unique salt, never plaintext.', ['hash', 'salt', 'bcrypt|argon|scrypt', 'https|tls']);
    expect(r.covered).toEqual(['hash', 'salt', 'bcrypt']);
    expect(r.missing).toEqual(['https']);
    expect(r.coverage).toBe(0.75);
  });
  test('similarity is symmetric and bounded', () => {
    const a = similarity('database index speeds up reads', 'an index speeds database reads');
    expect(a).toBeGreaterThan(0.5);
    expect(a).toBeLessThanOrEqual(1);
    expect(similarity('', 'x')).toBe(0);
  });
});

describe('Response-Time Intelligence', () => {
  test('flags rushed starts on hard questions', () => {
    const r = analyzeResponseTime({ thinkTimeMs: 500, answerDurationMs: 60000, wordCount: 150, difficulty: 4, mode: 'voice' });
    expect(r.thinkVerdict).toBe('rushed');
    expect(r.wpm).toBe(150);
    expect(r.score).toBeLessThan(100);
  });
  test('ideal timing scores full marks', () => {
    const r = analyzeResponseTime({ thinkTimeMs: 4000, answerDurationMs: 60000, wordCount: 140, difficulty: 2, mode: 'voice' });
    expect(r.thinkVerdict).toBe('ideal');
    expect(r.paceVerdict).toBe('comfortable');
    expect(r.score).toBe(100);
  });
  test('long pauses and overtime are noted', () => {
    const r = analyzeResponseTime({ thinkTimeMs: 60000, answerDurationMs: 200000, wordCount: 300, difficulty: 2, mode: 'video', timeLimitSec: 75 });
    expect(r.thinkVerdict).toBe('long');
    expect(r.notes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Dynamic Difficulty Engine', () => {
  test('raises after strong answers, lowers after weak ones, clamps', () => {
    expect(nextDifficulty({ current: 2, recentScores: [8, 8.5] }).level).toBe(3);
    expect(nextDifficulty({ current: 3, recentScores: [3, 3.5] }).level).toBe(2);
    expect(nextDifficulty({ current: 5, recentScores: [9, 9] }).level).toBe(5);
    expect(nextDifficulty({ current: 1, recentScores: [1, 1] }).level).toBe(1);
    expect(nextDifficulty({ current: 2, recentScores: [] }).change).toBe(0);
  });
  test('stress mode pushes harder', () => {
    expect(nextDifficulty({ current: 2, recentScores: [6, 6] }).change).toBe(0);
    expect(nextDifficulty({ current: 2, recentScores: [6, 6], stress: true }).change).toBe(1);
  });
});

describe('Evaluator', () => {
  const q = findQuestion('hr-conflict');
  test('a strong story outscores a weak one', () => {
    const good = evaluateAnswer({ answer: STORY, question: q.text, keyPoints: q.keyPoints, type: q.type, difficulty: 2 });
    const weak = evaluateAnswer({ answer: 'Um I think maybe we like talked about it and stuff.', question: q.text, keyPoints: q.keyPoints, type: q.type, difficulty: 2 });
    expect(good.overall).toBeGreaterThan(weak.overall + 2);
    expect(good.feedback.strengths.length).toBeGreaterThan(0);
    expect(weak.feedback.improvements.length).toBeGreaterThan(0);
    expect(good.modelAnswer.length).toBeGreaterThan(2);
    for (const k of ['relevance', 'depth', 'structure', 'clarity', 'confidence']) {
      expect(good.scores[k]).toBeGreaterThanOrEqual(0);
      expect(good.scores[k]).toBeLessThanOrEqual(10);
    }
  });
  test('non-English answers skip English keyword gaps', () => {
    const e = evaluateAnswer({ answer: 'मैंने टीम के साथ बात की और समस्या हल की।', question: 'x', keyPoints: ['listen'], type: 'behavioral', language: 'hi' });
    expect(e.gaps.unavailable).toBe(true);
  });
});

describe('Counter-Question Engine', () => {
  const base = { overall: 6, scores: { depth: 7, confidence: 7 }, stats: { words: 60 }, star: { components: { result: { present: true } } }, gaps: { missing: [], coverage: 1 } };
  test('probes resume claims first', () => {
    const r = decideCounterQuestion({ evaluation: base, answer: 'I mostly used Docker for deployment', type: 'behavioral', resumeClaims: [{ id: 'c1', keyword: 'Docker' }] });
    expect(r.reason).toBe('resume-claim');
    expect(r.claimId).toBe('c1');
  });
  test('asks for the result when missing', () => {
    const r = decideCounterQuestion({ evaluation: { ...base, star: { components: { result: { present: false } } } }, answer: 'x '.repeat(30), type: 'behavioral' });
    expect(r.reason).toBe('missing-result');
  });
  test('short answers get a deeper probe and limits are respected', () => {
    const short = { ...base, stats: { words: 6 }, scores: { depth: 2, confidence: 5 } };
    expect(decideCounterQuestion({ evaluation: short, answer: 'it is a list', type: 'technical' }).reason).toBe('too-short');
    expect(decideCounterQuestion({ evaluation: short, answer: 'it is a list', type: 'technical', followUpsSoFar: 1 })).toBeNull();
  });
  test('stress mode doubts low-confidence answers and localises', () => {
    const r = decideCounterQuestion({ evaluation: { ...base, scores: { depth: 7, confidence: 4 } }, answer: 'word '.repeat(40), type: 'behavioral', stress: true, language: 'es' });
    expect(r.reason).toBe('stress-doubt');
    expect(r.text).toBe(phrases('es').stressDoubt);
  });
});

describe('Resume Truth Checker', () => {
  const resume = `Priya Sharma
Skills: Python, SQL, Power BI, Excel, Git
Projects
Built a sales dashboard in Power BI that reduced reporting time by 40% for 3 regional teams
Developed a Flask REST API for student attendance
Experience
Led a team of 5 volunteers for the college tech fest
Certifications
Google Data Analytics Certificate (Coursera)`;

  test('extracts typed claims with questions', () => {
    const claims = extractClaims(resume);
    const types = new Set(claims.map((c) => c.type));
    for (const t of ['metric', 'leadership', 'project', 'certification', 'skill']) expect(types.has(t)).toBe(true);
    expect(claims.every((c) => c.question && c.id)).toBe(true);
    expect(claims[0].type).toBe('metric');
  });
  test('assesses support and catches inconsistent numbers', () => {
    const metric = extractClaims(resume).find((c) => c.type === 'metric');
    const strong = assessClaim(metric, 'I measured reporting time before and after: it went from 5 hours to 3 hours, about 40%. I built the DAX measures and the refresh schedule myself because the query was slow.');
    const vague = assessClaim(metric, 'The team did it, I am not sure.');
    const wrong = assessClaim(metric, 'It cut time by about 90 percent overall and we measured it weekly in the dashboard for everyone.');
    expect(strong.status).toBe('supported');
    expect(vague.status).toBe('unverified');
    expect(wrong.status).toBe('inconsistent');
    const sum = summarize([{ assessment: strong }, { assessment: vague }, {}]);
    expect(sum.tested).toBe(2);
    expect(sum.supported).toBe(1);
  });
});

describe('Skills & JD Match', () => {
  test('skill extraction respects word boundaries', () => {
    const s = extractSkills('Strong in Java, JavaScript, C++ and MS Excel. The rest of my time I do sales.');
    expect(s).toEqual(expect.arrayContaining(['Java', 'JavaScript', 'C++', 'Excel', 'Sales']));
    expect(s).not.toContain('REST APIs');
  });
  test('match score, missing skills and questions', () => {
    const jd = `Role: Junior Data Analyst
Requirements:
- Must have strong SQL and Excel
- Experience with Power BI dashboards
- Python required
Nice to have: Tableau, statistics`;
    const req = extractRequirements(jd);
    expect(req.role).toMatch(/Junior Data Analyst/);
    const m = matchResume(jd, 'Python, SQL and Excel. Built dashboards in Power BI.');
    expect(m.score).toBeGreaterThan(50);
    expect(m.missing).toEqual([]);
    const m2 = matchResume(jd, 'I know Java and C++');
    expect(m2.missing.length).toBeGreaterThan(2);
    expect(m2.score).toBeLessThan(m.score);
    expect(jdQuestions(m2).some((q) => q.id.startsWith('jd-missing'))).toBe(true);
  });
});

function fakeEval(overall, extra = {}) {
  return {
    overall,
    scores: { relevance: overall, depth: overall, structure: overall, clarity: overall, confidence: overall },
    gaps: { coverage: overall / 10, missing: [] },
    fillers: { perHundred: 10 - overall, level: 'light', top: [] },
    star: { applicable: true, score: overall * 10, quantified: overall > 6, components: { result: { present: true } }, missing: [] },
    timing: { score: 80, thinkSec: 4, wpm: 140, thinkVerdict: 'ideal' },
    stats: { words: 120, hedges: 0 },
    ...extra
  };
}

describe('Readiness & Outcome Predictor', () => {
  test('readiness rises with better answers and stays in 0–100', () => {
    const low = readiness([fakeEval(3), fakeEval(4)], { sessions: 1 });
    const high = readiness([fakeEval(8.5), fakeEval(9)], { sessions: 8 });
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.score).toBeLessThanOrEqual(100);
    expect(low.score).toBeGreaterThanOrEqual(0);
    expect(high.breakdown).toHaveLength(7);
    expect(readiness([]).score).toBe(0);
  });
  test('recurring mistakes apply a penalty', () => {
    const a = readiness([fakeEval(7)], { sessions: 3 });
    const b = readiness([fakeEval(7)], { sessions: 3, activeMistakes: [{ count: 4 }, { count: 5 }] });
    expect(b.score).toBeLessThan(a.score);
  });
  test('outcome probability is monotonic in quality', () => {
    const lo = predictOutcome(outcomeFeatures([fakeEval(4)]));
    const hi = predictOutcome(outcomeFeatures([fakeEval(9)]));
    expect(hi.probability).toBeGreaterThan(lo.probability);
    expect(hi.helping.length).toBeGreaterThan(0);
    expect(lo.hurting.length).toBeGreaterThan(0);
    expect(hi.disclaimer).toBeTruthy();
  });
});

describe('Skill Gap Map, Digital Twin & Weakness engine', () => {
  const turns = [
    { competency: 'domain', difficulty: 2, evaluation: fakeEval(8) },
    { competency: 'domain', difficulty: 3, evaluation: fakeEval(7) },
    { competency: 'communication', difficulty: 2, evaluation: fakeEval(4) },
    { competency: 'teamwork', difficulty: 2, evaluation: fakeEval(5), stress: true }
  ];
  test('gap map lists measured axes and priorities', () => {
    const g = skillGapMap(turns, 'bsc-it');
    expect(g.axes).toHaveLength(8);
    expect(g.priorities[0].id).toBe('communication');
    expect(g.untested.length).toBe(5);
  });
  test('twin needs data, then produces a portrait and predictions', () => {
    expect(digitalTwin([]).ready).toBe(false);
    const t = digitalTwin(turns, { mistakes: [{ code: 'too-short', label: 'Answers too brief', count: 3, resolved: false }], sessions: 2 });
    expect(t.ready).toBe(true);
    expect(t.portrait).toMatch(/strongest in domain knowledge/i);
    expect(t.predictions.find((p) => p.id === 'domain').atLevel5).toBeLessThan(t.predictions.find((p) => p.id === 'domain').atLevel3);
    expect(t.archetype.name).toBeTruthy();
    expect(simulateScore({ mean: null }, 3)).toBeNull();
  });
  test('weakness engine targets the weakest competency', () => {
    const pick = pickWeaknessQuestion({ streamId: 'bsc-it', turns, difficulty: 2 });
    expect(pick.question.competency).toBe('communication');
    expect(pick.reason).toMatch(/communication/);
  });
});

describe('Presentation Behavior Analyzer', () => {
  test('returns non-diagnostic observations', () => {
    const r = analyzePresentation([
      { brightness: 40, presence: 0.4, centred: 0.3, motion: 0.2, voiceActivity: 0.6, volumeVariation: 0.3, longPauses: 1 },
      { brightness: 50, presence: 0.5, centred: 0.4, motion: 0.15, voiceActivity: 0.5, volumeVariation: 0.3, longPauses: 0 }
    ]);
    expect(r.observations.find((o) => o.area === 'Lighting').status).toBe('improve');
    expect(r.observations.find((o) => o.area === 'Framing').status).toBe('improve');
    expect(r.disclaimer).toMatch(/not an assessment/i);
    expect(JSON.stringify(r)).not.toMatch(/nervous|anxious|lying|emotion detected/i);
  });
  test('handles empty input', () => {
    expect(analyzePresentation([])).toBeNull();
  });
});

describe('A/B Answer Testing', () => {
  test('picks the stronger version and explains why', () => {
    const r = compareAnswers({ question: 'Tell me about a conflict.', answerA: 'Um we like talked and it was fine I guess.', answerB: STORY });
    expect(r.winner).toBe('B');
    expect(r.delta).toBeGreaterThan(0);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.dims).toHaveLength(5);
  });
  test('identical answers tie', () => {
    expect(compareAnswers({ question: 'Q?', answerA: STORY, answerB: STORY }).winner).toBe('tie');
  });
});

describe('Personal AI Coach (offline)', () => {
  test('detects intent and personalises', () => {
    expect(detectIntent('How do I stop saying um?')).toBe('fillers');
    expect(detectIntent('I get so nervous')).toBe('nerves');
    const r = coachReply('What should I work on?', { name: 'Asha Verma', mistakes: [{ label: 'Answers too brief', count: 3, tip: 'Say more.', resolved: false }], skillGap: { priorities: [{ id: 'communication', label: 'Communication', gap: 20 }] } });
    expect(r.reply).toMatch(/Communication/);
    expect(r.reply).toMatch(/answers too brief/);
  });
});

describe('Mistake Memory detection', () => {
  test('maps evaluation signals to mistake codes', () => {
    const e = evaluateAnswer({ answer: 'Um, like, basically we, uh, we did it, you know, we like finished.', question: 'Tell me about a team project', keyPoints: ['situation', 'action', 'result'], type: 'behavioral', metrics: { thinkTimeMs: 60000, answerDurationMs: 10000 } });
    const codes = detectMistakes(e, { type: 'behavioral', answer: 'Um, like, basically we, uh, we did it, you know, we like finished.' }).map((m) => m.code);
    expect(codes).toEqual(expect.arrayContaining(['filler-overuse', 'too-short', 'slow-start']));
  });
});

describe('Data & i18n', () => {
  test('streams are complete and ids unique', () => {
    expect(STREAMS.map((s) => s.name)).toEqual(expect.arrayContaining(['BSc IT', 'BCom', 'BBA', 'BCA', 'MBA']));
    const ids = [...STREAMS.flatMap((s) => s.questions.map((q) => q.id)), ...COMMON.map((q) => q.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const qq of [...STREAMS.flatMap((s) => s.questions), ...COMMON]) {
      expect(qq.keyPoints.length).toBeGreaterThanOrEqual(3);
      expect(qq.difficulty).toBeGreaterThanOrEqual(1);
      expect(qq.difficulty).toBeLessThanOrEqual(5);
    }
  });
  test('every offline language translates every common question', () => {
    for (const lang of Object.keys(QUESTIONS)) {
      for (const q of COMMON) expect(translateQuestion(q.id, lang, null)).toBeTruthy();
    }
    expect(LANGUAGES.filter((l) => l.offline).map((l) => l.code).sort()).toEqual(['de', 'en', 'es', 'fr', 'hi']);
    expect(PERSONAS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Interviewer planning', () => {
  test('plan starts with intro and includes special slots', () => {
    const plan = interviewer.buildPlan({ questionCount: 8, streamId: 'mba', hasResume: true, hasJd: true, focusWeaknesses: true, hasHistory: true });
    expect(plan).toHaveLength(8);
    expect(plan[0]).toBe('intro');
    expect(plan).toEqual(expect.arrayContaining(['resume', 'jd', 'weakness']));
  });
  test('stress forces the skeptical persona and tighter limits', () => {
    expect(interviewer.getPersona('mentor', true).id).toBe('skeptic');
    expect(interviewer.timeLimitFor('voice', true)).toBeLessThan(interviewer.timeLimitFor('voice', false));
  });
  test('offline next question respects language', async () => {
    const session = { stream: 'bcom', persona: 'mentor', language: 'hi', difficulty: 2, plan: ['intro', 'behavioral'], turns: [], stress: false };
    const q = await interviewer.nextQuestion(session, { history: [], mistakes: [] });
    expect(q.text).toBe(QUESTIONS.hi['hr-intro']);
    session.turns.push({ kind: 'main', questionId: q.questionId });
    const q2 = await interviewer.nextQuestion(session, { history: [], mistakes: [] });
    expect(q2.questionId).not.toBe('hr-intro');
  });
});

describe('Gemini helpers', () => {
  test('extractJson tolerates code fences and prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"b":2} hope that helps')).toEqual({ b: 2 });
    expect(extractJson('nope')).toBeNull();
  });
});

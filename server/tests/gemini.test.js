'use strict';
/**
 * Gemini integration with a mocked SDK: verifies the AI path is used when a key
 * exists, that its output is validated/merged, and that any failure falls back
 * to the offline engines without breaking the interview.
 */

const mockGenerate = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: mockGenerate } }))
}));

let interviewer;
let gemini;

beforeAll(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  jest.isolateModules(() => {
    interviewer = require('../src/services/ai/interviewer');
    gemini = require('../src/services/ai/gemini');
  });
});

afterAll(() => {
  process.env.GEMINI_API_KEY = '';
});

beforeEach(() => {
  mockGenerate.mockReset();
  gemini._reset();
});

const session = { stream: 'bsc-it', persona: 'tech-lead', language: 'en', difficulty: 3, plan: ['intro', 'technical', 'behavioral'], turns: [{ kind: 'main', questionId: 'hr-intro' }], stress: false, mode: 'text', role: 'Web Developer' };

test('Gemini writes the question when available', async () => {
  mockGenerate.mockResolvedValue({ text: JSON.stringify({ text: 'How would you cache API responses in an Angular app?', competency: 'domain', type: 'technical', keyPoints: ['http interceptor', 'cache invalidation', 'ttl'] }) });
  const q = await interviewer.nextQuestion(session, { history: [], mistakes: [] });
  expect(q.source).toBe('gemini');
  expect(q.text).toMatch(/cache API responses/);
  expect(q.keyPoints).toHaveLength(3);
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  const call = mockGenerate.mock.calls[0][0];
  expect(call.config.responseMimeType).toBe('application/json');
});

test('invalid Gemini output falls back to the question bank', async () => {
  mockGenerate.mockResolvedValue({ text: 'I am not JSON' });
  const q = await interviewer.nextQuestion(session, { history: [], mistakes: [] });
  expect(q.source).toBe('bank');
  expect(q.text.length).toBeGreaterThan(10);
});

test('Gemini errors fall back and the circuit breaker opens after repeated failures', async () => {
  mockGenerate.mockRejectedValue(new Error('429 quota'));
  for (let i = 0; i < 3; i++) {
    const q = await interviewer.nextQuestion(session, { history: [], mistakes: [] });
    expect(q.source).toBe('bank');
  }
  expect(gemini.isEnabled()).toBe(false);
  const calls = mockGenerate.mock.calls.length;
  await interviewer.nextQuestion(session, { history: [], mistakes: [] });
  expect(mockGenerate.mock.calls.length).toBe(calls); // not called while open
});

test('evaluation blends Gemini semantic scores with offline signals', async () => {
  mockGenerate.mockResolvedValue({
    text: JSON.stringify({ scores: { relevance: 9, depth: 9, structure: 8, clarity: 8, confidence: 8 }, strengths: ['Clear layered explanation.'], improvements: ['Mention cache invalidation.'], missing: ['ttl'], modelAnswer: ['Define', 'Explain', 'Example'] })
  });
  const turn = { text: 'Explain caching', keyPoints: ['cache', 'ttl'], type: 'technical', difficulty: 3 };
  const e = await interviewer.evaluate({ turn, answer: 'I cache responses with an interceptor, um, and expire them.', metrics: { thinkTimeMs: 3000, answerDurationMs: 20000 }, session });
  expect(e.source).toBe('gemini');
  expect(e.feedback.strengths).toEqual(['Clear layered explanation.']);
  expect(e.modelAnswer).toEqual(['Define', 'Explain', 'Example']);
  expect(e.fillers.total).toBeGreaterThan(0); // offline signals still present
  expect(e.overall).toBeGreaterThan(0);
  expect(e.overall).toBeLessThanOrEqual(10);
});

test('malformed Gemini scores are ignored', async () => {
  mockGenerate.mockResolvedValue({ text: JSON.stringify({ scores: { relevance: 'high' } }) });
  const turn = { text: 'Explain caching', keyPoints: ['cache'], type: 'technical', difficulty: 3 };
  const e = await interviewer.evaluate({ turn, answer: 'Caching stores responses.', metrics: {}, session });
  expect(e.source).toBe('offline');
});

test('health status reports a failing key with the provider error, without leaking the key', async () => {
  mockGenerate.mockRejectedValue(new Error('API key not valid. Please pass a valid API key. (AIzaSyFAKEFAKEFAKEFAKE123)'));
  const s = await gemini.status({ deep: true });
  expect(s.state).toBe('failing');
  expect(s.lastError.message).toMatch(/API key not valid/);
  expect(s.lastError.message).not.toMatch(/AIzaSyFAKE/);
  // cached: a second deep check within 30 s does not call Gemini again
  const calls = mockGenerate.mock.calls.length;
  await gemini.status({ deep: true });
  expect(mockGenerate.mock.calls.length).toBe(calls);
});

test('health status reports working after a successful call', async () => {
  mockGenerate.mockResolvedValue({ text: 'ok' });
  const s = await gemini.status({ deep: true });
  expect(s.state).toBe('working');
  expect(s.reply).toBe('ok');
  expect((await gemini.status()).state).toBe('working');
});

test('busy (503) responses are retried and then succeed', async () => {
  mockGenerate
    .mockRejectedValueOnce(Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE","message":"high demand"}}'), { status: 503 }))
    .mockResolvedValueOnce({ text: JSON.stringify({ text: 'Tell me about a bug you fixed recently.', competency: 'problemSolving', type: 'behavioral', keyPoints: ['bug', 'fix', 'result'] }) });
  const q = await interviewer.nextQuestion(session, { history: [], mistakes: [] });
  expect(q.source).toBe('gemini');
  expect(mockGenerate).toHaveBeenCalledTimes(2);
});

test('a retired model falls through to the next model in GEMINI_FALLBACK_MODELS', async () => {
  let g;
  process.env.GEMINI_FALLBACK_MODELS = 'backup-model';
  jest.isolateModules(() => {
    g = require('../src/services/ai/gemini');
  });
  process.env.GEMINI_FALLBACK_MODELS = '';
  mockGenerate.mockImplementation(async ({ model }) => {
    if (model !== 'backup-model') throw new Error('404 NOT_FOUND: model is no longer available');
    return { text: '{"ok":true}' };
  });
  expect(await g.generateJson({ system: 's', prompt: 'p' })).toEqual({ ok: true });
  expect(mockGenerate.mock.calls.map((c) => c[0].model)).toEqual([expect.any(String), 'backup-model']);
});

test('non-retryable errors fail fast', async () => {
  mockGenerate.mockRejectedValue(new Error('400 API key not valid'));
  expect(await gemini.generateJson({ system: 's', prompt: 'p' })).toBeNull();
  expect(mockGenerate).toHaveBeenCalledTimes(1);
});

describe('model fallback chain', () => {
  let g;
  beforeAll(() => {
    process.env.GEMINI_FALLBACK_MODELS = 'backup-model';
    jest.isolateModules(() => {
      g = require('../src/services/ai/gemini');
    });
    process.env.GEMINI_FALLBACK_MODELS = '';
  });
  beforeEach(() => g._reset());

  test('a slow primary model hands over to the backup model within the deadline', async () => {
    mockGenerate.mockImplementation(({ model }) => (model === 'backup-model' ? Promise.resolve({ text: '{"ok":true}' }) : new Promise(() => {})));
    const t0 = Date.now();
    expect(await g.generateJson({ system: 's', prompt: 'p', timeoutMs: 4000 })).toEqual({ ok: true });
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(mockGenerate.mock.calls.map((c) => c[0].model)).toEqual([expect.any(String), 'backup-model']);
  });

  test('a quota error moves straight to the backup model without retrying the same one', async () => {
    mockGenerate.mockImplementation(async ({ model }) => {
      if (model !== 'backup-model') throw Object.assign(new Error('{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}'), { status: 429 });
      return { text: '{"ok":true}' };
    });
    expect(await g.generateJson({ system: 's', prompt: 'p' })).toEqual({ ok: true });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  test('when every model fails, the health status names each model and its error', async () => {
    mockGenerate.mockImplementation(async ({ model }) => {
      if (model === 'backup-model') throw Object.assign(new Error('{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}'), { status: 429 });
      throw Object.assign(new Error('{"error":{"code":503,"message":"The model is overloaded","status":"UNAVAILABLE"}}'), { status: 503 });
    });
    const s = await g.status({ deep: true });
    expect(s.state).toBe('failing');
    expect(s.lastError.message).toMatch(/All Gemini models failed/);
    expect(s.lastError.message).toMatch(/overloaded/);
    expect(s.lastError.message).toMatch(/backup-model: 429 You exceeded your current quota/);
    expect(s.fallbackModels).toBeDefined();
  });
});


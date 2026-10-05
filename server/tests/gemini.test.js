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

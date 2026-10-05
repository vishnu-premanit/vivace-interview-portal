'use strict';
/** Node ↔ ML service contract, using a stub HTTP server, plus graceful fallback. */
const http = require('http');

let server;
let port;
let ml;
let interviewer;
let fail = false;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (fail) {
        res.writeHead(500);
        return res.end();
      }
      res.setHeader('content-type', 'application/json');
      if (req.url === '/health') return res.end(JSON.stringify({ status: 'ok' }));
      if (req.url === '/v1/analyze/answer') return res.end(JSON.stringify({ covered: ['hash'], missing: ['salt'], coverage: 0.5, similarity: 0.4, keywords: ['hash'], readability: 60 }));
      if (req.url === '/v1/predict/outcome') return res.end(JSON.stringify({ probability: 77, band: 'Likely to advance', helping: [], hurting: [], model: 'sklearn-logreg-v1' }));
      if (req.url === '/v1/match') return res.end(JSON.stringify({ similarity: 0.66, top_terms: ['angular'] }));
      res.writeHead(404);
      res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${port}`;
  jest.isolateModules(() => {
    ml = require('../src/services/mlClient');
    interviewer = require('../src/services/ai/interviewer');
  });
});

afterAll(async () => {
  process.env.ML_SERVICE_URL = '';
  await new Promise((r) => server.close(r));
});

test('uses ML service results when available', async () => {
  expect(await ml.status()).toBe('up');
  const out = await ml.predictOutcome({ overall: 7 });
  expect(out.probability).toBe(77);
  const session = { mode: 'text', stress: false, language: 'en' };
  const e = await interviewer.evaluate({ turn: { text: 'How to store passwords?', keyPoints: ['hash', 'salt'], type: 'technical', difficulty: 2 }, answer: 'Hash them.', metrics: {}, session });
  expect(e.gaps.engine).toBe('ml-tfidf');
  expect(e.gaps.missing).toEqual(['salt']);
  expect(e.ml.readability).toBe(60);
});

test('falls back to JS engines when the ML service errors', async () => {
  fail = true;
  jest.isolateModules(() => {
    ml = require('../src/services/mlClient');
  });
  expect(await ml.predictOutcome({ overall: 7 })).toBeNull();
  // second call short-circuits (circuit open) — still null, no throw
  expect(await ml.matchJd({ resume_text: 'a', jd_text: 'b' })).toBeNull();
  fail = false;
});

describe('sleeping ML service (free hosting)', () => {
  let slow;
  let slowMl;
  let healthCalls = 0;

  beforeAll(async () => {
    // Takes longer than the 2.5 s health timeout to answer, like a service waking from sleep.
    slow = http.createServer((req, res) => {
      if (req.url === '/health') healthCalls += 1;
      setTimeout(() => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(req.url === '/health' ? { status: 'ok' } : { probability: 61, band: 'Borderline', helping: [], hurting: [] }));
      }, 3000);
    });
    await new Promise((r) => slow.listen(0, r));
    process.env.ML_SERVICE_URL = `http://127.0.0.1:${slow.address().port}`;
    jest.isolateModules(() => {
      slowMl = require('../src/services/mlClient');
    });
  });

  afterAll(async () => {
    process.env.ML_SERVICE_URL = `http://127.0.0.1:${port}`;
    await new Promise((r) => slow.close(r));
  });

  test('a slow health check reports "waking" and a background request wakes it', async () => {
    expect(await slowMl.status()).toBe('waking');
    // While waking, checks answer at once and share the one background request.
    const t0 = Date.now();
    expect(await slowMl.status()).toBe('waking');
    expect(Date.now() - t0).toBeLessThan(200);
    expect(await slowMl.wake()).toBe(true);
    expect(healthCalls).toBe(2); // the timed-out probe + one wake request
    expect(await slowMl.status()).toBe('up');
    expect(await slowMl.predictOutcome({ overall: 6 })).toMatchObject({ probability: 61 });
  }, 15000);
});

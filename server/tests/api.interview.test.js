'use strict';
const request = require('supertest');
const { setup, teardown, registerAgent, getApp } = require('./helpers');
const fs = require('fs');
const path = require('path');
const { RESUME_TEXT, GOOD_ANSWER, TECH_ANSWER } = require('./fixtures');

beforeAll(setup);
afterAll(teardown);

async function runInterview(agent, options = {}, answerFor = () => GOOD_ANSWER) {
  const create = await agent.post('/api/interviews').send({ mode: 'text', stream: 'bsc-it', questionCount: 3, ...options });
  expect(create.status).toBe(201);
  const id = create.body.interview.id;
  let current = create.body.interview.current;
  let guard = 0;
  let last;
  while (current && guard++ < 20) {
    last = await agent.post(`/api/interviews/${id}/answer`).send({ answer: answerFor(current), thinkTimeMs: 4000, answerDurationMs: 45000, inputMode: 'typed' });
    expect(last.status).toBe(200);
    if (last.body.done) break;
    current = last.body.next;
  }
  const finish = await agent.post(`/api/interviews/${id}/finish`);
  expect(finish.status).toBe(200);
  return { id, create: create.body.interview, finish: finish.body.interview, last: last && last.body };
}

describe('interview lifecycle (text)', () => {
  test('requires auth', async () => {
    expect((await request(getApp()).post('/api/interviews').send({ mode: 'text', stream: 'bsc-it' })).status).toBe(401);
  });

  test('validates options', async () => {
    const { agent } = await registerAgent();
    expect((await agent.post('/api/interviews').send({ mode: 'hologram', stream: 'bsc-it' })).status).toBe(400);
    expect((await agent.post('/api/interviews').send({ mode: 'text', stream: 'bsc-it', difficulty: 9 })).status).toBe(400);
    expect((await agent.post('/api/interviews').send({ mode: 'text', stream: 'bsc-it', questionCount: 50 })).status).toBe(400);
  });

  test('runs end to end and produces a full report', async () => {
    const { agent } = await registerAgent();
    const { create, finish, id, last } = await runInterview(agent, { persona: 'tech-lead', difficulty: 2 });
    expect(create.persona.name).toBe('Arjun');
    expect(create.greeting).toMatch(/Arjun/);
    expect(create.current.text).toMatch(/background/i);
    expect(last.closing).toMatch(/Thank you/);
    expect(finish.status).toBe('completed');
    const r = finish.report;
    expect(r.overall).toBeGreaterThan(0);
    expect(r.readiness.score).toBeGreaterThan(0);
    expect(r.outcome.probability).toBeGreaterThanOrEqual(0);
    expect(r.outcome.probability).toBeLessThanOrEqual(100);
    expect(r.fillers.rows.length).toBe(r.answered);
    expect(r.timing.rows.length).toBe(r.answered);
    expect(r.difficultyPath.length).toBe(3);
    expect(r.skillGap.axes).toHaveLength(8);
    expect(r.summary.text).toBeTruthy();
    expect(r.summary.nextSteps.length).toBeGreaterThan(0);
    expect(finish.turns.every((t) => t.answered)).toBe(true);

    // Finishing twice is idempotent
    const again = await agent.post(`/api/interviews/${id}/finish`);
    expect(again.body.interview.report.generatedAt).toBe(r.generatedAt);

    // Answering a finished interview is rejected
    expect((await agent.post(`/api/interviews/${id}/answer`).send({ answer: 'late' })).status).toBe(409);

    const list = await agent.get('/api/interviews');
    expect(list.body.interviews[0]).toMatchObject({ id, status: 'completed' });
  });

  test('weak answers trigger counter-questions and difficulty drops', async () => {
    const { agent } = await registerAgent();
    const create = await agent.post('/api/interviews').send({ mode: 'text', stream: 'bca', questionCount: 4, difficulty: 3 });
    const id = create.body.interview.id;
    const r1 = await agent.post(`/api/interviews/${id}/answer`).send({ answer: 'I study computers.', thinkTimeMs: 1000, answerDurationMs: 3000 });
    expect(r1.status).toBe(200);
    expect(r1.body.next.kind).toBe('follow-up');
    expect(r1.body.next.counterReason).toBe('too-short');
    const r2 = await agent.post(`/api/interviews/${id}/answer`).send({ answer: 'I like code.', thinkTimeMs: 1000, answerDurationMs: 3000 });
    expect(r2.body.next.kind).toBe('main');
    expect(r2.body.difficulty.change).toBe(-1);
    expect(r2.body.next.difficulty).toBeLessThanOrEqual(3);
  });

  test('empty answers are rejected but skipping works', async () => {
    const { agent } = await registerAgent();
    const create = await agent.post('/api/interviews').send({ mode: 'text', stream: 'bcom', questionCount: 3 });
    const id = create.body.interview.id;
    expect((await agent.post(`/api/interviews/${id}/answer`).send({ answer: '  ' })).status).toBe(400);
    const skip = await agent.post(`/api/interviews/${id}/answer`).send({ skip: true });
    expect(skip.status).toBe(200);
    expect(skip.body.evaluation).toBeNull();
    expect(skip.body.next.kind).toBe('main');
  });

  test('finishing with no answers marks it abandoned', async () => {
    const { agent } = await registerAgent();
    const create = await agent.post('/api/interviews').send({ mode: 'text', stream: 'ba', questionCount: 3 });
    const res = await agent.post(`/api/interviews/${create.body.interview.id}/finish`);
    expect(res.body.abandoned).toBe(true);
    expect(res.body.interview.status).toBe('abandoned');
  });

  test('other users cannot read or modify an interview', async () => {
    const a = await registerAgent();
    const b = await registerAgent();
    const create = await a.agent.post('/api/interviews').send({ mode: 'text', stream: 'bsc-it', questionCount: 3 });
    const id = create.body.interview.id;
    expect((await b.agent.get(`/api/interviews/${id}`)).status).toBe(404);
    expect((await b.agent.post(`/api/interviews/${id}/answer`).send({ answer: 'hijack attempt' })).status).toBe(404);
    expect((await b.agent.delete(`/api/interviews/${id}`)).status).toBe(404);
    expect((await a.agent.get('/api/interviews/not-an-id')).status).toBe(404);
  });

  test('multi-language interview runs in Hindi offline', async () => {
    const { agent } = await registerAgent();
    const create = await agent.post('/api/interviews').send({ mode: 'text', stream: 'bba', language: 'hi', questionCount: 3 });
    expect(create.body.interview.language.speech).toBe('hi-IN');
    expect(create.body.interview.greeting).toMatch(/नमस्ते/);
    expect(create.body.interview.current.text).toMatch(/[ऀ-ॿ]/);
  });

  test('stress mode uses the skeptical persona and a time limit', async () => {
    const { agent } = await registerAgent();
    const create = await agent.post('/api/interviews').send({ mode: 'voice', stream: 'mba', stress: true, questionCount: 3 });
    expect(create.body.interview.persona.id).toBe('skeptic');
    expect(create.body.interview.timeLimitSec).toBe(75);
    const { finish } = await runInterview(agent, { mode: 'text', stream: 'mba', stress: true });
    expect(finish.report.stress).toBeTruthy();
    expect(finish.report.stress.score).toBeGreaterThanOrEqual(0);
  });
});

describe('voice & video specifics', () => {
  test('presentation samples, recording upload, media streaming with range', async () => {
    const { agent } = await registerAgent();
    const create = await agent.post('/api/interviews').send({ mode: 'video', stream: 'bsc-it', questionCount: 3 });
    const id = create.body.interview.id;
    const samples = Array.from({ length: 5 }, () => ({ brightness: 120, presence: 0.9, centred: 0.8, motion: 0.03, voiceActivity: 0.6, volumeVariation: 0.3, longPauses: 0 }));
    expect((await agent.post(`/api/interviews/${id}/presentation`).send({ samples })).status).toBe(200);
    expect((await agent.post(`/api/interviews/${id}/presentation`).send({ samples: [{ brightness: 999 }] })).status).toBe(400);

    const video = Buffer.alloc(4096, 7);
    const up = await agent.post(`/api/interviews/${id}/recording`).attach('recording', video, { filename: 'take.webm', contentType: 'video/webm' });
    expect(up.status).toBe(201);
    let fileId = up.body.recording.id;
    // A real WebM whose part was mislabelled text/plain (busboy does this for "codecs=vp9,opus") is accepted by sniffing.
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 1)]);
    const sniffed = await agent.post(`/api/interviews/${id}/recording`).attach('recording', webm, { filename: 'take.webm', contentType: 'text/plain' });
    expect(sniffed.status).toBe(201);
    expect(sniffed.body.recording.mime).toBe('video/webm');
    const up2 = await agent.post(`/api/interviews/${id}/recording`).attach('recording', video, { filename: 'take.webm', contentType: 'video/webm' });
    expect(up2.status).toBe(201);
    fileId = up2.body.recording.id; // earlier recordings were replaced
    const bad = await agent.post(`/api/interviews/${id}/recording`).attach('recording', Buffer.from('x'), { filename: 'evil.html', contentType: 'text/html' });
    expect(bad.status).toBe(415);

    const full = await agent.get(`/api/media/${fileId}`);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toBe('video/webm');
    const part = await agent.get(`/api/media/${fileId}`).set('Range', 'bytes=0-99');
    expect(part.status).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 0-99/4096');
    expect(Number(part.headers['content-length'])).toBe(100);
    expect((await agent.get(`/api/media/${fileId}`).set('Range', 'bytes=9000-9100')).status).toBe(416);

    const other = await registerAgent();
    expect((await other.agent.get(`/api/media/${fileId}`)).status).toBe(404);

    // Transcription without Gemini degrades gracefully
    const tr = await agent.post(`/api/interviews/${id}/transcribe`).attach('audio', Buffer.alloc(100), { filename: 'a.webm', contentType: 'audio/webm' });
    expect(tr.status).toBe(503);

    const { finish } = await (async () => {
      let current = create.body.interview.current;
      while (current) {
        const r = await agent.post(`/api/interviews/${id}/answer`).send({ answer: GOOD_ANSWER, thinkTimeMs: 3000, answerDurationMs: 60000, inputMode: 'speech' });
        current = r.body.done ? null : r.body.next;
      }
      const f = await agent.post(`/api/interviews/${id}/finish`);
      return { finish: f.body.interview };
    })();
    expect(finish.report.presentation.observations.length).toBeGreaterThan(0);
    expect(finish.report.presentation.disclaimer).toBeTruthy();
    expect(finish.recording.id).toBe(fileId);

    // Deleting the interview removes the recording
    expect((await agent.delete(`/api/interviews/${id}`)).status).toBe(200);
    expect((await agent.get(`/api/media/${fileId}`)).status).toBe(404);
  });

  test('text interviews reject presentation data', async () => {
    const { agent } = await registerAgent();
    const create = await agent.post('/api/interviews').send({ mode: 'text', stream: 'bsc-it', questionCount: 3 });
    const res = await agent.post(`/api/interviews/${create.body.interview.id}/presentation`).send({ samples: [{ brightness: 100 }] });
    expect(res.status).toBe(400);
  });
});

describe('resume truth checker & JD match', () => {
  test('uploads a PDF resume, extracts claims, checks one and runs a JD match', async () => {
    const { agent } = await registerAgent();
    const pdf = fs.readFileSync(path.join(__dirname, 'files/resume.pdf')); // printed by Chromium — a real-world PDF
    const up = await agent.post('/api/resume').attach('resume', pdf, { filename: 'asha-resume.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const resume = up.body.resume;
    expect(resume.skills).toEqual(expect.arrayContaining(['Angular', 'Node.js', 'MongoDB', 'Docker']));
    expect(resume.claims.length).toBeGreaterThan(4);
    const metric = resume.claims.find((c) => c.type === 'metric');
    expect(metric).toBeTruthy();

    const check = await agent.post(`/api/resume/claims/${metric.id}/check`).send({ answer: 'I measured load time in Lighthouse: it went from 4.0s to 2.6s, about 35%. I lazy-loaded the images and added a service worker cache myself.' });
    expect(check.status).toBe(200);
    expect(['supported', 'partially-supported']).toContain(check.body.assessment.status);
    expect(check.body.summary.tested).toBe(1);

    const jd = await agent.post('/api/resume/jd-match').send({ jdText: 'Role: Full-stack Developer\nMust have Angular, Node.js and MongoDB.\nRequired: Docker and AWS experience.\nNice to have: Kubernetes, Python.' });
    expect(jd.status).toBe(200);
    expect(jd.body.match.score).toBeGreaterThan(40);
    expect(jd.body.match.matched).toEqual(expect.arrayContaining(['Angular', 'Node.js']));
    expect(jd.body.questions.length).toBeGreaterThan(0);

    const get = await agent.get('/api/resume');
    expect(get.body.resume.filename).toBe('asha-resume.pdf');
    expect(get.body.lastJd.match.score).toBe(jd.body.match.score);

    const file = await agent.get('/api/resume/file');
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toMatch(/attachment/);

    // Interview that uses the resume + JD asks claim/JD questions and records truth assessments
    const { finish } = await runInterview(agent, { questionCount: 5, useResume: true, jdText: 'Role: Full-stack Developer\nMust have Angular, Node.js and MongoDB.\nRequired: Docker and AWS experience.' });
    const sources = finish.turns.map((t) => t.source);
    expect(sources).toEqual(expect.arrayContaining(['resume', 'jd']));
    expect(finish.report.truth).toBeTruthy();
    expect(finish.report.jd.score).toBeGreaterThan(0);

    expect((await agent.delete('/api/resume')).status).toBe(200);
    expect((await agent.get('/api/resume')).body.resume).toBeNull();
  });

  test('accepts TXT, rejects spoofed and unreadable files', async () => {
    const { agent } = await registerAgent();
    const txt = await agent.post('/api/resume').attach('resume', Buffer.from(RESUME_TEXT), { filename: 'resume.txt', contentType: 'text/plain' });
    expect(txt.status).toBe(201);
    const exe = await agent.post('/api/resume').attach('resume', Buffer.from('MZ\x90\x00binary'), { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(exe.status).toBe(415);
    const tiny = await agent.post('/api/resume').attach('resume', Buffer.from('hello'), { filename: 'r.txt', contentType: 'text/plain' });
    expect(tiny.status).toBe(422);
    const jdShort = await agent.post('/api/resume/jd-match').send({ jdText: 'short' });
    expect(jdShort.status).toBe(400);
  });
});

describe('analytics, twin, mistakes, coach and A/B lab', () => {
  test('dashboard data builds up from interviews', async () => {
    const { agent } = await registerAgent();
    const empty = await agent.get('/api/analytics/overview');
    expect(empty.status).toBe(200);
    expect(empty.body.readiness.score).toBe(0);
    expect(empty.body.outcome).toBeNull();

    await runInterview(agent, { questionCount: 3 }, (q) => (q.type === 'technical' ? TECH_ANSWER : GOOD_ANSWER));
    await runInterview(agent, { questionCount: 3 }, () => 'Um, like, basically we did it, you know.');

    const ov = await agent.get('/api/analytics/overview');
    expect(ov.body.readiness.score).toBeGreaterThan(0);
    expect(ov.body.outcome.probability).toBeGreaterThanOrEqual(0);
    expect(ov.body.trend).toHaveLength(2);
    expect(ov.body.totals.completed).toBe(2);
    expect(ov.body.mistakes.active.map((m) => m.code)).toEqual(expect.arrayContaining(['filler-overuse', 'too-short']));
    expect(ov.body.skillGap.axes.some((a) => a.current !== null)).toBe(true);

    const twin = await agent.get('/api/analytics/twin');
    expect(twin.body.twin.ready).toBe(true);
    expect(twin.body.twin.portrait).toBeTruthy();
    const sim = await agent.post('/api/analytics/twin/simulate').send({ competency: 'communication', difficulty: 4, stress: true });
    expect(sim.status).toBe(200);
    expect(sim.body).toHaveProperty('predicted');
    expect((await agent.post('/api/analytics/twin/simulate').send({ competency: 'magic', difficulty: 4 })).status).toBe(400);

    // Mistake memory reminders appear at the start of the next interview
    const next = await agent.post('/api/interviews').send({ mode: 'text', stream: 'bsc-it', questionCount: 3, focusWeaknesses: true });
    expect(next.body.interview.reminders.length).toBeGreaterThan(0);
  });

  test('coach replies using the candidate data and keeps history', async () => {
    const { agent } = await registerAgent();
    const r = await agent.post('/api/coach').send({ message: 'How do I stop saying um so much?' });
    expect(r.status).toBe(200);
    expect(r.body.message.text).toMatch(/filler/i);
    expect(r.body.message.source).toBe('offline');
    expect((await agent.post('/api/coach').send({ message: '' })).status).toBe(400);
    const h = await agent.get('/api/coach/history');
    expect(h.body.messages).toHaveLength(2);
    await agent.delete('/api/coach/history');
    expect((await agent.get('/api/coach/history')).body.messages).toHaveLength(0);
  });

  test('A/B lab compares two answers', async () => {
    const { agent } = await registerAgent();
    const r = await agent.post('/api/ab-test').send({ question: 'Tell me about a time you improved something.', answerA: 'I made the app faster I think.', answerB: GOOD_ANSWER });
    expect(r.status).toBe(200);
    expect(r.body.result.winner).toBe('B');
    expect(r.body.result.dims).toHaveLength(5);
    const list = await agent.get('/api/ab-test');
    expect(list.body.tests).toHaveLength(1);
  });

  test('account deletion removes all data', async () => {
    const { agent, credentials } = await registerAgent();
    await agent.post('/api/resume').attach('resume', Buffer.from(RESUME_TEXT), { filename: 'resume.txt', contentType: 'text/plain' });
    await runInterview(agent, { questionCount: 3 });
    expect((await agent.delete('/api/users/me').send({ password: 'wrong' })).status).toBe(400);
    expect((await agent.delete('/api/users/me').send({ password: credentials.password })).status).toBe(200);
    const login = await request(getApp()).post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
    expect(login.status).toBe(401);
    const Interview = require('../src/models/Interview');
    expect(await Interview.countDocuments({ user: credentials.id })).toBe(0);
  });
});

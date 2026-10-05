'use strict';
const request = require('supertest');
const { setup, teardown, registerAgent, getApp } = require('./helpers');

beforeAll(setup);
afterAll(teardown);

describe('health & meta', () => {
  test('GET /api/health', async () => {
    const res = await request(getApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up', ai: 'offline', ml: 'disabled', aiStatus: { state: 'offline' } });
  });
  test('GET /api/meta lists streams, personas and languages', async () => {
    const res = await request(getApp()).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.streams.length).toBeGreaterThanOrEqual(10);
    expect(res.body.personas.length).toBeGreaterThanOrEqual(5);
    expect(res.body.languages.find((l) => l.code === 'hi')).toBeTruthy();
  });
  test('unknown API route is a JSON 404', async () => {
    const res = await request(getApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});

describe('security headers', () => {
  test('helmet + permissions policy are set and x-powered-by is hidden', async () => {
    const res = await request(getApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['permissions-policy']).toMatch(/camera=\(self\)/);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('registration', () => {
  test('creates an account and sets an httpOnly SameSite=Strict cookie', async () => {
    const res = await request(getApp()).post('/api/auth/register').send({ name: 'Ravi Kumar', email: 'Ravi@Example.com', password: 'Secur3pass', stream: 'mba' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Ravi Kumar', email: 'ravi@example.com', stream: 'mba' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/vivace_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });
  test('rejects duplicates, weak passwords and bad emails', async () => {
    const dup = await request(getApp()).post('/api/auth/register').send({ name: 'Ravi K', email: 'ravi@example.com', password: 'Secur3pass' });
    expect(dup.status).toBe(409);
    const weak = await request(getApp()).post('/api/auth/register').send({ name: 'Weak', email: 'weak@example.com', password: 'password' });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toMatch(/letter and one number/);
    const short = await request(getApp()).post('/api/auth/register').send({ name: 'Weak', email: 'weak@example.com', password: 'a1' });
    expect(short.status).toBe(400);
    const email = await request(getApp()).post('/api/auth/register').send({ name: 'Bad', email: 'not-an-email', password: 'Secur3pass' });
    expect(email.status).toBe(400);
    const stream = await request(getApp()).post('/api/auth/register').send({ name: 'Bad', email: 'x@y.com', password: 'Secur3pass', stream: 'astrology' });
    expect(stream.status).toBe(400);
  });
  test('malformed JSON is a 400, not a crash', async () => {
    const res = await request(getApp()).post('/api/auth/register').set('content-type', 'application/json').send('{"name":');
    expect(res.status).toBe(400);
  });
});

describe('login, session & logout', () => {
  test('logs in, reads /me, logs out', async () => {
    const { credentials } = await registerAgent();
    const agent = request.agent(getApp());
    const bad = await agent.post('/api/auth/login').send({ email: credentials.email, password: 'Wrong1234' });
    expect(bad.status).toBe(401);
    const ok = await agent.post('/api/auth/login').send({ email: credentials.email.toUpperCase(), password: credentials.password });
    expect(ok.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(credentials.email);
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
  test('unknown email and wrong password give the same message', async () => {
    const a = await request(getApp()).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Whatever1' });
    expect(a.status).toBe(401);
    expect(a.body.error).toBe('Email or password is incorrect.');
  });
  test('locks the account after repeated failures', async () => {
    const { credentials } = await registerAgent();
    for (let i = 0; i < 5; i++) await request(getApp()).post('/api/auth/login').send({ email: credentials.email, password: 'Wrong1234' });
    const res = await request(getApp()).post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
    expect(res.status).toBe(423);
  });
  test('rejects tampered and missing tokens', async () => {
    expect((await request(getApp()).get('/api/auth/me')).status).toBe(401);
    const res = await request(getApp()).get('/api/auth/me').set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad');
    expect(res.status).toBe(401);
  });
  test('logout-all invalidates existing tokens', async () => {
    const { agent, credentials } = await registerAgent();
    const other = request.agent(getApp());
    await other.post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
    await agent.post('/api/auth/logout-all');
    expect((await other.get('/api/auth/me')).status).toBe(401);
  });
});

describe('injection & CSRF defences', () => {
  test('NoSQL operator payloads are rejected by validation', async () => {
    const res = await request(getApp()).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });
  test('cross-site state-changing requests are blocked', async () => {
    const { agent } = await registerAgent();
    const res = await agent.post('/api/coach').set('Origin', 'https://evil.example').send({ message: 'hi' });
    expect(res.status).toBe(403);
  });
  test('unknown profile fields are rejected (mass assignment)', async () => {
    const { agent } = await registerAgent();
    const res = await agent.patch('/api/users/me').send({ tokenVersion: 99, name: 'New Name' });
    expect(res.status).toBe(400);
  });
});

describe('profile management', () => {
  test('updates profile and preferences', async () => {
    const { agent } = await registerAgent();
    const res = await agent.patch('/api/users/me').send({ name: 'Asha V', stream: 'bcom', targetRole: 'Audit Assistant', language: 'hi', preferences: { lowPower: true } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Asha V', stream: 'bcom', targetRole: 'Audit Assistant', language: 'hi' });
    expect(res.body.user.preferences.lowPower).toBe(true);
  });
  test('changes password', async () => {
    const { agent, credentials } = await registerAgent();
    expect((await agent.post('/api/users/me/password').send({ current: 'nope', next: 'N3wpassword' })).status).toBe(400);
    expect((await agent.post('/api/users/me/password').send({ current: credentials.password, next: 'N3wpassword' })).status).toBe(200);
    const login = await request(getApp()).post('/api/auth/login').send({ email: credentials.email, password: 'N3wpassword' });
    expect(login.status).toBe(200);
  });
});

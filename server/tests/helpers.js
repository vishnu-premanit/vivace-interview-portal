'use strict';
const request = require('supertest');
const db = require('../src/db/mongo');
const { createApp } = require('../src/app');

let app;
async function setup() {
  await db.connect('');
  app = createApp();
  return app;
}
async function teardown() {
  await db.disconnect();
}

let counter = 0;
async function registerAgent(overrides = {}) {
  const agent = request.agent(app);
  counter += 1;
  const body = { name: 'Asha Verma', email: `asha${counter}.${Date.now()}@example.com`, password: 'Passw0rd!', stream: 'bsc-it', ...overrides };
  const res = await agent.post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user, credentials: body };
}

module.exports = { setup, teardown, registerAgent, getApp: () => app };

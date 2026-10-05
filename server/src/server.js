'use strict';
const env = require('./config/env');
const db = require('./db/mongo');
const { createApp } = require('./app');
const ml = require('./services/mlClient');

async function main() {
  await db.connect();
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[vivace] listening on http://localhost:${env.port} — AI: ${env.geminiKey ? 'Gemini' : 'offline engines'}${env.mlServiceUrl ? `, ML: ${env.mlServiceUrl}` : ''}`);
    // The ML service may be asleep (free hosting); start waking it while the first user signs in.
    void ml.wake();
  });
  const shutdown = async (signal) => {
    console.log(`[vivace] ${signal} received, shutting down`);
    server.close(async () => {
      await db.disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[vivace] failed to start:', err);
  process.exit(1);
});

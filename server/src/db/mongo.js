'use strict';
const mongoose = require('mongoose');
const { Readable } = require('stream');
const env = require('../config/env');

let memoryServer = null;
let bucket = null;

async function connect(uri = env.mongoUri) {
  let target = uri;
  if (!target) {
    if (env.isProd) throw new Error('MONGODB_URI is required in production');
    // Zero-setup local runs: spin up an in-memory MongoDB (dev dependency).
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    target = memoryServer.getUri('vivace');
    if (!env.isTest) console.log('[db] MONGODB_URI not set — using in-memory MongoDB (data resets on restart)');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(target, { serverSelectionTimeoutMS: 15000, maxPoolSize: 10 });
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'media' });
  return mongoose.connection;
}

async function disconnect() {
  await mongoose.disconnect();
  bucket = null;
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

function getBucket() {
  if (!bucket) throw new Error('Database not connected');
  return bucket;
}

function saveBuffer(buffer, filename, contentType, metadata = {}) {
  return new Promise((resolve, reject) => {
    const upload = getBucket().openUploadStream(filename, { metadata: { ...metadata, contentType } });
    Readable.from(buffer).pipe(upload).on('error', reject).on('finish', () => resolve(upload.id));
  });
}

async function findFile(id) {
  let oid;
  try {
    oid = new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
  const files = await getBucket().find({ _id: oid }).limit(1).toArray();
  return files[0] || null;
}

async function deleteFile(id) {
  try {
    await getBucket().delete(new mongoose.Types.ObjectId(String(id)));
  } catch {
    /* already gone */
  }
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connect, disconnect, getBucket, saveBuffer, findFile, deleteFile, isConnected };

'use strict';
const env = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  if (err.type === 'entity.too.large') {
    status = 413;
    message = 'That request is too large.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body.';
  } else if (err.name === 'MulterError') {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message;
  } else if (err.name === 'CastError') {
    status = 404;
    message = 'Not found.';
  } else if (err.code === 11000) {
    status = 409;
    message = 'That already exists.';
  }
  if (status >= 500) {
    if (!env.isTest) console.error('[error]', err);
    if (env.isProd) message = 'Something went wrong on our side. Please try again.';
  }
  const body = { error: message };
  if (err.details && status < 500) body.details = err.details;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };

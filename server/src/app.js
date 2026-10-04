'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const env = require('./config/env');
const { sanitizeBody, apiLimiter } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/error');

function sameOriginGuard(req, res, next) {
  // CSRF defence in depth (cookies are already SameSite=Strict): reject state-changing
  // requests whose Origin is a different site.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = [`${req.protocol}://${req.get('host')}`, ...env.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)];
  if (allowed.includes(origin)) return next();
  return res.status(403).json({ error: 'Cross-site request blocked.' });
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render / most PaaS sit behind one proxy

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'media-src': ["'self'", 'blob:', 'mediastream:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': env.isProd ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
  );
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
    next();
  });
  app.use(compression());
  if (env.corsOrigin) {
    app.use('/api', cors({ origin: env.corsOrigin.split(',').map((s) => s.trim()), credentials: true }));
  }
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(sanitizeBody);

  const api = express.Router();
  api.use(apiLimiter);
  api.use(sameOriginGuard);
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use('/', require('./routes/meta').router);
  api.use('/auth', require('./routes/auth').router);
  api.use('/users', require('./routes/users').router);
  api.use('/interviews', require('./routes/interviews').router);
  api.use('/resume', require('./routes/resume').router);
  api.use('/analytics', require('./routes/analytics').router);
  api.use('/coach', require('./routes/coach').router);
  api.use('/ab-test', require('./routes/abtest').router);
  api.use('/media', require('./routes/media').router);
  api.use(notFound);
  app.use('/api', api);

  // Serve the Angular build (single deployable).
  const dist = env.clientDist;
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders(res, filePath) {
          if (/\.[a-f0-9]{8,}\.(js|css|woff2?)$|\/media\//.test(filePath) || /-[A-Z0-9]{8}\.(js|css)$/.test(filePath)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.set('Cache-Control', 'public, max-age=3600');
          }
        }
      })
    );
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (req.method !== 'GET' || path.extname(req.path)) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else if (!env.isTest) {
    app.get('/', (_req, res) => res.type('text').send('Vivace API is running. Build the client (npm run build) to serve the web app from here.'));
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };

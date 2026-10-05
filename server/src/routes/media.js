'use strict';
const express = require('express');
const db = require('../db/mongo');
const { requireAuth } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/httpError');

const router = express.Router();
router.use(requireAuth);

/** Stream a GridFS file the user owns, with HTTP Range support so video can seek. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = await db.findFile(req.params.id);
    if (!file || !file.metadata || file.metadata.user !== req.user._id.toString()) throw new HttpError(404, 'File not found.');
    const size = file.length;
    const type = file.metadata.contentType || 'application/octet-stream';
    res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': type, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' });
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
      if (m && !m[1] && m[2]) {
        start = Math.max(0, size - parseInt(m[2], 10));
        end = size - 1;
      }
      if (start >= size || end >= size || start > end) {
        res.status(416).set('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      db.getBucket().openDownloadStream(file._id, { start, end: end + 1 }).pipe(res);
      return;
    }
    res.set('Content-Length', size);
    db.getBucket().openDownloadStream(file._id).pipe(res);
  })
);

module.exports = { router };

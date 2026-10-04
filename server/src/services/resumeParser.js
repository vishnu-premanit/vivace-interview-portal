'use strict';
const { HttpError } = require('../utils/httpError');

/** Extract plain text from an uploaded resume. Checks magic bytes, not just the extension. */
async function extractText(buffer, filename = '') {
  const head = buffer.subarray(0, 8);
  const lower = filename.toLowerCase();
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') {
    // Require the library file directly: the package index runs a debug harness when loaded as main.
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    let result;
    try {
      result = await pdfParse(buffer, { max: 8 });
    } catch {
      throw new HttpError(422, 'That PDF could not be read. Try exporting it again or upload a DOCX.');
    }
    return { text: clean(result.text), mime: 'application/pdf' };
  }
  if (head[0] === 0x50 && head[1] === 0x4b && lower.endsWith('.docx')) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return { text: clean(result.value), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    const text = buffer.toString('utf8');
    // Reject binary data pretending to be text.
    if (/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 2000))) throw new HttpError(415, 'That file does not look like plain text.');
    return { text: clean(text), mime: 'text/plain' };
  }
  throw new HttpError(415, 'Please upload a PDF, DOCX or TXT resume.');
}

function clean(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 60000);
}

module.exports = { extractText };

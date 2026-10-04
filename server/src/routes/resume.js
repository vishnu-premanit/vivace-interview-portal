'use strict';
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const User = require('../models/User');
const db = require('../db/mongo');
const ml = require('../services/mlClient');
const gemini = require('../services/ai/gemini');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { uploadLimiter, aiLimiter } = require('../middleware/security');
const { HttpError, asyncHandler } = require('../utils/httpError');
const { extractText } = require('../services/resumeParser');
const { extractClaims, assessClaim, summarize } = require('../services/engines/resumeTruth');
const { extractSkills } = require('../services/data/skills');
const { matchResume, jdQuestions } = require('../services/engines/jdMatch');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

function resumeView(user) {
  const r = user.resume || {};
  if (!r.fileId) return null;
  const claims = (r.claims || []).map((c) => ({ id: c.id, type: c.type, keyword: c.keyword, evidence: c.evidence, question: c.question, assessment: c.assessment && c.assessment.status ? c.assessment : null }));
  return {
    filename: r.filename,
    size: r.size,
    uploadedAt: r.uploadedAt,
    skills: r.skills || [],
    claims,
    summary: summarize(claims)
  };
}

async function geminiClaims(text) {
  const data = await gemini.generateJson({
    system: 'You extract verifiable claims from resumes for interview preparation. Respond only with JSON.',
    prompt: `From this resume, list up to 8 specific claims an interviewer would want to verify (achievements with numbers, leadership, projects).
Return JSON {"claims":[{"type":"metric|leadership|project|experience|certification","keyword":"short label","evidence":"exact phrase from resume","question":"one probing interview question"}]}
Resume:
"""${text.slice(0, 12000)}"""`,
    temperature: 0.2
  });
  if (!data || !Array.isArray(data.claims)) return [];
  const types = ['metric', 'leadership', 'project', 'experience', 'certification'];
  return data.claims
    .filter((c) => c && types.includes(c.type) && typeof c.keyword === 'string' && typeof c.question === 'string')
    .slice(0, 8)
    .map((c, i) => ({ id: `ai${Date.now().toString(36)}${i}`, type: c.type, keyword: c.keyword.slice(0, 90), evidence: String(c.evidence || '').slice(0, 200), question: c.question.slice(0, 300) }));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ resume: resumeView(req.user), lastJd: req.user.lastJd && req.user.lastJd.match ? { match: req.user.lastJd.match, at: req.user.lastJd.at } : null });
  })
);

router.post(
  '/',
  uploadLimiter,
  upload.single('resume'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a resume file to upload.');
    const { text, mime } = await extractText(req.file.buffer, req.file.originalname);
    if (text.length < 80) throw new HttpError(422, 'We could not read enough text from that file. If it is a scanned PDF, upload a text-based PDF or DOCX.');
    const user = await User.findById(req.user._id).select('+resume.text');
    if (user.resume && user.resume.fileId) await db.deleteFile(user.resume.fileId);
    const safeName = req.file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    const fileId = await db.saveBuffer(req.file.buffer, safeName, mime, { user: user._id.toString(), kind: 'resume' });
    let claims = extractClaims(text);
    if (gemini.isEnabled()) {
      const aiClaims = await geminiClaims(text);
      const skillClaims = claims.filter((c) => c.type === 'skill');
      if (aiClaims.length) claims = [...aiClaims, ...skillClaims].slice(0, 24);
    }
    user.resume = { fileId, filename: safeName, mime, size: req.file.size, text, skills: extractSkills(text), claims, uploadedAt: new Date() };
    await user.save();
    res.status(201).json({ resume: resumeView(user) });
  })
);

router.get(
  '/file',
  asyncHandler(async (req, res) => {
    const r = req.user.resume;
    if (!r || !r.fileId) throw new HttpError(404, 'No resume uploaded.');
    const file = await db.findFile(r.fileId);
    if (!file) throw new HttpError(404, 'No resume uploaded.');
    res.set('Content-Type', (file.metadata && file.metadata.contentType) || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${r.filename.replace(/"/g, '')}"`);
    res.set('Cache-Control', 'private, no-store');
    db.getBucket().openDownloadStream(file._id).pipe(res);
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (user.resume && user.resume.fileId) await db.deleteFile(user.resume.fileId);
    await User.updateOne({ _id: user._id }, { $unset: { resume: 1 } });
    res.json({ ok: true });
  })
);

const checkSchema = z.object({ answer: z.string().trim().min(2, 'Write an answer first').max(6000) });

router.post(
  '/claims/:claimId/check',
  aiLimiter,
  validate(checkSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    const claim = user.resume && user.resume.claims ? user.resume.claims.find((c) => c.id === req.params.claimId) : null;
    if (!claim) throw new HttpError(404, 'Claim not found.');
    const assessment = { ...assessClaim(claim, req.body.answer), at: new Date() };
    claim.assessment = assessment;
    user.markModified('resume.claims');
    await user.save();
    res.json({ assessment, summary: summarize(user.resume.claims) });
  })
);

const jdSchema = z.object({ jdText: z.string().trim().min(40, 'Paste the full job description (at least a few lines).').max(20000) });

router.post(
  '/jd-match',
  aiLimiter,
  validate(jdSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+resume.text');
    const resumeText = (user.resume && user.resume.text) || '';
    const match = matchResume(req.body.jdText, resumeText, user.resume && user.resume.skills && user.resume.skills.length ? user.resume.skills : null);
    const mlMatch = resumeText ? await ml.matchJd({ resume_text: resumeText, jd_text: req.body.jdText }) : null;
    if (mlMatch && typeof mlMatch.similarity === 'number') {
      match.textSimilarity = mlMatch.similarity;
      match.engine = 'ml-tfidf';
      if (Array.isArray(mlMatch.top_terms)) match.sharedTerms = mlMatch.top_terms.slice(0, 12);
    }
    match.hasResume = Boolean(resumeText);
    user.lastJd = { text: req.body.jdText, match, at: new Date() };
    await user.save();
    res.json({ match, questions: jdQuestions(match, 5) });
  })
);

module.exports = { router };

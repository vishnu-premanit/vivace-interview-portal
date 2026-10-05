'use strict';
const mongoose = require('mongoose');

const turnSchema = new mongoose.Schema(
  {
    index: Number,
    kind: { type: String, enum: ['main', 'follow-up'], default: 'main' },
    parent: { type: Number, default: null },
    slot: String,
    questionId: String,
    text: String,
    competency: String,
    type: String,
    difficulty: Number,
    keyPoints: [String],
    source: String,
    claimId: String,
    counterReason: String,
    targetReason: String,
    untranslated: Boolean,
    askedAt: Date,
    answer: { type: String, maxlength: 12000 },
    answeredAt: Date,
    skipped: { type: Boolean, default: false },
    metrics: {
      thinkTimeMs: Number,
      answerDurationMs: Number,
      inputMode: String
    },
    audioFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    evaluation: mongoose.Schema.Types.Mixed,
    difficultyChange: { level: Number, change: Number, reason: String }
  },
  { _id: false }
);

const interviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    mode: { type: String, enum: ['text', 'voice', 'video'], required: true },
    stream: { type: String, required: true },
    role: { type: String, default: '' },
    persona: { type: String, default: 'mentor' },
    language: { type: String, default: 'en' },
    stress: { type: Boolean, default: false },
    focusWeaknesses: { type: Boolean, default: false },
    useResume: { type: Boolean, default: false },
    difficultyStart: { type: Number, default: 2 },
    difficulty: { type: Number, default: 2 },
    questionCount: { type: Number, default: 6 },
    plan: [String],
    jd: { text: String, match: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ['active', 'completed', 'abandoned'], default: 'active', index: true },
    turns: [turnSchema],
    presentationSamples: { type: [mongoose.Schema.Types.Mixed], select: false },
    presentation: mongoose.Schema.Types.Mixed,
    recording: {
      fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      mime: String,
      size: Number
    },
    reminders: [mongoose.Schema.Types.Mixed],
    report: mongoose.Schema.Types.Mixed,
    aiSource: { type: String, default: 'offline' },
    completedAt: Date
  },
  { timestamps: true }
);

interviewSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.Interview || mongoose.model('Interview', interviewSchema);

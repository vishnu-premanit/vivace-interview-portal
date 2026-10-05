'use strict';
const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    id: String,
    type: { type: String, enum: ['skill', 'metric', 'leadership', 'project', 'experience', 'certification'] },
    keyword: String,
    evidence: String,
    question: String,
    number: String,
    assessment: { score: Number, status: String, note: String, at: Date }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    stream: { type: String, default: 'bsc-it' },
    targetRole: { type: String, default: '', maxlength: 100 },
    language: { type: String, default: 'en' },
    preferences: {
      lowPower: { type: Boolean, default: false },
      voiceRate: { type: Number, default: 1 }
    },
    resume: {
      fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      filename: String,
      mime: String,
      size: Number,
      text: { type: String, select: false },
      skills: [String],
      claims: [claimSchema],
      uploadedAt: Date
    },
    lastJd: {
      text: { type: String, maxlength: 20000 },
      match: mongoose.Schema.Types.Mixed,
      at: Date
    },
    tokenVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false }
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    stream: this.stream,
    targetRole: this.targetRole,
    language: this.language,
    preferences: this.preferences,
    hasResume: Boolean(this.resume && this.resume.fileId),
    createdAt: this.createdAt
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);

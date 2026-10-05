'use strict';
const mongoose = require('mongoose');

const mistakeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    code: { type: String, required: true },
    label: String,
    tip: String,
    count: { type: Number, default: 0 },
    cleanStreak: { type: Number, default: 0 },
    resolved: { type: Boolean, default: false },
    details: [String],
    firstSeen: Date,
    lastSeen: Date,
    resolvedAt: Date
  },
  { timestamps: true }
);
mistakeSchema.index({ user: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.Mistake || mongoose.model('Mistake', mistakeSchema);

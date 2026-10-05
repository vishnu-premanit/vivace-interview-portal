'use strict';
const mongoose = require('mongoose');

const coachMessageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['user', 'coach'], required: true },
    text: { type: String, required: true, maxlength: 6000 },
    intent: String,
    source: String
  },
  { timestamps: true }
);

module.exports = mongoose.models.CoachMessage || mongoose.model('CoachMessage', coachMessageSchema);

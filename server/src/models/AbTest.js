'use strict';
const mongoose = require('mongoose');

const abTestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    question: { type: String, maxlength: 600 },
    answerA: { type: String, maxlength: 6000 },
    answerB: { type: String, maxlength: 6000 },
    result: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

module.exports = mongoose.models.AbTest || mongoose.model('AbTest', abTestSchema);

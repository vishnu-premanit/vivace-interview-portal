'use strict';
const { phrases } = require('../data/i18n');

/**
 * Counter-Question Engine.
 * Decides whether the interviewer should probe the last answer instead of moving on,
 * and what to probe. Priorities: unverified resume claim → missing result →
 * vagueness → too short → missing "why". Persona pressure and stress mode raise
 * how often we probe.
 */

const BIG_CLAIM = /\b(i (led|managed|built|founded|architected|designed|headed|single-handedly|increased|reduced|saved|grew))\b[^.?!]{0,60}/i;

function pickClaim(answer, resumeClaims = []) {
  const lower = String(answer || '').toLowerCase();
  const fromResume = resumeClaims.find((c) => c.keyword && lower.includes(String(c.keyword).toLowerCase()));
  if (fromResume) return { claim: fromResume.keyword, fromResume: true, claimId: fromResume.id };
  const m = String(answer || '').match(BIG_CLAIM);
  if (m) {
    const phrase = m[0].replace(/^i\s+/i, '').trim().split(/\s+/).slice(0, 7).join(' ');
    return { claim: `that you ${phrase}`, fromResume: false };
  }
  return null;
}

function decideCounterQuestion({ evaluation, answer, type, language = 'en', followUpsSoFar = 0, maxFollowUps = 1, pressure = 1, stress = false, resumeClaims = [] }) {
  if (followUpsSoFar >= maxFollowUps) return null;
  const p = phrases(language);
  const words = evaluation.stats ? evaluation.stats.words : 0;
  const star = evaluation.star || {};
  const gaps = evaluation.gaps || { missing: [] };

  if (stress && words > 25 && evaluation.scores && evaluation.scores.confidence < 6) {
    return { text: p.stressDoubt, reason: 'stress-doubt', focus: 'confidence' };
  }

  const claim = pickClaim(answer, resumeClaims);
  if (claim && (claim.fromResume || pressure >= 2)) {
    return { text: p.followClaim(claim.claim), reason: claim.fromResume ? 'resume-claim' : 'claim', focus: claim.claim, claimId: claim.claimId };
  }

  if (type !== 'technical' && star.components && !star.components.result.present && words > 25) {
    return { text: p.followResult, reason: 'missing-result', focus: 'result' };
  }

  const vague = evaluation.scores && evaluation.scores.depth < 5 && words >= 15;
  if (vague) return { text: p.followVague, reason: 'vague', focus: 'specifics' };

  if (words < 15 && words > 0) return { text: p.followShort, reason: 'too-short', focus: 'depth' };

  if (type === 'technical' && gaps.missing.length && gaps.coverage < 0.5 && pressure >= 2) {
    if (language === 'en') {
      return { text: `You didn't mention ${gaps.missing[0]}. How does that fit into your answer?`, reason: 'gap-probe', focus: gaps.missing[0] };
    }
    return { text: p.followWhy, reason: 'gap-probe', focus: gaps.missing[0] };
  }

  if (pressure >= 3 && evaluation.overall >= 6 && evaluation.overall < 8) {
    return { text: p.followWhy, reason: 'why', focus: 'reasoning' };
  }
  return null;
}

module.exports = { decideCounterQuestion, pickClaim };

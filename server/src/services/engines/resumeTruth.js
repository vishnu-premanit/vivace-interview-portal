'use strict';
const crypto = require('crypto');
const { extractSkills } = require('../data/skills');
const { sentences, tokenize, normalize } = require('../../utils/text');

/**
 * Resume Truth Checker.
 * 1. Pull verifiable claims out of a resume: skills, quantified achievements,
 *    leadership claims, projects, experience durations, certifications.
 * 2. Turn each into a probing question.
 * 3. After the candidate answers, judge whether the answer *supports* the claim:
 *    specifics, technical vocabulary around the skill, consistent numbers.
 *
 * It never says someone lied — only how well the interview backed the claim up.
 */

const id = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

const SECTION_HINT = /^(projects?|academic projects?|internships?|experience|work experience|certifications?|achievements?)\b/i;

function lines(text) {
  return String(text || '')
    .split(/\r?\n|•|·|▪|◦|●/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 3);
}

function extractClaims(resumeText) {
  const text = String(resumeText || '');
  const claims = [];
  const seen = new Set();
  const push = (claim) => {
    const key = `${claim.type}:${normalize(claim.keyword)}`;
    if (seen.has(key)) return;
    seen.add(key);
    claims.push({ id: id(key), ...claim });
  };

  for (const skill of extractSkills(text)) {
    push({ type: 'skill', keyword: skill, evidence: findEvidence(text, skill), question: `Your resume lists ${skill}. Tell me about the last thing you built or did with it, and one problem you hit along the way.` });
  }

  let section = '';
  for (const line of lines(text)) {
    if (SECTION_HINT.test(line) && line.length < 40) {
      section = line.toLowerCase();
      continue;
    }
    const quantified = line.match(/\b(\d+(\.\d+)?)\s?(%|percent|x|times|users|customers|students|members|lakhs?|crores?|k\b|hours|downloads)/i);
    if (quantified && /\b(increas|reduc|improv|grew|saved|boost|cut|achiev|generat|led|manag|handl|serv|onboard)/i.test(line)) {
      push({ type: 'metric', keyword: line.slice(0, 90), number: quantified[0], evidence: line, question: `You wrote "${line.slice(0, 110)}". How exactly was that ${quantified[0]} measured, and what was your part in it?` });
      continue;
    }
    if (/\b(led|leading|headed|captain|president|coordinat(ed|or)|managed a team|team lead)\b/i.test(line)) {
      push({ type: 'leadership', keyword: line.slice(0, 90), evidence: line, question: `Your resume says "${line.slice(0, 110)}". What was the hardest people problem you handled in that role?` });
      continue;
    }
    if (/project/.test(section) || /\b(developed|built|designed|created|implemented)\b/i.test(line)) {
      if (tokenize(line).length >= 4) {
        push({ type: 'project', keyword: line.slice(0, 90), evidence: line, question: `Pick the project "${line.slice(0, 80)}". What would break first if ten times more people used it?` });
      }
      continue;
    }
    const years = line.match(/\b(\d+(\.\d+)?)\+?\s*(years?|yrs?|months?)\b.*\b(experience|exp)\b/i);
    if (years) {
      push({ type: 'experience', keyword: years[0], evidence: line, question: `You mention ${years[0]}. What is one thing you can do now that you could not do at the start of that period?` });
      continue;
    }
    if (/certif|nptel|coursera|udemy|aws certified|ccna|nism|cfa level/i.test(line)) {
      push({ type: 'certification', keyword: line.slice(0, 80), evidence: line, question: `You hold "${line.slice(0, 80)}". What is one concept from it you have actually applied?` });
    }
  }

  // Keep the list focused: metrics & leadership first, then projects, then skills.
  const order = { metric: 0, leadership: 1, project: 2, experience: 3, certification: 4, skill: 5 };
  return claims.sort((a, b) => order[a.type] - order[b.type]).slice(0, 24);
}

function findEvidence(text, skill) {
  const hit = sentences(text).find((s) => s.toLowerCase().includes(skill.toLowerCase().split(/[\s/]/)[0]));
  return hit ? hit.slice(0, 160) : '';
}

const SPECIFIC = /\b(\d+|because|for example|i (used|wrote|built|configured|fixed|chose|measured|tested|deployed|designed|set up)|the (bug|issue|problem|error)|version|library|endpoint|table|query|schema|function|component|module|client|users)\b/gi;

/** Judge how well an interview answer supports a claim. Returns 0–100 + status. */
function assessClaim(claim, answer) {
  const text = String(answer || '');
  const words = tokenize(text).length;
  const specifics = (text.match(SPECIFIC) || []).length;
  const mentions = claim.keyword && normalize(text).includes(normalize(claim.keyword).split(' ')[0]);
  let score = 20;
  score += Math.min(30, words / 4);
  score += Math.min(30, specifics * 6);
  if (mentions) score += 10;
  if (/\b(i don't remember|not sure|i think it was|someone else|my friend did|team did it)\b/i.test(text)) score -= 25;

  // Numbers in the answer that contradict the resume's number.
  let inconsistent = false;
  if (claim.number) {
    const claimed = parseFloat(claim.number);
    const nums = (text.match(/\b\d+(\.\d+)?/g) || []).map(Number);
    if (nums.length && !nums.some((n) => Math.abs(n - claimed) <= Math.max(1, claimed * 0.15))) {
      inconsistent = nums.some((n) => n > 0 && (n < claimed * 0.5 || n > claimed * 2));
      if (inconsistent) score -= 25;
    } else if (nums.length) {
      score += 10;
    }
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  let status = 'unverified';
  if (inconsistent) status = 'inconsistent';
  else if (score >= 70) status = 'supported';
  else if (score >= 45) status = 'partially-supported';
  const note =
    status === 'supported'
      ? 'Answer gave concrete, first-hand detail.'
      : status === 'partially-supported'
        ? 'Some detail, but an interviewer would probe further.'
        : status === 'inconsistent'
          ? 'Numbers in the answer did not line up with the resume. Make sure you can explain the figure.'
          : 'Answer was too general to back this claim up.';
  return { score, status, note };
}

function summarize(claims) {
  const assessed = claims.filter((c) => c.assessment && typeof c.assessment.score === 'number');
  const avg = assessed.length ? Math.round(assessed.reduce((a, c) => a + c.assessment.score, 0) / assessed.length) : null;
  return {
    totalClaims: claims.length,
    tested: assessed.length,
    credibility: avg,
    supported: assessed.filter((c) => c.assessment.status === 'supported').length,
    weak: assessed.filter((c) => ['unverified', 'inconsistent'].includes(c.assessment.status)).length
  };
}

module.exports = { extractClaims, assessClaim, summarize };

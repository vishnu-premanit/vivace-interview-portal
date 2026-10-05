'use strict';
const { extractSkills, skillCategory } = require('../data/skills');
const { similarity } = require('./gapDetection');
const { tokenize } = require('../../utils/text');

/**
 * JD Match Interview.
 * Reads a job description, works out what the employer actually asks for,
 * compares it with the resume and builds targeted questions — hardest on the
 * requirements the resume does not cover.
 */

function extractRequirements(jdText) {
  const text = String(jdText || '');
  const skills = extractSkills(text);
  const must = [];
  const nice = [];
  for (const raw of text.split(/\r?\n|•|·|;/)) {
    const line = raw.trim();
    if (line.length < 6) continue;
    const lineSkills = extractSkills(line);
    if (/\b(nice to have|preferred|bonus|plus|good to have|desirable)\b/i.test(line)) nice.push(...lineSkills);
    else if (/\b(must|required|requirement|mandatory|need|strong|proficien|experience (in|with)|knowledge of)\b/i.test(line)) must.push(...lineSkills);
  }
  const mustSet = new Set(must.length ? must : skills.filter((s) => !nice.includes(s)));
  const niceSet = new Set(nice.filter((s) => !mustSet.has(s)));
  const yearsMatch = text.match(/(\d+)\s*\+?\s*(?:-\s*\d+\s*)?years?/i);
  const roleMatch = text.match(/\b(?:role|position|title)\s*[:-]\s*([^\n.]{3,60})/i);
  return {
    skills,
    mustHave: [...mustSet],
    niceToHave: [...niceSet],
    minYears: yearsMatch ? Number(yearsMatch[1]) : null,
    role: roleMatch ? roleMatch[1].trim() : null,
    words: tokenize(text).length
  };
}

function matchResume(jdText, resumeText = '', resumeSkills = null) {
  const req = extractRequirements(jdText);
  const have = new Set(resumeSkills || extractSkills(resumeText));
  const matchedMust = req.mustHave.filter((s) => have.has(s));
  const missingMust = req.mustHave.filter((s) => !have.has(s));
  const matchedNice = req.niceToHave.filter((s) => have.has(s));
  const missingNice = req.niceToHave.filter((s) => !have.has(s));
  const textSim = resumeText ? similarity(jdText, resumeText) : 0;

  const mustScore = req.mustHave.length ? matchedMust.length / req.mustHave.length : 0.5;
  const niceScore = req.niceToHave.length ? matchedNice.length / req.niceToHave.length : 0.5;
  const score = Math.round(Math.min(100, (mustScore * 0.65 + niceScore * 0.15 + Math.min(1, textSim * 2.2) * 0.2) * 100));

  const verdict = score >= 75 ? 'Strong match' : score >= 50 ? 'Partial match' : 'Stretch role';
  return {
    score,
    verdict,
    requirements: req,
    matched: [...matchedMust, ...matchedNice],
    missing: missingMust,
    missingNice,
    textSimilarity: textSim,
    byCategory: groupByCategory(req.skills, have)
  };
}

function groupByCategory(skills, have) {
  const out = {};
  for (const s of skills) {
    const cat = skillCategory(s);
    out[cat] = out[cat] || { required: 0, matched: 0 };
    out[cat].required += 1;
    if (have.has(s)) out[cat].matched += 1;
  }
  return out;
}

function jdQuestions(match, limit = 4) {
  const qs = [];
  for (const skill of match.missing.slice(0, 2)) {
    qs.push({
      id: `jd-missing-${slug(skill)}`,
      text: `This role asks for ${skill}, and I don't see it on your resume. How would you get productive with it in your first month?`,
      competency: 'adaptability',
      difficulty: 3,
      type: 'situational',
      keyPoints: ['plan|learn|course|documentation', 'related experience|similar|transferable', 'small project|practice|build', 'ask|mentor|team'],
      source: 'jd'
    });
  }
  for (const skill of match.matched.slice(0, 3)) {
    qs.push({
      id: `jd-match-${slug(skill)}`,
      text: `The job description puts weight on ${skill}. Describe the most demanding thing you've done with ${skill} and how you'd apply it here.`,
      competency: 'domain',
      difficulty: 3,
      type: 'behavioral',
      keyPoints: [`${skill.toLowerCase()}`, 'problem|challenge', 'action|built|did', 'result|outcome', 'apply|this role'],
      source: 'jd'
    });
  }
  if (match.requirements.role) {
    qs.push({
      id: 'jd-role-fit',
      text: `What do you think a great first 90 days look like in the ${match.requirements.role} role?`,
      competency: 'professionalism',
      difficulty: 3,
      type: 'situational',
      keyPoints: ['learn|understand', 'stakeholder|team', 'quick win|deliver', 'measure|goal'],
      source: 'jd'
    });
  }
  return qs.slice(0, limit);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { extractRequirements, matchResume, jdQuestions };

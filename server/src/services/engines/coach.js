'use strict';

/**
 * Personal AI Coach — offline brain. Gemini (when configured) gets the same
 * context and writes a free-form reply; this is the deterministic fallback.
 * It reads intent from the message and answers using the candidate's own data.
 */

const INTENTS = [
  ['fillers', /\b(filler|um+|uh+|like|basically|fluent|fluency|stammer|stutter)\b/i],
  ['nerves', /\b(nervous|anxious|anxiety|scared|panic|blank|freeze|confidence|confident|stress)\b/i],
  ['star', /\b(star|story|stories|behaviou?ral|tell me about a time|structure)\b/i],
  ['resume', /\b(resume|cv|claim|project section)\b/i],
  ['salary', /\b(salary|ctc|package|negotiat|offer)\b/i],
  ['intro', /\b(introduce|introduction|tell me about yourself|self intro)\b/i],
  ['weakness', /\b(weak|weakest|improve|worst|gap|bad at|work on|focus on|next step)\b/i],
  ['plan', /\b(plan|schedule|prepare|preparation|week|days|routine|practice)\b/i],
  ['technical', /\b(technical|coding|dsa|sql|accounting|finance|case|guesstimate)\b/i],
  ['progress', /\b(progress|score|readiness|ready|how am i|doing)\b/i]
];

function detectIntent(message) {
  for (const [name, re] of INTENTS) if (re.test(message)) return name;
  return 'general';
}

function coachReply(message, ctx = {}) {
  const intent = detectIntent(String(message || ''));
  const name = ctx.name ? ctx.name.split(' ')[0] : 'there';
  const twin = ctx.twin && ctx.twin.ready ? ctx.twin : null;
  const mistakes = (ctx.mistakes || []).filter((m) => !m.resolved);
  const gap = ctx.skillGap && ctx.skillGap.priorities ? ctx.skillGap.priorities : [];
  const readiness = ctx.readiness;
  const lines = [];

  switch (intent) {
    case 'fillers': {
      const rate = twin ? twin.delivery.fillersPer100 : null;
      lines.push(rate !== null ? `Your fillers sit at about ${rate} per 100 words${rate > 4 ? ' — noticeable to an interviewer' : ' — honestly not bad'}.` : `Let's tackle fillers.`);
      lines.push('Three drills that work: (1) record a 60-second answer, count fillers, redo it aiming for half; (2) replace the filler with a deliberate one-beat pause — it sounds confident, not hesitant; (3) memorise your first sentence for common questions, since fillers cluster at the start.');
      break;
    }
    case 'nerves':
      lines.push(`Nerves are normal, ${name}. The goal is not to remove them but to give them somewhere to go.`);
      lines.push('Before the interview: do two warm-up answers out loud. During: breathe out slowly before you answer, and use a bridge line ("That\'s a good one — let me think for a second"). If you blank, say what you do know and reason forward. Try a Stress Mode session here — practising under pressure makes the real thing feel calmer.');
      break;
    case 'star':
      lines.push('Use STAR, but keep it light: one sentence of Situation, one of Task, three or four of Action (with "I", not "we"), and a Result with a number.');
      if (twin && twin.delivery.quantifiesResults !== null) lines.push(`Right now you quantify results in about ${twin.delivery.quantifiesResults}% of your stories. Push that above 70%.`);
      break;
    case 'resume':
      lines.push('Every line on your resume is a question you might be asked. Upload it on the Resume & JD page and the Truth Checker will list the claims an interviewer is most likely to probe, with a practice question for each.');
      if (ctx.truth && ctx.truth.credibility !== null && ctx.truth.credibility !== undefined) lines.push(`So far your answers back up your claims at a credibility of ${ctx.truth.credibility}/100.`);
      break;
    case 'salary':
      lines.push('For freshers: research the typical range for the role and city first. If asked early, say you are open and focused on the role, then ask for their range. When you do give a number, give a narrow range anchored slightly above your target, and justify it with skills, not needs.');
      break;
    case 'intro':
      lines.push('A strong "Tell me about yourself" takes about 60–90 seconds: present (what you are studying/doing), past (one or two proof points — a project, internship, result), future (why this role). End on the role, not on your hobbies.');
      break;
    case 'weakness':
      if (gap.length) lines.push(`Your biggest gaps right now: ${gap.map((g) => `${g.label} (${g.gap} points below target)`).join(', ')}.`);
      if (mistakes.length) lines.push(`The habit to fix first: ${mistakes[0].label.toLowerCase()} — seen ${mistakes[0].count} times. ${mistakes[0].tip}`);
      if (!gap.length && !mistakes.length) lines.push('I need a couple of interviews before I can point at a real weakness. Run one in text mode — it takes ten minutes.');
      lines.push('Start your next interview with "Focus on my weak areas" switched on and the Weakness-to-Question engine will pick questions that target these.');
      break;
    case 'plan':
      lines.push('Here is a simple 7-day plan:');
      lines.push('Day 1 — text interview to set a baseline. Day 2 — fix the top mistake from your report. Day 3 — voice interview. Day 4 — upload your resume and run the Truth Checker questions. Day 5 — JD Match interview for a real job. Day 6 — Stress Mode. Day 7 — video interview, then compare your readiness score with Day 1.');
      break;
    case 'technical':
      lines.push('For technical rounds, answer in layers: one-line definition, how it works, a trade-off, and an example from your own work. If you are unsure, say what you would check — interviewers reward a clear reasoning process.');
      if (gap.find((g) => g.id === 'domain')) lines.push('Your domain-knowledge scores are below target, so revise fundamentals for your stream before the next session.');
      break;
    case 'progress':
      if (readiness && readiness.sampleSize) lines.push(`Your readiness score is ${readiness.score}/100 (${readiness.band}).`);
      if (twin) lines.push(twin.portrait);
      if (!readiness || !readiness.sampleSize) lines.push('No interviews yet — your first one will give me a baseline.');
      break;
    default:
      lines.push(`Happy to help, ${name}. I can help with filler words, nerves, STAR stories, your resume, salary questions, a practice plan, or what to work on next.`);
      if (mistakes.length) lines.push(`If you want a starting point: your most frequent mistake is "${mistakes[0].label.toLowerCase()}".`);
  }
  return { reply: lines.join('\n\n'), intent, source: 'offline' };
}

module.exports = { coachReply, detectIntent };

'use strict';
const { round, mean } = require('../../utils/text');

/**
 * Presentation Behavior Analyzer (non-diagnostic).
 * The browser samples low-resolution frames and audio levels locally — no video
 * leaves the device for this — and sends only aggregate numbers:
 *   brightness (0–255), presence (0–1: share of frames with a subject in the
 *   centre region), centred (0–1), motion (0–1 average frame difference),
 *   voiceActivity (0–1), volumeVariation (0–1), longPauses (count).
 * We turn those into practical camera-presence tips. It does not infer emotion,
 * personality, honesty or any medical/psychological condition.
 */

const DISCLAIMER =
  'These are practical camera and audio observations from simple frame and sound measurements. They are not an assessment of personality, emotion, honesty or health.';

function analyzePresentation(samples = []) {
  const s = samples.filter((x) => x && typeof x === 'object');
  if (!s.length) return null;
  const agg = {
    brightness: round(mean(s.map((x) => x.brightness))),
    presence: round(mean(s.map((x) => x.presence)), 2),
    centred: round(mean(s.map((x) => x.centred)), 2),
    motion: round(mean(s.map((x) => x.motion)), 3),
    voiceActivity: round(mean(s.map((x) => x.voiceActivity)), 2),
    volumeVariation: round(mean(s.map((x) => x.volumeVariation)), 2),
    longPauses: s.reduce((a, x) => a + (Number(x.longPauses) || 0), 0)
  };

  const observations = [];
  const add = (area, status, text) => observations.push({ area, status, text });

  if (Number.isFinite(agg.brightness)) {
    if (agg.brightness < 60) add('Lighting', 'improve', 'The frame is quite dark. Face a window or put a lamp behind your screen.');
    else if (agg.brightness > 210) add('Lighting', 'improve', 'The frame is washed out. Move away from direct light behind or above the camera.');
    else add('Lighting', 'good', 'Lighting is even and your face is easy to see.');
  }
  if (Number.isFinite(agg.presence)) {
    if (agg.presence < 0.6) add('Framing', 'improve', 'You were often out of the centre of the frame. Sit so your head and shoulders fill the middle third.');
    else if (agg.centred < 0.55) add('Framing', 'okay', 'You drift to one side at times. Centre the camera at eye level.');
    else add('Framing', 'good', 'Well framed — head and shoulders stay centred.');
  }
  if (Number.isFinite(agg.motion)) {
    if (agg.motion > 0.12) add('Movement', 'improve', 'There is a lot of movement in frame. Plant your feet and keep gestures within the frame.');
    else if (agg.motion < 0.008 && agg.presence > 0.5) add('Movement', 'okay', 'Very still. A few natural hand gestures make you look more engaged.');
    else add('Movement', 'good', 'Natural, controlled movement.');
  }
  if (Number.isFinite(agg.volumeVariation)) {
    if (agg.volumeVariation < 0.12 && agg.voiceActivity > 0.2) add('Voice', 'okay', 'Your volume stays very flat. Lift your voice slightly on key points.');
    else if (agg.voiceActivity > 0 && agg.voiceActivity < 0.25) add('Voice', 'improve', 'Long stretches of silence while recording. Check your microphone level or speak a little louder.');
    else if (agg.voiceActivity > 0) add('Voice', 'good', 'Clear voice with natural variation.');
  }
  if (agg.longPauses >= 4) add('Pauses', 'okay', `${agg.longPauses} pauses longer than three seconds. Short pauses are fine; long ones are easier to fill with a bridging phrase.`);

  const goods = observations.filter((o) => o.status === 'good').length;
  const score = observations.length ? Math.round((goods / observations.length) * 70 + 30 - observations.filter((o) => o.status === 'improve').length * 8) : null;
  return { metrics: agg, observations, score: score === null ? null : Math.max(0, Math.min(100, score)), disclaimer: DISCLAIMER };
}

module.exports = { analyzePresentation, DISCLAIMER };

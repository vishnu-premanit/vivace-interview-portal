'use strict';

/**
 * Dynamic Difficulty Engine.
 * Uses a short rolling window rather than the single last answer so one lucky
 * or unlucky reply doesn't swing the interview. Stress mode leans harder.
 */
function nextDifficulty({ current = 2, recentScores = [], stress = false, min = 1, max = 5 }) {
  const window = recentScores.slice(-2);
  if (!window.length) return { level: current, change: 0, reason: 'Starting level' };
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  const last = window[window.length - 1];

  let change = 0;
  let reason = 'Holding steady — answers are in the expected range for this level.';
  const upAt = stress ? 6.5 : 7.5;
  if (last >= upAt && avg >= upAt - 0.5) {
    change = 1;
    reason = 'Strong answers — raising the bar.';
  } else if (last <= 4 && avg <= 4.5) {
    change = -1;
    reason = 'Stepping back a level to rebuild momentum.';
  }
  if (stress && change === 0 && last >= 5.5) {
    change = 1;
    reason = 'Stress mode: pushing harder while you are holding up.';
  }
  const level = Math.min(max, Math.max(min, current + change));
  return { level, change: level - current, reason };
}

module.exports = { nextDifficulty };

export interface Feature {
  no: string;
  name: string;
  line: string;
  group: 'Interviewer' | 'Analysis' | 'Prediction' | 'Practice';
}

export const FEATURES: Feature[] = [
  { no: '01', name: 'Interview personas', line: 'Five interviewers — from a supportive HR partner to a sceptical hiring manager — each with their own voice, pace and pressure.', group: 'Interviewer' },
  { no: '02', name: 'Dynamic difficulty', line: 'Two strong answers and the next question gets harder. Two weak ones and it steps back so you can recover.', group: 'Interviewer' },
  { no: '03', name: 'Counter-questions', line: 'Vague answer? Missing result? A claim you can’t back up? Expect a follow-up, the way a real panel would.', group: 'Interviewer' },
  { no: '04', name: 'Stress mode', line: 'Tighter clocks, interruptions and push-back, so the real thing feels calmer by comparison.', group: 'Interviewer' },
  { no: '05', name: 'Twelve languages', line: 'Interview in English, Hindi, Spanish, French, German, Tamil, Telugu, Marathi, Bengali and more.', group: 'Interviewer' },
  { no: '06', name: 'JD match interview', line: 'Paste a job description. Vivace scores your fit and builds questions around what the employer actually asked for.', group: 'Interviewer' },
  { no: '07', name: 'Answer gap detection', line: 'Each question has the points a strong answer covers. You see exactly which ones you missed.', group: 'Analysis' },
  { no: '08', name: 'Filler word heatmap', line: 'Every “um”, “like” and “basically” — counted, highlighted, and mapped to where in the answer they cluster.', group: 'Analysis' },
  { no: '09', name: 'Response-time intelligence', line: 'Thinking time and speaking pace, judged against how hard the question was.', group: 'Analysis' },
  { no: '10', name: 'STAR structure analyzer', line: 'Sentence-by-sentence tagging of Situation, Task, Action and Result — and whether your result has a number.', group: 'Analysis' },
  { no: '11', name: 'Presentation analyzer', line: 'Lighting, framing, movement and voice — measured on your device, never “reading” your emotions.', group: 'Analysis' },
  { no: '12', name: 'Resume truth checker', line: 'Finds the claims on your resume an interviewer will poke at, then checks if your answers hold them up.', group: 'Analysis' },
  { no: '13', name: 'Readiness score', line: 'One honest number from 0 to 100, broken down so you can see what moves it.', group: 'Prediction' },
  { no: '14', name: 'Outcome predictor', line: 'How likely you are to advance at your current level — with the factors helping and hurting.', group: 'Prediction' },
  { no: '15', name: 'Skill gap map', line: 'Eight competencies plotted against what your stream and role expect.', group: 'Prediction' },
  { no: '16', name: 'Interview digital twin', line: 'A model of how you interview. Ask it how you’d do on a level-5 leadership question under stress.', group: 'Prediction' },
  { no: '17', name: 'Weakness-to-question engine', line: 'Turn on “focus on weak areas” and the next interview is built around them.', group: 'Practice' },
  { no: '18', name: 'Mistake memory', line: 'Recurring habits are remembered, reminded, and only cleared after you stop repeating them.', group: 'Practice' },
  { no: '19', name: 'A/B answer testing', line: 'Write two versions of an answer and see, dimension by dimension, which one lands.', group: 'Practice' },
  { no: '20', name: 'Personal coach', line: 'A coach that has read every one of your reports. Ask it what to fix this week.', group: 'Practice' }
];

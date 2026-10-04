export type Mode = 'text' | 'voice' | 'video';

export interface User {
  id: string;
  name: string;
  email: string;
  stream: string;
  targetRole: string;
  language: string;
  preferences: { lowPower: boolean; voiceRate: number };
  hasResume: boolean;
  createdAt: string;
}

export interface Stream {
  id: string;
  name: string;
  full: string;
  group: string;
  roles: string[];
  questionCount: number;
}

export interface Persona {
  id: string;
  name: string;
  title: string;
  style: string;
  tone: string;
  pressure: number;
  voice: { rate: number; pitch: number };
  hue: number;
}

export interface Language {
  code: string;
  name: string;
  native: string;
  speech: string;
  offline: boolean;
}

export interface Meta {
  streams: Stream[];
  personas: Persona[];
  languages: Language[];
  competencies: { id: string; label: string }[];
  sampleQuestions: { id: string; text: string; type: string }[];
}

export interface FillerMark {
  start: number;
  end: number;
  word: string;
}

export interface HeatCell {
  index: number;
  words: number;
  fillers: number;
  density: number;
}

export interface Evaluation {
  source: 'offline' | 'gemini';
  overall: number;
  scores: Record<'relevance' | 'depth' | 'structure' | 'clarity' | 'confidence', number>;
  stats: { words: number; sentences: number; avgSentence: number; hedges: number; assertive: number; connectors: number };
  fillers: { total: number; perHundred: number; level: string; top: { word: string; count: number }[]; heatmap: HeatCell[]; hotspot: string | null; marks: FillerMark[] } | null;
  star: {
    applicable: boolean;
    score: number;
    components: Record<'situation' | 'task' | 'action' | 'result', { present: boolean; sentences: number[] }>;
    missing: string[];
    quantified: boolean;
    sentences: { index: number; text: string; tag: string | null }[];
    tips: string[];
  };
  gaps: { covered: string[]; missing: string[]; coverage: number; unavailable?: boolean; engine?: string };
  timing: { thinkSec: number; answerSec: number; wpm: number | null; idealThink: [number, number]; thinkVerdict: string; paceVerdict: string | null; score: number; notes: string[] };
  feedback: { strengths: string[]; improvements: string[] };
  modelAnswer: string[];
}

export interface Turn {
  index: number;
  kind: 'main' | 'follow-up';
  parent: number | null;
  text: string;
  competency: string;
  type: 'technical' | 'behavioral' | 'situational';
  difficulty: number;
  source: string;
  counterReason: string | null;
  targetReason: string | null;
  untranslated: boolean;
  answer: string | null;
  skipped: boolean;
  answered: boolean;
  hasAudio: boolean;
  evaluation?: Evaluation | null;
}

export interface Reminder {
  code: string;
  label: string;
  tip: string;
  count: number;
}

export interface Driver {
  key: string;
  label: string;
  impact: number;
}

export interface Outcome {
  probability: number;
  band: string;
  helping: Driver[];
  hurting: Driver[];
  model: string;
  disclaimer: string;
}

export interface Readiness {
  score: number;
  band: string;
  sampleSize: number;
  penalty?: number;
  breakdown: { key: string; label: string; weight: number; value: number }[];
}

export interface GapAxis {
  id: string;
  label: string;
  current: number | null;
  target: number;
  gap: number | null;
  n: number;
  trend: number;
}

export interface SkillGap {
  stream: string | null;
  axes: GapAxis[];
  priorities: { id: string; label: string; gap: number }[];
  untested: string[];
  coverage: number;
  skills?: { resume: string[]; missingForJd: string[] };
}

export interface Report {
  generatedAt: string;
  overall: number;
  scores: Evaluation['scores'];
  answered: number;
  skipped: number;
  followUps: number;
  readiness: Readiness;
  outcome: Outcome | null;
  competencies: { id: string; label: string; n: number; mean: number }[];
  fillers: { total: number; perHundred: number; words: { word: string; count: number }[]; rows: { index: number; label: string; heatmap: HeatCell[]; perHundred: number }[] };
  star: { average: number; components: { key: string; rate: number }[]; quantifiedRate: number } | null;
  timing: { rows: { index: number; difficulty: number; thinkSec: number; answerSec: number; wpm: number | null; verdict: string; idealThink: [number, number] }[]; avgThink: number; avgAnswer: number; avgWpm: number | null; notes: string[] };
  difficultyPath: { index: number; level: number; change: number; reason: string | null; score: number | null }[];
  mistakes: { code: string; count: number; label: string; tip: string }[];
  truth: { totalClaims: number; tested: number; credibility: number | null; supported: number; weak: number; claims: { id: string; type: string; keyword: string; assessment: ClaimAssessment }[] } | null;
  jd: { score: number; verdict: string; matched: string[]; missing: string[] } | null;
  stress: { stressAverage: number; calmAverage: number | null; delta: number | null; score: number; followUpsHandled: number } | null;
  presentation: { metrics: Record<string, number>; observations: { area: string; status: 'good' | 'okay' | 'improve'; text: string }[]; score: number | null; disclaimer: string } | null;
  skillGap: SkillGap;
  persona: { id: string; name: string; title: string };
  summary: { text: string; nextSteps: string[]; source: string };
}

export interface Interview {
  id: string;
  mode: Mode;
  stream: { id: string; name: string };
  role: string;
  persona: Persona;
  language: Language;
  stress: boolean;
  focusWeaknesses: boolean;
  useResume: boolean;
  status: 'active' | 'completed' | 'abandoned';
  difficulty: number;
  difficultyStart: number;
  questionCount: number;
  mainAsked: number;
  timeLimitSec: number;
  greeting: string;
  reminders: Reminder[];
  turns: Turn[];
  current: Turn | null;
  hasRecording: boolean;
  recording: { id: string; mime: string; size: number } | null;
  aiSource: string;
  report: Report | null;
  createdAt: string;
  completedAt: string | null;
}

export interface InterviewSummary {
  id: string;
  mode: Mode;
  stream: string;
  streamName: string;
  role: string;
  persona: string;
  language: string;
  stress: boolean;
  status: string;
  questionCount: number;
  answered: number;
  overall: number | null;
  readiness: number | null;
  outcome: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AnswerResult {
  evaluation: Evaluation | null;
  next: Turn | null;
  transition: string;
  difficulty: { level: number; change: number; reason: string } | null;
  done: boolean;
  closing: string | null;
  progress: { mainAsked: number; questionCount: number };
}

export interface Mistake {
  code: string;
  label: string;
  tip: string;
  count: number;
  lastSeen: string;
  cleanStreak: number;
  details: string[];
}

export interface Overview {
  readiness: Readiness;
  outcome: Outcome | null;
  skillGap: SkillGap;
  mistakes: { active: Mistake[]; resolved: { code: string; label: string; count: number; resolvedAt: string }[] };
  trend: { id: string; date: string; mode: Mode; stress: boolean; overall: number | null; readiness: number | null; fillers: number | null }[];
  byMode: { mode: Mode; answers: number; average: number | null }[];
  truth: { totalClaims: number; tested: number; credibility: number | null; supported: number; weak: number } | null;
  totals: { sessions: number; completed: number; answers: number; averageScore: number | null; minutesPractised: number };
}

export interface Twin {
  ready: boolean;
  sampleSize: number;
  message?: string;
  archetype?: { id: string; name: string; description: string };
  portrait?: string;
  delivery?: { avgWords: number; wpm: number | null; thinkSec: number | null; fillersPer100: number; hedgesPerAnswer: number; quantifiesResults: number | null; starScore: number | null };
  consistency?: number;
  stressDelta?: number | null;
  strengths?: string[];
  risks?: string[];
  predictions?: { id: string; label: string; atLevel3: number | null; atLevel5: number | null }[];
  habits?: { code: string; label: string; count: number }[];
}

export interface ClaimAssessment {
  score: number;
  status: 'supported' | 'partially-supported' | 'unverified' | 'inconsistent';
  note: string;
  at?: string;
}

export interface Claim {
  id: string;
  type: string;
  keyword: string;
  evidence: string;
  question: string;
  assessment: ClaimAssessment | null;
}

export interface ResumeInfo {
  filename: string;
  size: number;
  uploadedAt: string;
  skills: string[];
  claims: Claim[];
  summary: { totalClaims: number; tested: number; credibility: number | null; supported: number; weak: number };
}

export interface JdMatch {
  score: number;
  verdict: string;
  requirements: { skills: string[]; mustHave: string[]; niceToHave: string[]; minYears: number | null; role: string | null };
  matched: string[];
  missing: string[];
  missingNice: string[];
  textSimilarity: number;
  hasResume?: boolean;
  sharedTerms?: string[];
}

export interface AbResult {
  winner: 'A' | 'B' | 'tie';
  delta: number;
  dims: { key: string; a: number; b: number; diff: number }[];
  a: AbSide;
  b: AbSide;
  reasons: string[];
  merge: string[];
  aiVerdict?: string;
  improved?: string;
  source: string;
}

export interface AbSide {
  overall: number;
  scores: Evaluation['scores'];
  fillers: { perHundred: number; top: { word: string; count: number }[]; marks: FillerMark[] };
  star: { score: number; missing: string[]; quantified: boolean };
  gaps: { covered: string[]; missing: string[]; coverage: number };
  stats: Evaluation['stats'];
  feedback: Evaluation['feedback'];
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
  createdAt: string;
  source?: string;
}

# Vivace — interview practice that talks back

Vivace is a multi-modal interview portal for college students and graduates. You pick your stream (BSc IT, BCA, BSc CS, BTech CSE, MCA, BSc Data Science, BCom, MCom, BBA, MBA, BA), choose an interviewer, and sit a **text**, **voice** or **video** interview. The interviewer asks follow-ups when you're vague, makes the questions harder when you're doing well, remembers the habits you keep repeating, and gives you a detailed debrief afterwards.

> *Vivace* is a tempo marking: "lively, brisk". The three interview formats are labelled *Andante* (text), *Moderato* (voice) and *Vivace* (video).

---

## Contents

1. [What's inside](#whats-inside)
2. [The 20 features and where they live](#the-20-features-and-where-they-live)
3. [Architecture](#architecture)
4. [Running it locally](#running-it-locally)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Security](#security)
8. [Performance & accessibility](#performance--accessibility)
9. [Project structure](#project-structure)
10. [Deployment](#deployment) (full guide in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md))
11. [API reference](#api-reference)
12. [Known limitations](#known-limitations)

---

## What's inside

| Layer | Technology | Role |
|---|---|---|
| Frontend | Angular 21 (standalone components, signals, zoneless), TypeScript, SCSS | Landing page, auth, dashboard, interview room, reports, insights, resume/JD, A/B lab, coach, settings |
| API | Node.js 22, Express 5, Mongoose 8, Zod | Auth, interview orchestration, all analysis engines, serves the Angular build |
| ML service | Python 3.11, FastAPI, scikit-learn | TF-IDF answer-gap detection, resume ↔ JD similarity, logistic-regression outcome model |
| AI | Google Gemini (`@google/genai`) | Writes questions & follow-ups, semantic answer scoring, coach replies, resume claim extraction, audio transcription |
| Storage | MongoDB Atlas + GridFS | Users, interviews, mistakes, coach chats, A/B tests; resumes and recordings in GridFS |

**Everything works without Gemini and without the ML service.** If `GEMINI_API_KEY` is missing (or Gemini fails / is rate-limited), Vivace uses its offline engines: a hand-written question bank of ~120 questions with expected key points, a rule-based evaluator and a templated coach. If `ML_SERVICE_URL` is missing or the service is down, the Node API uses JavaScript equivalents. A circuit breaker stops calling a failing dependency for a minute so the interview never stalls.

## The 20 features and where they live

| # | Feature | How it works | Code |
|---|---|---|---|
| 1 | **AI Interview Persona** | Five interviewers (Meera — HR partner, Arjun — tech lead, Dr. Kapoor — panel chair, Zoya — founder, Mr. Rao — sceptic). Each has its own tone, follow-up pressure, voice rate/pitch and colour; Gemini is prompted in-character. | `server/src/services/data/streams.js` (`PERSONAS`), `services/ai/interviewer.js` |
| 2 | **Dynamic Difficulty Engine** | Rolling window of the last two scores moves the level 1–5 up/down; stress mode leans harder. Every change is explained in the report. | `engines/difficulty.js` |
| 3 | **Interview Digital Twin** | Builds a model of you from all answers: per-competency means and trends, delivery signature (pace, thinking time, fillers, hedges), archetype, stress delta. You can ask it to predict your score for any competency × level × stress. | `engines/profile.js` (`digitalTwin`, `simulateScore`), Insights page |
| 4 | **Counter-Question Engine** | Decides whether to probe instead of moving on: unverified resume claim → missing result → vague → too short → missed key point → "why?". Persona pressure sets how many follow-ups. | `engines/counterQuestion.js` |
| 5 | **Answer Gap Detection** | Every question has expected key points (with alternatives). Stem matching in JS, TF-IDF character n-grams in the ML service; story points ("result") are cross-checked with STAR. | `engines/gapDetection.js`, `ml-service/app/similarity.py` |
| 6 | **Resume Truth Checker** | Extracts claims from a PDF/DOCX/TXT resume (metrics, leadership, projects, experience, certifications, skills), turns each into a probing question, and scores whether your answers back the claim up — including catching numbers that don't match. | `engines/resumeTruth.js`, `routes/resume.js` |
| 7 | **JD Match Interview** | Parses a job description into must-have / nice-to-have skills, scores the match against your resume and builds targeted questions (hardest on what you're missing). | `engines/jdMatch.js` |
| 8 | **Readiness Score 0–100** | Weighted blend of answer quality, concept coverage, delivery, structure, timing, consistency and practice volume, minus a penalty for habits you keep repeating. | `engines/scoring.js` |
| 9 | **Outcome Predictor** | Logistic model of "chance to clear a screening round" with the factors helping and hurting. The ML service fits it on a synthetic, rubric-labelled dataset (93% hold-out accuracy); Node has the same coefficients as a fallback. | `engines/scoring.js`, `ml-service/app/outcome.py` |
| 10 | **Weakness-to-Question Engine** | With "focus on weak areas" on, picks questions from your lowest-scoring competencies and from story-structure habits. | `engines/profile.js` (`pickWeaknessQuestion`) |
| 11 | **Filler Word Heatmap** | Finds fillers with character offsets (handles "like" used grammatically, stutter repeats, Hinglish fillers) and maps their density across the start → end of every answer. | `engines/fillerWords.js`, `shared/charts/heatmap.ts` |
| 12 | **Response-Time Intelligence** | Separates thinking time from answer time and judges both against the question's level; speaking pace in words per minute. | `engines/responseTime.js` |
| 13 | **STAR Answer Structure Analyzer** | Tags each sentence as Situation/Task/Action/Result, checks order, rewards quantified results, flags "we" vs "I". | `engines/star.js` |
| 14 | **Presentation Behavior Analyzer** | In voice/video rooms the browser samples 64×48 frames and audio levels locally and sends only numbers (lighting, framing, movement, voice activity, pauses). Output is practical and explicitly non-diagnostic — no emotion, personality or honesty claims. | `client/src/app/core/media-session.ts`, `engines/presentation.js` |
| 15 | **Stress Interview Mode** | The sceptical persona takes over, time limits tighten, the interviewer interrupts at ~65% of the time and pushes back on low-confidence answers; the report scores stress resilience vs your calm sessions. | `routes/interviews.js`, `pages/room/room.ts` |
| 16 | **A/B Answer Testing** | Score two versions of an answer side by side, per dimension, with reasons and a "best of both" list (plus a Gemini rewrite when available). | `engines/abTest.js`, `pages/lab` |
| 17 | **Skill Gap Map** | Radar of eight competencies against the target profile of your stream, plus resume skills missing for your last JD. | `engines/profile.js` (`skillGapMap`), `shared/charts/radar.ts` |
| 18 | **Personal AI Coach** | Chat that reads your readiness, twin, gaps and mistakes. Gemini writes replies when configured; otherwise an intent-based offline coach answers from your data. | `routes/coach.js`, `engines/coach.js` |
| 19 | **Mistake Memory Engine** | Recurring habits (fillers, no numbers, rambling, hedging, slow starts, concept gaps…) are stored with counts and examples, reminded at the start of every interview, and cleared only after four clean answers in a row where the habit could have shown up. | `engines/mistakeMemory.js`, `services/history.js` |
| 20 | **Multi-Language Interview** | 12 languages for speech recognition/synthesis and Gemini. English, Hindi, Spanish, French and German also work fully offline (translated HR questions and interviewer phrases). | `services/data/i18n.js` |

The three interview modes:

* **Text-to-text** — the question types itself out; you type; `Ctrl + Enter` sends.
* **Voice-to-voice** — the interviewer speaks (Web Speech synthesis, persona voice); your answer is transcribed live (Web Speech recognition), you can correct the transcript before sending. If the browser has no speech recognition, the answer is recorded and transcribed by Gemini on the server; failing that, you can type.
* **Video-to-video** — camera + mic, the whole session is recorded (WebM, stored in GridFS, streamed back with HTTP range support for seeking), and the presentation analyser runs on-device.

## Architecture

```
 Browser (Angular SPA)                     Render web service "vivace"                 Render web service "vivace-ml"
┌──────────────────────────┐   /api/*    ┌───────────────────────────────────┐  HTTP  ┌───────────────────────────┐
│ Room: TTS, STT, camera,  │ ──────────▶ │ Express 5                         │ ─────▶ │ FastAPI                   │
│ frame/audio sampling,    │  httpOnly   │  ├─ auth (JWT cookie, bcrypt)     │        │  /v1/analyze/answer       │
│ MediaRecorder            │  cookie     │  ├─ interviews / resume / coach … │        │  /v1/match                │
│ Dashboard, reports,      │ ◀────────── │  ├─ engines (offline analysis)    │        │  /v1/predict/outcome      │
│ insights, lab, coach     │   JSON      │  ├─ Gemini client (+fallback)     │        └───────────────────────────┘
└──────────────────────────┘             │  └─ static: Angular build         │  HTTPS ┌───────────────────────────┐
                                         │                                   │ ─────▶ │ Google Gemini API         │
                                         └──────────────┬────────────────────┘        └───────────────────────────┘
                                                        │ mongoose / GridFS
                                                 ┌──────▼───────┐
                                                 │ MongoDB Atlas │
                                                 └──────────────┘
```

One deployable: Express serves the compiled Angular app from `client/dist/client/browser` and falls back to `index.html` for client-side routes. The ML service is optional.

## Running it locally

Requirements: **Node 22.12+** (or 20.19+), **npm 10+**, **Python 3.11+** (only for the ML service). MongoDB is optional locally — without `MONGODB_URI` the server starts an in-memory MongoDB automatically.

```bash
# 1. install
npm install                 # root (Playwright for E2E)
npm run install:all         # server + client

# 2. build the Angular app and start the portal
npm run build
npm start                   # → http://localhost:8080

# optional: the ML service in another terminal
cd ml-service
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001
# then start the portal with ML_SERVICE_URL=http://127.0.0.1:8001
```

For development with hot reload run `npm run dev:server` (port 8080) and `npm run dev:client` (port 4200, proxies `/api` to 8080).

Or with Docker: `docker compose up --build` starts MongoDB, the ML service and the portal on http://localhost:8080.

## Configuration

Copy `.env.example` to `.env` in the repo root.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MONGODB_URI` | in production | — | Atlas connection string. Empty in development = in-memory DB. |
| `JWT_SECRET` | in production | dev-only value | ≥ 32 characters. The server refuses to start in production without it. |
| `JWT_EXPIRES` | no | `2d` | Session length. |
| `GEMINI_API_KEY` | no | — | Enables Gemini. Get one at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Any Gemini model that supports JSON output and audio input. |
| `ML_SERVICE_URL` | no | — | e.g. `https://vivace-ml.onrender.com` |
| `PORT` | no | `8080` | Render sets this automatically. |
| `MAX_UPLOAD_MB` | no | `40` | Max recording upload size. |
| `CORS_ORIGIN` | no | — | Only if the frontend is hosted on another origin. |

## Testing

```bash
npm run test:server   # Jest + Supertest + in-memory MongoDB — 87 tests
npm run test:ml       # pytest + FastAPI TestClient — 11 tests
npm run test:client   # Angular unit tests (Vitest) — 22 tests
npm run build && npm run test:e2e   # Playwright — 49 tests across 3 device profiles
npm test              # everything above, in order
```

What is covered:

* **Engine unit tests** — every analysis engine (fillers, STAR, gaps, timing, difficulty, evaluator, counter-questions, resume truth, JD match, readiness, outcome, twin, skill gap, weakness picker, presentation, A/B, coach, mistakes), the question bank and translations.
* **API tests** — registration/login/lockout/logout-everywhere, validation errors, NoSQL-injection payloads, cross-site request blocking, mass-assignment protection, security headers, the full interview lifecycle, counter-questions and difficulty changes, skipping, abandoning, ownership isolation between users, Hindi interviews, stress mode, presentation samples, recording upload + magic-byte sniffing + range streaming, PDF/TXT resume parsing and spoofed-file rejection, JD match, analytics, digital twin simulation, coach, A/B lab, account deletion cleanup.
* **Gemini & ML contract tests** — Gemini mocked: AI-written questions, invalid output fallback, circuit breaker, score blending; ML service stubbed: results used when present, JS fallback when it errors.
* **Client unit tests** — charts, transcript highlighting (XSS-safe), auth service, guards, theme & motion services, auth form validation, landing content.
* **E2E (Playwright)** — run on desktop (1366×860), tablet (820×1180, touch) and mobile (Pixel 7): landing, auth, a full text interview with a counter-question, stress mode in Hindi, a voice interview with live transcript, a video interview with recording/presentation/playback (fake camera & mic), typing fallback, resume upload + truth check + JD match, A/B lab, coach, insights after two interviews, settings persistence, every app page checked for horizontal overflow, reduced-motion support, and no console errors.

Bugs found and fixed by the E2E suite include a race where double-clicking "Next question" wiped a fresh answer, recordings rejected because the multipart parser mis-read `video/webm;codecs=vp9,opus`, a body `overflow-x: hidden` breaking sticky headers, and a 2px horizontal scroll on phones.

## Security

* Passwords hashed with **bcrypt** (cost 12); password policy enforced server-side; constant-time-ish login (dummy hash for unknown emails) and identical error messages.
* **JWT** (HS256, issuer/audience checked) in an **httpOnly, SameSite=Strict, Secure** cookie scoped to `/api` — never in `localStorage`. A per-user token version lets "sign out everywhere" and password changes revoke old sessions.
* Account lockout after 5 failed logins (15 minutes).
* **Rate limits**: 300 req/min API-wide, 20 auth attempts / 15 min, 40 AI calls / min, 60 uploads / hour.
* **Validation** with Zod on every body (unknown profile fields rejected), body-size limits, NoSQL operator stripping, ObjectId checks, per-user ownership on every interview/media query.
* CSRF defence in depth: same-site cookies **and** an Origin check on state-changing requests.
* **Helmet** with a strict Content-Security-Policy (`script-src 'self'`), `frame-ancestors 'none'`, no `x-powered-by`, a Permissions-Policy that only allows camera/mic for this origin.
* Uploads: memory-only multer with size limits, file types verified by magic bytes (PDF, DOCX, WebM/MP4/Ogg), filenames sanitised, downloads sent as attachments with `nosniff`.
* Transcripts are rendered as text segments (no `innerHTML`), so answers can't inject markup.
* Account deletion removes every document and GridFS file belonging to the user.

## Performance & accessibility

* All animation uses `transform`/`opacity` only (compositor-friendly, 60 fps): page transitions via the View Transitions API, staggered reveals with a single IntersectionObserver per element, self-drawing SVG charts, a mic meter that writes styles directly instead of re-rendering.
* **Three motion levels**: `full`; `lite` — chosen automatically on low-end devices (≤ 4 CPU cores, ≤ 4 GB RAM or Data Saver) or via Settings → Low-power mode — keeps micro-interactions but drops ambient loops and lowers camera resolution/frame rate/bitrate; `off` — honours `prefers-reduced-motion`.
* Lazy-loaded routes, zoneless change detection with signals and `OnPush`, self-hosted variable fonts, no chart library (hand-written SVG), long-cache headers for hashed assets, gzip compression. Initial bundle ≈ 320 kB raw / ≈ 91 kB gzipped.
* Video analysis works on 64×48 thumbnails once a second; audio meter at ~20 Hz.
* Keyboard support (skip link, focus rings, `Ctrl+Enter`, `Enter`, `Esc`), ARIA live regions in the room and coach, labelled controls, light/dark themes.

## Project structure

```
vivace-interview-portal/
├── client/                 Angular app
│   └── src/app/
│       ├── core/           api, auth, guards, speech, media session, theme, motion
│       ├── shared/         icons, directives, charts (gauge, radar, line, heatmap, ring, waveform)
│       └── pages/          landing, auth, shell, dashboard, setup, room, report, history,
│                           insights, resume, lab, coach, settings, not-found
├── server/                 Express API
│   ├── src/
│   │   ├── routes/         auth, users, interviews, resume, analytics, coach, abtest, media, meta
│   │   ├── services/       engines/ (all analysis), ai/ (Gemini, interviewer), data/ (question bank, i18n, skills)
│   │   ├── models/         User, Interview, Mistake, CoachMessage, AbTest
│   │   └── middleware/     auth, validation, security, errors
│   └── tests/              Jest suites + fixtures
├── ml-service/             FastAPI app + pytest
├── e2e/                    Playwright specs
├── docs/DEPLOYMENT.md      Render + Atlas guide
├── render.yaml             Render Blueprint (portal + ML service)
├── Dockerfile, docker-compose.yml
└── .env.example
```

## Deployment

Short version (Render + MongoDB Atlas):

1. Create a free **MongoDB Atlas** M0 cluster, a database user, allow `0.0.0.0/0`, copy the connection string.
2. Push this repo to GitHub. In **Render → New → Blueprint**, select the repo — `render.yaml` creates `vivace` (portal) and `vivace-ml` (ML service).
3. Fill in `MONGODB_URI` and (optionally) `GEMINI_API_KEY`. `JWT_SECRET` is generated for you, `ML_SERVICE_URL` is wired automatically.
4. Open `https://vivace-xxxx.onrender.com` and check `/api/health`.

Step-by-step with screenshots-worth of detail, custom domains, Docker and troubleshooting: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## API reference

All routes are under `/api`. Authenticated routes need the session cookie set by register/login.

| Method & path | Purpose |
|---|---|
| `GET /health`, `GET /meta` | Health (db/ai/ml status); streams, personas, languages, competencies |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me` | Authentication |
| `PATCH /users/me`, `POST /users/me/password`, `DELETE /users/me` | Profile, password, account deletion |
| `POST /interviews` | Start an interview (mode, stream, role, persona, language, stress, difficulty, questionCount, focusWeaknesses, useResume, jdText) |
| `GET /interviews`, `GET /interviews/:id`, `DELETE /interviews/:id` | List, read, delete |
| `POST /interviews/:id/answer` | Answer or skip the open question → evaluation + next question / follow-up |
| `POST /interviews/:id/transcribe` | Server transcription of an audio answer (Gemini) |
| `POST /interviews/:id/presentation` | Aggregate camera/audio samples |
| `POST /interviews/:id/recording` | Upload the session recording (GridFS) |
| `POST /interviews/:id/finish` | Build the report |
| `GET /media/:id` | Stream an owned file (supports `Range`) |
| `GET/POST/DELETE /resume`, `GET /resume/file`, `POST /resume/claims/:id/check`, `POST /resume/jd-match` | Resume truth checker & JD match |
| `GET /analytics/overview`, `GET /analytics/twin`, `POST /analytics/twin/simulate` | Dashboard, digital twin |
| `GET/POST/DELETE /coach…` | Personal coach |
| `GET/POST /ab-test` | A/B answer lab |

## Known limitations

* Browser speech recognition quality depends on the browser (best in Chrome/Edge). Firefox and some mobile browsers have no `SpeechRecognition`; there Vivace records audio for Gemini transcription, or you type.
* Offline evaluation is keyword- and rule-based; it is good at structure, delivery and coverage, less good at judging whether an unusual but correct answer is right. Adding a Gemini key gives semantic scoring.
* The outcome model is trained on synthetic, rubric-labelled data and is clearly labelled as a practice estimate.
* On Render's free plan services sleep after 15 minutes of inactivity; the first request after that takes ~30–60 seconds.

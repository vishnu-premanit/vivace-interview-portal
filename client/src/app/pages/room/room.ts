import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { PerfService } from '../../core/perf.service';
import { SpeechService } from '../../core/speech.service';
import { ToastService } from '../../core/toast.service';
import { MediaSession } from '../../core/media-session';
import { AnswerResult, Evaluation, Interview, Turn } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Waveform } from '../../shared/charts/waveform';
import { Highlight } from '../../shared/highlight';

type Phase = 'loading' | 'preflight' | 'asking' | 'answering' | 'review' | 'evaluating' | 'feedback' | 'finishing' | 'error';

const STRESS_LINES: Record<string, string> = {
  en: 'Let me stop you there — get to the point. What exactly did YOU do?',
  hi: 'यहीं रुकिए — सीधे मुद्दे पर आइए। आपने ख़ुद क्या किया?',
  es: 'Déjame interrumpirte: ve al grano. ¿Qué hiciste TÚ exactamente?',
  fr: 'Je vous arrête — allez à l’essentiel. Qu’avez-vous fait, VOUS ?',
  de: 'Ich unterbreche kurz — kommen Sie zum Punkt. Was haben SIE gemacht?'
};

const COUNTER_LABELS: Record<string, string> = {
  'resume-claim': 'Checking a resume claim',
  claim: 'Probing a claim',
  'missing-result': 'Asking for the result',
  vague: 'Asking for specifics',
  'too-short': 'Asking you to go deeper',
  'gap-probe': 'Probing a missed point',
  why: 'Asking why',
  'stress-doubt': 'Pushing back'
};

@Component({
  selector: 'app-room',
  imports: [FormsModule, RouterLink, Icon, Waveform, Highlight],
  templateUrl: './room.html',
  styleUrl: './room.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)', '(window:beforeunload)': 'onUnload($event)' }
})
export class Room implements OnInit, OnDestroy {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private perf = inject(PerfService);
  readonly auth = inject(AuthService);
  readonly speech = inject(SpeechService);

  readonly selfView = viewChild<ElementRef<HTMLVideoElement>>('selfView');
  readonly previewView = viewChild<ElementRef<HTMLVideoElement>>('previewView');
  readonly answerBox = viewChild<ElementRef<HTMLTextAreaElement>>('answerBox');

  readonly interview = signal<Interview | null>(null);
  readonly phase = signal<Phase>('loading');
  readonly turn = signal<Turn | null>(null);
  readonly shownQuestion = signal('');
  readonly answer = signal('');
  readonly lastEval = signal<Evaluation | null>(null);
  readonly lastResult = signal<AnswerResult | null>(null);
  readonly transition = signal('');
  readonly errorText = signal('');
  readonly mediaError = signal<string | null>(null);
  readonly mediaReady = signal(false);
  readonly interrupted = signal(false);
  readonly transcribing = signal(false);
  readonly sttFallback = signal(false);
  readonly typing = signal(false);
  readonly noMedia = signal(false);
  readonly confirmEnd = signal(false);
  readonly progress = signal({ mainAsked: 1, questionCount: 6 });
  readonly elapsed = signal(0); // seconds since answer window opened
  readonly finishingNote = signal('Writing your report…');

  readonly media = signal<MediaSession | null>(null);
  readonly level = computed(() => this.media()?.level() ?? 0);

  readonly isVoice = computed(() => this.interview()?.mode !== 'text');
  readonly isVideo = computed(() => this.interview()?.mode === 'video');
  readonly persona = computed(() => this.interview()?.persona ?? null);
  readonly limit = computed(() => this.interview()?.timeLimitSec ?? 0);
  readonly remaining = computed(() => (this.limit() ? Math.max(0, this.limit() - this.elapsed()) : null));
  readonly timePct = computed(() => (this.limit() ? Math.min(100, (this.elapsed() / this.limit()) * 100) : 0));
  readonly liveTranscript = computed(() => `${this.speech.finalText()} ${this.speech.interimText()}`.trim());
  readonly wordCount = computed(() => (this.answer().trim() ? this.answer().trim().split(/\s+/).length : 0));
  readonly counterLabel = computed(() => {
    const t = this.turn();
    return t && t.counterReason ? COUNTER_LABELS[t.counterReason] ?? 'Follow-up' : null;
  });
  readonly difficultyDots = [1, 2, 3, 4, 5];

  private questionShownAt = 0;
  private firstInputAt = 0;
  private tick: ReturnType<typeof setInterval> | null = null;
  private typeTimer: ReturnType<typeof setTimeout> | null = null;
  private interruptedThisTurn = false;
  private pendingSamples: object[] = [];
  private destroyed = false;

  constructor() {
    // Keep the self-view attached whenever the <video> element is (re)rendered.
    effect(() => {
      const el = this.selfView()?.nativeElement ?? this.previewView()?.nativeElement;
      const m = this.media();
      if (el && m && this.mediaReady()) m.attachVideo(el);
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      const res = await this.api.get<{ interview: Interview }>(`/interviews/${id}`);
      const iv = res.interview;
      if (iv.status !== 'active') {
        await this.router.navigateByUrl(iv.status === 'completed' ? `/app/reports/${iv.id}` : '/app');
        return;
      }
      this.interview.set(iv);
      this.progress.set({ mainAsked: iv.mainAsked, questionCount: iv.questionCount });
      this.turn.set(iv.current);
      this.phase.set('preflight');
      if (iv.mode !== 'text') void this.openMedia();
    } catch (err) {
      this.errorText.set(errorMessage(err, 'This interview could not be loaded.'));
      this.phase.set('error');
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopTick();
    if (this.typeTimer) clearTimeout(this.typeTimer);
    this.speech.stopSpeaking();
    this.speech.stopListening();
    this.media()?.close();
  }

  // ---------- media ----------
  async openMedia(): Promise<void> {
    this.mediaError.set(null);
    const session = new MediaSession(this.isVideo());
    try {
      await session.open(this.perf.lowEnd() || this.perf.lowPowerPreference);
      if (this.destroyed) {
        session.close();
        return;
      }
      this.media.set(session);
      this.mediaReady.set(true);
    } catch (err) {
      const name = (err as DOMException)?.name;
      this.mediaError.set(
        name === 'NotAllowedError'
          ? 'Permission was blocked. Allow camera/microphone in the address bar, then try again.'
          : name === 'NotFoundError'
            ? `No ${this.isVideo() ? 'camera or microphone' : 'microphone'} was found.`
            : 'Could not start your camera/microphone.'
      );
    }
  }

  // ---------- flow ----------
  async begin(): Promise<void> {
    const iv = this.interview();
    if (!iv) return;
    // Without a microphone the interviewer still speaks; the candidate types.
    this.noMedia.set(this.isVoice() && !this.mediaReady());
    if (this.isVoice()) this.media()?.startSessionRecording(this.perf.lowEnd());
    if (iv.greeting && this.isVoice()) {
      this.phase.set('asking');
      this.shownQuestion.set(iv.greeting);
      await this.say(iv.greeting);
    }
    this.ask(this.turn());
  }

  private async ask(t: Turn | null): Promise<void> {
    if (!t) return;
    this.turn.set(t);
    this.answer.set('');
    this.lastEval.set(null);
    this.interrupted.set(false);
    this.interruptedThisTurn = false;
    this.sttFallback.set(false);
    this.typing.set(false);
    this.phase.set('asking');
    const lead = this.transition();
    if (this.isVoice()) {
      this.shownQuestion.set(t.text);
      await this.say((lead ? lead + ' ' : '') + t.text);
      if (this.destroyed) return;
      this.openAnswerWindow();
    } else {
      this.typeQuestion(t.text);
    }
  }

  private typeQuestion(text: string): void {
    if (this.typeTimer) clearTimeout(this.typeTimer);
    if (this.perf.level() === 'off') {
      this.shownQuestion.set(text);
      this.openAnswerWindow();
      return;
    }
    let i = 0;
    const chunk = this.perf.level() === 'lite' ? 6 : 3;
    const step = () => {
      i = Math.min(text.length, i + chunk);
      this.shownQuestion.set(text.slice(0, i));
      if (i < text.length) this.typeTimer = setTimeout(step, 16);
      else this.openAnswerWindow();
    };
    step();
  }

  private openAnswerWindow(): void {
    this.phase.set('answering');
    this.questionShownAt = performance.now();
    this.firstInputAt = 0;
    this.elapsed.set(0);
    this.startTick();
    const iv = this.interview()!;
    if (this.isVoice() && this.noMedia()) {
      this.typing.set(true);
      setTimeout(() => this.answerBox()?.nativeElement.focus({ preventScroll: true }), 50);
    } else if (this.isVoice()) {
      this.media()?.measure(true);
      const ok = this.speech.startListening(iv.language.speech, () => this.markFirstInput());
      if (!ok) {
        // No browser STT: record this answer and transcribe on the server (or let the user type).
        this.sttFallback.set(true);
        this.media()?.startAnswerAudio();
      }
    } else {
      setTimeout(() => this.answerBox()?.nativeElement.focus({ preventScroll: true }), 50);
    }
  }

  markFirstInput(): void {
    if (!this.firstInputAt) this.firstInputAt = performance.now();
  }

  onType(value: string): void {
    this.answer.set(value);
    if (value.length) this.markFirstInput();
  }

  private startTick(): void {
    this.stopTick();
    this.tick = setInterval(() => {
      const secs = Math.floor((performance.now() - this.questionShownAt) / 1000);
      this.elapsed.set(secs);
      const lim = this.limit();
      if (!lim || this.phase() !== 'answering') return;
      if (this.interview()?.stress && !this.interruptedThisTurn && secs >= lim * 0.65 && this.firstInputAt) {
        this.interruptedThisTurn = true;
        this.interrupted.set(true);
        if (this.isVoice()) {
          const lang = this.interview()!.language.code;
          void this.speech.speak(STRESS_LINES[lang] ?? STRESS_LINES['en'], { lang: this.interview()!.language.speech, rate: 1.1, pitch: 0.85 });
        }
      }
      if (secs >= lim) {
        this.toast.show('Time is up for this question.');
        void this.finishAnswering(true);
      }
    }, 250);
  }

  private stopTick(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }

  /** Voice/video: stop listening and move to review (edit transcript), or submit directly on timeout. */
  async finishAnswering(timeout = false): Promise<void> {
    if (this.phase() !== 'answering') return;
    if (!this.isVoice()) {
      if (timeout) {
        if (this.answer().trim().length >= 2) await this.submit();
        else await this.skip();
      }
      return;
    }
    this.stopTick();
    this.media()?.measure(false);
    this.speech.stopSpeaking();
    let text = this.speech.stopListening();
    if (this.typing()) {
      text = this.answer();
    } else if (this.sttFallback()) {
      const clip = await this.media()?.stopAnswerAudio();
      if (clip && clip.size > 0) {
        this.transcribing.set(true);
        try {
          const res = await this.api.upload<{ text: string }>(`/interviews/${this.interview()!.id}/transcribe`, 'audio', clip, 'answer.webm');
          text = res.text || '';
        } catch (err) {
          if (!(err instanceof HttpErrorResponse && err.status === 503)) this.toast.bad(errorMessage(err));
        } finally {
          this.transcribing.set(false);
        }
      }
    }
    this.answer.set(text);
    if (timeout && text.trim().length >= 2) {
      await this.submit();
      return;
    }
    this.phase.set('review');
  }

  async rerecord(): Promise<void> {
    this.answer.set('');
    this.typing.set(false);
    this.openAnswerWindow();
  }

  async submit(): Promise<void> {
    const iv = this.interview();
    const t = this.turn();
    if (!iv || !t) return;
    const text = this.answer().trim();
    if (text.length < 2) {
      this.toast.show('Your answer is empty — say or type something, or skip.');
      return;
    }
    this.stopTick();
    if (this.isVoice()) this.speech.stopListening();
    const now = performance.now();
    const thinkTimeMs = Math.round((this.firstInputAt || now) - this.questionShownAt);
    const answerDurationMs = Math.round(now - (this.firstInputAt || this.questionShownAt));
    await this.send({ answer: text, thinkTimeMs, answerDurationMs, inputMode: !this.isVoice() || this.typing() ? 'typed' : this.sttFallback() ? 'transcribed' : 'speech' });
  }

  async skip(): Promise<void> {
    this.stopTick();
    if (this.isVoice()) {
      this.speech.stopListening();
      this.media()?.measure(false);
      if (this.sttFallback()) await this.media()?.stopAnswerAudio();
    }
    await this.send({ skip: true });
  }

  private async send(body: object): Promise<void> {
    const iv = this.interview()!;
    this.phase.set('evaluating');
    this.queueSample();
    try {
      const res = await this.api.post<AnswerResult>(`/interviews/${iv.id}/answer`, body);
      this.lastResult.set(res);
      this.lastEval.set(res.evaluation);
      this.progress.set(res.progress);
      this.transition.set(res.transition || '');
      if (res.difficulty && res.next) this.interview.update((x) => (x ? { ...x, difficulty: res.difficulty!.level } : x));
      void this.flushSamples();
      if (res.done) {
        if (this.isVoice() && res.closing) await this.say(res.closing);
        await this.finish();
        return;
      }
      if (!res.evaluation) {
        // Skipped: go straight to the next question.
        await this.ask(res.next);
        return;
      }
      this.phase.set('feedback');
    } catch (err) {
      this.toast.bad(errorMessage(err));
      this.phase.set(this.isVoice() ? 'review' : 'answering');
      if (!this.isVoice()) this.startTick();
    }
  }

  async next(): Promise<void> {
    const res = this.lastResult();
    if (!res || !res.next) return;
    await this.ask(res.next);
  }

  private queueSample(): void {
    const s = this.media()?.drain();
    if (s) this.pendingSamples.push(s);
  }

  private async flushSamples(): Promise<void> {
    if (!this.pendingSamples.length || !this.isVoice()) return;
    const samples = this.pendingSamples.splice(0, 60);
    try {
      await this.api.post(`/interviews/${this.interview()!.id}/presentation`, { samples });
    } catch {
      /* non-critical */
    }
  }

  async finish(): Promise<void> {
    const iv = this.interview();
    if (!iv) return;
    this.confirmEnd.set(false);
    this.stopTick();
    this.speech.stopSpeaking();
    this.speech.stopListening();
    this.phase.set('finishing');
    this.queueSample();
    await this.flushSamples();
    const m = this.media();
    if (m) {
      this.finishingNote.set('Saving your recording…');
      const blob = await m.stopSessionRecording();
      m.close();
      if (blob && blob.size > 0) {
        try {
          await this.api.upload(`/interviews/${iv.id}/recording`, 'recording', blob, `interview.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
        } catch (err) {
          this.toast.bad(`Recording not saved: ${errorMessage(err)}`);
        }
      }
    }
    this.finishingNote.set('Writing your report…');
    try {
      const res = await this.api.post<{ interview: Interview; abandoned?: boolean }>(`/interviews/${iv.id}/finish`);
      if (res.abandoned) {
        this.toast.show('No answers were recorded, so there is no report for this one.');
        await this.router.navigateByUrl('/app');
      } else {
        await this.router.navigateByUrl(`/app/reports/${iv.id}`);
      }
    } catch (err) {
      this.errorText.set(errorMessage(err));
      this.phase.set('error');
    }
  }

  private say(text: string): Promise<void> {
    const iv = this.interview();
    const p = this.persona();
    if (!iv || !p) return Promise.resolve();
    const rate = (this.auth.user()?.preferences.voiceRate ?? 1) * p.voice.rate;
    return this.speech.speak(text, { lang: iv.language.speech, rate, pitch: p.voice.pitch });
  }

  replayQuestion(): void {
    const t = this.turn();
    if (t) void this.say(t.text);
  }

  /** Voice/video candidates can always fall back to typing an answer. */
  switchToTyping(): void {
    const spoken = this.speech.stopListening();
    void this.media()?.stopAnswerAudio();
    this.answer.set(spoken);
    this.typing.set(true);
    this.markFirstInput();
    setTimeout(() => this.answerBox()?.nativeElement.focus({ preventScroll: true }), 50);
  }

  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (this.phase() === 'answering' && !this.isVoice()) void this.submit();
      else if (this.phase() === 'review') void this.submit();
      else if (this.phase() === 'feedback') void this.next();
    } else if (e.key === 'Enter' && this.phase() === 'feedback' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      void this.next();
    } else if (e.key === 'Escape' && this.confirmEnd()) {
      this.confirmEnd.set(false);
    }
  }

  onUnload(e: BeforeUnloadEvent): void {
    if (['answering', 'review', 'evaluating', 'finishing'].includes(this.phase())) {
      e.preventDefault();
    }
  }

  fmt(sec: number | null): string {
    if (sec === null) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  scoreTone(v: number): string {
    return v >= 7.5 ? 'good' : v >= 5 ? 'okay' : 'low';
  }
}

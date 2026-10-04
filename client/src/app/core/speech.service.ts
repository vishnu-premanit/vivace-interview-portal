import { Injectable, signal } from '@angular/core';

/* Minimal typings for the Web Speech API (not in lib.dom for all TS targets). */
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

/**
 * Voice I/O for voice and video interviews.
 * - Text-to-speech: the interviewer's voice (speechSynthesis), persona-tuned.
 * - Speech-to-text: live transcript (SpeechRecognition) with auto-restart, since
 *   Chrome ends recognition after short silences.
 * Both degrade gracefully: if unavailable, the room falls back to typing or
 * server-side transcription.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  readonly speaking = signal(false);
  readonly listening = signal(false);
  readonly finalText = signal('');
  readonly interimText = signal('');
  readonly error = signal<string | null>(null);

  private recognition: Recognition | null = null;
  private wantListening = false;
  private onFirstWord: (() => void) | null = null;
  private heardSomething = false;

  get ttsSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  get sttSupported(): boolean {
    return Boolean(this.ctor());
  }

  private ctor(): RecognitionCtor | null {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }

  private pickVoice(lang: string): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    const base = lang.split('-')[0];
    return voices.find((v) => v.lang === lang) || voices.find((v) => v.lang.startsWith(base)) || null;
  }

  /** Speak and resolve when finished. Never rejects; times out based on length. */
  speak(text: string, opts: { lang: string; rate?: number; pitch?: number }): Promise<void> {
    if (!this.ttsSupported || !text) return Promise.resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = opts.lang;
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      const voice = this.pickVoice(opts.lang);
      if (voice) u.voice = voice;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.speaking.set(false);
        clearTimeout(timer);
        resolve();
      };
      // Safety net: some engines never fire onend (or have no voices at all).
      const timer = setTimeout(done, Math.min(30000, 1500 + text.length * 85));
      u.onend = done;
      u.onerror = done;
      this.speaking.set(true);
      synth.speak(u);
    });
  }

  stopSpeaking(): void {
    if (this.ttsSupported) window.speechSynthesis.cancel();
    this.speaking.set(false);
  }

  startListening(lang: string, onFirstWord?: () => void): boolean {
    const Ctor = this.ctor();
    if (!Ctor) return false;
    this.stopListening();
    this.finalText.set('');
    this.interimText.set('');
    this.error.set(null);
    this.onFirstWord = onFirstWord ?? null;
    this.heardSomething = false;
    this.wantListening = true;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      let added = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) added += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      if (added) this.finalText.update((t) => (t + ' ' + added).replace(/\s+/g, ' ').trim());
      this.interimText.set(interim);
      if (!this.heardSomething && (added || interim)) {
        this.heardSomething = true;
        this.onFirstWord?.();
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.error.set(e.error === 'not-allowed' ? 'Microphone permission was denied.' : e.error === 'network' ? 'Speech recognition needs an internet connection in this browser.' : `Speech recognition error: ${e.error}`);
      if (e.error === 'not-allowed' || e.error === 'network' || e.error === 'service-not-allowed') this.wantListening = false;
    };
    rec.onend = () => {
      if (this.wantListening) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through */
        }
      }
      this.listening.set(false);
    };
    try {
      rec.start();
      this.recognition = rec;
      this.listening.set(true);
      return true;
    } catch {
      this.wantListening = false;
      return false;
    }
  }

  /** Stop and return the full transcript (final + any pending interim words). */
  stopListening(): string {
    this.wantListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }
    this.listening.set(false);
    const text = `${this.finalText()} ${this.interimText()}`.replace(/\s+/g, ' ').trim();
    this.interimText.set('');
    return text;
  }
}

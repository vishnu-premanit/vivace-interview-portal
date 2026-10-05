import { signal } from '@angular/core';

export interface PresentationSample {
  brightness?: number;
  presence?: number;
  centred?: number;
  motion?: number;
  voiceActivity?: number;
  volumeVariation?: number;
  longPauses?: number;
}

/**
 * Camera/microphone session for voice & video interviews.
 * Everything is analysed locally on tiny buffers (64×48 frames, 256-bin audio)
 * so it runs smoothly on low-end laptops; only aggregate numbers are sent to
 * the server. The full recording is optional and uploaded once at the end.
 */
export class MediaSession {
  readonly level = signal(0); // 0..1 mic level for the waveform
  readonly recording = signal(false);
  stream: MediaStream | null = null;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private raf = 0;
  private lastTick = 0;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private prevFrame: Float32Array | null = null;
  private video: HTMLVideoElement | null = null;

  private sessionRecorder: MediaRecorder | null = null;
  private sessionChunks: Blob[] = [];
  private answerRecorder: MediaRecorder | null = null;
  private answerChunks: Blob[] = [];

  // Rolling stats between drains
  private frames: { brightness: number; presence: number; centred: number; motion: number }[] = [];
  private audioWindows: number[] = [];
  private silenceRun = 0;
  private longPauses = 0;
  private measuring = false;

  constructor(private readonly withVideo: boolean) {}

  async open(lowEnd: boolean): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: { echoCancellation: true, noiseSuppression: true },
      video: this.withVideo ? { width: { ideal: lowEnd ? 480 : 640 }, height: { ideal: lowEnd ? 270 : 360 }, frameRate: { ideal: lowEnd ? 15 : 24 }, facingMode: 'user' } : false
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.startAudio();
    return this.stream;
  }

  attachVideo(el: HTMLVideoElement): void {
    if (!this.stream) return;
    this.video = el;
    el.srcObject = this.stream;
    el.muted = true;
    el.playsInline = true;
    void el.play().catch(() => undefined);
    if (this.withVideo && !this.frameTimer) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 64;
      this.canvas.height = 48;
      this.frameTimer = setInterval(() => this.sampleFrame(), 1000);
    }
  }

  private startAudio(): void {
    if (!this.stream || !this.stream.getAudioTracks().length) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    src.connect(this.analyser);
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      if (t - this.lastTick < 50) return; // ~20 Hz is plenty for a meter
      const dt = this.lastTick ? t - this.lastTick : 50;
      this.lastTick = t;
      if (!this.analyser || !this.data) return;
      this.analyser.getByteTimeDomainData(this.data);
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const v = (this.data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.data.length);
      const lvl = Math.min(1, rms * 4);
      this.level.set(lvl);
      if (this.measuring) {
        this.audioWindows.push(rms);
        if (rms < 0.02) {
          this.silenceRun += dt;
        } else {
          if (this.silenceRun > 3000) this.longPauses += 1;
          this.silenceRun = 0;
        }
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private sampleFrame(): void {
    if (!this.video || !this.canvas || this.video.readyState < 2) return;
    const g = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.drawImage(this.video, 0, 0, 64, 48);
    const { data } = g.getImageData(0, 0, 64, 48);
    const luma = new Float32Array(64 * 48);
    let total = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      luma[p] = y;
      total += y;
    }
    const brightness = total / luma.length;
    // Centre-region texture vs thirds: a person in frame adds detail to the middle.
    const energy = [0, 0, 0];
    let cSum = 0;
    let cSq = 0;
    let cN = 0;
    for (let y = 1; y < 47; y++) {
      for (let x = 1; x < 63; x++) {
        const i = y * 64 + x;
        const grad = Math.abs(luma[i] - luma[i - 1]) + Math.abs(luma[i] - luma[i - 64]);
        energy[x < 21 ? 0 : x < 43 ? 1 : 2] += grad;
        if (x >= 16 && x < 48 && y >= 6 && y < 42) {
          cSum += luma[i];
          cSq += luma[i] * luma[i];
          cN++;
        }
      }
    }
    const variance = cSq / cN - (cSum / cN) ** 2;
    const presence = variance > 180 ? 1 : variance > 80 ? 0.5 : 0;
    const centred = energy[1] / Math.max(1, energy[0] + energy[1] + energy[2]) > 0.36 ? 1 : 0;
    let motion = 0;
    if (this.prevFrame) {
      let diff = 0;
      for (let i = 0; i < luma.length; i++) diff += Math.abs(luma[i] - this.prevFrame[i]);
      motion = Math.min(1, diff / luma.length / 255);
    }
    this.prevFrame = luma;
    if (this.measuring) this.frames.push({ brightness, presence, centred, motion });
  }

  /** Start/stop collecting presentation stats (only while the candidate answers). */
  measure(on: boolean): void {
    this.measuring = on;
    if (!on && this.silenceRun > 3000) this.longPauses += 1;
    this.silenceRun = 0;
  }

  /** Aggregate and reset the collected stats into one sample for the server. */
  drain(): PresentationSample | null {
    const f = this.frames;
    const a = this.audioWindows;
    if (!f.length && !a.length) return null;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);
    const sample: PresentationSample = {};
    if (f.length) {
      sample.brightness = round(avg(f.map((x) => x.brightness))!, 1);
      sample.presence = round(avg(f.map((x) => x.presence))!, 2);
      sample.centred = round(avg(f.map((x) => x.centred))!, 2);
      sample.motion = round(avg(f.slice(1).map((x) => x.motion)) ?? 0, 3);
    }
    if (a.length) {
      const active = a.filter((r) => r >= 0.02);
      sample.voiceActivity = round(active.length / a.length, 2);
      const m = avg(active) ?? 0;
      const sd = active.length > 1 ? Math.sqrt(active.reduce((s, x) => s + (x - m) ** 2, 0) / (active.length - 1)) : 0;
      sample.volumeVariation = round(Math.min(1, m ? sd / m : 0), 2);
      sample.longPauses = this.longPauses;
    }
    this.frames = [];
    this.audioWindows = [];
    this.longPauses = 0;
    return sample;
  }

  static pickMime(video: boolean): string {
    const candidates = video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    if (typeof MediaRecorder === 'undefined') return '';
    return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || '';
  }

  startSessionRecording(lowEnd: boolean): void {
    if (!this.stream || typeof MediaRecorder === 'undefined') return;
    const mimeType = MediaSession.pickMime(this.withVideo);
    try {
      this.sessionRecorder = new MediaRecorder(this.stream, { mimeType: mimeType || undefined, videoBitsPerSecond: lowEnd ? 350_000 : 700_000, audioBitsPerSecond: 64_000 });
    } catch {
      return;
    }
    this.sessionChunks = [];
    this.sessionRecorder.ondataavailable = (e) => e.data.size && this.sessionChunks.push(e.data);
    this.sessionRecorder.start(5000);
    this.recording.set(true);
  }

  stopSessionRecording(): Promise<Blob | null> {
    const rec = this.sessionRecorder;
    if (!rec || rec.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => {
        this.recording.set(false);
        // Drop codec parameters: some multipart parsers choke on "codecs=vp9,opus".
        const type = (rec.mimeType || (this.withVideo ? 'video/webm' : 'audio/webm')).split(';')[0];
        resolve(this.sessionChunks.length ? new Blob(this.sessionChunks, { type }) : null);
      };
      rec.stop();
    });
  }

  /** Per-answer audio clip, used for server transcription when the browser has no STT. */
  startAnswerAudio(): void {
    if (!this.stream || typeof MediaRecorder === 'undefined') return;
    const audio = new MediaStream(this.stream.getAudioTracks());
    const mimeType = MediaSession.pickMime(false);
    try {
      this.answerRecorder = new MediaRecorder(audio, mimeType ? { mimeType } : undefined);
    } catch {
      this.answerRecorder = null;
      return;
    }
    this.answerChunks = [];
    this.answerRecorder.ondataavailable = (e) => e.data.size && this.answerChunks.push(e.data);
    this.answerRecorder.start();
  }

  stopAnswerAudio(): Promise<Blob | null> {
    const rec = this.answerRecorder;
    if (!rec || rec.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(this.answerChunks.length ? new Blob(this.answerChunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] }) : null);
      rec.stop();
    });
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.frameTimer = null;
    try {
      this.sessionRecorder?.state !== 'inactive' && this.sessionRecorder?.stop();
      this.answerRecorder?.state !== 'inactive' && this.answerRecorder?.stop();
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    if (this.video) this.video.srcObject = null;
  }
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

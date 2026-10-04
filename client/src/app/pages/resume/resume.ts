import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { HandoffService } from '../../core/handoff.service';
import { ToastService } from '../../core/toast.service';
import { Claim, ClaimAssessment, JdMatch, ResumeInfo } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Ring } from '../../shared/charts/ring';
import { RevealDirective } from '../../shared/directives';

const STATUS: Record<string, { label: string; cls: string }> = {
  supported: { label: 'Backed up', cls: 'chip-good' },
  'partially-supported': { label: 'Partly backed up', cls: 'chip-warn' },
  unverified: { label: 'Not backed up', cls: 'chip-bad' },
  inconsistent: { label: 'Inconsistent', cls: 'chip-bad' }
};

@Component({
  selector: 'app-resume',
  imports: [FormsModule, DatePipe, DecimalPipe, Icon, Ring, RevealDirective],
  templateUrl: './resume.html',
  styleUrl: './resume.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResumePage implements OnInit {
  private api = inject(Api);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private handoff = inject(HandoffService);

  readonly resume = signal<ResumeInfo | null>(null);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly dragging = signal(false);
  readonly practising = signal<string | null>(null);
  readonly practiceAnswer = signal('');
  readonly checking = signal(false);
  readonly filter = signal<string>('all');
  readonly jdText = signal('');
  readonly matching = signal(false);
  readonly match = signal<JdMatch | null>(null);
  readonly jdQuestions = signal<{ id: string; text: string }[]>([]);
  readonly status = STATUS;

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.get<{ resume: ResumeInfo | null; lastJd: { match: JdMatch } | null }>('/resume');
      this.resume.set(res.resume);
      if (res.lastJd) this.match.set(res.lastJd.match);
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  claims(): Claim[] {
    const list = this.resume()?.claims ?? [];
    const f = this.filter();
    return f === 'all' ? list : list.filter((c) => c.type === f);
  }

  types(): string[] {
    return [...new Set((this.resume()?.claims ?? []).map((c) => c.type))];
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void this.upload(file);
  }

  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.upload(file);
    input.value = '';
  }

  async upload(file: File): Promise<void> {
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
      this.toast.bad('Please choose a PDF, DOCX or TXT file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.bad('That file is over 5 MB.');
      return;
    }
    this.uploading.set(true);
    try {
      const res = await this.api.upload<{ resume: ResumeInfo }>('/resume', 'resume', file, file.name);
      this.resume.set(res.resume);
      this.auth.user.update((u) => (u ? { ...u, hasResume: true } : u));
      this.toast.good(`Found ${res.resume.claims.length} claims and ${res.resume.skills.length} skills.`);
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.uploading.set(false);
    }
  }

  async removeResume(): Promise<void> {
    if (!confirm('Remove your resume and its claims?')) return;
    try {
      await this.api.delete('/resume');
      this.resume.set(null);
      this.auth.user.update((u) => (u ? { ...u, hasResume: false } : u));
    } catch (err) {
      this.toast.bad(errorMessage(err));
    }
  }

  practise(c: Claim): void {
    this.practising.set(this.practising() === c.id ? null : c.id);
    this.practiceAnswer.set('');
  }

  async check(c: Claim): Promise<void> {
    this.checking.set(true);
    try {
      const res = await this.api.post<{ assessment: ClaimAssessment; summary: ResumeInfo['summary'] }>(`/resume/claims/${c.id}/check`, { answer: this.practiceAnswer() });
      this.resume.update((r) => (r ? { ...r, summary: res.summary, claims: r.claims.map((x) => (x.id === c.id ? { ...x, assessment: res.assessment } : x)) } : r));
      this.practising.set(null);
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.checking.set(false);
    }
  }

  async runMatch(): Promise<void> {
    this.matching.set(true);
    try {
      const res = await this.api.post<{ match: JdMatch; questions: { id: string; text: string }[] }>('/resume/jd-match', { jdText: this.jdText() });
      this.match.set(res.match);
      this.jdQuestions.set(res.questions);
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.matching.set(false);
    }
  }

  startJdInterview(): void {
    this.handoff.set({ jdText: this.jdText(), useResume: Boolean(this.resume()) });
    this.router.navigateByUrl('/app/new');
  }

  startResumeInterview(): void {
    this.handoff.set({ useResume: true });
    this.router.navigateByUrl('/app/new');
  }
}

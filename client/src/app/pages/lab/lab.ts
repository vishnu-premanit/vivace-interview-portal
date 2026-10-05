import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { MetaService } from '../../core/meta.service';
import { ToastService } from '../../core/toast.service';
import { AbResult } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Highlight } from '../../shared/highlight';

interface PastTest {
  id: string;
  question: string;
  result: { winner: string; delta: number; a: number; b: number };
  createdAt: string;
}

const LABELS: Record<string, string> = { relevance: 'Relevance', depth: 'Depth', structure: 'Structure', clarity: 'Clarity', confidence: 'Confidence' };

@Component({
  selector: 'app-lab',
  imports: [FormsModule, DatePipe, Icon, Highlight],
  templateUrl: './lab.html',
  styleUrl: './lab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Lab implements OnInit {
  private api = inject(Api);
  private toast = inject(ToastService);
  readonly meta = inject(MetaService);

  readonly question = signal('Tell me about a time you solved a difficult problem in a team.');
  readonly questionId = signal<string | undefined>(undefined);
  readonly a = signal('');
  readonly b = signal('');
  readonly busy = signal(false);
  readonly result = signal<AbResult | null>(null);
  readonly past = signal<PastTest[]>([]);
  readonly labels = LABELS;

  async ngOnInit(): Promise<void> {
    this.meta.load().catch(() => undefined);
    try {
      this.past.set((await this.api.get<{ tests: PastTest[] }>('/ab-test')).tests);
    } catch {
      /* non-critical */
    }
  }

  pick(id: string, text: string): void {
    this.questionId.set(id);
    this.question.set(text);
  }

  swap(): void {
    const a = this.a();
    this.a.set(this.b());
    this.b.set(a);
    this.result.set(null);
  }

  async compare(): Promise<void> {
    this.busy.set(true);
    try {
      const res = await this.api.post<{ id: string; result: AbResult }>('/ab-test', { question: this.question(), questionId: this.questionId(), answerA: this.a(), answerB: this.b() });
      this.result.set(res.result);
      this.past.update((p) => [{ id: res.id, question: this.question(), result: { winner: res.result.winner, delta: res.result.delta, a: res.result.a.overall, b: res.result.b.overall }, createdAt: new Date().toISOString() }, ...p].slice(0, 20));
    } catch (err) {
      this.toast.bad(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { HandoffService } from '../../core/handoff.service';
import { ToastService } from '../../core/toast.service';
import { Interview, Turn } from '../../core/models';
import { Gauge } from '../../shared/charts/gauge';
import { Radar } from '../../shared/charts/radar';
import { Heatmap } from '../../shared/charts/heatmap';
import { LineChart, Series } from '../../shared/charts/line-chart';
import { Ring } from '../../shared/charts/ring';
import { Highlight } from '../../shared/highlight';
import { Icon } from '../../shared/icon';
import { CountUpDirective, RevealDirective } from '../../shared/directives';

const DIM_LABELS: Record<string, string> = {
  relevance: 'Relevance',
  depth: 'Depth & evidence',
  structure: 'Structure',
  clarity: 'Clarity',
  confidence: 'Confidence'
};

const STATUS_LABEL: Record<string, string> = {
  supported: 'Backed up',
  'partially-supported': 'Partly backed up',
  unverified: 'Not backed up',
  inconsistent: 'Inconsistent'
};

@Component({
  selector: 'app-report',
  imports: [RouterLink, DatePipe, DecimalPipe, Gauge, Radar, Heatmap, LineChart, Ring, Highlight, Icon, CountUpDirective, RevealDirective],
  templateUrl: './report.html',
  styleUrl: './report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportPage implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private toast = inject(ToastService);
  private handoff = inject(HandoffService);
  readonly id = input.required<string>();

  readonly interview = signal<Interview | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly open = signal<number | null>(null);
  readonly dimLabels = DIM_LABELS;
  readonly statusLabel = STATUS_LABEL;

  readonly report = computed(() => this.interview()?.report ?? null);
  readonly answered = computed(() => (this.interview()?.turns ?? []).filter((t) => t.answered));
  readonly dims = computed(() => {
    const r = this.report();
    return r ? Object.entries(r.scores).map(([k, v]) => ({ key: k, label: DIM_LABELS[k] ?? k, value: v })) : [];
  });
  readonly radarAxes = computed(() => (this.report()?.skillGap.axes ?? []).map((a) => ({ label: a.label, current: a.current, target: a.target })));
  readonly diffSeries = computed<Series[]>(() => {
    const path = this.report()?.difficultyPath ?? [];
    return [
      { name: 'Difficulty level', values: path.map((p) => p.level), color: 'var(--ink)' },
      { name: 'Score ÷ 2', values: path.map((p) => (p.score === null ? null : p.score / 2)), color: 'var(--accent)' }
    ];
  });
  readonly diffLabels = computed(() => (this.report()?.difficultyPath ?? []).map((_, i) => `Q${i + 1}`));
  readonly maxThink = computed(() => Math.max(10, ...(this.report()?.timing.rows ?? []).map((r) => Math.max(r.thinkSec, r.idealThink[1]))));

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.get<{ interview: Interview }>(`/interviews/${this.id()}`);
      if (res.interview.status === 'active') {
        await this.router.navigate(['/room', res.interview.id]);
        return;
      }
      this.interview.set(res.interview);
      const first = res.interview.turns.find((t) => t.answered && !t.skipped);
      if (first) this.open.set(first.index);
    } catch (err) {
      this.error.set(errorMessage(err, 'Report not found.'));
    } finally {
      this.loading.set(false);
    }
  }

  toggle(t: Turn): void {
    this.open.set(this.open() === t.index ? null : t.index);
  }

  label(t: Turn): string {
    if (t.kind === 'follow-up') return 'Follow-up';
    const mains = (this.interview()?.turns ?? []).filter((x) => x.kind === 'main');
    return `Q${mains.findIndex((x) => x.index === t.index) + 1}`;
  }

  tone(v: number): string {
    return v >= 7.5 ? 'good' : v >= 5 ? 'okay' : 'low';
  }

  print(): void {
    window.print();
  }

  again(): void {
    const iv = this.interview();
    if (iv) this.handoff.set({ mode: iv.mode, stress: iv.stress, focusWeaknesses: true });
    this.router.navigateByUrl('/app/new');
  }

  async remove(): Promise<void> {
    const iv = this.interview();
    if (!iv || !confirm('Delete this interview and its recording? This cannot be undone.')) return;
    try {
      await this.api.delete(`/interviews/${iv.id}`);
      this.toast.good('Interview deleted.');
      this.router.navigateByUrl('/app/reports');
    } catch (err) {
      this.toast.bad(errorMessage(err));
    }
  }

  modeIcon(m: string): string {
    return m === 'voice' ? 'mic' : m === 'video' ? 'video' : 'type';
  }

  starTag(tag: string | null): string {
    return tag ? tag.charAt(0).toUpperCase() : '·';
  }
}

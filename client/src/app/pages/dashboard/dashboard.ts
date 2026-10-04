import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { HandoffService } from '../../core/handoff.service';
import { InterviewSummary, Mode, Overview } from '../../core/models';
import { Gauge } from '../../shared/charts/gauge';
import { Radar } from '../../shared/charts/radar';
import { LineChart, Series } from '../../shared/charts/line-chart';
import { Icon } from '../../shared/icon';
import { CountUpDirective } from '../../shared/directives';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, Gauge, Radar, LineChart, Icon, CountUpDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Dashboard implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private handoff = inject(HandoffService);
  readonly auth = inject(AuthService);

  readonly data = signal<Overview | null>(null);
  readonly recent = signal<InterviewSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  });
  readonly isNew = computed(() => (this.data()?.totals.completed ?? 0) === 0);
  readonly trendSeries = computed<Series[]>(() => {
    const t = this.data()?.trend ?? [];
    return [
      { name: 'Readiness', values: t.map((x) => x.readiness), color: 'var(--accent)' },
      { name: 'Average score ×10', values: t.map((x) => (x.overall === null ? null : x.overall * 10)), color: 'var(--teal)' }
    ];
  });
  readonly trendLabels = computed(() => (this.data()?.trend ?? []).map((_, i) => `#${i + 1}`));
  readonly radarAxes = computed(() => (this.data()?.skillGap.axes ?? []).map((a) => ({ label: a.label, current: a.current, target: a.target })));

  async ngOnInit(): Promise<void> {
    try {
      const [overview, list] = await Promise.all([this.api.get<Overview>('/analytics/overview'), this.api.get<{ interviews: InterviewSummary[] }>('/interviews?limit=6')]);
      this.data.set(overview);
      this.recent.set(list.interviews);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  quickStart(mode: Mode): void {
    this.handoff.set({ mode });
    this.router.navigateByUrl('/app/new');
  }

  practiseWeakness(): void {
    this.handoff.set({ focusWeaknesses: true });
    this.router.navigateByUrl('/app/new');
  }

  open(i: InterviewSummary): void {
    this.router.navigateByUrl(i.status === 'active' ? `/room/${i.id}` : `/app/reports/${i.id}`);
  }

  modeIcon(m: string): string {
    return m === 'voice' ? 'mic' : m === 'video' ? 'video' : 'type';
  }
}

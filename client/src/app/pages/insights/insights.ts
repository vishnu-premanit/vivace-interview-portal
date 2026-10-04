import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { HandoffService } from '../../core/handoff.service';
import { MetaService } from '../../core/meta.service';
import { Overview, Twin } from '../../core/models';
import { Radar } from '../../shared/charts/radar';
import { Ring } from '../../shared/charts/ring';
import { Icon } from '../../shared/icon';
import { RevealDirective } from '../../shared/directives';

interface SimResult {
  competency: string;
  difficulty: number;
  stress: boolean;
  predicted: number | null;
  confidence: string;
  evidence: number;
  pitfalls: string[];
  note: string | null;
}

@Component({
  selector: 'app-insights',
  imports: [FormsModule, RouterLink, DatePipe, Radar, Ring, Icon, RevealDirective],
  templateUrl: './insights.html',
  styleUrl: './insights.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Insights implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private handoff = inject(HandoffService);
  readonly metaSvc = inject(MetaService);

  readonly overview = signal<Overview | null>(null);
  readonly twin = signal<Twin | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly simCompetency = signal('communication');
  readonly simDifficulty = signal(4);
  readonly simStress = signal(false);
  readonly sim = signal<SimResult | null>(null);
  readonly simBusy = signal(false);

  readonly radarAxes = computed(() => (this.overview()?.skillGap.axes ?? []).map((a) => ({ label: a.label, current: a.current, target: a.target })));

  async ngOnInit(): Promise<void> {
    this.metaSvc.load().catch(() => undefined);
    try {
      const [o, t] = await Promise.all([this.api.get<Overview>('/analytics/overview'), this.api.get<{ twin: Twin }>('/analytics/twin')]);
      this.overview.set(o);
      this.twin.set(t.twin);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async simulate(): Promise<void> {
    this.simBusy.set(true);
    try {
      this.sim.set(await this.api.post<SimResult>('/analytics/twin/simulate', { competency: this.simCompetency(), difficulty: this.simDifficulty(), stress: this.simStress() }));
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.simBusy.set(false);
    }
  }

  practise(): void {
    this.handoff.set({ focusWeaknesses: true });
    this.router.navigateByUrl('/app/new');
  }
}

import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { InterviewSummary } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Ring } from '../../shared/charts/ring';

@Component({
  selector: 'app-history',
  imports: [RouterLink, DatePipe, Icon, Ring],
  template: `
    <div class="page-head">
      <div>
        <span class="eyebrow">Reports</span>
        <h1>Every interview, <em class="serif">on record</em>.</h1>
        <p>Open any session for the full debrief, recording and question-by-question feedback.</p>
      </div>
      <a routerLink="/app/new" class="btn btn-accent">New interview <app-icon name="arrow" /></a>
    </div>
    <div class="filters" role="tablist" aria-label="Filter interviews">
      @for (f of filters; track f.id) {
        <button type="button" role="tab" class="chip filter" [class.on]="filter() === f.id" [attr.aria-selected]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }}</button>
      }
    </div>
    @if (loading()) {
      <div class="card"><div class="skeleton" style="height: 200px"></div></div>
    } @else if (error()) {
      <div class="card empty"><h3>{{ error() }}</h3></div>
    } @else if (shown().length === 0) {
      <div class="card empty">
        <h3>Nothing here yet</h3>
        <p>Your interviews will show up here once you finish one.</p>
        <a routerLink="/app/new" class="btn btn-accent">Start one</a>
      </div>
    } @else {
      <div class="list">
        @for (r of shown(); track r.id; let i = $index) {
          <button type="button" class="item card card-hover" (click)="open(r)" [style.--i]="i">
            <span class="mode"><app-icon [name]="r.mode === 'voice' ? 'mic' : r.mode === 'video' ? 'video' : 'type'" /></span>
            <span class="main">
              <strong>{{ r.streamName }}{{ r.role ? ' · ' + r.role : '' }}</strong>
              <span class="small muted">{{ r.createdAt | date: 'EEE d MMM yyyy, h:mm a' }} · {{ r.answered }} answers · {{ r.persona }}{{ r.stress ? ' · stress' : '' }}{{ r.language !== 'en' ? ' · ' + r.language : '' }}</span>
            </span>
            @if (r.status === 'completed') {
              <span class="stats">
                <span class="score"><b>{{ r.overall }}</b><small>/10</small></span>
                <app-ring [value]="r.readiness" style="--s: 46px" />
              </span>
            } @else if (r.status === 'active') {
              <span class="chip chip-warn">In progress · resume</span>
            } @else {
              <span class="chip">Abandoned</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: `
    .filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 18px; }
    .filter { cursor: pointer; transition: background-color var(--dur-2), color var(--dur-2); }
    .filter.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
    .list { display: grid; gap: 10px; }
    .item { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; text-align: left; cursor: pointer; padding: 16px 20px; animation: rise .45s var(--ease-out) both; animation-delay: calc(var(--i) * 40ms); }
    .mode { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: 1.2rem; }
    .main { display: grid; min-width: 0; }
    .main strong { font-size: 1.02rem; }
    .stats { display: flex; align-items: center; gap: 14px; }
    .score b { font-family: var(--font-display); font-size: 1.6rem; font-weight: 500; }
    .score small { color: var(--muted); font-family: var(--font-mono); }
    @media (max-width: 560px) { .item { grid-template-columns: auto 1fr; } .stats, .item > .chip { grid-column: 2; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class History implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  readonly list = signal<InterviewSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly filter = signal<'all' | 'text' | 'voice' | 'video' | 'stress'>('all');
  readonly filters = [
    { id: 'all' as const, label: 'All' },
    { id: 'text' as const, label: 'Text' },
    { id: 'voice' as const, label: 'Voice' },
    { id: 'video' as const, label: 'Video' },
    { id: 'stress' as const, label: 'Stress' }
  ];
  readonly shown = computed(() => {
    const f = this.filter();
    return this.list().filter((x) => f === 'all' || (f === 'stress' ? x.stress : x.mode === f));
  });

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.get<{ interviews: InterviewSummary[] }>('/interviews?limit=50');
      this.list.set(res.interviews);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  open(r: InterviewSummary): void {
    this.router.navigateByUrl(r.status === 'active' ? `/room/${r.id}` : `/app/reports/${r.id}`);
  }
}

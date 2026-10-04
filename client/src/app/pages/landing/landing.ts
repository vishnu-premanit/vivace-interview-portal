import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/logo';
import { Icon } from '../../shared/icon';
import { RevealDirective } from '../../shared/directives';
import { AuthService } from '../../core/auth.service';
import { MetaService } from '../../core/meta.service';
import { PerfService } from '../../core/perf.service';
import { FEATURES } from './features';

const DEMO = [
  { q: 'Tell me about a time you disagreed with a teammate.', a: 'In my final year project, um, our backend lead wanted Firebase. I built two quick prototypes and we compared them for a day. We went with MongoDB and shipped two weeks early.', follow: 'And what did that change for the users?' },
  { q: 'Explain normalisation — and when would you break the rules?', a: 'Normalisation removes redundancy, like, through 1NF to 3NF. I’d denormalise a reporting table when joins slow down the dashboard reads.', follow: 'How would you measure that slowdown?' }
];

@Component({
  selector: 'app-landing',
  imports: [RouterLink, Logo, Icon, RevealDirective],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Landing implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly metaSvc = inject(MetaService);
  private perf = inject(PerfService);
  readonly features = FEATURES;
  readonly groups = ['Interviewer', 'Analysis', 'Prediction', 'Practice'] as const;
  readonly streams = computed(() => this.metaSvc.meta()?.streams ?? []);
  readonly menuOpen = signal(false);

  // Demo card: types the answer out, then shows a follow-up.
  readonly demoIndex = signal(0);
  readonly typed = signal('');
  readonly showFollow = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly demo = computed(() => DEMO[this.demoIndex()]);
  readonly fillerCount = computed(() => (this.typed().match(/\b(um|like)\b/gi) || []).length);

  ngOnInit(): void {
    this.metaSvc.load().catch(() => undefined);
    this.play();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  featuresIn(group: string) {
    return this.features.filter((f) => f.group === group);
  }

  private play(): void {
    const full = this.demo().a;
    if (this.perf.level() === 'off') {
      this.typed.set(full);
      this.showFollow.set(true);
      return;
    }
    let i = 0;
    this.typed.set('');
    this.showFollow.set(false);
    const step = () => {
      i = Math.min(full.length, i + (this.perf.level() === 'lite' ? 4 : 2));
      this.typed.set(full.slice(0, i));
      if (i < full.length) {
        this.timer = setTimeout(step, 28);
      } else {
        this.timer = setTimeout(() => {
          this.showFollow.set(true);
          this.timer = setTimeout(() => {
            this.demoIndex.set((this.demoIndex() + 1) % DEMO.length);
            this.play();
          }, 4200);
        }, 700);
      }
    };
    this.timer = setTimeout(step, 900);
  }
}

import { Directive, ElementRef, OnDestroy, OnInit, inject, input, effect } from '@angular/core';

/** Adds .in when the element scrolls into view (one IntersectionObserver per element, disconnected after). */
@Directive({ selector: '[appReveal]', host: { class: 'reveal' } })
export class RevealDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private io: IntersectionObserver | null = null;
  readonly appReveal = input<number | string>('');

  ngOnInit(): void {
    const node = this.el.nativeElement;
    const i = this.appReveal();
    if (i !== '' && i !== undefined) node.style.setProperty('--i', String(i));
    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('in');
      return;
    }
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            node.classList.add('in');
            this.io?.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    this.io.observe(node);
  }
  ngOnDestroy(): void {
    this.io?.disconnect();
  }
}

/** Animates a number from 0 to its value (rAF, ease-out). Respects reduced motion. */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective implements OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  readonly appCountUp = input<number | null>(0);
  readonly decimals = input(0);
  private raf = 0;

  constructor() {
    effect(() => {
      const target = this.appCountUp();
      const decimals = this.decimals();
      cancelAnimationFrame(this.raf);
      if (target === null || target === undefined || Number.isNaN(target)) {
        this.el.nativeElement.textContent = '—';
        return;
      }
      const reduce = document.documentElement.dataset['motion'] === 'off';
      if (reduce) {
        this.el.nativeElement.textContent = target.toFixed(decimals);
        return;
      }
      const start = performance.now();
      const dur = 900;
      const step = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        this.el.nativeElement.textContent = (target * eased).toFixed(decimals);
        if (p < 1) this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    });
  }
  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
  }
}

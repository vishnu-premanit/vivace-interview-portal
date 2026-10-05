import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HeatCell } from '../../core/models';

/** Filler Word Heatmap — rows are answers, columns are slices of each answer (start → end). */
@Component({
  selector: 'app-heatmap',
  template: `
    <div class="hm" role="table" aria-label="Filler word density across each answer">
      <div class="hdr" role="row">
        <span role="columnheader"></span>
        <span class="cols" role="columnheader"><span>start</span><span>middle</span><span>end</span></span>
        <span role="columnheader" class="rate">per 100</span>
      </div>
      @for (row of rows(); track row.index; let i = $index) {
        <div class="r" role="row" [style.--i]="i">
          <span class="lbl" role="rowheader">{{ row.label }}</span>
          <span class="cells">
            @for (c of row.heatmap; track c.index) {
              <span class="cell" [style.--d]="intensity(c)" [title]="c.fillers + ' filler(s) in ' + c.words + ' words'"></span>
            }
          </span>
          <span class="rate mono">{{ row.perHundred }}</span>
        </div>
      }
    </div>
    <div class="scale"><span>clean</span><i></i><span>heavy</span></div>
  `,
  styles: `
    :host { display: block; }
    .hm { display: grid; gap: 6px; }
    .hdr, .r { display: grid; grid-template-columns: 84px 1fr 56px; gap: 10px; align-items: center; }
    .hdr { font-size: .7rem; color: var(--faint); font-family: var(--font-mono); }
    .cols { display: flex; justify-content: space-between; }
    .r { animation: rise .5s var(--ease-out) both; animation-delay: calc(var(--i) * 50ms); }
    .lbl { font-size: .8rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cells { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; }
    .cell { height: 22px; border-radius: 4px; background: color-mix(in srgb, var(--accent) calc(var(--d) * 100%), var(--surface-2)); border: 1px solid var(--line); }
    .rate { text-align: right; font-size: .8rem; }
    .scale { display: flex; align-items: center; gap: 8px; justify-content: flex-end; font-size: .7rem; color: var(--faint); margin-top: 10px; }
    .scale i { width: 90px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, var(--surface-2), var(--accent)); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Heatmap {
  readonly rows = input<{ index: number; label: string; heatmap: HeatCell[]; perHundred: number }[]>([]);
  intensity(c: HeatCell): number {
    return Math.min(1, c.density * 6);
  }
}

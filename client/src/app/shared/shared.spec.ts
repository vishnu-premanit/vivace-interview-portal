import { TestBed } from '@angular/core/testing';
import { Highlight } from './highlight';
import { Gauge } from './charts/gauge';
import { Radar } from './charts/radar';
import { Heatmap } from './charts/heatmap';
import { Ring } from './charts/ring';
import { LineChart } from './charts/line-chart';
import { Icon } from './icon';

describe('Highlight', () => {
  it('wraps filler marks without using innerHTML', async () => {
    const f = TestBed.createComponent(Highlight);
    const text = 'Um, I <b>built</b> it, like, fast.';
    const at = text.indexOf('like');
    f.componentRef.setInput('text', text);
    f.componentRef.setInput('marks', [
      { start: 0, end: 2, word: 'um' },
      { start: at, end: at + 4, word: 'like' }
    ]);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const marks = el.querySelectorAll('mark.filler');
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe('Um');
    expect(marks[1].textContent).toBe('like');
    expect(el.querySelector('b')).toBeNull(); // HTML in answers is shown as text
    expect(el.textContent).toContain('<b>built</b>');
  });

  it('ignores out-of-range or overlapping marks', async () => {
    const f = TestBed.createComponent(Highlight);
    f.componentRef.setInput('text', 'short');
    f.componentRef.setInput('marks', [{ start: 2, end: 99, word: 'x' }]);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelectorAll('mark').length).toBe(0);
  });
});

describe('Gauge', () => {
  it('clamps and colours by value', async () => {
    const f = TestBed.createComponent(Gauge);
    f.componentRef.setInput('value', 140);
    await f.whenStable();
    expect(f.componentInstance.clamped()).toBe(100);
    expect(f.componentInstance.color()).toBe('var(--good)');
    f.componentRef.setInput('value', 30);
    expect(f.componentInstance.color()).toBe('var(--accent)');
    expect((f.nativeElement as HTMLElement).querySelector('svg')?.getAttribute('aria-label')).toContain('Readiness');
  });
});

describe('Radar', () => {
  it('draws one spoke per axis and hollow dots for untested axes', async () => {
    const f = TestBed.createComponent(Radar);
    f.componentRef.setInput('axes', [
      { label: 'A', current: 80, target: 70 },
      { label: 'B', current: null, target: 60 },
      { label: 'C', current: 40, target: 75 }
    ]);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.spoke').length).toBe(3);
    expect(el.querySelectorAll('circle.hollow').length).toBe(1);
  });
});

describe('Heatmap & Ring & LineChart', () => {
  it('renders heatmap rows and cells', async () => {
    const f = TestBed.createComponent(Heatmap);
    f.componentRef.setInput('rows', [{ index: 0, label: 'Q1', perHundred: 4, heatmap: [{ index: 0, words: 10, fillers: 2, density: 0.2 }, { index: 1, words: 10, fillers: 0, density: 0 }] }]);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelectorAll('.cell').length).toBe(2);
    expect(f.componentInstance.intensity({ index: 0, words: 10, fillers: 2, density: 0.2 })).toBe(1);
  });
  it('ring shows a dash for null', async () => {
    const f = TestBed.createComponent(Ring);
    f.componentRef.setInput('value', null);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).textContent).toContain('—');
  });
  it('line chart skips null points', async () => {
    const f = TestBed.createComponent(LineChart);
    f.componentRef.setInput('series', [{ name: 's', values: [10, null, 30], color: 'red' }]);
    await f.whenStable();
    expect(f.componentInstance.paths()[0].pts.length).toBe(2);
  });
});

describe('Icon', () => {
  it('renders known icons and nothing for unknown ones', async () => {
    const f = TestBed.createComponent(Icon);
    f.componentRef.setInput('name', 'mic');
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('svg')?.innerHTML).toContain('rect');
    f.componentRef.setInput('name', 'nope');
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('svg')?.innerHTML).toBe('');
  });
});

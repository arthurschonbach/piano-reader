/**
 * The timing meter under the cursor: one dot per key pressed (↓) and per key
 * let go (↑). Centre = right on time; left (blue) = too soon; right (orange) =
 * too late. The dots fade, so a tendency (rushing, dragging, short notes)
 * shows without reading anything.
 */

/** Dots kept per lane: the latest ones, older ones fading. */
const KEEP = 8;
/** A value of ±1 is the edge of "right"; the lane shows up to ±LIMIT. */
const LIMIT = 2.5;

export type MeterLane = 'attack' | 'release';

export class TimingMeter {
  readonly el: HTMLDivElement;
  private lanes: Record<MeterLane, HTMLDivElement>;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'meter';
    this.el.setAttribute('aria-hidden', 'true');
    const lane = (kind: MeterLane, icon: string, title: string) => {
      const row = document.createElement('div');
      row.className = `meter-row ${kind}`;
      const ic = document.createElement('span');
      ic.className = 'meter-icon';
      ic.textContent = icon;
      ic.title = title;
      const track = document.createElement('div');
      track.className = 'meter-track';
      const ok = document.createElement('span');
      ok.className = 'meter-ok';
      // The "right" band is ±1 out of ±LIMIT.
      ok.style.left = `${50 - 50 / LIMIT}%`;
      ok.style.width = `${100 / LIMIT}%`;
      track.append(ok);
      row.append(ic, track);
      this.el.append(row);
      return track;
    };
    this.lanes = { attack: lane('attack', '↓', 'Appui'), release: lane('release', '↑', 'Relâché') };
    const legend = document.createElement('div');
    legend.className = 'meter-legend';
    legend.innerHTML = '<span class="early">tôt</span><span class="late">tard</span>';
    this.el.append(legend);
    this.el.hidden = true;
    parent.append(this.el);
  }

  /** Centre the meter on the cursor, just under the music. */
  place(x: number, top: number, maxTop: number): void {
    const w = this.el.offsetWidth || 230;
    this.el.style.left = `${Math.max(6, x - w / 2 - 9)}px`;
    this.el.style.top = `${Math.min(top, maxTop)}px`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }

  /**
   * A dot on a lane. `x` is the error in tolerance units: 0 = exact, ±1 =
   * the edge of what counts as right, negative = too soon.
   */
  add(lane: MeterLane, x: number): void {
    const track = this.lanes[lane];
    const v = Math.max(-LIMIT, Math.min(LIMIT, x));
    const dot = document.createElement('i');
    dot.className = `meter-dot ${Math.abs(x) <= 1 ? 'ok' : x < 0 ? 'early' : 'late'}`;
    dot.style.left = `${50 + (50 * v) / LIMIT}%`;
    track.querySelectorAll('.meter-dot.last').forEach((d) => d.classList.remove('last'));
    dot.classList.add('last');
    track.append(dot);
    const dots = track.querySelectorAll('.meter-dot');
    for (let i = 0; i < dots.length - KEEP; i++) dots[i].remove();
  }

  clear(): void {
    for (const t of Object.values(this.lanes)) t.querySelectorAll('.meter-dot').forEach((d) => d.remove());
  }

  destroy(): void {
    this.el.remove();
  }
}

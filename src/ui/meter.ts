/**
 * Timing lanes at the cursor, one per hand: the right hand's above the treble
 * staff, the left hand's under the bass staff, so they never cover a note.
 * Each key pressed leaves a dot: centre = on time, left (blue) = too soon,
 * right (orange) = too late. Older dots fade, so a hand that rushes or drags
 * shows as a cluster on one side, without reading anything.
 */

/** Dots kept per lane: the latest ones, older ones fading. */
const KEEP = 8;
/** A value of ±1 is the edge of "right"; the lane shows up to ±LIMIT. */
const LIMIT = 2.5;
/** Lane width (px) and the height it needs, dots included. */
export const LANE_W = 200;
export const LANE_H = 16;

export class TimingMeter {
  private lanes: HTMLDivElement[] = [];

  /** `hands`: one lane per staff (1 or 2). */
  constructor(parent: HTMLElement, hands: number) {
    for (let i = 0; i < hands; i++) {
      const lane = document.createElement('div');
      lane.className = `meter hand-${i}`;
      lane.setAttribute('aria-hidden', 'true');
      lane.style.width = `${LANE_W}px`;
      const ok = document.createElement('span');
      ok.className = 'meter-ok';
      // The "right" band is ±1 out of ±LIMIT.
      ok.style.left = `${50 - 50 / LIMIT}%`;
      ok.style.width = `${100 / LIMIT}%`;
      lane.append(ok);
      lane.hidden = true;
      parent.append(lane);
      this.lanes.push(lane);
    }
  }

  /** Centre each lane on the cursor at its own height (centre y, per staff). */
  place(x: number, ys: number[]): void {
    this.lanes.forEach((lane, i) => {
      lane.style.left = `${Math.max(4, x - LANE_W / 2)}px`;
      lane.style.top = `${ys[i] - LANE_H / 2}px`;
      lane.hidden = false;
    });
  }

  hide(): void {
    for (const l of this.lanes) l.hidden = true;
  }

  /**
   * A dot on a hand's lane. `x` is the error in tolerance units: 0 = exact,
   * ±1 = the edge of what counts as right, negative = too soon.
   */
  add(hand: number, x: number): void {
    const lane = this.lanes[Math.min(hand, this.lanes.length - 1)];
    if (!lane) return;
    const v = Math.max(-LIMIT, Math.min(LIMIT, x));
    const dot = document.createElement('i');
    dot.className = `meter-dot ${Math.abs(x) <= 1 ? 'ok' : x < 0 ? 'early' : 'late'}`;
    dot.style.left = `${50 + (50 * v) / LIMIT}%`;
    lane.querySelectorAll('.meter-dot.last').forEach((d) => d.classList.remove('last'));
    dot.classList.add('last');
    lane.append(dot);
    const dots = lane.querySelectorAll('.meter-dot');
    for (let i = 0; i < dots.length - KEEP; i++) dots[i].remove();
  }

  clear(): void {
    for (const l of this.lanes) l.querySelectorAll('.meter-dot').forEach((d) => d.remove());
  }

  destroy(): void {
    for (const l of this.lanes) l.remove();
  }
}

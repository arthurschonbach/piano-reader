import { ScoreRenderer, type DrawState } from './engraver';
import type { NoteItem, Score } from './model';

/** Everything that changes the picture, except the scroll position. */
export type ViewOptions = Omit<DrawState, 'beat' | 'sp' | 'stateBeat' | 'pin' | 'fitBeats' | 'anchor'> & { anchor: number };

/** Browsers refuse canvases past these sizes (iOS: 16 M pixels, 16384 px a side). */
const MAX_SIDE = 16000;
const MAX_AREA = 15_000_000;

/**
 * A scrolling score that moves at the screen's own refresh rate.
 *
 * The whole exercise is drawn once into a single wide canvas (the "strip").
 * Moving the score is a CSS transform on it, animated by the browser's
 * compositor (Web Animations): it doesn't depend on the page's frame rate,
 * which in-app browsers on iPad cap at 60 or even 30 fps. When a note changes
 * (colour, a mark), only a narrow band around it is repainted. The cursor and
 * the pinned clefs live on a fixed overlay canvas above the strip.
 */
export class ScrollStrip {
  private strip: HTMLCanvasElement;
  private stripR: ScoreRenderer;
  private overlayCanvas: HTMLCanvasElement;
  private overlay: ScoreRenderer;
  private probe: ScoreRenderer;
  private w = 0;
  private h = 0;
  private geo: { SP: number; lead: number; pxQ: number; anchorX: number; bottom: number; staffTop: number[]; staffBottom: number[] } | null = null;
  private anim: Animation | null = null;
  private pinState = '';
  private overlayDirty = true;
  /** The whole strip needs painting (new size, theme, options). */
  private fullDirty = true;
  /** Bands to repaint, in strip CSS px. */
  private dirty: [number, number][] = [];
  /** Beat the strip shows (or is gliding to) when not playing. */
  private restBeat = 0;
  /** Curtain over the notes about to be played (look-ahead practice). */
  private mask: HTMLDivElement;
  private maskBeats = 0;

  constructor(stage: HTMLElement, private score: Score, private opts: ViewOptions) {
    this.strip = document.createElement('canvas');
    this.strip.className = 'strip';
    this.stripR = new ScoreRenderer(this.strip);
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'strip-overlay';
    this.mask = document.createElement('div');
    this.mask.className = 'strip-mask';
    this.mask.hidden = true;
    // Above the music, under the cursor and the pinned clefs.
    stage.append(this.strip, this.mask, this.overlayCanvas);
    this.overlay = new ScoreRenderer(this.overlayCanvas, false);
    // Off-screen renderer, only used to compute the layout at the stage size.
    this.probe = new ScoreRenderer(document.createElement('canvas'));
  }

  resize(w: number, h: number): void {
    if (Math.abs(w - this.w) < 0.5 && Math.abs(h - this.h) < 0.5) return;
    this.w = w;
    this.h = h;
    this.probe.resize(w, h);
    this.geo = this.probe.layout(this.score, { ...this.opts, beat: 0 });
    this.overlay.resize(w, h);
    // Room for every beat, plus a screen's width so the end can scroll to the cursor.
    const { lead, pxQ } = this.geo;
    const last = this.score.measures[this.score.measures.length - 1];
    const sw = Math.ceil(lead + (last ? last.startBeat + last.length : 0) * pxQ + w + 40);
    const scale = Math.min(3, MAX_SIDE / sw, Math.sqrt(MAX_AREA / (sw * h)));
    this.stripR.resize(sw, h, scale);
    this.strip.style.width = `${sw}px`;
    this.strip.style.height = `${h}px`;
    this.fullDirty = true;
    this.overlayDirty = true;
    this.layoutMask();
    if (!this.anim) this.place(this.restBeat, false);
  }

  setOptions(o: Partial<ViewOptions>): void {
    this.opts = { ...this.opts, ...o };
    this.invalidateAll();
  }

  invalidateAll(): void {
    this.fullDirty = true;
    this.overlayDirty = true;
  }

  /** Something changed on these notes (colour, label): repaint around them. */
  invalidateNotes(notes: Iterable<NoteItem>): void {
    if (!this.geo) return;
    const { lead, pxQ, SP } = this.geo;
    for (const n of notes) {
      const x = lead + n.beat * pxQ;
      this.dirty.push([x - 4 * SP, x + 5 * SP]);
    }
  }

  /** Repaint everything between two beats. */
  invalidateSpan(fromBeat: number, toBeat: number): void {
    if (!this.geo) return;
    const { lead, pxQ, SP } = this.geo;
    this.dirty.push([lead + fromBeat * pxQ - 4 * SP, lead + toBeat * pxQ + 5 * SP]);
  }

  /**
   * Hide the notes from the current beat to `beats` ahead (0 = no curtain),
   * so they have to be read before they arrive. The curtain is fixed: the
   * music slides under it.
   */
  setMask(beats: number): void {
    this.maskBeats = beats;
    this.layoutMask();
  }

  get maskedBeats(): number {
    return this.maskBeats;
  }

  /** Lift the curtain for a moment (a hint after mistakes). */
  peek(on: boolean): void {
    this.mask.classList.toggle('peek', on);
  }

  private layoutMask(): void {
    this.mask.hidden = !this.geo || this.maskBeats <= 0;
    if (this.mask.hidden || !this.geo) return;
    const { SP, lead, pxQ, anchorX } = this.geo;
    // Noteheads sit 0.65 SP after their beat; leave room for an accidental on either side.
    const noteX = anchorX + lead + 0.65 * SP;
    const left = noteX - 1.6 * SP;
    this.mask.style.left = `${left}px`;
    this.mask.style.width = `${Math.max(SP, noteX + this.maskBeats * pxQ - 1.7 * SP - left)}px`;
  }

  /** Where the cursor meets the music: its x, the y just under the lowest staff, and each staff's top and bottom. */
  cursorPoint(): { x: number; below: number; SP: number; staffTop: number[]; staffBottom: number[] } | null {
    if (!this.geo) return null;
    const { anchorX, lead, SP, bottom, staffTop, staffBottom } = this.geo;
    return { x: anchorX + lead + 1.25 * SP, below: bottom, SP, staffTop, staffBottom };
  }

  private offset(beat: number): number {
    return this.geo ? this.geo.anchorX - beat * this.geo.pxQ : 0;
  }

  /** Move to a beat: instantly, or with a short native glide (wait mode). */
  place(beat: number, glide: boolean): void {
    this.stopAnimation();
    this.restBeat = beat;
    this.strip.style.transition = glide ? 'transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1)' : 'none';
    this.strip.style.transform = `translate3d(${this.offset(beat)}px, 0, 0)`;
  }

  /**
   * Scroll at constant speed: `fromBeat` is shown at performance time `atMs`,
   * then one beat every `msPerBeat`, until `toBeat`. Runs on the compositor.
   */
  play(fromBeat: number, atMs: number, msPerBeat: number, toBeat: number): void {
    this.stopAnimation();
    this.strip.style.transition = 'none';
    this.strip.style.transform = `translate3d(${this.offset(fromBeat)}px, 0, 0)`;
    if (typeof this.strip.animate !== 'function') return;
    const keyframes = [
      { transform: `translate3d(${this.offset(fromBeat)}px, 0, 0)` },
      { transform: `translate3d(${this.offset(toBeat)}px, 0, 0)` }
    ];
    const duration = Math.max(1, (toBeat - fromBeat) * msPerBeat);
    this.anim = this.strip.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' });
    // The document timeline and performance.now() share the same origin.
    this.anim.startTime = atMs;
  }

  stopAnimation(): void {
    this.anim?.cancel();
    this.anim = null;
  }

  private paint(region?: [number, number]): void {
    if (!this.geo) return;
    this.stripR.draw(this.score, {
      ...this.opts,
      beat: 0,
      anchor: 0,
      sp: this.geo.SP,
      stateBeat: -1e9,
      pin: false,
      cursor: false,
      region
    });
  }

  /**
   * Call every frame with the current beat. Repaints what changed on the
   * strip and keeps the overlay up to date. `manual` moves the strip from
   * here (no Web Animations support).
   */
  update(beat: number, manual = false): void {
    if (!this.geo || this.w < 2) return;
    if (this.fullDirty) {
      this.fullDirty = false;
      this.dirty = [];
      this.paint();
    } else if (this.dirty.length) {
      // Merge overlapping bands, then repaint each one.
      const bands = this.dirty.sort((a, b) => a[0] - b[0]);
      this.dirty = [];
      let [a, b] = bands[0];
      for (const [x0, x1] of bands.slice(1)) {
        if (x0 <= b) b = Math.max(b, x1);
        else {
          this.paint([a, b]);
          [a, b] = [x0, x1];
        }
      }
      this.paint([a, b]);
    }
    const off = this.offset(beat);
    if (manual && !this.anim) this.strip.style.transform = `translate3d(${off}px, 0, 0)`;

    // Pinned clefs show once bar 1 has gone; their key follows the current bar.
    const pinned = off < 0;
    const bar = pinned ? this.score.measures.find((m) => m.startBeat <= beat && beat < m.startBeat + m.length) : undefined;
    const state = pinned ? `pin:${bar?.key ?? ''}` : 'none';
    if (state !== this.pinState || this.overlayDirty) {
      this.pinState = state;
      this.overlayDirty = false;
      this.overlay.drawOverlay(this.score, { ...this.opts, beat: pinned ? beat : Math.min(beat, 0) }, true);
    }
  }

  get animated(): boolean {
    return this.anim !== null;
  }

  destroy(): void {
    this.stopAnimation();
    this.strip.remove();
    this.mask.remove();
    this.overlayCanvas.remove();
  }
}

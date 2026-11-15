import { ScoreRenderer, type DrawState } from './engraver';
import type { NoteItem, Score } from './model';

/** Everything that changes the picture, except the scroll position. */
export type ViewOptions = Omit<DrawState, 'beat' | 'sp' | 'stateBeat' | 'pin' | 'fitBeats' | 'anchor'> & { anchor: number };

interface Tile {
  canvas: HTMLCanvasElement;
  renderer: ScoreRenderer;
  index: number;
  dirty: boolean;
}

/** Tile width in CSS pixels. A small pool of canvases is recycled along the score. */
const TILE_W = 768;
const POOL = 6;

/**
 * A scrolling score that moves at the screen's own refresh rate.
 *
 * The music is drawn once into tiles sitting side by side in a wide "strip"
 * element. Moving the score is a CSS transform on that strip, animated by the
 * browser's compositor (Web Animations): it doesn't depend on the page's
 * frame rate, which in-app browsers on iPad cap at 60 or even 30 fps.
 * The page only repaints a tile when something on it changes, and keeps the
 * tiles around the visible area ready. The cursor and the pinned clefs live
 * on a fixed overlay canvas above the strip.
 */
export class ScrollStrip {
  private strip: HTMLDivElement;
  private overlayCanvas: HTMLCanvasElement;
  private overlay: ScoreRenderer;
  private probe: ScoreRenderer;
  private tiles: Tile[] = [];
  private w = 0;
  private h = 0;
  private geo: { SP: number; lead: number; pxQ: number; anchorX: number } | null = null;
  private anim: Animation | null = null;
  private pinState = '';
  private overlayDirty = true;
  /** Beat the strip shows (or is gliding to) when not playing. */
  private restBeat = 0;

  constructor(stage: HTMLElement, private score: Score, private opts: ViewOptions) {
    this.strip = document.createElement('div');
    this.strip.className = 'strip';
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'strip-overlay';
    stage.append(this.strip, this.overlayCanvas);
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
    this.strip.style.height = `${h}px`;
    for (const t of this.tiles) {
      t.renderer.resize(TILE_W, h);
      t.canvas.style.height = `${h}px`;
      t.dirty = true;
    }
    this.overlayDirty = true;
    if (!this.anim) this.place(this.restBeat, false);
  }

  setOptions(o: Partial<ViewOptions>): void {
    this.opts = { ...this.opts, ...o };
    this.invalidateAll();
  }

  invalidateAll(): void {
    for (const t of this.tiles) t.dirty = true;
    this.overlayDirty = true;
  }

  /** Something changed on these notes (colour, label): redraw the tiles they sit on. */
  invalidateNotes(notes: Iterable<NoteItem>): void {
    if (!this.geo) return;
    const { lead, pxQ, SP } = this.geo;
    const margin = 4 * SP;
    for (const n of notes) {
      const x = lead + n.beat * pxQ;
      for (const t of this.tiles) {
        const x0 = t.index * TILE_W;
        if (x + margin >= x0 && x - margin <= x0 + TILE_W) t.dirty = true;
      }
    }
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

  private tile(index: number): Tile {
    let t = this.tiles.find((x) => x.index === index);
    if (t) return t;
    if (this.tiles.length < POOL) {
      const canvas = document.createElement('canvas');
      canvas.className = 'strip-tile';
      canvas.style.width = `${TILE_W}px`;
      canvas.style.height = `${this.h}px`;
      this.strip.append(canvas);
      const renderer = new ScoreRenderer(canvas);
      renderer.resize(TILE_W, this.h);
      t = { canvas, renderer, index, dirty: true };
      this.tiles.push(t);
    } else {
      // Recycle the tile farthest from the one we need.
      t = this.tiles.reduce((a, b) => (Math.abs(a.index - index) >= Math.abs(b.index - index) ? a : b));
      t.index = index;
      t.dirty = true;
    }
    t.canvas.style.left = `${index * TILE_W}px`;
    return t;
  }

  private paint(t: Tile): void {
    if (!this.geo) return;
    t.renderer.draw(this.score, {
      ...this.opts,
      beat: (t.index * TILE_W) / this.geo.pxQ,
      anchor: 0,
      sp: this.geo.SP,
      stateBeat: -1e9,
      pin: false,
      cursor: false
    });
    t.dirty = false;
  }

  /**
   * Call every frame with the current beat. Keeps the tiles around the view
   * painted (at most two per frame) and the overlay up to date.
   * `manual` moves the strip from here (no Web Animations support).
   */
  update(beat: number, manual = false): void {
    if (!this.geo || this.w < 2) return;
    const off = this.offset(beat);
    const firstVisible = Math.max(0, Math.floor(-off / TILE_W));
    const lastVisible = Math.max(0, Math.floor((this.w - off) / TILE_W));
    // Visible tiles first, then the next one, then the previous one.
    const order: number[] = [];
    for (let k = firstVisible; k <= lastVisible; k++) order.push(k);
    order.push(lastVisible + 1);
    if (firstVisible > 0) order.push(firstVisible - 1);
    let budget = 2;
    for (const k of order) {
      const t = this.tile(k);
      if (t.dirty && budget-- > 0) this.paint(t);
    }
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
    this.overlayCanvas.remove();
  }
}

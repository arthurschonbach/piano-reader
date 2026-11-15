import { currentPalette, ScoreRenderer, type DrawState } from './engraver';
import type { NoteItem, Score } from './model';

/** Everything that changes the picture, except the scroll position. */
export type ViewOptions = Omit<DrawState, 'beat' | 'sp' | 'stateBeat' | 'pin' | 'fitBeats' | 'anchor'> & { anchor: number };

interface Tile {
  canvas: HTMLCanvasElement;
  renderer: ScoreRenderer;
  index: number;
  dirty: boolean;
  used: number;
}

/** Tile width in CSS pixels; a few are kept, the rest are recycled. */
const TILE_W = 768;
const POOL = 5;

/**
 * A scrolling score that stays smooth on tablets: the music is drawn once
 * into tiles, and each frame only copies the visible tiles at the scroll
 * offset, then draws what moves (cursor, pinned clefs). A tile is redrawn only
 * when something on it changes (a note turns green, names shown…).
 */
export class ScrollView {
  private main: ScoreRenderer;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private tiles: Tile[] = [];
  private clock = 0;
  private geo: { SP: number; lead: number; pxQ: number; anchorX: number } | null = null;

  constructor(canvas: HTMLCanvasElement, private score: Score, private opts: ViewOptions) {
    this.main = new ScoreRenderer(canvas);
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  resize(w: number, h: number): void {
    if (Math.abs(w - this.w) < 0.5 && Math.abs(h - this.h) < 0.5) return;
    this.w = w;
    this.h = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.main.resize(w, h);
    this.geo = this.main.layout(this.score, { ...this.opts, beat: 0 });
    // Geometry changed: every tile must be redrawn at the new size.
    for (const t of this.tiles) t.renderer.resize(TILE_W, h);
    this.invalidateAll();
  }

  setOptions(o: Partial<ViewOptions>): void {
    this.opts = { ...this.opts, ...o };
    this.invalidateAll();
  }

  invalidateAll(): void {
    for (const t of this.tiles) t.dirty = true;
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

  private tile(index: number): Tile {
    let t = this.tiles.find((x) => x.index === index);
    if (!t) {
      if (this.tiles.length < POOL) {
        const canvas = document.createElement('canvas');
        const renderer = new ScoreRenderer(canvas);
        renderer.resize(TILE_W, this.h);
        t = { canvas, renderer, index, dirty: true, used: 0 };
        this.tiles.push(t);
      } else {
        t = this.tiles.reduce((a, b) => (a.used < b.used ? a : b));
        t.index = index;
        t.dirty = true;
      }
    }
    t.used = ++this.clock;
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

  /** Draw the view scrolled to `beat`. Cheap: a few image copies. */
  draw(beat: number): void {
    if (!this.geo || this.w < 2 || this.h < 2) return;
    const { pxQ, anchorX } = this.geo;
    const ctx = this.ctx;
    // Strip coordinate X(b) = lead + b·pxQ lands on screen at X + offset.
    let offset = anchorX - beat * pxQ;
    offset = Math.round(offset * this.dpr) / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const first = Math.floor(-offset / TILE_W);
    const last = Math.floor((this.w - offset) / TILE_W);
    // Paper first, for the area before the system starts.
    ctx.fillStyle = currentPalette().paper;
    ctx.fillRect(0, 0, this.w, this.h);
    for (let k = Math.max(0, first); k <= last; k++) {
      const t = this.tile(k);
      if (t.dirty) this.paint(t);
      ctx.drawImage(t.canvas, k * TILE_W + offset, 0, TILE_W, this.h);
    }
    // Get the next tile ready before it scrolls in.
    const next = this.tiles.find((t) => t.index === last + 1);
    if (!next || next.dirty) this.paint(this.tile(last + 1));
    this.main.drawOverlay(this.score, { ...this.opts, beat });
  }
}

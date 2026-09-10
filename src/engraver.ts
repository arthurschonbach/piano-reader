import { CanvasContext, Glyph } from 'vexflow';
import { measureAt, totalBeats, type Measure, type NoteItem, type Score } from './model';

const K = 0.001036;
export const HAND = ['#2563eb', '#ea580c'];
const INK = '#3b4757';
const PLAYED = '#9daebf';
const REST_C = '#9aa5b1';
const REST_PLAYED = '#e2e7ed';
const STAFF = '#a9b6c3';
const BAR = '#8d99a6';

const SHARP_STEPS = [3, 0, 4, 1, 5, 2, 6];
const FLAT_STEPS = [6, 2, 5, 1, 4, 0, 3];
const PRINTED_ALTER: Record<string, number> = {
  sharp: 1, natural: 0, flat: -1, 'double-sharp': 2, 'sharp-sharp': 2,
  'double-flat': -2, 'flat-flat': -2, 'natural-sharp': 1, 'natural-flat': -1
};

interface GlyphBox { w: number; h: number; above: number; below: number; xoff: number; }
const gCache = new Map<string, GlyphBox>();

let VCTX: CanvasContext;

function gbox(code: string, em: number): GlyphBox {
  const key = `${code}@${em}`;
  let b = gCache.get(key);
  if (!b) {
    const point = em / (1000 * K);
    const g = new Glyph(code, point);
    const m = g.metrics;
    const fd = m.font.getData().glyphs[code];
    const s = point * K * (m.scale ?? 1);
    const yMax = fd.y_max ?? fd.ha;
    const yMin = fd.y_min ?? 0;
    b = {
      w: (m.x_max - m.x_min) * s,
      h: (yMax - yMin) * s,
      above: yMax * s,
      below: -yMin * s,
      xoff: m.x_min * s
    };
    gCache.set(key, b);
  }
  return b;
}

function drawG(
  code: string, em: number, x: number, y: number,
  anchorY: 'b' | 't' | 'bink' | 'cink' = 'b'
): void {
  const b = gbox(code, em);
  const point = em / (1000 * K);
  let gy = y;
  if (anchorY === 't') gy = y + b.above;
  else if (anchorY === 'bink') gy = y - b.below;
  else if (anchorY === 'cink') gy = y + (b.above - b.below) / 2;
  Glyph.renderGlyph(VCTX, x - b.xoff, gy, point, code);
}

interface Cluster {
  staff: number;
  voice: number;
  beat: number;
  x: number;
  primary: NoteItem;
  members: NoteItem[];
  rest: boolean;
  grace: boolean;
  base: number;
  dur: number;
  end: number;
  state: number;
}

export interface DrawState {
  beat: number;
  lookahead: number;
  names: boolean;
  zoom: number;
}

export interface ViewGeom {
  anchorX: number;
  lead: number;
  pxQ: number;
}

function idxOf(n: NoteItem): number {
  return n.spell.octave * 7 + n.spell.step;
}

function stateOf(beat: number, end: number, t: number, lookahead: number): number {
  if (end <= t + 1e-9) return 0;
  if (t >= beat - 1e-9 && t < end) return 2;
  if (beat > t && beat <= t + lookahead) return 1;
  return 3;
}

function colorOf(state: number, hand: number, rest: boolean): string {
  if (rest) return state === 0 ? REST_PLAYED : REST_C;
  if (state === 0) return PLAYED;
  if (state === 3) return INK;
  return HAND[hand];
}

const STEPS = 'CDEFGAB';

function noteName(n: NoteItem): string {
  const s = n.spell;
  const acc = s.alter === 1 ? '♯' : s.alter === -1 ? '♭' : s.alter === 2 ? '𝄪' : s.alter === -2 ? '𝄫' : '';
  return `${STEPS[s.step]}${acc}${s.octave}`;
}

function accGlyph(alter: number): string {
  if (alter === 2) return 'accidentalDoubleSharp';
  if (alter === -2) return 'accidentalDoubleFlat';
  if (alter === 1) return 'accidentalSharp';
  if (alter === -1) return 'accidentalFlat';
  return 'accidentalNatural';
}

function keyAlter(fifths: number, step: number): number {
  if (fifths > 0) {
    const i = SHARP_STEPS.indexOf(step);
    return i >= 0 && i < fifths ? 1 : 0;
  }
  if (fifths < 0) {
    const i = FLAT_STEPS.indexOf(step);
    return i >= 0 && i < -fifths ? -1 : 0;
  }
  return 0;
}

export class ScoreRenderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  lastView: ViewGeom = { anchorX: 0, lead: 0, pxQ: 110 };

  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Canvas 2D indisponible');
    this.ctx = c;
    VCTX = new CanvasContext(c);
  }

  beatAt(xCss: number, currentBeat: number): number {
    const { anchorX, lead, pxQ } = this.lastView;
    return currentBeat + (xCss - anchorX - lead) / pxQ;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(2.5, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.w = w;
    this.h = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private measureWidths(SP: number, m0: Measure): { clefW: number; timeW: number; keyW: number } {
    const clefW = Math.max(gbox('gClef', 4 * SP).w, gbox('fClef', 4 * SP).w);
    const timeW = m0.time ? digitWidth(m0.time[0], SP) + digitWidth(m0.time[1], SP) + 0.6 * SP : 0;
    const keyW = Math.abs(m0.key) * 1.08 * SP + 0.9 * SP;
    return { clefW, timeW, keyW };
  }

  draw(score: Score, s: DrawState): void {
    const { ctx, w, h } = this;
    if (w < 2 || h < 2) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fdfdfe';
    ctx.fillRect(0, 0, w, h);

    const U = s.zoom;
    let SP = 10 * U;
    const maxSP = (h - 26) / 16.8;
    if (SP > maxSP) SP = Math.max(4, maxSP);
    const pxQ = 11 * SP;
    const staffH = 4 * SP;
    const single = (score.staves ?? 2) < 2;
    const gap = 6.5 * SP;
    const contentTotal = staffH * 2 + gap + (single ? 0 : 18);
    const trebleTop = Math.max(22, (h - contentTotal) / 2);
    const trebleBottom = trebleTop + staffH;
    const bassTop = trebleBottom + gap;
    const bassBottom = bassTop + staffH;
    const staffTop = [trebleTop, bassTop];
    const staffBottom = [trebleBottom, bassBottom];
    const bottomIdx = [30, 18];
    const yIdxFor = (st: number) => (idx: number) => staffBottom[st] - (idx - bottomIdx[st]) * (SP / 2);

    const m0 = score.measures[0];
    const lead = m0 ? (() => {
      const mw = this.measureWidths(SP, m0);
      return mw.clefW + mw.keyW + mw.timeW + 3 * SP;
    })() : 2 * SP;

    const anchorX = w * 0.3;
    this.lastView = { anchorX, lead, pxQ };
    const xOf = (b: number) => anchorX + lead + (b - s.beat) * pxQ;

    const leftBeat = s.beat - (anchorX + lead) / pxQ;
    const rightBeat = s.beat + (w - anchorX - lead) / pxQ;
    const mi0 = Math.max(0, measureAt(score, leftBeat) - 1);
    const visible: number[] = [];
    for (let i = mi0; i < score.measures.length; i++) {
      const m = score.measures[i];
      if (m.startBeat > rightBeat) break;
      visible.push(i);
    }

    ctx.fillStyle = 'rgba(37,99,235,0.05)';
    ctx.fillRect(xOf(s.beat), trebleTop - 12 * U, s.lookahead * pxQ, (bassBottom - trebleTop) + 24 * U);

    ctx.strokeStyle = STAFF;
    ctx.lineWidth = 1;
    const stCount = single ? 1 : 2;
    for (let st = 0; st < stCount; st++) {
      for (let l = 0; l < 5; l++) {
        const y = staffTop[st] + l * SP;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    const measureClusters: Cluster[][] = [];
    const pad = 0.65 * SP;
    for (const i of visible) {
      measureClusters.push(buildClusters(score.measures[i], xOf, s.beat, s.lookahead, pad));
    }

    for (let j = 0; j < visible.length; j++) {
      const m = score.measures[visible[j]];
      const bx = xOf(m.startBeat);
      ctx.strokeStyle = BAR;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx, trebleTop);
      ctx.lineTo(bx, single ? trebleBottom : bassBottom);
      ctx.stroke();
      ctx.fillStyle = BAR;
      ctx.font = `${10 * U}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(String(m.number), bx + 4 * U, trebleTop - 6 * U);
      this.drawMeasureHeader(score, m, bx, SP, staffTop, bottomIdx, yIdxFor, single);
    }
    if (!score.infinite && score.measures.length) {
      const fx = xOf(totalBeats(score));
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(fx - 4.5 * U, trebleTop);
      ctx.lineTo(fx - 4.5 * U, single ? trebleBottom : bassBottom);
      ctx.moveTo(fx, trebleTop);
      ctx.lineTo(fx, single ? trebleBottom : bassBottom);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillRect(fx + 1.6 * U, trebleTop, 3.4 * U, (single ? trebleBottom : bassBottom) - trebleTop);
    }

    const accStates = visible.map(() => [new Map<number, number>(), new Map<number, number>()]);
    for (let st = 0; st < stCount; st++) {
      for (let j = 0; j < visible.length; j++) {
        const m = score.measures[visible[j]];
        const acc = accStates[j][st];
        seedKey(acc, m.key);
        const list = measureClusters[j].filter((c) => c.staff === st);
        if (!list.length) continue;
        const voices = [...new Set(list.map((c) => c.voice))];
        for (const v of voices) {
          drawStream(ctx, list.filter((c) => c.voice === v), {
            st, SP, staffTop, staffBottom, bottomIdx, yIdx: yIdxFor(st), midIdx: bottomIdx[st] + 8,
            acc
          });
        }
      }
    }

    for (let j = 0; j < visible.length; j++) {
      for (const c of measureClusters[j]) {
        for (const n of c.members) {
          if (!n.tieStart || !n.tieTarget || n.grace) continue;
          const st = c.staff;
          const yIdx = yIdxFor(st);
          const dir = avgUp(c, bottomIdx[st] + 8) ? 1 : -1;
          const headW = gbox('noteheadBlack', 4 * SP).w;
          const x1 = c.x + headW * 0.72;
          const y1 = yIdx(idxOf(n)) + dir * 0.9 * SP;
          const x2 = xOf(n.tieTarget.beat) + pad - 0.18 * SP;
          const y2 = yIdx(idxOf(n.tieTarget)) + dir * 0.9 * SP;
          ctx.strokeStyle = colorOf(c.state, st, false);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(x1 + (x2 - x1) * 0.4, y1 + dir * 0.85 * SP, x1 + (x2 - x1) * 0.62, y2 + dir * 0.85 * SP, x2, y2);
          ctx.stroke();
        }
      }
    }

    if (s.names) {
      ctx.textAlign = 'center';
      ctx.font = `600 ${Math.max(9, 1.1 * SP)}px system-ui, sans-serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(253,253,254,0.92)';
      for (let j = 0; j < visible.length; j++) {
        for (const c of measureClusters[j]) {
          if (c.rest || c.grace) continue;
          ctx.fillStyle = colorOf(c.state, c.staff, false);
          const nx = c.x + gbox('noteheadBlack', 4 * SP).w / 2;
          const ny = staffBottom[c.staff] + 15;
          ctx.strokeText(noteName(c.primary), nx, ny);
          ctx.fillText(noteName(c.primary), nx, ny);
        }
      }
    }

    const px = xOf(s.beat);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2 * U;
    ctx.beginPath();
    ctx.moveTo(px, trebleTop - 14 * U);
    ctx.lineTo(px, (single ? trebleBottom : bassBottom) + 14 * U);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(px - 6 * U, trebleTop - 16 * U);
    ctx.lineTo(px + 6 * U, trebleTop - 16 * U);
    ctx.lineTo(px, trebleTop - 7 * U);
    ctx.closePath();
    ctx.fill();
  }

  private drawMeasureHeader(
    score: Score, m: Measure, bx: number, SP: number,
    staffTop: number[], bottomIdx: number[],
    yIdxFor: (st: number) => (idx: number) => number, single: boolean
  ): void {
    const clefs = score.clefs ?? ['G', 'F'];
    const staves = single ? 1 : 2;
    const isFirst = m.number === 1;
    const wantClef = isFirst || m.number % 10 === 1;
    const wantKey = m.keyChange && !isFirst;
    const wantTime = m.time !== null;
    if (!wantClef && !wantKey && !wantTime) return;

    const clefW = Math.max(gbox('gClef', 4 * SP).w, gbox('fClef', 4 * SP).w);
    const keyW = Math.abs(m.key) * 1.08 * SP + 0.9 * SP;
    const timeW = m.time ? digitWidth(m.time[0], SP) + digitWidth(m.time[1], SP) + 0.6 * SP : 0;

    const drawClef = (st: number, x: number) => {
      const yIdx = yIdxFor(st);
      if (clefs[st] === 'F') drawG('fClef', 4 * SP, x, yIdx(bottomIdx[st] + 6), 'b');
      else drawG('gClef', 4 * SP, x, yIdx(bottomIdx[st] + 2), 'b');
    };
    const drawKey = (st: number, x: number, fifths: number) => {
      const yIdx = yIdxFor(st);
      const bass = clefs[st] === 'F';
      const idxPos = fifths >= 0 ? (bass ? BASS_POS : TREBLE_POS) : (bass ? BASS_POS_FLAT : TREBLE_POS_FLAT);
      for (let i = 0; i < Math.abs(fifths); i++) {
        const code = fifths > 0 ? 'accidentalSharp' : 'accidentalFlat';
        drawG(code, 4 * SP, x + i * 1.08 * SP, yIdx(idxPos[i]), 'cink');
      }
    };
    const drawTime = (x: number, t: [number, number]) => {
      const mid = staffTop[0] + 2 * SP;
      drawDigits(String(t[0]), x, mid - SP, SP);
      drawDigits(String(t[1]), x, mid + SP, SP);
    };

    if (isFirst) {
      let x = bx + 1.4 * SP;
      for (let st = 0; st < staves; st++) {
        if (wantClef) {
          drawClef(st, x);
        }
        drawKey(st, x + clefW + 0.4 * SP, m.key);
      }
      if (wantTime && m.time) drawTime(x + clefW + keyW + 0.6 * SP, m.time);
      return;
    }

    const totalW = (wantClef ? clefW + 0.4 * SP : 0) + (wantKey ? keyW : 0) + (wantTime ? timeW : 0);
    let x = bx - 0.5 * SP - totalW;
    for (let st = 0; st < staves; st++) {
      let cx = x;
      if (wantClef) {
        drawClef(st, cx);
        cx += clefW + 0.4 * SP;
      }
      if (wantKey) drawKey(st, cx, m.key);
    }
    if (wantTime && m.time) drawTime(x + totalW - timeW, m.time);
  }
}

const TREBLE_POS = [38, 35, 39, 36, 33, 37, 34];
const BASS_POS = [24, 21, 25, 22, 19, 23, 20];
const TREBLE_POS_FLAT = [34, 37, 33, 36, 32, 35, 31];
const BASS_POS_FLAT = [20, 23, 19, 22, 18, 21, 17];

function digitWidth(n: number, SP: number): number {
  return String(n).length * gbox('timeSig4', 4 * SP).w;
}

function drawDigits(str: string, x: number, y: number, SP: number): void {
  const gw = gbox('timeSig4', 4 * SP).w;
  for (let i = 0; i < str.length; i++) {
    drawG(`timeSig${str[i]}`, 4 * SP, x + i * gw, y, 'cink');
  }
}

function seedKey(state: Map<number, number>, fifths: number): void {
  state.clear();
  for (let step = 0; step < 7; step++) state.set(step, keyAlter(fifths, step));
}

function buildClusters(m: Measure, xOf: (b: number) => number, t: number, lookahead: number, pad: number): Cluster[] {
  const list = [...m.notes].sort((a, b) => a.beat - b.beat);
  const out: Cluster[] = [];
  for (const n of list) {
    const end = Math.max(n.tieEnd, n.beat + n.dur);
    if (n.chord && !n.rest && out.length) {
      const prev = out[out.length - 1];
      if (!prev.grace && !prev.rest && prev.beat === n.beat && prev.staff === n.staff && prev.voice === n.voice) {
        prev.members.push(n);
        continue;
      }
    }
    const c: Cluster = {
      staff: n.staff,
      voice: n.voice,
      beat: n.beat,
      x: xOf(n.beat) + pad,
      primary: n,
      members: [n],
      rest: n.rest,
      grace: n.grace,
      base: n.base,
      dur: n.dur,
      end,
      state: stateOf(n.beat, end, t, lookahead)
    };
    out.push(c);
  }
  return out;
}

function avgUp(c: Cluster, midIdx: number): boolean {
  let a = 0;
  for (const n of c.members) a += idxOf(n);
  a /= c.members.length;
  return a < midIdx;
}

interface StreamEnv {
  st: number;
  SP: number;
  staffTop: number[];
  staffBottom: number[];
  bottomIdx: number[];
  yIdx: (idx: number) => number;
  midIdx: number;
  acc: Map<number, number>;
}

function drawStream(ctx: CanvasRenderingContext2D, list: Cluster[], e: StreamEnv): void {
  const { SP, yIdx, acc, st } = e;
  const bIdx = e.bottomIdx[st];
  const headW = gbox('noteheadBlack', 4 * SP).w;

  const beamed: Cluster[][] = [];
  let run: Cluster[] = [];
  for (const c of list) {
    const beamable = !c.rest && !c.grace && c.base > 0 && c.base < 1;
    const prev = run[run.length - 1];
    if (beamable && prev && Math.abs(prev.beat + prev.dur - c.beat) < 1e-6 && Math.floor(prev.beat) === Math.floor(c.beat)) {
      run.push(c);
    } else {
      if (run.length >= 2) beamed.push(run);
      run = beamable ? [c] : [];
    }
  }
  if (run.length >= 2) beamed.push(run);
  const inBeam = new Set<Cluster>();
  for (const g of beamed) for (const c of g) inBeam.add(c);

  for (const c of list) {
    const color = colorOf(c.state, st, c.rest);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    if (c.state === 2 && !c.rest) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      for (const n of c.members) {
        ctx.beginPath();
        ctx.arc(c.x + headW / 2, yIdx(idxOf(n)), 1.9 * SP, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (c.rest) {
      drawRest(ctx, c, e.staffTop[st], SP, color);
      continue;
    }

    for (const n of c.members) {
      const idx = idxOf(n);
      const y = yIdx(idx);
      const onLine = (idx - e.midIdx) % 2 === 0;
      const em = 4 * SP * (c.grace ? 0.72 : 1);
      const code = c.base >= 4 ? 'noteheadWhole' : c.base >= 2 ? 'noteheadHalf' : 'noteheadBlack';
      const hw = gbox(code, em).w;
      for (let L = bIdx + 10; L <= idx; L += 2) drawLedger(ctx, c.x, yIdx(L), SP, hw);
      for (let L = bIdx - 2; L >= idx; L -= 2) drawLedger(ctx, c.x, yIdx(L), SP, hw);
      const gx = c.grace ? c.x - 1.4 * SP : c.x;
      drawG(code, em, gx, y, 'cink');
      if (c.state === 1 && !c.grace) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = HAND[st];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(gx + hw / 2, y, hw * 0.75, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const printed = n.printed ? PRINTED_ALTER[n.printed] : null;
      let accDraw: number | null = null;
      if (printed !== null && printed !== undefined) {
        if (acc.get(n.spell.step) !== printed) {
          accDraw = printed;
          acc.set(n.spell.step, printed);
        }
      } else if (n.spell.alter !== acc.get(n.spell.step)) {
        accDraw = n.spell.alter;
        acc.set(n.spell.step, n.spell.alter);
      }
      if (accDraw !== null) {
        const g = accGlyph(accDraw);
        drawG(g, 4 * SP, gx - 0.3 * SP - gbox(g, 4 * SP).w, y, 'cink');
      }
      for (let d = 0; d < n.dots; d++) {
        const dy = onLine ? y - SP / 2 : y;
        drawG('augmentationDot', 2.7 * SP, gx + hw + 0.35 * SP + d * 0.8 * SP, dy, 'cink');
      }
    }

    if (c.base < 4 && !inBeam.has(c)) {
      const up = avgUp(c, e.midIdx);
      const sx = up ? c.x + headW - 0.8 : c.x + 0.8;
      const yAvg = avgY(c, yIdx);
      const tip = up ? yAvg - 3.3 * SP : yAvg + 3.3 * SP;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx, yAvg);
      ctx.lineTo(sx, tip);
      ctx.stroke();
      if (c.grace) {
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sx - headW * 0.5, tip + 2.4 * SP);
        ctx.lineTo(sx + headW * 0.7, tip - 0.9 * SP);
        ctx.stroke();
      } else {
        const fc = flagCodeFor(c.base, up);
        if (fc) drawG(fc, 4 * SP, sx - 0.15 * SP, tip, 'b');
      }
    }
  }

  for (const g of beamed) drawBeamGroup(ctx, g, e);
}

function drawRest(ctx: CanvasRenderingContext2D, c: Cluster, staffTopY: number, SP: number, color: string): void {
  ctx.fillStyle = color;
  let code = 'restQuarter';
  let y = staffTopY + 2 * SP;
  if (c.base >= 4) {
    code = 'restWhole';
    y = staffTopY + SP;
  } else if (c.base >= 2) {
    code = 'restHalf';
  }
  drawG(code, 4 * SP, c.x, y, 'b');
}

function flagCodeFor(base: number, up: boolean): string | null {
  if (base >= 1 || base <= 0) return null;
  const n = Math.round(-Math.log2(base));
  const map: Record<number, [string, string]> = {
    1: ['flag8thUp', 'flag8thDown'],
    2: ['flag16thUp', 'flag16thDown'],
    3: ['flag32ndUp', 'flag32ndDown']
  };
  const pair = map[Math.min(3, Math.max(1, n))];
  return pair ? pair[up ? 0 : 1] : null;
}

function avgY(c: Cluster, yIdx: (i: number) => number): number {
  let s = 0;
  for (const n of c.members) s += yIdx(idxOf(n));
  return s / c.members.length;
}

function drawBeamGroup(ctx: CanvasRenderingContext2D, group: Cluster[], e: StreamEnv): void {
  const { SP, yIdx, midIdx, st } = e;
  const headW = gbox('noteheadBlack', 4 * SP).w;
  const up = avgUp(group[0], midIdx);
  const stemXs = group.map((c) => (up ? c.x + headW - 0.8 : c.x + 0.8));
  const tips = group.map((c) => {
    const y = avgY(c, yIdx);
    return up ? y - 3.3 * SP : y + 3.3 * SP;
  });
  let bY = up ? Math.min(...tips) : Math.max(...tips);
  bY = Math.min(e.staffBottom[st] + 2.2 * SP, Math.max(e.staffTop[st] - 2.2 * SP, bY));
  const color = colorOf(group[0].state, st, false);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  group.forEach((c, j) => {
    ctx.beginPath();
    ctx.moveTo(stemXs[j], avgY(c, yIdx));
    ctx.lineTo(stemXs[j], up ? bY + 0.3 * SP : bY - 0.3 * SP);
    ctx.stroke();
  });
  const counts = group.map((c) => Math.round(-Math.log2(c.base)));
  const layers = Math.max(...counts);
  const beamH = 0.5 * SP;
  const gap = 0.28 * SP;
  for (let i = 0; i < layers; i++) {
    for (let j = 0; j < group.length; j++) {
      if (counts[j] <= i) continue;
      let x1 = stemXs[j];
      let x2 = x1;
      if (j + 1 < group.length && counts[j + 1] > i) x2 = stemXs[j + 1];
      else if (j > 0 && counts[j - 1] > i) continue;
      else x2 = x1 + 1.1 * SP;
      const y = up ? bY + i * (beamH + gap) : bY - beamH - i * (beamH + gap);
      ctx.fillRect(x1, y, Math.max(0.4 * SP, x2 - x1), beamH);
    }
  }
}

function drawLedger(ctx: CanvasRenderingContext2D, x: number, y: number, SP: number, headW: number): void {
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 0.6 * SP, y);
  ctx.lineTo(x + headW + 0.6 * SP, y);
  ctx.stroke();
}
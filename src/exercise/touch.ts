/**
 * How the keys were played, beyond right notes at the right time: notes held
 * for their full length, legato, evenness of touch, melody over accompaniment,
 * piano against forte. Uses what a MIDI piano sends: key releases and velocity.
 */
import type { Dyn } from '../core/model';

export interface TouchNote {
  midi: number;
  staff: number;
  /** Second or later note of a chord. */
  chord: boolean;
  /** Key velocity 1–127; 0 when unknown. */
  velocity: number;
  dyn?: Dyn;
  /** Rhythm mode: written start and end (ties included), in beats. */
  start?: number;
  end?: number;
  /** Rhythm mode: when the key went down and up, in beats. */
  on?: number;
  off?: number;
}

export interface TouchSummary {
  /** Notes held to (nearly) their written end, out of those judged. */
  held?: number;
  heldJudged: number;
  /** Notes released too early, earliest first: written start beats. */
  shortAt: number[];
  /** Notes held into the next one, earliest first: written start beats. */
  longAt: number[];
  /** Joins between two notes of one hand with no audible gap. */
  legato?: number;
  /** Spread of velocity on the melody (standard deviation, within each dynamic). */
  spread?: number;
  /** Mean melody velocity minus mean accompaniment velocity. */
  balance?: number;
  piano?: number;
  forte?: number;
  /** forte − piano, in velocity units. */
  contrast?: number;
  /** Notes on the right side of the piano/forte midpoint. */
  dynAccuracy?: number;
}

/** A note may stop this much before its written end: a quarter of its length, at least 150 ms. */
export const HOLD_SLACK = { share: 0.25, minMs: 150 };
/** A gap shorter than this between two notes still sounds legato. */
export const LEGATO_GAP_MS = 80;

/** The beat a note must be held to (its written end, minus the allowed slack). */
export function holdDeadline(start: number, end: number, msPerBeat: number): number {
  return end - Math.max(HOLD_SLACK.share * (end - start), HOLD_SLACK.minMs / msPerBeat);
}

/** A note may run this far past its written end before it blurs into the next one. */
export const LONG_SLACK = { share: 0.25, minMs: 200 };

/**
 * Held the right length, let go too early, or held too long (only judged when
 * another note of that hand follows: holding the last note is harmless).
 */
export function holdVerdict(start: number, end: number, off: number, msPerBeat: number, hasNext: boolean): 'ok' | 'short' | 'long' {
  if (off < holdDeadline(start, end, msPerBeat) - 1e-9) return 'short';
  if (hasNext && off > end + Math.max(LONG_SLACK.share * (end - start), LONG_SLACK.minMs / msPerBeat) + 1e-9) return 'long';
  return 'ok';
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function summarizeTouch(notes: TouchNote[], opts: { msPerBeat?: number; melodyStaff?: number } = {}): TouchSummary {
  const out: TouchSummary = { heldJudged: 0, shortAt: [], longAt: [] };
  const ms = opts.msPerBeat;

  if (ms) {
    let ok = 0;
    for (const n of notes) {
      if (n.start === undefined || n.end === undefined || n.on === undefined || n.off === undefined) continue;
      const lenMs = (n.end - n.start) * ms;
      const shortMs = (n.end - n.off) * ms;
      out.heldJudged++;
      if (shortMs <= Math.max(HOLD_SLACK.share * lenMs, HOLD_SLACK.minMs)) ok++;
      else out.shortAt.push(n.start);
    }
    if (out.heldJudged) out.held = ok / out.heldJudged;
    out.shortAt.sort((a, b) => a - b);
    // Too long: only when a later note of the same hand follows.
    for (const staff of new Set(notes.map((n) => n.staff))) {
      const line = notes.filter((n) => n.staff === staff && n.start !== undefined).sort((a, b) => a.start! - b.start!);
      const lastStart = line.length ? line[line.length - 1].start! : 0;
      for (const n of line) {
        if (n.end === undefined || n.off === undefined || n.start! >= lastStart - 1e-9) continue;
        if (holdVerdict(n.start!, n.end, n.off, ms, true) === 'long') out.longAt.push(n.start!);
      }
    }
    out.longAt = [...new Set(out.longAt)].sort((a, b) => a - b);

    let joins = 0;
    let smooth = 0;
    for (const staff of new Set(notes.map((n) => n.staff))) {
      const line = notes.filter((n) => n.staff === staff && !n.chord && n.start !== undefined).sort((a, b) => a.start! - b.start!);
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1];
        const b = line[i];
        // Only notes that follow each other directly, on different keys.
        if (a.midi === b.midi || Math.abs(b.start! - a.end!) > 1e-6 || a.off === undefined || b.on === undefined) continue;
        joins++;
        if ((b.on - a.off) * ms <= LEGATO_GAP_MS) smooth++;
      }
    }
    if (joins >= 3) out.legato = smooth / joins;
  }

  const felt = notes.filter((n) => n.velocity > 0);
  const melody = felt.filter((n) => !n.chord && (opts.melodyStaff === undefined || n.staff === opts.melodyStaff));
  if (melody.length >= 4) {
    // Pooled within each dynamic, so piano/forte changes don't count as unevenness.
    let ss = 0;
    for (const d of new Set(melody.map((n) => n.dyn))) {
      const v = melody.filter((n) => n.dyn === d).map((n) => n.velocity);
      const m = mean(v);
      ss += v.reduce((a, x) => a + (x - m) ** 2, 0);
    }
    out.spread = Math.sqrt(ss / melody.length);
  }
  if (opts.melodyStaff !== undefined) {
    const acc = felt.filter((n) => n.staff !== opts.melodyStaff);
    if (melody.length >= 4 && acc.length >= 4) out.balance = mean(melody.map((n) => n.velocity)) - mean(acc.map((n) => n.velocity));
  }
  const p = felt.filter((n) => n.dyn === 'p');
  const f = felt.filter((n) => n.dyn === 'f');
  if (p.length >= 2 && f.length >= 2) {
    out.piano = mean(p.map((n) => n.velocity));
    out.forte = mean(f.map((n) => n.velocity));
    out.contrast = out.forte - out.piano;
    const mid = (out.piano + out.forte) / 2;
    out.dynAccuracy = (p.filter((n) => n.velocity < mid).length + f.filter((n) => n.velocity > mid).length) / (p.length + f.length);
  }
  return out;
}

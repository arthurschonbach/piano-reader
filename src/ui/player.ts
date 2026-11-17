import { ClickTrack } from '../core/audio';
import type { HoldFlag, Mark } from '../core/engraver';
import { ScrollStrip } from '../core/scroller';
import { dynamicsByMeasure, measureAt, noteName, spellOfMidi, type NoteItem, type Score } from '../core/model';
import { holdVerdict, summarizeTouch, type TouchNote, type TouchSummary } from '../exercise/touch';
import { LANE_H, TimingMeter } from './meter';
import { buildSteps, summarize, WaitSession, type StepResult, type Summary } from '../exercise/wait';
import { buildTargets, RhythmSession, summarizeRhythm, WINDOWS, type RhythmSummary, type Target } from '../exercise/rhythm';
import { mountKeyboard } from '../input/keyboard';
import type { NoteAttempt, SessionMetrics } from '../progress/store';
import type { App } from './app';
import { button, h, keepAwake, percent, themeButton } from './dom';

export const nameOf = (midi: number): string => noteName(spellOfMidi(midi));

/** "1 temps ½", "2 temps", "½ temps": a length the way it's counted. */
export function beatsText(b: number): string {
  const r = Math.round(b * 4) / 4;
  const whole = Math.floor(r + 1e-9);
  const frac = r - whole;
  const f = frac > 0.7 ? '¾' : frac > 0.4 ? '½' : frac > 0.1 ? '¼' : '';
  if (!whole) return `${f || '0'} temps`;
  return `${whole} temps${f ? ` ${f}` : ''}`;
}

/** A tiny note: head coloured like the attack, stem like the hold. */
function noteIcon(head: string, stem: string, ring = false): string {
  const h = ring
    ? `<ellipse cx="9" cy="24" rx="6" ry="4.4" transform="rotate(-20 9 24)" fill="none" stroke="var(--bad)" stroke-width="2"/>`
    : `<ellipse cx="9" cy="24" rx="6" ry="4.4" transform="rotate(-20 9 24)" fill="var(--${head})"/>`;
  const st = ring ? '' : `<line x1="14.4" y1="23" x2="14.4" y2="3" stroke="var(--${stem})" stroke-width="${stem === head ? 1.8 : 3.4}" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 20 30" width="20" height="30" aria-hidden="true">${st}${h}</svg>`;
}

/**
 * The colour language of rhythm mode, said once before playing, with pictures:
 * head = attack, stem = hold, red ring = the key played instead, one lane per hand.
 */
function legend(twoHands: boolean): HTMLElement {
  const box = h('div', 'legend');
  const item = (svg: string, text: string) => {
    const it = h('div', 'lg-item');
    const pic = h('span', 'lg-pic');
    pic.innerHTML = svg;
    it.append(pic, h('span', undefined, text));
    box.append(it);
  };
  item(noteIcon('good', 'good') + noteIcon('early', 'early') + noteIcon('late', 'late'), 'La tête : juste, trop tôt, trop tard.');
  item(noteIcon('good', 'early') + noteIcon('good', 'late'), 'La queue : lâchée trop tôt, tenue trop longtemps.');
  item(noteIcon('bad', 'bad', true), 'Un cercle rouge : la touche jouée à la place.');
  const lane = `<svg viewBox="0 0 60 16" width="60" height="16" aria-hidden="true"><rect x="0" y="5" width="60" height="6" rx="3" fill="var(--line)"/><rect x="18" y="5" width="24" height="6" rx="3" fill="color-mix(in srgb, var(--good) 35%, var(--line))"/><circle cx="10" cy="8" r="5" fill="var(--early)"/><circle cx="31" cy="8" r="5" fill="var(--good)"/><circle cx="50" cy="8" r="5" fill="var(--late)"/></svg>`;
  item(lane, twoHands ? 'Au curseur, une ligne par main : main droite au-dessus, main gauche en dessous. À gauche trop tôt, à droite trop tard.' : 'Au curseur : à gauche trop tôt, à droite trop tard.');
  return box;
}

export interface Intro {
  heading: string;
  paragraphs: string[];
  setup?: string;
  /** How success is judged, one line. */
  criteria?: string;
}

export interface PlayConfig {
  /** Shown in the top bar. */
  title: string;
  score: Score;
  mode: 'wait' | 'rhythm';
  /** Rhythm mode: starting tempo, and the tempo that counts for validation. */
  bpm?: number;
  targetBpm?: number;
  intro: Intro;
  /** Wait mode: end early (level test). */
  stopWhen?: (results: StepResult[]) => boolean;
  /** Fingering numbers drawn (default true). */
  fingers?: boolean;
  /** Staff carrying the melody, for the melody/accompaniment balance. */
  melodyStaff?: number;
  /** Look-ahead: beats hidden in front of the cursor. Less than this during play = not counted. */
  mask?: number;
  onFinish: (o: Outcome, show: (card: HTMLElement) => void, restart: () => void) => void;
  onExit: () => void;
}

export interface Outcome {
  metrics: SessionMetrics;
  wait?: Summary & { results: StepResult[] };
  rhythm?: RhythmSummary;
  /** Rhythm mode: every written note with how it was played. */
  targets?: Target[];
  touch: TouchSummary;
  /** The piano sent velocities (not the on-screen keys). */
  felt: boolean;
  stoppedEarly: boolean;
}

function keyboardRange(score: Score): [number, number] {
  const ms = score.measures.flatMap((m) => m.notes.filter((n) => !n.rest).map((n) => n.midi));
  const black = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  let lo = Math.min(...ms) - 4;
  let hi = Math.max(...ms) + 4;
  while (black(lo)) lo--;
  while (black(hi)) hi++;
  return [lo, hi];
}

const SLOW_MS = 2000;

function waitMetrics(results: StepResult[], s: Summary, assisted: boolean): SessionMetrics {
  const attempts: NoteAttempt[] = results.flatMap((r) =>
    r.expected.map((midi) => ({ midi, clean: r.wrong.length === 0, slow: r.reactionMs > SLOW_MS }))
  );
  return { mode: 'wait', accuracy: s.accuracy, medianReactionMs: s.medianReactionMs, attempts, confusions: s.confusions, assisted };
}

/**
 * How each hand did, at a glance: its dots on a timing lane (as during the
 * run) with the median marked, then the share of notes on time and held.
 */
function handsRecap(targets: Target[], msPerBeat: number, last: Set<Target>, sawRelease: boolean): HTMLElement {
  const box = h('div', 'hands');
  for (const [staff, name] of [[0, 'Main droite'], [1, 'Main gauche']] as const) {
    const mine = targets.filter((t) => t.note.staff === staff);
    if (!mine.length) continue;
    const hits = mine.filter((t) => t.dtMs !== undefined && (t.grade === 'perfect' || t.grade === 'good'));
    // Same rule as the run's score: right note within the timing window.
    const onTime = hits.length / mine.length;
    const dts = hits.map((t) => t.dtMs!).sort((a, b) => a - b);
    const median = dts.length ? dts[Math.floor(dts.length / 2)] : 0;
    const judged = sawRelease ? mine.filter((t) => t.onBeat !== undefined && t.offBeat !== undefined) : [];
    const verdicts = judged.map((t) => holdVerdict(t.note.beat, t.note.tieEnd, t.offBeat!, msPerBeat, !last.has(t)));
    const short = verdicts.filter((v) => v === 'short').length;
    const long = verdicts.filter((v) => v === 'long').length;

    const row = h('div', 'hand-row');
    const lane = h('div', 'hand-lane');
    const pos = (ms: number) => `${50 + (50 * Math.max(-2.5, Math.min(2.5, ms / WINDOWS.perfect))) / 2.5}%`;
    for (const d of dts) {
      const dot = h('i', `meter-dot ${Math.abs(d) <= WINDOWS.perfect ? 'ok' : d < 0 ? 'early' : 'late'}`);
      dot.style.left = pos(d);
      lane.append(dot);
    }
    if (dts.length) {
      const m = h('b', `hand-median ${Math.abs(median) <= WINDOWS.perfect / 2 ? 'ok' : median < 0 ? 'early' : 'late'}`);
      m.style.left = pos(median);
      lane.append(m);
    }
    const tendency = dts.length < 3 || Math.abs(median) <= WINDOWS.perfect / 2 ? 'régulière' : median < 0 ? 'en avance' : 'en retard';
    const facts = h('div', 'hand-facts');
    facts.append(h('span', `hand-chip ${onTime >= 0.8 ? 'good' : ''}`, `${percent(onTime)} à temps · ${tendency}`));
    if (judged.length) {
      const held = 1 - (short + long) / judged.length;
      const what = short > long ? 'lâche trop tôt' : long > short ? 'tient trop longtemps' : '';
      facts.append(h('span', `hand-chip ${held >= 0.8 ? 'good' : ''}`, `${percent(held)} bien tenues${what && held < 0.95 ? ` · ${what}` : ''}`));
    }
    row.append(h('div', 'hand-name', name), lane, facts);
    box.append(row);
  }
  return box;
}

/**
 * The exercise screen, for both modes:
 *  - wait: the score stops on each note until it's played right;
 *  - rhythm: the score moves at the tempo after a count-in, and timing is judged.
 */
export function mountPlayer(root: HTMLElement, app: App, cfg: PlayConfig): () => void {
  const { score, mode } = cfg;
  const marks = new Map<NoteItem, Mark>();
  const labels = new Set<NoteItem>();
  // Every change to a note's look also tells the scroll view which tiles to redraw.
  const setMark = (n: NoteItem, m: Mark) => {
    marks.set(n, m);
    sv.invalidateNotes([n]);
  };
  const addLabel = (n: NoteItem) => {
    labels.add(n);
    sv.invalidateNotes([n]);
  };
  // Rhythm mode: keys held down, and the notes held the wrong length (a label on the note).
  const holdFlags = new Map<NoteItem, HoldFlag>();
  // A wrong key: shown as a red ring where it sits on the staff.
  const ghosts = new Map<NoteItem, number>();
  const holding = new Map<number, Target>();
  const lastOfStaff = new Set<Target>();
  const clearMarks = () => {
    marks.clear();
    labels.clear();
    holdFlags.clear();
    ghosts.clear();
    delete view.dataset.short;
    delete view.dataset.long;
    holding.clear();
    sv.invalidateAll();
  };
  let bpm = Math.round(cfg.bpm ?? score.bpm ?? 60);

  const view = h('div', 'ex');
  view.dataset.phase = 'intro';
  view.dataset.mode = mode;
  // Top bar: nothing to tap up there (in full screen the iPad's top strip swallows taps).
  const count = h('div', 'count');
  const source = h('span', 'source');
  const progress = h('div', 'ex-progress');
  const progressFill = h('span');
  progress.append(progressFill);
  const bar = h('header', 'topbar');
  bar.append(h('div', 'tb-title', cfg.title), source, count);
  view.append(bar, progress);
  const stage = h('div', 'stage');
  const countIn = h('div', 'countin');
  countIn.setAttribute('aria-hidden', 'true');
  stage.append(countIn);
  const feedback = h('div', 'feedback');
  feedback.setAttribute('aria-live', 'polite');
  // Options are chosen on the intro card, before playing: changing them midway
  // would change what the run measures.
  let showNames = false;
  let assisted = false;
  let maskBeats = cfg.mask ?? 0;
  const isAssisted = () => showNames || maskBeats < (cfg.mask ?? 0);
  // Bottom bar: what's said in wait mode, then start over and Retour, bottom-right.
  const tools = h('div', 'tools');
  const restartBtn = button('↻', 'btn icon', () => restart());
  restartBtn.setAttribute('aria-label', 'Recommencer');
  restartBtn.title = 'Recommencer';
  const back = button('Retour', 'btn back', cfg.onExit);
  tools.append(feedback, restartBtn, back);
  const kbdSlot = h('div', 'kbd-slot');
  // The intro/results card covers only the score area, so the toolbar
  // (with Retour) and the on-screen keys stay usable underneath.
  const body = h('div', 'ex-body');
  body.append(stage);
  view.append(body, tools, h('div', 'portrait-hint', 'Astuce : tourne l’écran en paysage.'), kbdSlot);

  // ---------- intro ----------
  const overlay = h('div', 'overlay');
  const show = (card: HTMLElement) => {
    overlay.innerHTML = '';
    overlay.append(card);
    if (!overlay.isConnected) body.append(overlay);
  };
  const introCard = () => {
    const card = h('div', 'card intro');
    card.append(h('h2', undefined, cfg.intro.heading));
    for (const p of cfg.intro.paragraphs) card.append(h('p', undefined, p));
    if (cfg.intro.setup) card.append(h('p', 'setup', `🖐 ${cfg.intro.setup}`));
    if (cfg.intro.criteria) card.append(h('p', 'rules', cfg.intro.criteria));
    if (mode === 'rhythm') card.append(legend(score.staves > 1));
    if (mode === 'rhythm') {
      const row = h('div', 'tempo-row');
      const val = h('span', 'tempo-val');
      const sync = () => {
        val.textContent = `${bpm} bpm`;
        const below = cfg.targetBpm && bpm < cfg.targetBpm;
        warn.textContent = below ? `En dessous de ${cfg.targetBpm} bpm, la séance sert d’entraînement mais ne valide pas.` : '';
      };
      const warn = h('p', 'note');
      row.append(
        h('span', undefined, 'Tempo'),
        button('−', 'btn step', () => {
          bpm = Math.max(30, bpm - 4);
          sync();
        }),
        val,
        button('+', 'btn step', () => {
          bpm = Math.min(160, bpm + 4);
          sync();
        })
      );
      card.append(row, warn);
      sync();
      if (!app.settings.calibrated && app.midi.connected) {
        card.append(h('p', 'note', 'Piano en Bluetooth ? Calibre la latence une fois (Réglages) pour un jugement du rythme plus juste.'));
      }
      card.append(options(), button('C’est parti', 'btn primary big', () => start()));
    } else {
      card.append(options(), button('C’est parti', 'btn primary big', () => start()), h('p', 'hint', 'ou joue n’importe quelle note pour commencer'));
    }
    card.append(button('📖 Un mot inconnu ? Lexique FR ↔ EN', 'btn quiet small lex-link', () => app.go('#/lexique')));
    return card;
  };
  /** The settings of the run, as toggles on the intro card. */
  const options = () => {
    const row = h('div', 'ex-options');
    const note = h('span', 'assisted', 'séance non comptée');
    const sync = () => {
      note.hidden = !isAssisted();
    };
    const toggle = (label: () => string, on: () => boolean, flip: () => void, title?: string) => {
      const b = button(label(), `btn toggle${on() ? ' on' : ''}`, () => {
        flip();
        b.textContent = label();
        b.classList.toggle('on', on());
        sync();
      });
      if (title) b.title = title;
      row.append(b);
    };
    toggle(() => 'Noms des notes', () => showNames, () => {
      showNames = !showNames;
      sv.setOptions({ names: showNames });
    });
    toggle(
      () => (maskBeats ? `Cache : ${maskBeats} temps` : 'Cache'),
      () => maskBeats > 0,
      () => {
        maskBeats = (maskBeats + 1) % 3;
        applyMask();
      },
      'Cache les notes juste avant qu’elles soient jouées : il faut les lire en avance.'
    );
    if (mode === 'rhythm') {
      toggle(() => 'Métronome', () => app.settings.metronome, () => app.setSettings({ ...app.settings, metronome: !app.settings.metronome }));
    }
    row.append(themeButton(app), note);
    sync();
    return row;
  };
  show(introCard());
  root.append(view);

  // ---------- shared state ----------
  // Pre-drawn tiles: each frame only slides them (smooth on tablets).
  const sv = new ScrollStrip(stage, score, {
    lookahead: 0,
    names: false,
    zoom: 2.4,
    pxPerBeat: mode === 'wait' ? 4.5 : 5.5,
    anchor: mode === 'wait' ? 0.08 : 0.12,
    cursor: mode === 'rhythm',
    fingers: cfg.fingers !== false,
    marks,
    labels,
    holdFlags,
    ghosts,
    // Room above and below the staves for the timing lanes.
    margin: mode === 'rhythm' ? LANE_H + 6 : 0
  });
  const hands = score.staves > 1 ? 2 : 1;
  const meter = mode === 'rhythm' ? new TimingMeter(stage, hands) : null;
  const lastBeat = mode === 'rhythm' ? Math.max(...buildTargets(score).map((t) => t.beat)) : 0;
  /** Rhythm mode: the last note's written end, so a final long note is held to the end. */
  const lastEnd = mode === 'rhythm' ? Math.max(...buildTargets(score).map((t) => t.note.tieEnd)) : 0;
  /** Rhythm mode: the run ends once the last note's window has passed. */
  const endBeat = lastBeat + 4;
  let raf = 0;
  let viewBeat = 0;
  let badTimer = 0;
  let releaseWake: (() => void) | null = null;
  let finished = false;

  // wait mode
  const steps = buildSteps(score);
  let wait: WaitSession | null = null;
  // rhythm mode
  let rhythm: RhythmSession | null = null;
  let clicks: ClickTrack | null = null;
  let t0 = 0;
  let msPerBeat = 1000;
  let judged = 0;
  /** Dynamic in force for each bar. */
  const dynOf = dynamicsByMeasure(score);
  let sawVelocity = false;
  let sawRelease = false;

  viewBeat = mode === 'wait' ? steps[0]?.beat ?? 0 : -2;
  sv.place(viewBeat, false);
  /** Wait mode shows the first note: there is nothing before it to read ahead from. */
  const applyMask = () => sv.setMask(mode === 'wait' && !(wait && wait.results.length > 0) ? 0 : maskBeats);
  applyMask();

  // Touch the DOM only when something changes: a write per frame forces style
  // and layout work that steals time from the score animation.
  const setFeedback = (text: string, tone: '' | 'good' | 'bad' | 'early' | 'late' = '') => {
    if (feedback.textContent !== text) feedback.textContent = text;
    if (feedback.dataset.tone !== tone) feedback.dataset.tone = tone;
  };
  const setCount = (text: string) => {
    if (count.textContent !== text) count.textContent = text;
  };
  let shownProgress = -1;
  const setProgress = (f: number) => {
    const v = Math.round(Math.max(0, Math.min(1, f)) * 200) / 200;
    if (v === shownProgress) return;
    shownProgress = v;
    progressFill.style.transform = `scaleX(${v})`;
  };
  const setCountIn = (text: string) => {
    if (countIn.textContent !== text) countIn.textContent = text;
  };

  const markCurrent = () => {
    const st = wait?.current;
    view.dataset.expected = st ? st.midis.join(',') : '';
    if (st) for (const n of st.notes) setMark(n, 'current');
    setCount(`${wait?.results.length ?? 0} / ${steps.length}`);
    setProgress((wait?.results.length ?? 0) / Math.max(1, steps.length));
  };

  const start = () => {
    if (view.dataset.phase === 'play') return;
    overlay.remove();
    view.dataset.phase = 'play';
    finished = false;
    clearMarks();
    assisted = isAssisted();
    setProgress(0);
    releaseWake ??= keepAwake();
    if (mode === 'wait') {
      wait = new WaitSession(steps, performance.now());
      applyMask();
      setFeedback(score.staves > 1 ? 'Joue les notes entourées, toutes ensemble si elles sont alignées.' : 'Joue la note entourée.');
      markCurrent();
    } else {
      app.metronome.unlock();
      msPerBeat = 60000 / bpm;
      // One bar of count-in; with a pickup, keep counting up to its first note.
      // Bar length in quarter beats; in 6/8 the metronome clicks the six eighths.
      const [tn, td] = score.measures.find((m) => m.time)?.time ?? [4, 4];
      const bpb = (tn * 4) / td;
      const unit = td === 8 ? 0.5 : 1;
      const pickup = score.measures.length > 1 && score.measures[0].length < bpb ? score.measures[0].length : 0;
      const countIn = bpb + (pickup ? bpb - pickup : 0);
      t0 = performance.now() + countIn * msPerBeat + 120;
      rhythm = new RhythmSession(buildTargets(score), msPerBeat);
      // The last note of each hand can't be held "too long": nothing follows it.
      lastOfStaff.clear();
      for (const st of new Set(rhythm.targets.map((t) => t.note.staff))) {
        const mine = rhythm.targets.filter((t) => t.note.staff === st);
        const lastBeat = Math.max(...mine.map((t) => t.beat));
        for (const t of mine) if (t.beat === lastBeat) lastOfStaff.add(t);
      }
      clicks = new ClickTrack(app.metronome, t0, msPerBeat * unit, -countIn / unit, bpb / unit, pickup / unit);
      // The score scrolls on the compositor, in step with the clock the clicks use.
      sv.play(-countIn, t0 - countIn * msPerBeat, msPerBeat, endBeat);
      view.dataset.t0 = String(t0);
      view.dataset.msPerBeat = String(msPerBeat);
      view.dataset.latency = String(app.settings.latencyMs);
      view.dataset.onsets = JSON.stringify(rhythm.targets.map((t) => [t.beat, t.midi, t.note.tieEnd - t.note.beat, dynOf[measureAt(score, t.note.beat)] ?? '']));
      setCount(`${bpm} bpm`);
      judged = 0;
      applyMask();
    }
    sawVelocity = false;
    sawRelease = false;
  };

  const restart = () => {
    view.dataset.phase = 'intro';
    rhythm = null;
    clicks = null;
    wait = null;
    clearMarks();
    meter?.clear();
    applyMask();
    sv.peek(false);
    viewBeat = mode === 'wait' ? steps[0]?.beat ?? 0 : -2;
    sv.place(viewBeat, false);
    setFeedback('');
    setCountIn('');
    setProgress(0);
    show(introCard());
  };

  const finish = (stoppedEarly: boolean) => {
    if (finished) return;
    finished = true;
    view.dataset.phase = 'done';
    releaseWake?.();
    releaseWake = null;
    let outcome: Outcome;
    const melodyStaff = cfg.melodyStaff;
    const measureOf = (n: NoteItem) => measureAt(score, n.beat);
    if (mode === 'wait' && wait) {
      const s = summarize(wait.results);
      const tn: TouchNote[] = wait.results.flatMap((r, i) =>
        steps[i].notes.map((n) => ({
          midi: n.midi, staff: n.staff, chord: steps[i].notes.some((o) => o !== n && o.staff === n.staff && o.midi < n.midi),
          velocity: sawVelocity ? r.velocities[r.expected.indexOf(n.midi)] ?? 0 : 0, dyn: dynOf[measureOf(n)]
        }))
      );
      const touch = summarizeTouch(tn, { melodyStaff });
      const metrics = { ...waitMetrics(wait.results, s, assisted), balance: touch.balance, contrast: touch.contrast, dynAccuracy: touch.dynAccuracy };
      outcome = { metrics, wait: { ...s, results: wait.results }, touch, felt: sawVelocity, stoppedEarly };
    } else {
      const r = rhythm!;
      r.releaseAll((performance.now() - app.settings.latencyMs - t0) / msPerBeat);
      const s = summarizeRhythm(r);
      const tn: TouchNote[] = r.targets.map((t) => ({
        midi: t.midi, staff: t.note.staff, chord: t.note.chord, velocity: sawVelocity ? t.velocity ?? 0 : 0, dyn: dynOf[measureOf(t.note)],
        start: t.note.beat, end: t.note.tieEnd, on: t.onBeat, off: sawRelease ? t.offBeat : undefined
      }));
      const touch = summarizeTouch(tn, { msPerBeat, melodyStaff });
      const conf = new Map<string, [number, number, number]>();
      for (const [e, p] of r.wrong) {
        const k = `${e}>${p}`;
        const c = conf.get(k) ?? [e, p, 0];
        c[2]++;
        conf.set(k, c);
      }
      const attempts: NoteAttempt[] = r.targets.map((t) => ({ midi: t.midi, clean: t.grade === 'perfect' || t.grade === 'good', slow: t.grade === 'good' }));
      outcome = {
        metrics: {
          mode: 'rhythm', accuracy: s.accuracy, timingMs: s.timingMs, tempo: bpm, attempts,
          confusions: [...conf.values()].sort((a, b) => b[2] - a[2]), assisted,
          held: touch.held, balance: touch.balance, contrast: touch.contrast, dynAccuracy: touch.dynAccuracy
        },
        rhythm: s,
        targets: r.targets,
        touch,
        felt: sawVelocity,
        stoppedEarly
      };
    }
    // Two hands at tempo: the card also says how each hand did, side by side.
    const recap = mode === 'rhythm' && rhythm && hands > 1 ? handsRecap(rhythm.targets, msPerBeat, lastOfStaff, sawRelease) : null;
    const showCard = (card: HTMLElement) => {
      if (recap && card.classList.contains('results') && !card.querySelector('.hands')) {
        const at = card.querySelector('.stats');
        if (at) at.after(recap);
        else card.querySelector('h2')?.after(recap);
      }
      show(card);
    };
    cfg.onFinish(outcome, showCard, restart);
  };

  // ---------- input ----------
  const offBus = app.bus.on((e) => {
    if (finished) return;
    if (!e.on) {
      if (mode === 'rhythm' && rhythm && view.dataset.phase === 'play') {
        sawRelease = true;
        const beat = (e.time - app.settings.latencyMs - t0) / msPerBeat;
        rhythm.noteOff(e.midi, beat);
        const t = holding.get(e.midi);
        if (t) {
          holding.delete(e.midi);
          const n = t.note;
          const verdict = holdVerdict(n.beat, n.tieEnd, beat, msPerBeat, !lastOfStaff.has(t));
          // Drawn on the note's stem: blue = let go too soon, orange = held into the next note.
          if (verdict !== 'ok') {
            holdFlags.set(n, verdict);
            sv.invalidateNotes([n]);
            view.dataset[verdict] = String([...holdFlags.values()].filter((v) => v === verdict).length);
          }
        }
      }
      return;
    }
    // The on-screen keys always send the same velocity: only a real piano counts for touch.
    if (app.midi.connected && view.dataset.phase === 'play') sawVelocity = true;
    if (view.dataset.phase === 'intro') {
      if (mode === 'wait' && !overlay.querySelector('.results')) start();
      return;
    }
    if (mode === 'wait' && wait && !wait.done) {
      const step = wait.current!;
      const fb = wait.noteOn(e.midi, e.time, app.bus.held, e.velocity);
      if (fb.kind === 'wrong') {
        for (const n of step.notes) setMark(n, 'bad');
        // The key pressed, drawn where it sits, beside the nearest written note of the step.
        const near = step.notes.reduce((a, n) => (Math.abs(n.midi - fb.played) < Math.abs(a.midi - fb.played) ? n : a));
        for (const n of step.notes) ghosts.delete(n);
        ghosts.set(near, fb.played);
        window.clearTimeout(badTimer);
        badTimer = window.setTimeout(() => {
          if (wait?.current === step) {
            for (const n of step.notes) setMark(n, 'current');
                  }
        }, 600);
        const sameName = step.midis.some((m) => m % 12 === fb.played % 12);
        let msg = sameName ? `${nameOf(fb.played)} : bonne note, mauvaise octave.` : `✗ Tu as joué ${nameOf(fb.played)}.`;
        if (fb.hint) {
          for (const n of step.notes) addLabel(n);
          msg += ` C’est ${step.midis.map(nameOf).join(' + ')} : regarde où ${step.midis.length > 1 ? 'ils se placent' : 'il se place'} sur la portée.`;
        }
        setFeedback(msg, 'bad');
        // Behind the curtain, two misses lift it for this note.
        if (sv.maskedBeats && wait.currentWrong >= 2) sv.peek(true);
          } else if (fb.kind === 'partial') {
        setFeedback('…et l’autre note en même temps.');
      } else if (fb.kind === 'correct') {
        window.clearTimeout(badTimer);
        for (const n of step.notes) ghosts.delete(n);
        const clean = fb.result.wrong.length === 0;
        for (const n of step.notes) setMark(n, clean ? 'ok' : 'late');
        setFeedback(clean ? '✓' : '✓ Trouvé.', clean ? 'good' : '');
        markCurrent();
        sv.peek(false);
        applyMask();
        if (fb.done) window.setTimeout(() => finish(false), 450);
        else if (cfg.stopWhen?.(wait.results)) window.setTimeout(() => finish(true), 450);
      }
    } else if (mode === 'rhythm' && rhythm) {
      const beat = (e.time - app.settings.latencyMs - t0) / msPerBeat;
      if (beat < -0.6) return; // count-in
      const hit = rhythm.noteOn(e.midi, beat, e.velocity);
      if (hit.kind === 'hit') {
        judged++;
        holding.set(e.midi, hit.target);
        const early = hit.dtMs < 0;
        setMark(hit.target.note, hit.grade === 'perfect' ? 'ok' : early ? 'early' : 'late');
        meter?.add(hit.target.note.staff, hit.dtMs / WINDOWS.perfect);
      } else if (hit.kind === 'wrong' && hit.near) {
        ghosts.set(hit.near.note, hit.played);
        setMark(hit.near.note, 'bad');
      }
    }
  });

  // ---------- on-screen keys ----------
  let unmountKbd: (() => void) | null = null;
  const syncInput = () => {
    const piano = app.midi.connected;
    source.textContent = piano && app.midi.status.state === 'ready' ? `🎹 ${app.midi.status.devices[0]}` : 'Clavier à l’écran';
    if (!piano && !unmountKbd) {
      const [lo, hi] = keyboardRange(score);
      unmountKbd = mountKeyboard(kbdSlot, app.bus, lo, hi);
    } else if (piano && unmountKbd) {
      unmountKbd();
      unmountKbd = null;
    }
    view.classList.toggle('has-kbd', !piano);
  };
  syncInput();
  const offMidi = app.midi.onChange(syncInput);
  const offTheme = app.onTheme(() => {
    sv.invalidateAll();
  });

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    // Time away from the screen shouldn't count as slow reading.
    wait?.restartClock(performance.now());
    // A rhythm run can't survive the screen being away: start over.
    if (mode === 'rhythm' && rhythm && !finished) restart();
  };
  document.addEventListener('visibilitychange', onVisible);

  const resize = () => {
    const r = stage.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) sv.resize(r.width, r.height);
    const cp = sv.cursorPoint();
    if (cp) {
      countIn.style.left = `${cp.x}px`;
      countIn.style.top = `${(cp.staffTop[0] + cp.below) / 2}px`;
    }
    // Right hand's lane above the treble staff, left hand's under the bass staff.
    if (meter && cp) {
      const clamp = (y: number) => Math.max(LANE_H / 2 + 2, Math.min(r.height - LANE_H / 2 - 2, y));
      const off = 1.5 * cp.SP + LANE_H / 2;
      const ys = hands > 1 ? [clamp(cp.staffTop[0] - off), clamp(cp.staffBottom[1] + off)] : [clamp(cp.staffTop[0] - off)];
      meter.place(cp.x, ys);
    }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);


  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (mode === 'wait') {
      const target = wait?.current?.beat ?? (wait ? viewBeat : steps[0]?.beat ?? 0);
      if (Math.abs(target - viewBeat) > 1e-6) {
        viewBeat = target;
        // Native glide to the next note, run by the compositor.
        sv.place(viewBeat, true);
      }
    } else if (rhythm && !finished && view.dataset.phase === 'play') {
      const now = performance.now();
      clicks?.pump(now, app.settings.metronome);
      viewBeat = (now - t0) / msPerBeat;
      // The start is set a hair after the count-in bar: don't show a fifth beat.
      const left = Math.ceil(-viewBeat - 0.2);
      setCountIn(left > 0 ? String(left) : '');
      for (const t of rhythm.tick(viewBeat - app.settings.latencyMs / msPerBeat)) {
        judged++;
        setMark(t.note, 'bad');
      }
      setCount(`${judged} / ${rhythm.targets.length}`);
      setProgress(viewBeat / Math.max(1, lastEnd));
      if (viewBeat > Math.max(lastBeat + WINDOWS.max / msPerBeat + 1.5, lastEnd + 0.25)) finish(false);
    }
    // Only repaints of changed notes here; the movement itself is done by the compositor.
    sv.update(viewBeat);
  };
  raf = requestAnimationFrame(frame);
  resize();

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(badTimer);
    ro.disconnect();
    offBus();
    offMidi();
    offTheme();
    unmountKbd?.();
    releaseWake?.();
    document.removeEventListener('visibilitychange', onVisible);
    sv.destroy();
    meter?.destroy();
    view.remove();
  };
}

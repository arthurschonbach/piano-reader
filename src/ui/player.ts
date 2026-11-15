import { ClickTrack } from '../core/audio';
import type { Mark } from '../core/engraver';
import { ScrollStrip } from '../core/scroller';
import { dynamicsByMeasure, measureAt, noteName, spellOfMidi, type NoteItem, type Score } from '../core/model';
import { summarizeTouch, type TouchNote, type TouchSummary } from '../exercise/touch';
import { buildSteps, summarize, WaitSession, type StepResult, type Summary } from '../exercise/wait';
import { buildTargets, RhythmSession, summarizeRhythm, WINDOWS, type RhythmSummary } from '../exercise/rhythm';
import { mountKeyboard } from '../input/keyboard';
import type { NoteAttempt, SessionMetrics } from '../progress/store';
import type { App } from './app';
import { button, h, keepAwake, topBar } from './dom';

export const nameOf = (midi: number): string => noteName(spellOfMidi(midi));

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
  onFinish: (o: Outcome, show: (card: HTMLElement) => void, restart: () => void) => void;
  onExit: () => void;
}

export interface Outcome {
  metrics: SessionMetrics;
  wait?: Summary & { results: StepResult[] };
  rhythm?: RhythmSummary;
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
  const clearMarks = () => {
    marks.clear();
    labels.clear();
    sv.invalidateAll();
  };
  let bpm = Math.round(cfg.bpm ?? score.bpm ?? 60);

  const view = h('div', 'ex');
  view.dataset.phase = 'intro';
  view.dataset.mode = mode;
  const count = h('div', 'count');
  // Retour and the theme toggle go in the bottom toolbar (see navSlot below).
  const navSlot = h('span', 'nav-slot');
  view.append(topBar(app, cfg.title, cfg.onExit, count, navSlot));
  const stage = h('div', 'stage');
  const feedback = h('div', 'feedback');
  feedback.setAttribute('aria-live', 'polite');
  const tools = h('div', 'tools');
  let showNames = false;
  let assisted = false;
  const namesBtn = button('Noms des notes', 'btn toggle', () => {
    showNames = !showNames;
    if (showNames && view.dataset.phase === 'play') assisted = true;
    namesBtn.classList.toggle('on', showNames);
    assistedNote.hidden = !assisted;
    sv.setOptions({ names: showNames });
  });
  const assistedNote = h('span', 'assisted', 'séance non comptée');
  assistedNote.hidden = true;
  tools.append(namesBtn, assistedNote);
  let metroBtn: HTMLButtonElement | null = null;
  if (mode === 'rhythm') {
    metroBtn = button('Métronome', `btn toggle${app.settings.metronome ? ' on' : ''}`, () => {
      app.setSettings({ ...app.settings, metronome: !app.settings.metronome });
      metroBtn!.classList.toggle('on', app.settings.metronome);
    });
    tools.append(metroBtn, button('Recommencer', 'btn', () => restart()));
  }
  const source = h('span', 'source');
  tools.append(source, navSlot, h('span', 'portrait-hint', 'Astuce : tourne l’écran en paysage.'));
  const kbdSlot = h('div', 'kbd-slot');
  // The intro/results card covers only the score area, so the toolbar
  // (with Retour) and the on-screen keys stay usable underneath.
  const body = h('div', 'ex-body');
  body.append(stage, feedback);
  view.append(body, tools, kbdSlot);

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
      card.append(button('C’est parti', 'btn primary big', () => start()));
    } else {
      card.append(button('C’est parti', 'btn primary big', () => start()), h('p', 'hint', 'ou joue n’importe quelle note pour commencer'));
    }
    card.append(button('📖 Un mot inconnu ? Lexique FR ↔ EN', 'btn quiet small lex-link', () => app.go('#/lexique')));
    return card;
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
    labels
  });
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
  /** Dynamic in force for each bar; the bar where the last live report was given. */
  const dynOf = dynamicsByMeasure(score);
  const hasDyn = dynOf.some((d) => d);
  let dynSection = -1;
  let sawVelocity = false;
  let sawRelease = false;

  viewBeat = mode === 'wait' ? steps[0]?.beat ?? 0 : -2;
  sv.place(viewBeat, false);

  // Touch the DOM only when something changes: a write per frame forces style
  // and layout work that steals time from the score animation.
  const setFeedback = (text: string, tone: '' | 'good' | 'bad' = '') => {
    if (feedback.textContent !== text) feedback.textContent = text;
    if (feedback.dataset.tone !== tone) feedback.dataset.tone = tone;
  };
  const setCount = (text: string) => {
    if (count.textContent !== text) count.textContent = text;
  };

  const markCurrent = () => {
    const st = wait?.current;
    view.dataset.expected = st ? st.midis.join(',') : '';
    if (st) for (const n of st.notes) setMark(n, 'current');
    setCount(`${wait?.results.length ?? 0} / ${steps.length}`);
  };

  const start = () => {
    if (view.dataset.phase === 'play') return;
    overlay.remove();
    view.dataset.phase = 'play';
    finished = false;
    clearMarks();
    assisted = showNames;
    assistedNote.hidden = !assisted;
    releaseWake ??= keepAwake();
    if (mode === 'wait') {
      wait = new WaitSession(steps, performance.now());
      setFeedback(score.staves > 1 ? 'Joue les notes entourées, toutes ensemble si elles sont alignées.' : 'Joue la note entourée.');
      markCurrent();
    } else {
      app.metronome.unlock();
      msPerBeat = 60000 / bpm;
      // One bar of count-in; with a pickup, keep counting up to its first note.
      const bpb = score.measures.find((m) => m.time)?.time?.[0] ?? 4;
      const pickup = score.measures.length > 1 && score.measures[0].length < bpb ? score.measures[0].length : 0;
      const countIn = bpb + (pickup ? bpb - pickup : 0);
      t0 = performance.now() + countIn * msPerBeat + 120;
      rhythm = new RhythmSession(buildTargets(score), msPerBeat);
      clicks = new ClickTrack(app.metronome, t0, msPerBeat, -countIn, bpb, pickup);
      // The score scrolls on the compositor, in step with the clock the clicks use.
      sv.play(-countIn, t0 - countIn * msPerBeat, msPerBeat, endBeat);
      view.dataset.t0 = String(t0);
      view.dataset.msPerBeat = String(msPerBeat);
      view.dataset.latency = String(app.settings.latencyMs);
      view.dataset.onsets = JSON.stringify(rhythm.targets.map((t) => [t.beat, t.midi, t.note.tieEnd - t.note.beat, dynOf[measureAt(score, t.note.beat)] ?? '']));
      setCount(`${bpm} bpm`);
      judged = 0;
      dynSection = -1;
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
    viewBeat = mode === 'wait' ? steps[0]?.beat ?? 0 : -2;
    sv.place(viewBeat, false);
    setFeedback('');
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
        touch,
        felt: sawVelocity,
        stoppedEarly
      };
    }
    cfg.onFinish(outcome, show, restart);
  };

  // ---------- input ----------
  const offBus = app.bus.on((e) => {
    if (finished) return;
    if (!e.on) {
      if (mode === 'rhythm' && rhythm && view.dataset.phase === 'play') {
        sawRelease = true;
        rhythm.noteOff(e.midi, (e.time - app.settings.latencyMs - t0) / msPerBeat);
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
          } else if (fb.kind === 'partial') {
        setFeedback('…et l’autre note en même temps.');
      } else if (fb.kind === 'correct') {
        window.clearTimeout(badTimer);
        const clean = fb.result.wrong.length === 0;
        for (const n of step.notes) setMark(n, clean ? 'ok' : 'late');
        setFeedback(clean ? '✓' : '✓ Trouvé.', clean ? 'good' : '');
        markCurrent();
        if (fb.done) window.setTimeout(() => finish(false), 450);
        else if (cfg.stopWhen?.(wait.results)) window.setTimeout(() => finish(true), 450);
      }
    } else if (mode === 'rhythm' && rhythm) {
      const beat = (e.time - app.settings.latencyMs - t0) / msPerBeat;
      if (beat < -0.6) return; // count-in
      const hit = rhythm.noteOn(e.midi, beat, e.velocity);
      if (hit.kind === 'hit') {
        judged++;
        setMark(hit.target.note, hit.grade === 'perfect' ? 'ok' : 'late');
        const a = Math.round(hit.dtMs);
        setFeedback(hit.grade === 'perfect' ? '✓' : a < 0 ? 'un peu en avance' : 'un peu en retard', hit.grade === 'perfect' ? 'good' : '');
          } else if (hit.kind === 'wrong') {
        setFeedback(`✗ ${nameOf(hit.played)} au lieu de ${hit.near ? nameOf(hit.near.midi) : '?'}`, 'bad');
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
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);


  /** Rhythm mode with dynamics: when a new marking starts, say how loud the last section was. */
  const reportDynamics = (beat: number) => {
    if (beat < 0) return;
    const mi = measureAt(score, beat);
    let start = mi;
    while (start > 0 && !score.measures[start].dynamic) start--;
    if (start === dynSection) return;
    const prev = dynSection;
    dynSection = start;
    if (prev < 0 || !rhythm) return;
    const d = dynOf[prev];
    const vs = rhythm.targets.filter((t) => t.velocity && measureAt(score, t.note.beat) >= prev && measureAt(score, t.note.beat) < start).map((t) => t.velocity!);
    if (!d || !vs.length) return;
    const avg = Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
    setFeedback(`${d === 'p' ? 'piano' : 'forte'} : ${avg} / 127`, '');
  };

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
      if (viewBeat < 0) setFeedback(`${Math.ceil(-viewBeat)}…`);
      for (const t of rhythm.tick(viewBeat - app.settings.latencyMs / msPerBeat)) {
        judged++;
        setMark(t.note, 'bad');
        setFeedback('raté', 'bad');
      }
      setCount(`${judged} / ${rhythm.targets.length}`);
      if (hasDyn && sawVelocity) reportDynamics(viewBeat);
      if (viewBeat > Math.max(lastBeat + WINDOWS.max / msPerBeat + 1.5, lastEnd + 0.25)) finish(false);
    }
    // Only tile upkeep here; the movement itself is done by the compositor.
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
    view.remove();
  };
}

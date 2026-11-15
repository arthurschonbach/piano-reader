import { ScoreRenderer, type Mark } from '../core/engraver';
import { frenchName, spellOfMidi, type NoteItem } from '../core/model';
import { generateExercise } from '../curriculum/generate';
import { MASTERY, type Lesson } from '../curriculum/lessons';
import { buildSteps, summarize, WaitSession, type Step } from '../exercise/wait';
import { mountKeyboard } from '../input/keyboard';
import { recordSession, validatedDays, weaknessMap } from '../progress/store';
import type { App } from './app';
import { button, h, keepAwake, percent, seconds } from './dom';

const nameOf = (midi: number) => frenchName(spellOfMidi(midi));

function keyboardRange(notes: number[]): [number, number] {
  const black = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
  let lo = Math.floor(Math.min(...notes) / 12) * 12 - 3;
  let hi = Math.max(...notes) + 5;
  while (black(lo)) lo--;
  while (black(hi)) hi++;
  return [lo, hi];
}

export function renderExercise(root: HTMLElement, app: App, lesson: Lesson): () => void {
  const score = generateExercise(lesson, { seed: Math.floor(Math.random() * 1e9), weakness: weaknessMap(app.progress) });
  const steps: Step[] = buildSteps(score);
  const marks = new Map<NoteItem, Mark>();
  const labels = new Set<NoteItem>();

  const view = h('div', 'ex');
  view.dataset.phase = 'intro';
  const bar = h('header', 'ex-bar');
  const count = h('div', 'count', `0 / ${steps.length}`);
  bar.append(
    button('‹', 'btn quiet back', () => app.go('#/')),
    h('div', 'ex-title', `Leçon ${lesson.number} · ${lesson.title}`),
    count
  );
  const stage = h('div', 'stage');
  const canvas = h('canvas');
  stage.append(canvas);
  const feedback = h('div', 'feedback', 'Joue la note entourée.');
  feedback.setAttribute('aria-live', 'polite');
  const tools = h('div', 'tools');
  let showNames = false;
  let assisted = false;
  const namesBtn = button('Noms des notes', 'btn toggle', () => {
    showNames = !showNames;
    if (showNames) assisted = true;
    namesBtn.classList.toggle('on', showNames);
    assistedNote.hidden = !assisted;
    dirty = true;
  });
  const assistedNote = h('span', 'assisted', 'séance non comptée pour la validation');
  assistedNote.hidden = true;
  const source = h('span', 'source');
  tools.append(namesBtn, assistedNote, source, h('span', 'portrait-hint', 'Astuce : tourne le téléphone en paysage.'));
  const kbdSlot = h('div', 'kbd-slot');
  view.append(bar, stage, feedback, tools, kbdSlot);

  // --- intro overlay ---
  const intro = h('div', 'overlay');
  const introCard = h('div', 'card');
  introCard.append(h('h2', undefined, lesson.title), h('p', undefined, lesson.goal));
  if (lesson.setup) introCard.append(h('p', 'setup', lesson.setup));
  introCard.append(
    h('p', 'rules', 'La partition attend que tu joues la bonne note : pas de tempo, prends ton temps. Vise la justesse du premier coup.'),
    h(
      'p',
      'rules',
      `Leçon validée avec ${percent(MASTERY.accuracy)} de notes justes du premier coup et moins de ${seconds(MASTERY.medianReactionMs)} par note, ${MASTERY.days} jours différents.`
    ),
    button('C’est parti', 'btn primary big', () => start()),
    h('p', 'hint', 'ou joue n’importe quelle note pour commencer')
  );
  intro.append(introCard);
  view.append(intro);
  root.append(view);

  const renderer = new ScoreRenderer(canvas);
  let session: WaitSession | null = null;
  let viewBeat = steps[0]?.beat ?? 0;
  let dirty = true;
  let raf = 0;
  let last = 0;
  let badTimer = 0;
  let releaseWake: (() => void) | null = null;

  const markCurrent = () => {
    const st = session?.current;
    view.dataset.expected = st ? st.midis.join(',') : '';
    if (st) for (const n of st.notes) marks.set(n, 'current');
    count.textContent = `${session?.results.length ?? 0} / ${steps.length}`;
    dirty = true;
  };

  const start = () => {
    if (session) return;
    intro.remove();
    view.dataset.phase = 'play';
    session = new WaitSession(steps, performance.now());
    releaseWake = keepAwake();
    markCurrent();
  };

  const finish = () => {
    if (!session) return;
    view.dataset.phase = 'done';
    const summary = summarize(session.results);
    const rec = recordSession(app.progress, lesson.id, session.results, summary, assisted);
    app.setProgress(rec.progress);
    const days = validatedDays(rec.progress.lessons[lesson.id]);
    const res = h('div', 'overlay');
    const card = h('div', 'card results');
    card.append(h('h2', undefined, rec.validated ? 'Séance validée ✓' : 'Séance terminée'));
    const grid = h('div', 'stats');
    const stat = (value: string, label: string, ok: boolean) => {
      const s = h('div', `stat ${ok ? 'good' : 'bad'}`);
      s.append(h('div', 'v', value), h('div', 'l', label));
      grid.append(s);
    };
    stat(percent(summary.accuracy), `juste du premier coup (objectif ${percent(MASTERY.accuracy)})`, summary.accuracy >= MASTERY.accuracy);
    stat(seconds(summary.medianReactionMs), `par note, en médiane (objectif < ${seconds(MASTERY.medianReactionMs)})`, summary.medianReactionMs <= MASTERY.medianReactionMs);
    card.append(grid);
    if (assisted) card.append(h('p', 'note', 'Noms des notes affichés : cette séance n’est pas comptée pour la validation.'));
    if (rec.newlyMastered) card.append(h('p', 'mastered', '🎉 Leçon maîtrisée !'));
    else if (!rec.progress.lessons[lesson.id].mastered) {
      const more = rec.validated && days < MASTERY.days ? ' Reviens un autre jour pour la suivante.' : '';
      card.append(h('p', 'note', `Jours validés : ${days} / ${MASTERY.days}.${more}`));
    }
    const conf = summary.confusions.slice(0, 3);
    if (conf.length) {
      const ul = h('ul', 'conf');
      for (const [e, p, n] of conf) {
        const what = p % 12 === e % 12
          ? `${nameOf(e)} joué une octave trop ${p > e ? 'haut' : 'bas'}`
          : `${nameOf(p)} joué au lieu de ${nameOf(e)}`;
        ul.append(h('li', undefined, `${what}${n > 1 ? ` (${n}×)` : ''}`));
      }
      card.append(h('h3', undefined, 'Tes confusions'), ul);
    }
    const actions = h('div', 'actions');
    actions.append(
      button('Nouvel exercice', 'btn primary big', () => app.go(`#/lecon/${lesson.id}?${Date.now()}`)),
      button('Retour au parcours', 'btn', () => app.go('#/'))
    );
    card.append(actions);
    res.append(card);
    view.append(res);
    releaseWake?.();
    releaseWake = null;
  };

  const offBus = app.bus.on((e) => {
    if (!e.on) return;
    if (!session) {
      start();
      return;
    }
    if (session.done) return;
    const step = session.current!;
    const fb = session.noteOn(e.midi, e.time, app.bus.held);
    if (fb.kind === 'wrong') {
      for (const n of step.notes) marks.set(n, 'bad');
      window.clearTimeout(badTimer);
      badTimer = window.setTimeout(() => {
        if (session?.current === step) {
          for (const n of step.notes) marks.set(n, 'current');
          dirty = true;
        }
      }, 600);
      const sameName = step.midis.some((m) => m % 12 === fb.played % 12);
      let msg = sameName
        ? `${nameOf(fb.played)} : bon nom, mais pas la bonne octave.`
        : `✗ Tu as joué ${nameOf(fb.played)}.`;
      if (fb.hint) {
        for (const n of step.notes) labels.add(n);
        msg += ` C’est un ${step.midis.map(nameOf).join(' + ')} : regarde où il se place sur la portée.`;
      }
      feedback.textContent = msg;
      feedback.dataset.tone = 'bad';
      dirty = true;
    } else if (fb.kind === 'partial') {
      feedback.textContent = '…et l’autre note de l’accord.';
      feedback.dataset.tone = '';
    } else if (fb.kind === 'correct') {
      window.clearTimeout(badTimer);
      const clean = fb.result.wrong.length === 0;
      for (const n of step.notes) marks.set(n, clean ? 'ok' : 'late');
      feedback.textContent = clean ? '✓' : '✓ Trouvé.';
      feedback.dataset.tone = clean ? 'good' : '';
      markCurrent();
      if (fb.done) window.setTimeout(finish, 500);
    }
  });

  // On-screen keys when no piano is connected.
  let unmountKbd: (() => void) | null = null;
  const syncInput = () => {
    const piano = app.midi.connected;
    source.textContent = piano ? `🎹 ${app.midi.status.state === 'ready' ? app.midi.status.devices[0] : ''}` : 'Clavier à l’écran';
    if (!piano && !unmountKbd) {
      const [lo, hi] = keyboardRange(lesson.notes!);
      unmountKbd = mountKeyboard(kbdSlot, app.bus, lo, hi);
    } else if (piano && unmountKbd) {
      unmountKbd();
      unmountKbd = null;
    }
    view.classList.toggle('has-kbd', !piano);
  };
  syncInput();
  const offMidi = app.midi.onChange(syncInput);

  const onVisible = () => {
    // Time away from the screen shouldn't count as slow reading.
    if (document.visibilityState === 'visible') session?.restartClock(performance.now());
  };
  document.addEventListener('visibilitychange', onVisible);

  const resize = () => {
    const r = stage.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) renderer.resize(r.width, r.height);
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const frame = (ts: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    const target = session?.current?.beat ?? (session ? viewBeat : steps[0]?.beat ?? 0);
    if (Math.abs(target - viewBeat) > 1e-3) {
      viewBeat += (target - viewBeat) * Math.min(1, dt * 9);
      if (Math.abs(target - viewBeat) < 1e-3) viewBeat = target;
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    renderer.draw(score, { beat: viewBeat, lookahead: 0, names: showNames, zoom: 2.4, pxPerBeat: 4.5, anchor: 0.08, cursor: false, marks, labels });
  };
  raf = requestAnimationFrame(frame);
  resize();

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(badTimer);
    ro.disconnect();
    offBus();
    offMidi();
    unmountKbd?.();
    releaseWake?.();
    document.removeEventListener('visibilitychange', onVisible);
    view.remove();
  };
}

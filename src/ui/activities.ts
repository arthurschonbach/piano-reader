/**
 * Every kind of practice, ready to play: a lesson exercise, a stage of a piece,
 * the reading warm-up, sight-reading. Each records progress and shows results.
 */
import { blockPasses, flashLesson, lessonDone, passes, sightReadingLesson } from '../curriculum/coach';
import { generateExercise } from '../curriculum/generate';
import { LESSONS, MASTERY, type Lesson, type TouchReq } from '../curriculum/lessons';
import { excerptScore, loopRange, PIECE_STAGES, pieceScore, weakBars, type Piece } from '../curriculum/pieces';
import { buildSteps } from '../exercise/wait';
import type { Score } from '../core/model';
import { analyzeDrill, BPM_STEP, DRILL_PASS, drillPasses, drillScore, type Drill } from '../curriculum/technique';
import { recordDrill, recordLesson, recordPiece, recordPractice, setPieceWeak, validatedDays, weaknessMap } from '../progress/store';
import type { App } from './app';
import { percent, resultCard, seconds, type CardAction, type StatLine } from './dom';
import { mountPlayer, nameOf, type Outcome } from './player';

export interface Hooks {
  onExit: () => void;
  /** In a guided session: what comes next. */
  next?: { label: string; go: () => void };
  /** Outside a session: run the same activity again. */
  again?: () => void;
}

const seed = () => Math.floor(Math.random() * 1e9);

function confusionItems(o: Outcome): string[] {
  return o.metrics.confusions.slice(0, 3).map(([e, p, n]) => {
    const what = p % 12 === e % 12 ? `${nameOf(e)} joué une octave trop ${p > e ? 'haut' : 'bas'}` : `${nameOf(p)} joué au lieu de ${nameOf(e)}`;
    return `${what}${n > 1 ? ` (${n}×)` : ''}`;
  });
}

/** What the piano's key releases and velocities say, as result lines. */
function touchStats(o: Outcome, req?: TouchReq): StatLine[] {
  const t = o.touch;
  const lines: StatLine[] = [];
  if (t.held !== undefined) lines.push({ value: percent(t.held), label: `notes tenues jusqu’au bout (objectif ${percent(MASTERY.rhythm.held)})`, ok: t.held >= MASTERY.rhythm.held });
  if (t.contrast !== undefined) {
    const ok = req?.contrast !== undefined ? t.contrast >= req.contrast && (t.dynAccuracy ?? 0) >= MASTERY.dynamics.accuracy : undefined;
    lines.push({
      value: `${t.contrast >= 0 ? '+' : ''}${Math.round(t.contrast)}`,
      label: `d’écart forte − piano (${Math.round(t.forte!)} contre ${Math.round(t.piano!)})${req?.contrast !== undefined ? `, objectif +${req.contrast} et ${percent(MASTERY.dynamics.accuracy)} des notes du bon côté (${percent(t.dynAccuracy ?? 0)})` : ''}`,
      ok
    });
  }
  if (t.balance !== undefined) {
    lines.push({
      value: `${t.balance >= 0 ? '+' : ''}${Math.round(t.balance)}`,
      label: `mélodie au-dessus de l’accompagnement${req?.balance !== undefined ? ` (objectif +${req.balance})` : ''}`,
      ok: req?.balance !== undefined ? t.balance >= req.balance : undefined
    });
  }
  return lines;
}

/** Advice drawn from the touch: one line each, only when it's worth saying. */
function touchNotes(o: Outcome): string[] {
  const t = o.touch;
  const out: string[] = [];
  if (t.held !== undefined && t.held < MASTERY.rhythm.held && t.shortAt.length) {
    const bars = [...new Set(t.shortAt.map((b) => Math.floor(b / 4) + 1))].slice(0, 4);
    out.push(`Notes lâchées trop tôt (mesure${bars.length > 1 ? 's' : ''} ${bars.join(', ')}) : garde la touche enfoncée jusqu’au temps suivant, surtout sur les blanches et les rondes.`);
  }
  if (t.legato !== undefined) {
    if (t.legato < 0.7) out.push(`Legato : ${percent(t.legato)} des enchaînements sans trou. Lâche une touche au moment précis où tu enfonces la suivante.`);
    else if (t.legato >= 0.9) out.push(`Legato : ${percent(t.legato)} des enchaînements sans trou, bien lié.`);
  }
  if (t.spread !== undefined && o.felt) {
    if (t.spread > 14) out.push(`Toucher irrégulier (écart moyen ±${Math.round(t.spread)} sur 127) : vise un son égal d’une note à l’autre.`);
    else if (t.spread <= 8) out.push(`Toucher régulier : ±${Math.round(t.spread)} sur 127.`);
  }
  if (t.balance !== undefined && t.balance < 0) out.push('L’accompagnement couvre la mélodie : allège la main qui accompagne.');
  return out;
}

function statsFor(o: Outcome, targetBpm?: number, req?: TouchReq): StatLine[] {
  if (o.metrics.mode === 'wait') {
    return [
      { value: percent(o.metrics.accuracy), label: `justes du premier coup (objectif ${percent(MASTERY.wait.accuracy)})`, ok: o.metrics.accuracy >= MASTERY.wait.accuracy },
      { value: seconds(o.metrics.medianReactionMs ?? 0), label: `par note, sans hésiter (objectif < ${seconds(MASTERY.wait.medianReactionMs)})`, ok: (o.metrics.medianReactionMs ?? 0) <= MASTERY.wait.medianReactionMs },
      ...touchStats(o, req)
    ];
  }
  const r = o.rhythm!;
  const lines: StatLine[] = [
    { value: percent(r.accuracy), label: `notes justes et à temps (objectif ${percent(MASTERY.rhythm.accuracy)})`, ok: r.accuracy >= MASTERY.rhythm.accuracy },
    { value: `${Math.round(r.timingMs)} ms`, label: `d’écart au temps, en médiane (objectif < ${MASTERY.rhythm.timingMs} ms)`, ok: r.timingMs <= MASTERY.rhythm.timingMs }
  ];
  if (targetBpm) lines.push({ value: `${o.metrics.tempo} bpm`, label: `tempo (objectif ${targetBpm})`, ok: (o.metrics.tempo ?? 0) >= targetBpm });
  return [...lines, ...touchStats(o, req)];
}

function rhythmNotes(o: Outcome): string[] {
  const r = o.rhythm;
  if (!r || r.hits < 4) return [];
  const out: string[] = [];
  if (r.biasMs < -40) out.push('Tu as tendance à te précipiter : écoute le clic et attends-le.');
  else if (r.biasMs > 40) out.push('Tu as tendance à jouer en retard : lis un peu plus en avance.');
  if (r.missed > 0) out.push(`${r.missed} note${r.missed > 1 ? 's' : ''} non jouée${r.missed > 1 ? 's' : ''}. En lecture à vue, on continue même après une erreur.`);
  return out;
}

function actions(hooks: Hooks, again: () => void, extra: CardAction[] = []): CardAction[] {
  if (hooks.next) return [{ label: hooks.next.label, primary: true, onClick: hooks.next.go }, { label: 'Refaire', onClick: again }];
  return [...extra, { label: 'Nouvel essai', primary: extra.length === 0, onClick: hooks.again ?? again }, { label: 'Retour', onClick: hooks.onExit }];
}

const RELAX = 'Pense à garder les épaules basses et les poignets souples.';

export function playLesson(root: HTMLElement, app: App, lesson: Lesson, hooks: Hooks, review = false): () => void {
  const score = generateExercise(lesson, { seed: seed(), weakness: weaknessMap(app.progress) });
  const touchRule = [
    lesson.mode === 'rhythm' ? `${percent(MASTERY.rhythm.held)} des notes tenues jusqu’au bout` : '',
    lesson.touch?.contrast !== undefined ? `forte au moins ${lesson.touch.contrast} plus fort que piano` : '',
    lesson.touch?.balance !== undefined ? `mélodie au moins ${lesson.touch.balance} au-dessus de l’accompagnement` : ''
  ].filter(Boolean);
  const criteria =
    (lesson.mode === 'wait'
      ? `Leçon validée avec ${percent(MASTERY.wait.accuracy)} de notes justes du premier coup et moins de ${seconds(MASTERY.wait.medianReactionMs)} par note`
      : `Leçon validée avec ${percent(MASTERY.rhythm.accuracy)} de notes justes et à temps (écart < ${MASTERY.rhythm.timingMs} ms) à ${lesson.bpm} bpm`) +
    (touchRule.length ? `, ${touchRule.join(', ')}` : '') +
    `, ${MASTERY.days} jours différents.` +
    (lesson.touch ? ' Les nuances se mesurent avec le piano branché en MIDI.' : '') +
    (lesson.mask ? ` Cache de ${lesson.mask} temps obligatoire.` : '');
  const melodyStaff = lesson.accomp ? (lesson.accomp.melody === 'rh' ? 0 : 1) : undefined;
  let cleanup = () => undefined as void;
  const again = () => {
    cleanup();
    cleanup = playLesson(root, app, lesson, hooks, review);
  };
  cleanup = mountPlayer(root, app, {
    title: `${review ? 'Révision · ' : ''}Leçon ${lesson.number}`,
    score,
    mode: lesson.mode,
    bpm: lesson.bpm,
    targetBpm: lesson.bpm,
    melodyStaff,
    mask: lesson.mask,
    intro: { heading: lesson.title, paragraphs: review ? [lesson.goal] : [lesson.goal, ...lesson.theory], setup: lesson.setup, criteria },
    onExit: hooks.onExit,
    onFinish: (o, show) => {
      const ok = passes(lesson.mode, o.metrics, lesson.bpm, lesson.touch);
      const rec = recordLesson(app.progress, lesson.id, o.metrics, ok, MASTERY.days);
      app.setProgress(rec.progress);
      const days = validatedDays(rec.progress.lessons[lesson.id]);
      const notes: string[] = [];
      if (o.metrics.assisted) notes.push('Noms des notes affichés : séance non comptée pour la validation.');
      if (!rec.progress.lessons[lesson.id].mastered) {
        notes.push(`Jours validés : ${days} / ${MASTERY.days}.${ok && days < MASTERY.days ? ' Reviens demain : le sommeil fixe ce que tu as appris.' : ''}`);
      }
      notes.push(...rhythmNotes(o), ...touchNotes(o));
      if (lesson.touch && !o.felt) notes.push('Sans piano MIDI, les nuances ne peuvent pas être mesurées : séance non validée.');
      if (!ok) notes.push(RELAX);
      show(
        resultCard({
          title: ok ? 'Séance validée ✓' : 'Séance terminée',
          celebrate: rec.newlyMastered ? `🎉 Leçon ${lesson.number} maîtrisée !` : undefined,
          stats: statsFor(o, lesson.bpm, lesson.touch),
          notes,
          list: { heading: 'Tes confusions', items: confusionItems(o) },
          actions: actions(hooks, again)
        })
      );
    }
  });
  return () => cleanup();
}

export function playFlash(root: HTMLElement, app: App, hooks: Hooks): () => void {
  const lesson = flashLesson(app.progress);
  const score = generateExercise(lesson, { seed: seed(), weakness: weaknessMap(app.progress), noHome: true });
  let cleanup = () => undefined as void;
  const again = () => {
    cleanup();
    cleanup = playFlash(root, app, hooks);
  };
  cleanup = mountPlayer(root, app, {
    title: 'Échauffement',
    score,
    mode: 'wait',
    intro: { heading: lesson.title, paragraphs: [lesson.goal, 'Les notes que tu rates le plus reviennent plus souvent.'] },
    onExit: hooks.onExit,
    onFinish: (o, show) => {
      app.setProgress(recordPractice(app.progress, o.metrics));
      show(resultCard({ title: 'Échauffement terminé', stats: statsFor(o), list: { heading: 'Tes confusions', items: confusionItems(o) }, actions: actions(hooks, again) }));
    }
  });
  return () => cleanup();
}

export function playSight(root: HTMLElement, app: App, hooks: Hooks): () => void {
  const lesson = sightReadingLesson(app.progress);
  // Once reading ahead has been learnt, sight-reading keeps a one-beat curtain.
  const ahead = LESSONS.find((l) => l.id === 'lire-en-avance');
  const mask = ahead && lessonDone(app.progress, ahead) ? 1 : 0;
  const score = generateExercise(lesson, { seed: seed(), weakness: weaknessMap(app.progress), bars: 8 });
  let cleanup = () => undefined as void;
  const again = () => {
    cleanup();
    cleanup = playSight(root, app, hooks);
  };
  cleanup = mountPlayer(root, app, {
    title: 'Lecture à vue',
    score,
    mode: 'rhythm',
    bpm: lesson.bpm,
    mask,
    intro: { heading: 'Lecture à vue', paragraphs: [lesson.goal, ...lesson.theory, ...(mask ? ['Un cache d’un temps t’oblige à lire en avance.'] : [])] },
    onExit: hooks.onExit,
    onFinish: (o, show) => {
      app.setProgress(recordPractice(app.progress, o.metrics));
      show(
        resultCard({
          title: 'Lecture terminée',
          stats: statsFor(o),
          notes: ['Une nouvelle page à chaque fois : en lecture à vue, on ne répète pas, on avance.', ...rhythmNotes(o)],
          list: { heading: 'Tes confusions', items: confusionItems(o) },
          actions: actions(hooks, again)
        })
      );
    }
  });
  return () => cleanup();
}

export function playPieceStage(root: HTMLElement, app: App, piece: Piece, stageIndex: number, hooks: Hooks, review = false): () => void {
  const stage = PIECE_STAGES[stageIndex];
  const score = pieceScore(piece, stage.hands);
  const target = stage.tempo ? Math.round(piece.bpm * stage.tempo) : undefined;
  const criteria =
    stage.mode === 'wait'
      ? `Étape validée avec ${percent(MASTERY.wait.accuracy)} de notes justes du premier coup et moins de ${seconds(MASTERY.wait.medianReactionMs)} par note.`
      : `Étape validée avec ${percent(MASTERY.rhythm.accuracy)} de notes justes et à temps, à ${target} bpm ou plus, ${percent(MASTERY.rhythm.held)} des notes tenues jusqu’au bout.`;
  let cleanup = () => undefined as void;
  const again = () => {
    cleanup();
    cleanup = playPieceStage(root, app, piece, stageIndex, hooks, review);
  };
  cleanup = mountPlayer(root, app, {
    title: `${review ? 'Révision · ' : ''}${piece.title}`,
    score,
    mode: stage.mode,
    bpm: target,
    targetBpm: target,
    melodyStaff: 0,
    intro: {
      heading: review ? `Révision · ${piece.title}` : stage.label,
      paragraphs: review
        ? ['Rejoue le morceau en entier, au tempo. Les révisions espacées fixent le morceau pour de bon.']
        : stageIndex === 0
          ? [`${piece.title} (${piece.origin}).`, ...piece.tips]
          : [stage.mode === 'wait' ? 'Sans tempo : vise la justesse et le bon doigté.' : 'Avec le métronome, sans t’arrêter. Si ça accroche, reviens à l’étape précédente.'],
      setup: piece.setup,
      criteria
    },
    onExit: hooks.onExit,
    onFinish: (o, show) => {
      const ok = passes(stage.mode, o.metrics, target);
      const rec = recordPiece(app.progress, piece.id, stageIndex, stage.id, PIECE_STAGES.length, o.metrics, ok);
      // Where it stumbled: kept for a loop on those bars, forgotten once the stage passes.
      const range = ok ? null : loopRange(score, weakBars(score, errorBeats(score, o)));
      app.setProgress(setPieceWeak(rec.progress, piece.id, range ? { stage: stageIndex, bars: range } : null));
      rec.progress = app.progress;
      const r = rec.progress.pieces[piece.id];
      const notes: string[] = [];
      if (o.metrics.assisted) notes.push('Noms des notes affichés : non compté.');
      if (review) notes.push(ok ? `Prochaine révision dans ${r.interval} jour${(r.interval ?? 1) > 1 ? 's' : ''}.` : 'On le revoit demain.');
      else if (rec.advanced && !rec.learnt) notes.push(`Étape suivante : ${PIECE_STAGES[r.stage].label}.`);
      notes.push(...rhythmNotes(o), ...touchNotes(o));
      if (!ok) notes.push(RELAX);
      const extra: CardAction[] =
        !hooks.next && rec.advanced && !rec.learnt
          ? [{ label: `Étape suivante`, primary: true, onClick: () => { cleanup(); cleanup = playPieceStage(root, app, piece, r.stage, hooks); } }]
          : [];
      if (range && !review) {
        const [a, b] = range.map((i) => score.measures[i].label ?? score.measures[i].number);
        notes.push(`Ça accroche surtout mesures ${a} à ${b} : travaille-les en boucle, puis reviens au morceau entier.`);
        extra.unshift({
          label: `🔁 Boucler mesures ${a}–${b}`,
          primary: !hooks.next,
          onClick: () => {
            cleanup();
            cleanup = playLoop(root, app, piece, stageIndex, range, { ...hooks, next: undefined, onExit: () => { cleanup(); cleanup = playPieceStage(root, app, piece, stageIndex, hooks, review); } });
          }
        });
      }
      show(
        resultCard({
          title: ok ? 'Étape validée ✓' : 'Pas encore',
          celebrate: rec.learnt ? `🎉 ${piece.title} est appris ! Révision demain, puis de plus en plus espacée.` : undefined,
          stats: statsFor(o, target),
          notes,
          list: { heading: 'Tes confusions', items: confusionItems(o) },
          actions: actions(hooks, again, extra)
        })
      );
    }
  });
  return () => cleanup();
}

/** One technique drill, at its own tempo, which rises after each clean run. */
export function playDrill(root: HTMLElement, app: App, drill: Drill, hooks: Hooks): () => void {
  const { score, crossings } = drillScore(drill);
  const rec = app.progress.technique[drill.id];
  const bpm = rec?.bpm ?? drill.startBpm;
  let cleanup = () => undefined as void;
  const again = () => {
    cleanup();
    cleanup = playDrill(root, app, drill, hooks);
  };
  const criteria =
    `Passage propre : ${percent(DRILL_PASS.accuracy)} de notes justes, régularité à ±${DRILL_PASS.steadinessMs} ms` +
    (drill.chords ? `, notes des accords ensemble à ${DRILL_PASS.chordSpreadMs} ms près` : `, ${percent(DRILL_PASS.legato)} des enchaînements liés`) +
    (drill.rh && drill.lh ? `, mains ensemble à ${DRILL_PASS.chordSpreadMs} ms près` : '') +
    `. Chaque passage propre monte le tempo de ${BPM_STEP} bpm, jusqu’à ${drill.goalBpm}.`;
  cleanup = mountPlayer(root, app, {
    title: `Technique · ${drill.title}`,
    score,
    mode: 'rhythm',
    bpm,
    targetBpm: bpm,
    intro: { heading: drill.title, paragraphs: [drill.desc, ...drill.tips], setup: drill.setup, criteria },
    onExit: hooks.onExit,
    onFinish: (o, show) => {
      const a = analyzeDrill(o.targets ?? [], crossings);
      const played = o.metrics.tempo ?? bpm;
      const clean = drillPasses(drill, { accuracy: o.metrics.accuracy, assisted: o.metrics.assisted, legato: o.touch.legato }, a);
      const r = recordDrill(app.progress, drill.id, o.metrics, clean, played, drill.startBpm, drill.goalBpm, BPM_STEP);
      app.setProgress(r.progress);
      const stats: StatLine[] = [
        { value: percent(o.metrics.accuracy), label: `notes justes et à temps (objectif ${percent(DRILL_PASS.accuracy)})`, ok: o.metrics.accuracy >= DRILL_PASS.accuracy }
      ];
      if (a.steadiness !== undefined) stats.push({ value: `±${Math.round(a.steadiness)} ms`, label: `régularité du rythme (objectif ±${DRILL_PASS.steadinessMs} ms)`, ok: a.steadiness <= DRILL_PASS.steadinessMs });
      if (!drill.chords && o.touch.legato !== undefined) stats.push({ value: percent(o.touch.legato), label: `enchaînements liés (objectif ${percent(DRILL_PASS.legato)})`, ok: o.touch.legato >= DRILL_PASS.legato });
      if (a.chordSpreadMs !== undefined && (drill.chords || (drill.rh && drill.lh))) {
        stats.push({ value: `${Math.round(a.chordSpreadMs)} ms`, label: `${drill.chords ? 'entre les notes d’un accord' : 'entre les deux mains'} (objectif < ${DRILL_PASS.chordSpreadMs} ms)`, ok: a.chordSpreadMs <= DRILL_PASS.chordSpreadMs });
      }
      if (o.touch.spread !== undefined && o.felt) stats.push({ value: `±${Math.round(o.touch.spread)}`, label: 'régularité du toucher (sur 127)' });
      stats.push({ value: `${played} bpm`, label: `tempo (objectif final ${drill.goalBpm})`, ok: played >= drill.goalBpm });

      const notes: string[] = [];
      if (r.raisedTo) notes.push(`Passage propre : prochain essai à ${r.raisedTo} bpm.`);
      else if (clean) notes.push(played >= drill.goalBpm ? 'Tempo final tenu proprement.' : `Propre, mais en dessous du tempo prévu (${bpm} bpm) : le tempo ne monte pas.`);
      else notes.push(`Pas encore propre : on reste à ${r.progress.technique[drill.id].bpm} bpm. Mieux vaut lent et régulier que rapide et bancal.`);
      if (a.crossingLagMs !== undefined && Math.abs(a.crossingLagMs) > 25) {
        notes.push(a.crossingLagMs > 0
          ? `Passages du pouce en retard de ${Math.round(a.crossingLagMs)} ms en moyenne : prépare le pouce plus tôt, il doit être au-dessus de sa touche avant d’en avoir besoin.`
          : `Passages du pouce en avance de ${Math.round(-a.crossingLagMs)} ms : tu te précipites sur le passage, garde la pulsation.`);
      }
      if (a.crossingAccent !== undefined && a.crossingAccent > 10) notes.push(`Le pouce tape au passage (+${Math.round(a.crossingAccent)} de force) : allège-le, il ne doit pas s’entendre plus que les autres doigts.`);
      notes.push(...touchNotes(o));
      show(
        resultCard({
          title: clean ? 'Passage propre ✓' : 'Encore un peu',
          celebrate: r.reachedNow ? `🎉 Tempo final atteint : ${drill.goalBpm} bpm !` : undefined,
          stats,
          notes,
          list: { heading: 'Tes confusions', items: confusionItems(o) },
          actions: actions(hooks, again)
        })
      );
    }
  });
  return () => cleanup();
}

/** Beats where something went wrong in a run: wrong keys, hesitations, missed or late notes, notes let go early. */
export function errorBeats(score: Score, o: Outcome): number[] {
  if (o.wait) {
    const steps = buildSteps(score);
    return o.wait.results.flatMap((r, i) => (r.wrong.length || r.hinted || r.reactionMs > 2500 ? [steps[i].beat] : []));
  }
  const timing = (o.targets ?? []).filter((t) => t.grade === 'miss' || t.grade === 'good').map((t) => t.beat);
  return [...timing, ...o.touch.shortAt];
}

/** Loop passes needed: three clean ones in a row, the last at full tempo. */
export const LOOP_CLEAN = 3;

/**
 * A few bars of a piece, again and again. In rhythm stages the loop starts at
 * 70 % of the stage tempo and rises 10 % after each clean pass.
 */
export function playLoop(
  root: HTMLElement,
  app: App,
  piece: Piece,
  stageIndex: number,
  range: [number, number],
  hooks: Hooks,
  state = { streak: 0, bpm: 0 }
): () => void {
  const stage = PIECE_STAGES[stageIndex];
  const full = pieceScore(piece, stage.hands);
  const score = excerptScore(full, range[0], range[1]);
  const target = Math.round(piece.bpm * (stage.tempo ?? 1));
  if (!state.bpm) state.bpm = Math.round(target * 0.7);
  const [a, b] = range.map((i) => full.measures[i].label ?? full.measures[i].number);
  let cleanup = () => undefined as void;
  const again = () => {
    cleanup();
    cleanup = playLoop(root, app, piece, stageIndex, range, hooks, state);
  };
  cleanup = mountPlayer(root, app, {
    title: `${piece.title} · boucle ${a}–${b}`,
    score,
    mode: stage.mode,
    bpm: state.bpm,
    targetBpm: stage.mode === 'rhythm' ? state.bpm : undefined,
    intro: {
      heading: `Boucle · mesures ${a} à ${b}`,
      paragraphs: [
        'Les mesures où ça a accroché, et leur voisine pour travailler l’enchaînement.',
        stage.mode === 'rhythm'
          ? `On commence plus lentement (${state.bpm} bpm) ; chaque passage propre accélère de 10 %, jusqu’à ${target} bpm.`
          : 'Sans tempo : vise la justesse du premier coup, sans hésiter.',
        `Il faut ${LOOP_CLEAN} passages propres d’affilée${stage.mode === 'rhythm' ? ', le dernier au tempo' : ''}.`
      ],
      setup: piece.setup
    },
    onExit: hooks.onExit,
    onFinish: (o, show) => {
      app.setProgress(recordPractice(app.progress, o.metrics));
      const clean = passes(stage.mode, o.metrics, stage.mode === 'rhythm' ? state.bpm : undefined);
      const played = o.metrics.tempo ?? state.bpm;
      if (clean) state.streak++;
      else state.streak = 0;
      const atTempo = stage.mode === 'wait' || played >= target;
      const done = clean && state.streak >= LOOP_CLEAN && atTempo;
      if (clean && stage.mode === 'rhythm') state.bpm = Math.min(target, Math.max(state.bpm, played) + Math.round(target * 0.1));
      if (done) app.setProgress(setPieceWeak(app.progress, piece.id, null));
      const notes = [
        done
          ? 'Ces mesures passent maintenant. Rejoue le morceau entier : elles doivent tenir dans le contexte.'
          : clean
            ? `Propre (${state.streak} / ${LOOP_CLEAN} d’affilée).${stage.mode === 'rhythm' ? ` Prochain passage à ${state.bpm} bpm.` : ''}`
            : 'Pas encore propre : on recommence au même tempo. Ralentis si besoin.',
        ...rhythmNotes(o),
        ...touchNotes(o)
      ];
      show(
        resultCard({
          title: done ? 'Boucle réussie ✓' : clean ? 'Passage propre ✓' : 'Encore une fois',
          stats: statsFor(o, stage.mode === 'rhythm' ? target : undefined),
          notes,
          list: { heading: 'Tes confusions', items: confusionItems(o) },
          actions: done
            ? [{ label: 'Rejouer le morceau entier', primary: true, onClick: hooks.onExit }, ...(hooks.next ? [{ label: hooks.next.label, onClick: hooks.next.go }] : [])]
            : [{ label: 'Encore', primary: true, onClick: again }, ...(hooks.next ? [{ label: hooks.next.label, onClick: hooks.next.go }] : []), { label: 'Arrêter la boucle', onClick: hooks.onExit }]
        })
      );
    }
  });
  return () => cleanup();
}

export { blockPasses };

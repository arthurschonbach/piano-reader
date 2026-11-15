/**
 * Every kind of practice, ready to play: a lesson exercise, a stage of a piece,
 * the reading warm-up, sight-reading. Each records progress and shows results.
 */
import { blockPasses, flashLesson, passes, sightReadingLesson } from '../curriculum/coach';
import { generateExercise } from '../curriculum/generate';
import { MASTERY, type Lesson } from '../curriculum/lessons';
import { PIECE_STAGES, pieceScore, type Piece } from '../curriculum/pieces';
import { recordLesson, recordPiece, recordPractice, validatedDays, weaknessMap } from '../progress/store';
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

function statsFor(o: Outcome, targetBpm?: number): StatLine[] {
  if (o.metrics.mode === 'wait') {
    return [
      { value: percent(o.metrics.accuracy), label: `justes du premier coup (objectif ${percent(MASTERY.wait.accuracy)})`, ok: o.metrics.accuracy >= MASTERY.wait.accuracy },
      { value: seconds(o.metrics.medianReactionMs ?? 0), label: `par note, sans hésiter (objectif < ${seconds(MASTERY.wait.medianReactionMs)})`, ok: (o.metrics.medianReactionMs ?? 0) <= MASTERY.wait.medianReactionMs }
    ];
  }
  const r = o.rhythm!;
  const lines: StatLine[] = [
    { value: percent(r.accuracy), label: `notes justes et à temps (objectif ${percent(MASTERY.rhythm.accuracy)})`, ok: r.accuracy >= MASTERY.rhythm.accuracy },
    { value: `${Math.round(r.timingMs)} ms`, label: `d’écart au temps, en médiane (objectif < ${MASTERY.rhythm.timingMs} ms)`, ok: r.timingMs <= MASTERY.rhythm.timingMs }
  ];
  if (targetBpm) lines.push({ value: `${o.metrics.tempo} bpm`, label: `tempo (objectif ${targetBpm})`, ok: (o.metrics.tempo ?? 0) >= targetBpm });
  return lines;
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
  const criteria =
    lesson.mode === 'wait'
      ? `Leçon validée avec ${percent(MASTERY.wait.accuracy)} de notes justes du premier coup et moins de ${seconds(MASTERY.wait.medianReactionMs)} par note, ${MASTERY.days} jours différents.`
      : `Leçon validée avec ${percent(MASTERY.rhythm.accuracy)} de notes justes et à temps (écart < ${MASTERY.rhythm.timingMs} ms) à ${lesson.bpm} bpm, ${MASTERY.days} jours différents.`;
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
    intro: { heading: lesson.title, paragraphs: review ? [lesson.goal] : [lesson.goal, ...lesson.theory], setup: lesson.setup, criteria },
    onExit: hooks.onExit,
    onFinish: (o, show) => {
      const ok = passes(lesson.mode, o.metrics, lesson.bpm);
      const rec = recordLesson(app.progress, lesson.id, o.metrics, ok, MASTERY.days);
      app.setProgress(rec.progress);
      const days = validatedDays(rec.progress.lessons[lesson.id]);
      const notes: string[] = [];
      if (o.metrics.assisted) notes.push('Noms des notes affichés : séance non comptée pour la validation.');
      if (!rec.progress.lessons[lesson.id].mastered) {
        notes.push(`Jours validés : ${days} / ${MASTERY.days}.${ok && days < MASTERY.days ? ' Reviens demain : le sommeil fixe ce que tu as appris.' : ''}`);
      }
      notes.push(...rhythmNotes(o));
      if (!ok) notes.push(RELAX);
      show(
        resultCard({
          title: ok ? 'Séance validée ✓' : 'Séance terminée',
          celebrate: rec.newlyMastered ? `🎉 Leçon ${lesson.number} maîtrisée !` : undefined,
          stats: statsFor(o, lesson.bpm),
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
    intro: { heading: 'Lecture à vue', paragraphs: [lesson.goal, ...lesson.theory] },
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
      : `Étape validée avec ${percent(MASTERY.rhythm.accuracy)} de notes justes et à temps, à ${target} bpm ou plus.`;
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
      app.setProgress(rec.progress);
      const r = rec.progress.pieces[piece.id];
      const notes: string[] = [];
      if (o.metrics.assisted) notes.push('Noms des notes affichés : non compté.');
      if (review) notes.push(ok ? `Prochaine révision dans ${r.interval} jour${(r.interval ?? 1) > 1 ? 's' : ''}.` : 'On le revoit demain.');
      else if (rec.advanced && !rec.learnt) notes.push(`Étape suivante : ${PIECE_STAGES[r.stage].label}.`);
      notes.push(...rhythmNotes(o));
      if (!ok) notes.push(RELAX);
      const extra: CardAction[] =
        !hooks.next && rec.advanced && !rec.learnt
          ? [{ label: `Étape suivante`, primary: true, onClick: () => { cleanup(); cleanup = playPieceStage(root, app, piece, r.stage, hooks); } }]
          : [];
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

export { blockPasses };

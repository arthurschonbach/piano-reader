/**
 * Ear training screen: listen, play it back, see it written.
 * The phrase is played on the piano itself when it accepts MIDI notes,
 * otherwise by a small synth in the browser.
 */
import { ScoreRenderer } from '../core/engraver';
import { mulberry32 } from '../core/random';
import {
  dictationScore, EAR_DOWN, EAR_ITEMS, EAR_LEVELS, EAR_REVEAL_AFTER, EAR_UP, EarTry, makeDictation, nextEarLevel, type Dictation
} from '../curriculum/ear';
import { mountKeyboard } from '../input/keyboard';
import { recordEar } from '../progress/store';
import type { Hooks } from './activities';
import type { App } from './app';
import { button, h, keepAwake, resultCard, topBar } from './dom';
import { nameOf } from './player';

/** Beat length when playing a melody, and a chord. */
const NOTE_MS = 650;
const CHORD_MS = 1100;

/** Where the phrases are heard: the piano itself when chosen and reachable. */
export const playsOnPiano = (app: App): boolean => app.settings.earOnPiano && app.midi.canPlay;

/** Play notes (one entry per beat); returns when the sound is over (ms from now). */
export function playBeats(app: App, beats: number[][], beatMs: number, startIn = 120): number {
  const t0 = performance.now() + startIn;
  const piano = playsOnPiano(app);
  beats.forEach((ms, i) => {
    for (const m of ms) {
      const at = t0 + i * beatMs;
      if (!(piano && app.midi.playNote(m, at, beatMs * 0.92, ms.length > 1 ? 52 : 64))) app.metronome.tone(m, at, beatMs * 0.92, ms.length > 1 ? 0.35 : 0.55);
    }
  });
  return startIn + beats.length * beatMs;
}

export function renderEar(root: HTMLElement, app: App, hooks: Hooks): () => void {
  const level = EAR_LEVELS[Math.min(EAR_LEVELS.length, Math.max(1, app.progress.ear.level)) - 1];
  const rng = mulberry32(Math.floor(Math.random() * 1e9));
  const view = h('div', 'subpage ear');
  view.append(topBar(app, `Oreille · niveau ${level.n}`, hooks.onExit));
  const page = h('div', 'page');
  view.append(page);
  root.append(view);
  const release = keepAwake();

  const status = h('p', 'ear-status');
  const dots = h('div', 'ear-dots');
  const feedback = h('p', 'feedback');
  feedback.setAttribute('aria-live', 'polite');
  const sheet = h('div', 'ear-sheet');
  const canvas = h('canvas');
  sheet.append(canvas);
  sheet.hidden = true;
  const names = h('p', 'ear-names');
  const btns = h('div', 'actions');
  const kbdSlot = h('div', 'kbd-slot');

  let item = 0;
  let clean = 0;
  let current: EarTry | null = null;
  /** Input is ignored while the app is playing (the piano may echo its own notes). */
  let busyUntil = 0;
  let finished = false;
  let waitingNext = false;
  let timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

  const drawDots = () => {
    dots.innerHTML = '';
    if (!current) return;
    current.d.answer.forEach((_, i) => dots.append(h('span', `dot${i < current!.pos ? ' on' : ''}`)));
  };
  const firstHint = (d: Dictation) =>
    d.level.kind === 'bass' ? 'Le premier accord est toujours I : sa basse est C.' : `Première note : ${nameOf(d.answer[0])}.`;

  const play = (d: Dictation) => {
    // A C major chord first, so the ear knows where "home" is.
    const anchor = d.level.kind === 'bass' ? 0 : playBeats(app, [[48, 60, 64, 67]], 900);
    later(anchor + (anchor ? 250 : 0), () => {
      const len = playBeats(app, d.sound, d.level.kind === 'bass' ? CHORD_MS : NOTE_MS);
      busyUntil = performance.now() + len + 150;
      // Ask only once the piano is listening again.
      later(len + 160, () => {
        if (current?.d === d && !current.done && !waitingNext) status.textContent = `À toi. ${firstHint(d)}`;
      });
    });
    busyUntil = performance.now() + anchor + 400;
    status.textContent = 'Écoute…';
  };

  const showAnswer = (d: Dictation) => {
    sheet.hidden = false;
    const r = new ScoreRenderer(canvas);
    const rect = sheet.getBoundingClientRect();
    r.resize(Math.max(200, rect.width), 150);
    const sc = dictationScore(d);
    r.draw(sc, { beat: 0, lookahead: 0, names: false, zoom: 1, fitBeats: sc.measures.length * 4, cursor: false });
    names.textContent = d.answer.map(nameOf).join(' · ');
  };

  const nextItem = () => {
    waitingNext = false;
    if (item >= EAR_ITEMS) return finish();
    item++;
    current = new EarTry(makeDictation(level, rng));
    // For the end-to-end test, like the exercise screen's onsets.
    view.dataset.answer = JSON.stringify(current.d.answer);
    sheet.hidden = true;
    names.textContent = '';
    feedback.textContent = '';
    feedback.dataset.tone = '';
    page.querySelector('.ear-count')!.textContent = `Dictée ${item} / ${EAR_ITEMS}`;
    drawDots();
    drawButtons();
    play(current.d);
  };

  const settle = (ok: boolean) => {
    if (!current) return;
    if (ok && current.wrongs === 0) clean++;
    waitingNext = true;
    showAnswer(current.d);
    status.textContent = ok ? (current.wrongs === 0 ? '✓ Du premier coup !' : '✓ Trouvé.') : 'Voici la réponse : écoute-la en la lisant.';
    if (!ok) later(300, () => {
      if (current) busyUntil = performance.now() + playBeats(app, current.d.sound, current.d.level.kind === 'bass' ? CHORD_MS : NOTE_MS) + 150;
    });
    drawButtons();
  };

  const drawButtons = () => {
    btns.innerHTML = '';
    if (waitingNext) {
      btns.append(button(item >= EAR_ITEMS ? 'Voir le résultat' : 'Suivant', 'btn primary big', nextItem));
      btns.append(h('p', 'hint', 'ou joue n’importe quelle note'));
    } else {
      btns.append(
        button('Réécouter', 'btn', () => current && play(current.d)),
        button('Je ne trouve pas', 'btn quiet', () => settle(false))
      );
    }
  };

  const finish = () => {
    finished = true;
    const before = app.progress.ear.level;
    const after = nextEarLevel(before, clean);
    app.setProgress(recordEar(app.progress, clean, EAR_ITEMS, after));
    page.innerHTML = '';
    unmountKbd?.();
    const notes = [
      after > before
        ? `Niveau suivant débloqué : ${EAR_LEVELS[after - 1].title}.`
        : after < before
          ? `On revient au niveau ${after} pour consolider : ${EAR_LEVELS[after - 1].title}.`
          : `Encore ce niveau la prochaine fois : il faut ${EAR_UP} / ${EAR_ITEMS} du premier coup pour passer au suivant.`,
      'Astuce : chante la phrase (même dans ta tête) avant de la jouer. Si tu peux la chanter, tu peux la trouver.'
    ];
    page.append(
      resultCard({
        title: 'Oreille',
        stats: [{ value: `${clean} / ${EAR_ITEMS}`, label: `dictées justes du premier coup (${EAR_UP} pour monter, ${EAR_DOWN} ou moins pour redescendre)`, ok: clean >= EAR_UP }],
        notes,
        actions: hooks.next
          ? [{ label: hooks.next.label, primary: true, onClick: hooks.next.go }]
          : [{ label: 'Nouvelle série', primary: true, onClick: () => (hooks.again ?? app.refresh)() }, { label: 'Retour', onClick: hooks.onExit }]
      })
    );
  };

  // ---------- intro ----------
  const intro = h('div', 'card intro');
  intro.append(
    h('h2', undefined, `Niveau ${level.n} · ${level.title}`),
    h('p', undefined, level.desc),
    h(
      'p',
      undefined,
      `Écoute la phrase, puis rejoue-la au piano. Une fausse note renvoie au début de la phrase : réécoute autant que tu veux. Après ${EAR_REVEAL_AFTER} essais ratés, la réponse s’affiche. ${EAR_ITEMS} dictées par série.`
    ),
  );
  // Where the sound comes from, with a test and a switch (the piano may not accept notes over Bluetooth).
  const source = h('p', 'setup');
  const soundRow = h('div', 'actions');
  const drawSource = () => {
    source.textContent = playsOnPiano(app)
      ? '🎹 Le piano joue lui-même les phrases. Fais « Tester le son » : si le piano reste muet, passe au son du téléphone.'
      : app.settings.earOnPiano && app.midi.connected
        ? '🔊 Aucune sortie MIDI vers le piano : le son sort du téléphone. Monte le volume.'
        : '🔊 Le son sort de cet appareil : monte le volume.';
    soundRow.innerHTML = '';
    soundRow.append(
      button('Tester le son', 'btn', () => {
        app.metronome.unlock();
        playBeats(app, [[60], [64], [67], [72]], 380);
      })
    );
    if (app.midi.canPlay) {
      soundRow.append(
        button(app.settings.earOnPiano ? 'Utiliser le son du téléphone' : 'Utiliser le son du piano', 'btn quiet', () => {
          app.setSettings({ ...app.settings, earOnPiano: !app.settings.earOnPiano });
          drawSource();
        })
      );
    }
  };
  drawSource();
  intro.append(source, soundRow);
  intro.append(
    button('C’est parti', 'btn primary big', () => {
      app.metronome.unlock();
      intro.remove();
      page.append(h('p', 'ear-count', ''), status, dots, feedback, sheet, names, btns);
      nextItem();
    })
  );
  page.append(intro);

  // ---------- input ----------
  let unmountKbd: (() => void) | null = null;
  if (!app.midi.connected) {
    const lo = level.kind === 'bass' ? 47 : 57;
    unmountKbd = mountKeyboard(kbdSlot, app.bus, lo, lo + 19);
    view.append(kbdSlot);
    view.classList.add('has-kbd');
  }
  const offBus = app.bus.on((e) => {
    if (!e.on || finished || !current) return;
    if (performance.now() < busyUntil) return;
    if (waitingNext) return nextItem();
    const fb = current.noteOn(e.midi);
    if (!fb) return;
    if (fb.kind === 'ok') {
      drawDots();
      feedback.textContent = nameOf(e.midi);
      feedback.dataset.tone = 'good';
      if (fb.done) settle(true);
    } else {
      drawDots();
      feedback.dataset.tone = 'bad';
      if (fb.wrongs >= EAR_REVEAL_AFTER) {
        feedback.textContent = `✗ ${nameOf(fb.played)}.`;
        settle(false);
      } else feedback.textContent = `✗ ${nameOf(fb.played)} : recommence depuis le début de la phrase.`;
    }
  });

  return () => {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
    app.midi.stopNotes();
    offBus();
    unmountKbd?.();
    release();
    view.remove();
  };
}

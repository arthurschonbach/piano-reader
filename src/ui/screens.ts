/** Guided session, level test, piece page, progress, settings. */
import type { ThemeChoice } from '../core/settings';
import { blockPasses, dailyPlan, placementLessons, type Activity } from '../curriculum/coach';
import { concatScores, generateExercise } from '../curriculum/generate';
import { LESSONS, lessonById } from '../curriculum/lessons';
import { PIECES, PIECE_STAGES, pieceById } from '../curriculum/pieces';
import { buildSteps, type StepResult } from '../exercise/wait';
import {
  emptyProgress, exportProgress, importProgress, recordPlacement, recordPractice, streak, validatedDays, weaknessMap
} from '../progress/store';
import { playFlash, playLesson, playPieceStage, playSight, type Hooks } from './activities';
import type { App } from './app';
import { button, h, percent, resultCard, topBar } from './dom';
import { mountPlayer, nameOf } from './player';

// ---------------------------------------------------------------- session

export function renderSession(root: HTMLElement, app: App): () => void {
  const plan = dailyPlan(app.progress);
  let cleanup: () => void = () => undefined;
  const home = () => app.go('#/');

  const runAt = (i: number) => {
    cleanup();
    if (i >= plan.length) return finish();
    const a = plan[i];
    const nextLabel = i + 1 < plan.length ? `Continuer : ${plan[i + 1].label}` : 'Terminer la séance';
    const hooks: Hooks = { onExit: home, next: { label: nextLabel, go: () => runAt(i + 1) } };
    cleanup = start(a, hooks);
    const count = root.querySelector('.count');
    root.querySelector('.tb-title')?.append(h('span', 'tb-step', ` · ${i + 1}/${plan.length}`));
    void count;
  };

  const start = (a: Activity, hooks: Hooks): (() => void) => {
    switch (a.kind) {
      case 'flash':
        return playFlash(root, app, hooks);
      case 'sight':
        return playSight(root, app, hooks);
      case 'lesson':
        return playLesson(root, app, lessonById(a.lessonId)!, hooks, a.review);
      case 'piece':
        return playPieceStage(root, app, pieceById(a.pieceId)!, a.stage, hooks, a.review);
    }
  };

  const finish = () => {
    // Even a session made only of warm-ups counts as a day of practice.
    const p = recordPractice(app.progress, { mode: 'wait', accuracy: 1, attempts: [], confusions: [], assisted: false });
    app.setProgress(p);
    const s = streak(p);
    const wrap = h('div', 'ex');
    wrap.append(topBar(app, 'Séance du jour', home));
    const ov = h('div', 'overlay');
    ov.append(
      resultCard({
        title: 'Séance terminée 👏',
        celebrate: s > 1 ? `🔥 ${s} jours d’affilée` : 'Premier jour de ta série !',
        stats: [],
        notes: [
          'Demain, la séance reprendra ce qui doit être revu : c’est la répétition espacée qui fait tenir les acquis.',
          'Pour le reste de ton temps de piano : un morceau en cours, mains séparées puis ensemble, lentement.'
        ],
        actions: [{ label: 'Retour à l’accueil', primary: true, onClick: home }]
      })
    );
    wrap.append(ov);
    root.append(wrap);
    cleanup = () => wrap.remove();
  };

  runAt(0);
  return () => cleanup();
}

// ---------------------------------------------------------------- level test

const BLOCK_BARS = 2;

export function renderPlacement(root: HTMLElement, app: App): () => void {
  const lessons = placementLessons();
  const seed = Math.floor(Math.random() * 1e9);
  const blocks = lessons.map((l, i) =>
    generateExercise(l, { seed: seed + i, bars: BLOCK_BARS, noHome: true, grand: true, rhythms: [[[1, 1, 1, 1], 1]], weakness: weaknessMap(app.progress) })
  );
  const score = concatScores(blocks, 'Test de niveau');
  // Which block each step belongs to.
  const steps = buildSteps(score);
  const blockOf = steps.map((s) => Math.floor(s.beat / (BLOCK_BARS * 4)));
  const sizes = lessons.map((_, b) => blockOf.filter((x) => x === b).length);

  const evalBlocks = (results: StepResult[]) => {
    const out: { passed: boolean; complete: boolean }[] = [];
    for (let b = 0; b < lessons.length; b++) {
      const rs = results.filter((_, i) => blockOf[i] === b);
      const complete = rs.length === sizes[b];
      const clean = rs.filter((r) => r.wrong.length === 0).length;
      const times = rs.map((r) => r.reactionMs).sort((x, y) => x - y);
      const med = times.length ? times[times.length >> 1] : Infinity;
      out.push({ passed: complete && blockPasses(clean, rs.length, med), complete });
    }
    return out;
  };

  return mountPlayer(root, app, {
    title: 'Test de niveau',
    score,
    mode: 'wait',
    fingers: false,
    intro: {
      heading: 'Test de niveau',
      paragraphs: [
        `Une suite de petits blocs de ${BLOCK_BARS} mesures, du plus simple (position de C, main droite) au plus avancé (armures).`,
        'Joue chaque note entourée, sans te presser mais sans réfléchir trop longtemps. Le test s’arrête au premier bloc difficile.',
        'Pas de doigté imposé ici, et rien à perdre : il sert juste à choisir où commencer.'
      ]
    },
    stopWhen: (results) => {
      const ev = evalBlocks(results);
      return ev.some((e) => e.complete && !e.passed);
    },
    onExit: () => app.go('#/'),
    onFinish: (o, show) => {
      const ev = evalBlocks(o.wait!.results);
      const passed: string[] = [];
      let stoppedAt: string | null = null;
      for (let b = 0; b < lessons.length; b++) {
        if (ev[b].passed) passed.push(lessons[b].id);
        else {
          stoppedAt = lessons[b].id;
          break;
        }
      }
      let p = recordPractice(app.progress, o.metrics);
      p = recordPlacement(p, passed, stoppedAt);
      app.setProgress(p);
      const start = LESSONS.find((l) => !p.lessons[l.id]?.acquired && !p.lessons[l.id]?.mastered);
      show(
        resultCard({
          title: 'Test terminé',
          stats: [{ value: String(passed.length), label: `bloc${passed.length > 1 ? 's' : ''} réussi${passed.length > 1 ? 's' : ''} sur ${lessons.length}` }],
          notes: [
            passed.length ? `Acquis : ${passed.map((id) => `leçon ${lessonById(id)!.number}`).join(', ')}.` : 'On commence par les bases : c’est très bien, elles vont vite.',
            start ? `Ton parcours reprend à la leçon ${start.number} : ${start.title}.` : 'Tout le parcours est acquis !',
            'Les leçons de rythme (4 et 8) ne sont pas testées ici : elles restent à faire.'
          ],
          actions: [{ label: 'Voir ma séance du jour', primary: true, onClick: () => app.go('#/') }]
        })
      );
    }
  });
}

// ---------------------------------------------------------------- piece page

export function renderPiece(root: HTMLElement, app: App, id: string): () => void {
  const piece = pieceById(id);
  if (!piece) {
    app.go('#/');
    return () => undefined;
  }
  const r = app.progress.pieces[piece.id];
  const stage = r?.stage ?? 0;
  const view = h('div', 'subpage');
  view.append(topBar(app, piece.title, () => app.go('#/')));
  const page = h('div', 'page');
  page.append(h('h1', 'title', piece.title), h('p', 'sub', `${piece.origin} · tempo cible ${piece.bpm} bpm`));
  page.append(h('p', 'setup', `🖐 ${piece.setup}`));
  const tips = h('ul', 'tips');
  for (const t of piece.tips) tips.append(h('li', undefined, t));
  page.append(tips);
  page.append(h('h2', 'sect', 'Apprendre étape par étape'));
  const ol = h('ol', 'stages');
  PIECE_STAGES.forEach((st, i) => {
    const done = i < stage;
    const li = h('li', `pstage${done ? ' done' : ''}${i === stage ? ' current' : ''}`);
    li.append(h('span', 'num', done ? '✓' : String(i + 1)), h('span', 'lbl', st.label + (st.tempo ? ` (${Math.round(piece.bpm * st.tempo)} bpm)` : '')));
    li.append(button(i === stage ? 'Travailler' : 'Jouer', i === stage ? 'btn primary' : 'btn', () => app.go(`#/morceau/${piece.id}/${i}`)));
    ol.append(li);
  });
  page.append(ol);
  if (stage >= PIECE_STAGES.length) {
    page.append(h('p', 'note', `✓ Appris. ${r?.due ? `Prochaine révision le ${r.due.split('-').reverse().join('/')}` : ''} (${r?.reviews ?? 0} révision${(r?.reviews ?? 0) > 1 ? 's' : ''} réussie${(r?.reviews ?? 0) > 1 ? 's' : ''}).`));
  }
  page.append(h('p', 'hint', 'Une étape validée débloque la suivante. Pour un vrai apprentissage, ne fais pas tout le même jour : reprendre le lendemain fixe le morceau.'));
  view.append(page);
  root.append(view);
  return () => view.remove();
}

export function renderPieceStage(root: HTMLElement, app: App, id: string, stage: number): () => void {
  const piece = pieceById(id);
  if (!piece || !(stage >= 0 && stage < PIECE_STAGES.length)) {
    app.go('#/');
    return () => undefined;
  }
  const learnt = (app.progress.pieces[piece.id]?.stage ?? 0) >= PIECE_STAGES.length;
  return playPieceStage(root, app, piece, stage, { onExit: () => app.go(`#/morceau/${piece.id}`) }, learnt && stage === PIECE_STAGES.length - 1);
}

// ---------------------------------------------------------------- progress

function sparkline(values: number[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 28');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('aria-hidden', 'true');
  const vs = values.slice(-12);
  if (vs.length > 1) {
    const pts = vs.map((v, i) => `${(i / (vs.length - 1)) * 100},${26 - v * 24}`).join(' ');
    const pl = document.createElementNS(ns, 'polyline');
    pl.setAttribute('points', pts);
    svg.append(pl);
  }
  return svg;
}

export function renderProgress(root: HTMLElement, app: App): () => void {
  const p = app.progress;
  const view = h('div', 'subpage');
  view.append(topBar(app, 'Mes progrès', () => app.go('#/')));
  const page = h('div', 'page');

  const s = streak(p);
  const totals = h('div', 'stats');
  const sessions = Object.values(p.lessons).reduce((a, r) => a + r.sessions.length, 0) + Object.values(p.pieces).reduce((a, r) => a + r.sessions.length, 0);
  for (const [v, l] of [
    [`${s}`, `jour${s > 1 ? 's' : ''} d’affilée`],
    [`${p.days.length}`, `jour${p.days.length > 1 ? 's' : ''} de pratique`],
    [`${sessions}`, 'exercices notés']
  ]) {
    const el = h('div', 'stat');
    el.append(h('div', 'v', v), h('div', 'l', l));
    totals.append(el);
  }
  page.append(totals);

  // Last 28 days.
  page.append(h('h2', 'sect', '4 dernières semaines'));
  const cal = h('div', 'cal');
  const set = new Set(p.days);
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const c = h('span', `day${set.has(key) ? ' on' : ''}${i === 0 ? ' today' : ''}`);
    c.title = key.split('-').reverse().join('/');
    cal.append(c);
  }
  page.append(cal);

  // Note map on a keyboard.
  page.append(h('h2', 'sect', 'Tes notes'), h('p', 'hint', 'Vert : lue sans hésiter. Orange, rouge : à retravailler. Gris : pas encore vue.'));
  const kb = h('div', 'notemap');
  for (let m = 36; m <= 84; m++) {
    if ([1, 3, 6, 8, 10].includes(m % 12)) continue;
    const st = p.notes[m];
    const k = h('span', 'nm-key');
    if (st && st.attempts > 0) {
      const d = Math.max(0, Math.min(1, st.difficulty));
      k.style.setProperty('--hue', String(Math.round(130 - 130 * d)));
      k.classList.add('seen');
      k.title = `${nameOf(m)} : ${percent(st.clean / st.attempts)} juste (${st.attempts} fois)`;
    } else k.title = nameOf(m);
    if (m % 12 === 0) k.append(h('span', 'nm-label', m === 60 ? 'C4' : `C${m / 12 - 1}`));
    kb.append(k);
  }
  page.append(kb);

  // Lessons.
  page.append(h('h2', 'sect', 'Leçons'));
  const ll = h('ul', 'prog-list');
  for (const l of LESSONS) {
    const r = p.lessons[l.id];
    const li = h('li');
    const label = r?.mastered ? '✓ maîtrisée' : r?.acquired ? '✓ acquise (test)' : r?.sessions.length ? `${validatedDays(r)} / 2 jours` : '—';
    li.append(h('span', 'pl-t', `${l.number}. ${l.title}`), sparkline(r?.sessions.map((x) => x.accuracy) ?? []), h('span', 'pl-s', label));
    ll.append(li);
  }
  page.append(ll);

  // Confusions.
  const conf = Object.entries(p.confusions).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (conf.length) {
    page.append(h('h2', 'sect', 'Confusions fréquentes'));
    const ul = h('ul', 'conf');
    for (const [k, n] of conf) {
      const [e, pl] = k.split('>').map(Number);
      ul.append(h('li', undefined, `${nameOf(pl)} joué au lieu de ${nameOf(e)}${Number(pl) % 12 === Number(e) % 12 ? ' (octave)' : ''} · ${n}×`));
    }
    page.append(ul);
  }

  // Pieces.
  page.append(h('h2', 'sect', 'Morceaux'));
  const pl = h('ul', 'prog-list');
  for (const pc of PIECES) {
    const r = p.pieces[pc.id];
    const st = r?.stage ?? 0;
    const li = h('li');
    li.append(
      h('span', 'pl-t', pc.title),
      h('span', 'pl-s', st >= PIECE_STAGES.length ? `✓ appris · ${r?.reviews ?? 0} révision(s)` : st ? `étape ${st + 1}/${PIECE_STAGES.length}` : '—')
    );
    pl.append(li);
  }
  page.append(pl);

  view.append(page);
  root.append(view);
  return () => view.remove();
}

// ---------------------------------------------------------------- settings

export function renderSettings(root: HTMLElement, app: App): () => void {
  const view = h('div', 'subpage');
  view.append(topBar(app, 'Réglages', () => app.go('#/')));
  const page = h('div', 'page');
  let stopCal: (() => void) | null = null;

  // Theme.
  page.append(h('h2', 'sect', 'Apparence'));
  const seg = h('div', 'seg');
  const choices: [ThemeChoice, string][] = [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']];
  const drawSeg = () => {
    seg.innerHTML = '';
    for (const [v, l] of choices) {
      const b = button(l, `btn${app.settings.theme === v ? ' on' : ''}`, () => {
        app.setSettings({ ...app.settings, theme: v });
        drawSeg();
      });
      b.setAttribute('aria-pressed', String(app.settings.theme === v));
      seg.append(b);
    }
  };
  drawSeg();
  page.append(seg, h('p', 'hint', 'Auto suit le réglage de ton appareil.'));

  // Latency.
  page.append(h('h2', 'sect', 'Latence du piano'));
  const latText = h('p');
  const syncLat = () => {
    latText.textContent = app.settings.calibrated ? `Mesurée : ${Math.round(app.settings.latencyMs)} ms (retirés avant de juger ton rythme).` : 'Pas encore mesurée. Recommandé si ton piano est en Bluetooth.';
  };
  syncLat();
  const calBox = h('div', 'cal-box');
  const calBtn = button('Calibrer', 'btn primary', () => {
    calBtn.disabled = true;
    stopCal = calibrate(app, calBox, (ms) => {
      if (ms !== null) app.setSettings({ ...app.settings, latencyMs: ms, calibrated: true });
      syncLat();
      calBtn.disabled = false;
      stopCal = null;
    });
  });
  const soundMsg = h('p', 'note');
  const testBtn = button('Tester le son', 'btn', () => {
    const ok = app.metronome.unlock();
    const now = performance.now() + 150;
    for (let i = 0; i < 4; i++) app.metronome.click(now + i * 500, i === 0);
    soundMsg.textContent = 'Tu dois entendre 4 clics…';
    window.setTimeout(() => {
      const st = app.metronome.state;
      soundMsg.textContent = !ok || st !== 'running'
        ? `Le navigateur bloque le son (état : ${st}). Réessaie en touchant le bouton une seconde fois.`
        : 'Rien entendu ? Monte le volume de l’appareil et coupe le mode silencieux (Centre de contrôle, icône cloche). Si tu as des écouteurs Bluetooth connectés, le son part dedans.';
    }, 2300);
  });
  const btns = h('div', 'row-btns');
  btns.append(testBtn, calBtn);
  page.append(latText, h('p', 'hint', 'Vérifie d’abord le son. Pour calibrer : 4 clics d’amorce, puis joue n’importe quelle touche du piano en même temps que chacun des 8 clics suivants.'), btns, soundMsg, calBox);

  // Transfer.
  page.append(h('h2', 'sect', 'Transférer ma progression'));
  page.append(h('p', 'hint', 'Ta progression est enregistrée sur cet appareil seulement. Pour la copier sur un autre (téléphone ↔ iPad) : copie le code ici, colle-le là-bas.'));
  const area = h('textarea', 'code');
  area.rows = 3;
  area.placeholder = 'Colle ici un code de progression…';
  const msg = h('p', 'note');
  const tr = h('div', 'row-btns');
  tr.append(
    button('Copier mon code', 'btn', async () => {
      const code = exportProgress(app.progress);
      area.value = code;
      try {
        await navigator.clipboard.writeText(code);
        msg.textContent = 'Code copié.';
      } catch {
        area.select();
        msg.textContent = 'Sélectionne le code et copie-le.';
      }
    }),
    button('Importer ce code', 'btn', () => {
      const p = importProgress(area.value);
      if (!p) {
        msg.textContent = 'Code illisible.';
        return;
      }
      if (!confirm('Remplacer la progression de cet appareil par celle du code ?')) return;
      app.setProgress(p);
      msg.textContent = 'Progression importée ✓';
    })
  );
  page.append(area, tr, msg);

  // Reset.
  page.append(h('h2', 'sect', 'Remettre à zéro'));
  page.append(
    button('Effacer ma progression', 'btn danger', () => {
      if (!confirm('Effacer toute ta progression sur cet appareil ? C’est définitif.')) return;
      app.setProgress(emptyProgress());
      app.go('#/');
    })
  );

  view.append(page);
  root.append(view);
  return () => {
    stopCal?.();
    view.remove();
  };
}

/** Clicks at 80 bpm; the median gap between click and key is the latency. */
function calibrate(app: App, box: HTMLElement, done: (ms: number | null) => void): () => void {
  // One shared audio context: iOS limits how many a page may open.
  const metro = app.metronome;
  if (!metro.unlock()) {
    box.textContent = 'Le son n’est pas disponible sur cet appareil.';
    done(null);
    return () => undefined;
  }
  const spb = 750;
  const t0 = performance.now() + 4 * spb + 200;
  const clickTimes: number[] = [];
  for (let b = -4; b < 8; b++) {
    const t = t0 + b * spb;
    metro.click(t, b === -4 || b === 0);
    if (b >= 0) clickTimes.push(t);
  }
  const gaps: number[] = [];
  box.textContent = 'Écoute… joue sur chaque clic après les 4 premiers.';
  const off = app.bus.on((e) => {
    if (!e.on) return;
    const near = clickTimes.reduce((a, t) => (Math.abs(t - e.time) < Math.abs(a - e.time) ? t : a), Infinity);
    if (Math.abs(near - e.time) < 350) gaps.push(e.time - near);
    box.textContent = `${gaps.length} / 8`;
  });
  const timer = window.setTimeout(() => {
    off();
    if (gaps.length < 5) {
      box.textContent = 'Pas assez de notes captées. Si tu n’entends pas les clics, utilise « Tester le son ».';
      done(null);
      return;
    }
    const s = [...gaps].sort((a, b) => a - b);
    const med = s[s.length >> 1];
    box.textContent = `Latence mesurée : ${Math.round(med)} ms ✓`;
    done(med);
  }, t0 + 8 * spb + 600 - performance.now());
  return () => {
    window.clearTimeout(timer);
    off();
  };
}

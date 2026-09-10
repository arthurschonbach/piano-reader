import { ScoreRenderer } from './engraver';
import { measureAt, totalBeats, type Score } from './model';

const I: Record<string, string> = {
  back: '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 19h4V5H6zm8-14v14h4V5z"/>',
  restart: '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>',
  prev: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>',
  next: '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>',
  loop: '<path d="M7 7h10v3l4-4-4-4v3H3v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2V17z"/>'
};
const svg = (name: string): string =>
  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${I[name]}</svg>`;

export interface PlayerOptions {
  root: HTMLElement;
  title: string;
  score: Score;
  ensure?: (untilBeat: number) => void;
  onExit: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, html?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function mountPlayer(o: PlayerOptions): () => void {
  const score = o.score;
  const root = el('div', 'player');

  const header = el('header', 'pbar top');
  const back = el('button', 'icon', svg('back'));
  back.title = 'Retour (Échap)';
  back.setAttribute('aria-label', 'Retour');
  const title = el('h1', undefined, o.title);
  const spacer = el('div', 'spacer');
  const namesLbl = el('label', 'chk');
  const namesChk = el('input') as HTMLInputElement;
  namesChk.type = 'checkbox';
  namesChk.checked = true;
  namesLbl.append(namesChk, document.createTextNode('Noms'));
  const lookLbl = el('label', 'chk', 'Fenêtre');
  const lookSel = el('select') as HTMLSelectElement;
  for (const [v, lbl] of [[1, '1 temps'], [2, '2 temps'], [4, '4 temps'], [8, '8 temps']] as const) {
    const opt = el('option');
    opt.value = String(v);
    opt.textContent = lbl;
    if (v === 2) opt.selected = true;
    lookSel.append(opt);
  }
  lookSel.setAttribute('aria-label', 'Fenêtre de lecture');
  const zoomSel = el('select') as HTMLSelectElement;
  for (const [v, lbl] of [[0.75, 'Petit'], [1, 'Normal'], [1.4, 'Grand']] as const) {
    const opt = el('option');
    opt.value = String(v);
    opt.textContent = lbl;
    if (v === 1) opt.selected = true;
    zoomSel.append(opt);
  }
  zoomSel.setAttribute('aria-label', 'Taille des notes');
  header.append(back, title, spacer, namesLbl, lookLbl, lookSel, zoomSel);

  const stage = el('div', 'stage');
  const canvas = el('canvas');
  const countin = el('div', 'countin');
  countin.append(
    el('div', 'ci-card', '<span class="ci-num"></span><span class="ci-lbl">Préparez-vous</span><div class="ci-dots"><i></i><i></i><i></i><i></i></div>')
  );
  const hint = el('div', 'hint', '▶ pour démarrer');
  stage.append(canvas, countin, hint);

  const footer = el('footer', 'pbar bottom');
  const tgroup = el('div', 'tgroup');
  const restartBtn = el('button', 'icon', svg('restart'));
  restartBtn.title = 'Recommencer (R)';
  restartBtn.setAttribute('aria-label', 'Recommencer');
  const prevM = el('button', 'icon', svg('prev'));
  prevM.title = 'Mesure précédente (←)';
  prevM.setAttribute('aria-label', 'Mesure précédente');
  const play = el('button', 'icon primary', svg('play'));
  play.title = 'Lecture / pause (Espace)';
  play.setAttribute('aria-label', 'Lecture / pause');
  const nextM = el('button', 'icon', svg('next'));
  nextM.title = 'Mesure suivante (→)';
  nextM.setAttribute('aria-label', 'Mesure suivante');
  tgroup.append(restartBtn, prevM, play, nextM);
  const progressEl = el('div', 'progress');
  const loop = el('button', 'icon toggle on', svg('loop'));
  loop.title = 'Boucle';
  loop.setAttribute('aria-label', 'Boucle');
  const tempoBox = el('div', 'tempo');
  const tdown = el('button', 'icon small', '−');
  const tempo = el('input') as HTMLInputElement;
  tempo.type = 'range';
  tempo.min = '30';
  tempo.max = '240';
  tempo.step = '1';
  tempo.value = String(Math.round(Math.min(240, Math.max(30, score.bpm))));
  tempo.setAttribute('aria-label', 'Tempo');
  const bpmLabel = el('span', 'bpm', `♩ = ${tempo.value}`);
  const tup = el('button', 'icon small', '+');
  tempoBox.append(tdown, tempo, bpmLabel, tup);
  footer.append(tgroup, progressEl, loop, tempoBox);
  root.append(header, stage, footer);
  o.root.append(root);

  const renderer = new ScoreRenderer(canvas);
  let beat = 0;
  let playing = false;
  let startedOnce = false;
  let countinLeft = 0;
  let countinShown = -1;
  let raf = 0;
  let last = 0;
  let bpm = parseFloat(tempo.value);

  const ciNum = countin.querySelector('.ci-num') as HTMLElement;
  const ciDots = [...countin.querySelectorAll('.ci-dots i')] as HTMLElement[];

  const total = () => (score.infinite ? Infinity : totalBeats(score));

  const resize = () => {
    const r = stage.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) renderer.resize(r.width, r.height);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const label = () => {
    const n = score.measures.length;
    if (!n) {
      progressEl.textContent = '…';
      return;
    }
    const i = measureAt(score, beat);
    progressEl.textContent = score.infinite ? `Mesure ${i + 1} · ∞` : `Mesure ${i + 1} / ${n}`;
  };

  const setPlaying = (p: boolean) => {
    playing = p;
    play.innerHTML = svg(playing ? 'pause' : 'play');
    if (playing && !startedOnce) {
      startedOnce = true;
      hint.classList.add('hide');
    }
  };

  const startCountin = () => {
    countinLeft = 4;
    countinShown = -1;
    countin.classList.add('show');
    hint.classList.add('hide');
  };

  const stopCountin = () => {
    countinLeft = 0;
    countin.classList.remove('show');
  };

  const doPlay = () => {
    if (beat <= 1e-6) startCountin();
    setPlaying(true);
  };

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      stopCountin();
    } else {
      const t = total();
      if (Number.isFinite(t) && beat >= t - 1e-4) beat = 0;
      doPlay();
    }
  };

  const restart = () => {
    beat = 0;
    if (playing) startCountin();
    else {
      stopCountin();
      hint.classList.remove('hide');
    }
  };

  const seekTo = (b: number) => {
    const t = total();
    beat = Number.isFinite(t) ? Math.max(0, Math.min(b, t - 1e-4)) : Math.max(0, b);
    stopCountin();
  };

  const stepMeasure = (dir: 1 | -1) => {
    const i = measureAt(score, beat);
    const target = i + dir;
    if (target >= 0 && target < score.measures.length) seekTo(score.measures[target].startBeat);
    else if (target < 0) seekTo(0);
  };

  const frame = (ts: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    if (playing) {
      if (countinLeft > 0) {
        countinLeft -= (dt * bpm) / 60;
        if (countinLeft <= 0) stopCountin();
      } else {
        beat += (dt * bpm) / 60;
        const t = total();
        if (Number.isFinite(t) && beat >= t) {
          if (loop.classList.contains('on')) {
            beat = 0;
            startCountin();
          } else {
            beat = t;
            setPlaying(false);
          }
        }
      }
    }
    if (o.ensure) o.ensure(beat + 40);
    if (countinLeft > 0) {
      const n = Math.ceil(countinLeft);
      if (n !== countinShown) {
        countinShown = n;
        ciNum.textContent = String(n);
        const done = 4 - n;
        ciDots.forEach((d, i) => d.classList.toggle('on', i < done));
        countin.classList.remove('pulse');
        void countin.offsetWidth;
        countin.classList.add('pulse');
      }
    }
    renderer.draw(score, { beat, lookahead: parseFloat(lookSel.value), names: namesChk.checked, zoom: parseFloat(zoomSel.value) });
    label();
  };
  raf = requestAnimationFrame(frame);

  canvas.addEventListener('click', (ev) => {
    const r = canvas.getBoundingClientRect();
    const b = renderer.beatAt(ev.clientX - r.left, beat);
    if (Number.isFinite(b)) seekTo(b);
  });

  const setBpm = (v: number) => {
    bpm = Math.max(30, Math.min(240, v));
    tempo.value = String(Math.round(bpm));
    bpmLabel.textContent = `♩ = ${Math.round(bpm)}`;
  };

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    if (ev.key === ' ' && ev.target instanceof HTMLButtonElement) return;
    switch (ev.key) {
      case ' ':
        ev.preventDefault();
        toggle();
        break;
      case 'ArrowLeft':
        ev.preventDefault();
        stepMeasure(-1);
        break;
      case 'ArrowRight':
        ev.preventDefault();
        stepMeasure(1);
        break;
      case 'r':
      case 'R':
        restart();
        break;
      case 'n':
      case 'N':
        namesChk.checked = !namesChk.checked;
        break;
      case '+':
      case '=':
        setBpm(bpm + 5);
        break;
      case '-':
        setBpm(bpm - 5);
        break;
      case 'Escape':
        o.onExit();
        break;
    }
  };

  play.addEventListener('click', toggle);
  restartBtn.addEventListener('click', restart);
  prevM.addEventListener('click', () => stepMeasure(-1));
  nextM.addEventListener('click', () => stepMeasure(1));
  back.addEventListener('click', o.onExit);
  loop.addEventListener('click', () => loop.classList.toggle('on'));
  tempo.addEventListener('input', () => setBpm(parseFloat(tempo.value)));
  tdown.addEventListener('click', () => setBpm(bpm - 5));
  tup.addEventListener('click', () => setBpm(bpm + 5));
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);
  resize();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    root.remove();
  };
}
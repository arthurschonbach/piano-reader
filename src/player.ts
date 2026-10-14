import { ScoreRenderer } from './engraver';
import { SoundEngine } from './audio';
import { measureAt, totalBeats, type Score } from './model';

export interface PlayerOptions {
  root: HTMLElement;
  title: string;
  score: Score;
  ensure?: (untilBeat: number) => void;
  practice?: boolean;
  persistKey?: string;
  onNew?: () => void;
  onStats?: (s: { bars: number; topTempo: number }) => void;
  onExit: () => void;
}

export interface SessionStats {
  bars: number;
  topTempo: number;
}

interface Prefs {
  sound: boolean;
  metro: boolean;
  large: boolean;
  mix: { guide: number; click: number };
  tempo: Record<string, number>;
}

const PREFS_KEY = 'piano-reader:prefs:v1';

function loadPrefs(): Prefs {
  const fallback: Prefs = { sound: true, metro: false, large: false, mix: { guide: 80, click: 60 }, tempo: {} };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Prefs>;
    const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d);
    return {
      sound: p.sound ?? true,
      metro: p.metro ?? false,
      large: p.large ?? false,
      mix: { guide: num(p.mix?.guide, 80), click: num(p.mix?.click, 60) },
      tempo: p.tempo && typeof p.tempo === 'object' ? (p.tempo as Record<string, number>) : {}
    };
  } catch {
    return fallback;
  }
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mountPlayer(o: PlayerOptions): () => void {
  const score = o.score;
  const finite = !score.infinite;
  const barCount = score.measures.length;
  const prefs = loadPrefs();
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // prefs are a nicety, not a requirement
    }
  };

  const root = h('div', 'player');

  const top = h('header', 'top');
  const back = h('button', 'btn quiet', '‹ Library');
  back.setAttribute('aria-label', 'Back to library');
  const titleBox = h('div', 'title-box');
  titleBox.append(h('div', 'ptitle', o.title), h('div', 'psub', o.practice ? 'Sight-reading · endless' : 'Your music'));
  const pos = h('div', 'pos');
  pos.setAttribute('aria-live', 'polite');
  top.append(back, titleBox, pos);

  const progress = h('div', 'progress');
  const progressFill = h('div', 'progress-fill');
  progress.append(progressFill);

  // Loop range bar (finite pieces only, shown while looping).
  const loop: { on: boolean; from: number; to: number } = { on: false, from: 0, to: Math.max(0, barCount - 1) };
  const loopBar = h('div', 'loopbar hidden');
  const loopFromVal = h('span', 'loop-val', '1');
  const loopToVal = h('span', 'loop-val', String(Math.max(1, barCount)));
  const loopTotal = h('span', 'loop-total', barCount === 1 ? '1 bar' : `of ${barCount} bars`);
  {
    const mk = (label: string, fn: () => void): HTMLButtonElement => {
      const b = h('button', 'btn step mini', label) as HTMLButtonElement;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      return b;
    };
    const setRange = (from: number, to: number) => {
      loop.from = Math.max(0, Math.min(from, loop.to));
      loop.to = Math.max(loop.from, Math.min(to, barCount - 1));
      loopFromVal.textContent = String(loop.from + 1);
      loopToVal.textContent = String(loop.to + 1);
    };
    loopBar.append(
      h('span', 'loop-label', 'Loop'),
      mk('− from', () => setRange(loop.from - 1, loop.to)),
      loopFromVal,
      mk('+ from', () => setRange(loop.from + 1, loop.to)),
      h('span', 'loop-dash', '–'),
      mk('− to', () => setRange(loop.from, loop.to - 1)),
      loopToVal,
      mk('+ to', () => setRange(loop.from, loop.to + 1)),
      loopTotal
    );
  }

  // Mixer panel (guide + metronome levels).
  const mixPanel = h('div', 'mixpanel hidden');
  const mkSlider = (label: string, value: number, on: (v: number) => void): void => {
    const row = h('label', 'mixrow');
    row.append(h('span', undefined, label));
    const s = h('input') as HTMLInputElement;
    s.type = 'range';
    s.min = '0';
    s.max = '100';
    s.value = String(value);
    s.setAttribute('aria-label', label);
    s.addEventListener('input', () => on(parseFloat(s.value)));
    row.append(s);
    mixPanel.append(row);
  };
  mkSlider('Guide notes', prefs.mix.guide, (v) => {
    prefs.mix.guide = v;
    engine.setLevels(v / 100, prefs.mix.click / 100);
    savePrefs();
  });
  mkSlider('Click', prefs.mix.click, (v) => {
    prefs.mix.click = v;
    engine.setLevels(prefs.mix.guide / 100, v / 100);
    savePrefs();
  });

  const stage = h('div', 'stage');
  const canvas = h('canvas') as HTMLCanvasElement;
  stage.append(canvas);

  const bottom = h('footer', 'bottom');
  const transport = h('div', 'tgroup');
  const restart = h('button', 'btn', 'Restart');
  restart.setAttribute('aria-label', 'Restart (R)');
  const prev = h('button', 'btn step', '‹');
  prev.setAttribute('aria-label', 'Previous bar');
  const play = h('button', 'btn primary play', 'Play');
  play.setAttribute('aria-label', 'Play or pause (Space)');
  const next = h('button', 'btn step', '›');
  next.setAttribute('aria-label', 'Next bar');
  transport.append(restart, prev, play, next);

  const tempoWrap = h('div', 'tempo-wrap');
  const tdown = h('button', 'btn step', '−');
  tdown.setAttribute('aria-label', 'Slower');
  const tempo = h('input') as HTMLInputElement;
  tempo.type = 'range';
  tempo.min = '30';
  tempo.max = '160';
  tempo.step = '1';
  const initialTempo = o.persistKey && prefs.tempo[o.persistKey]
    ? prefs.tempo[o.persistKey]
    : Math.round(Math.min(160, Math.max(30, score.bpm)));
  tempo.value = String(initialTempo);
  tempo.setAttribute('aria-label', 'Tempo');
  const tup = h('button', 'btn step', '+');
  tup.setAttribute('aria-label', 'Faster');
  const bpm = h('span', 'bpm', `${tempo.value} bpm`);
  tempoWrap.append(tdown, tempo, tup, bpm);

  const options = h('div', 'ogroup');
  const loopBtn = h('button', 'btn toggle', 'Loop');
  loopBtn.title = 'Loop a section, getting faster each pass (L)';
  loopBtn.setAttribute('aria-label', 'Toggle section loop');
  const soundBtn = h('button', 'btn toggle', 'Sound');
  soundBtn.title = 'Hear the notes while you play';
  soundBtn.setAttribute('aria-label', 'Toggle guide sound');
  const metroBtn = h('button', 'btn toggle', 'Click');
  metroBtn.title = 'Metronome';
  metroBtn.setAttribute('aria-label', 'Toggle metronome');
  const mixBtn = h('button', 'btn toggle', 'Mix');
  mixBtn.title = 'Balance guide notes and click';
  mixBtn.setAttribute('aria-label', 'Toggle mixer');
  mixBtn.setAttribute('aria-expanded', 'false');
  const namesBtn = h('button', 'btn toggle', 'A–G');
  namesBtn.title = 'Show note names';
  namesBtn.setAttribute('aria-label', 'Show note names (N)');
  const sizeBtn = h('button', 'btn toggle', 'Large');
  sizeBtn.title = 'Larger notation for the music stand';
  sizeBtn.setAttribute('aria-label', 'Toggle large notation');
  if (finite) options.append(loopBtn);
  options.append(soundBtn, metroBtn, mixBtn, namesBtn, sizeBtn);

  bottom.append(transport, tempoWrap, options);
  if (o.practice && o.onNew) {
    const fresh = h('button', 'btn new-page', 'New page');
    fresh.title = 'Fresh material at the same level';
    fresh.setAttribute('aria-label', 'New exercise page');
    fresh.addEventListener('click', () => o.onNew?.());
    bottom.append(fresh);
  }

  root.append(top, progress, loopBar, mixPanel, stage, bottom);
  o.root.append(root);

  const renderer = new ScoreRenderer(canvas);
  const engine = new SoundEngine();
  let beat = 0;
  let playing = false;
  let starting = false; // inside the count-in
  let waitUntil = 0;
  let showNames = false;
  let mixOpen = false;
  let large = prefs.large;
  let soundOn = prefs.sound;
  let metroOn = prefs.metro;
  let raf = 0;
  let last = 0;
  let speed = parseFloat(tempo.value);
  let maxBeat = 0;
  let maxSpeed = speed;
  let wakeLock: { release: () => Promise<void> } | null = null;

  const syncToggles = () => {
    loopBtn.classList.toggle('on', loop.on);
    soundBtn.classList.toggle('on', soundOn);
    metroBtn.classList.toggle('on', metroOn);
    mixBtn.classList.toggle('on', mixOpen);
    namesBtn.classList.toggle('on', showNames);
    sizeBtn.classList.toggle('on', large);
    loopBar.classList.toggle('hidden', !loop.on);
    mixPanel.classList.toggle('hidden', !mixOpen);
    mixBtn.setAttribute('aria-expanded', String(mixOpen));
  };
  syncToggles();

  const total = () => (score.infinite ? Infinity : totalBeats(score));
  const loopStartBeat = () => (loop.on && finite && barCount ? score.measures[loop.from].startBeat : 0);
  const loopEndBeat = () => {
    if (!loop.on || !finite || !barCount) return total();
    return loop.to + 1 < barCount ? score.measures[loop.to + 1].startBeat : totalBeats(score);
  };

  const resize = () => {
    const r = stage.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) renderer.resize(r.width, r.height);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const label = () => {
    if (!score.measures.length) {
      pos.textContent = '';
      progressFill.style.width = '0%';
      return;
    }
    if (starting) {
      const spbMs = (60 / speed) * 1000;
      const left = Math.max(1, Math.ceil((waitUntil - performance.now()) / spbMs));
      pos.textContent = `Ready · ${left}`;
      return;
    }
    const i = measureAt(score, beat);
    const loopTag = loop.on && finite ? ` · loop ${loop.from + 1}–${loop.to + 1}` : '';
    if (score.infinite) {
      pos.textContent = `Bar ${i + 1} · ∞`;
      progressFill.style.width = '0%';
    } else {
      pos.textContent = `Bar ${i + 1} of ${barCount}${loopTag}`;
      const t = total();
      progressFill.style.width = `${Math.max(0, Math.min(100, (beat / t) * 100))}%`;
    }
    bpm.textContent = `${Math.round(speed)} bpm`;
  };

  const lockScreen = async () => {
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (kind: string) => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock) wakeLock = await nav.wakeLock.request('screen');
    } catch {
      wakeLock = null;
    }
  };
  const unlockScreen = () => {
    try {
      void wakeLock?.release();
    } catch {
      // ignore
    }
    wakeLock = null;
  };

  const setPlaying = (p: boolean) => {
    playing = p;
    play.textContent = playing ? 'Pause' : 'Play';
    play.classList.toggle('playing', playing);
    if (playing) void lockScreen();
    else {
      engine.duck(true);
      window.setTimeout(() => engine.duck(false), 120);
      unlockScreen();
    }
  };

  const applyLevels = () => engine.setLevels(prefs.mix.guide / 100, prefs.mix.click / 100);

  const beginAudio = () => {
    engine.unlock();
    applyLevels();
    engine.reset(beat);
  };

  const doPlay = () => {
    const t = total();
    if (Number.isFinite(t) && beat >= t - 1e-4) beat = loopStartBeat();
    beginAudio();
    // Count-in when starting from the top with something to hear.
    if (beat < 0.05 && (soundOn || metroOn) && engine.ready) {
      const durSec = engine.countIn(speed);
      if (durSec > 0) {
        starting = true;
        waitUntil = performance.now() + durSec * 1000;
      }
    }
    setPlaying(true);
  };

  const toggle = () => {
    if (playing) {
      starting = false;
      setPlaying(false);
    } else {
      doPlay();
    }
  };

  const seekTo = (b: number) => {
    const t = total();
    beat = Number.isFinite(t) ? Math.max(0, Math.min(b, t - 1e-4)) : Math.max(0, b);
    starting = false;
    engine.reset(beat);
  };

  const stepMeasure = (dir: 1 | -1) => {
    const i = measureAt(score, beat);
    const target = i + dir;
    if (target >= 0 && target < score.measures.length) seekTo(score.measures[target].startBeat);
    else if (target < 0) seekTo(0);
  };

  /** Loop-ramp passes persist=false: only the player's own tempo is remembered. */
  const setSpeed = (v: number, persist = true) => {
    speed = Math.max(30, Math.min(160, v));
    maxSpeed = Math.max(maxSpeed, speed);
    tempo.value = String(Math.round(speed));
    bpm.textContent = `${Math.round(speed)} bpm`;
    if (persist && o.persistKey) {
      prefs.tempo[o.persistKey] = Math.round(speed);
      savePrefs();
    }
  };

  const frame = (ts: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    if (playing) {
      if (starting) {
        if (performance.now() >= waitUntil) {
          starting = false;
          engine.reset(beat);
        }
      } else {
        beat += (dt * speed) / 60;
        maxBeat = Math.max(maxBeat, beat);
        const end = loopEndBeat();
        if (beat >= end) {
          if (loop.on && finite) {
            // Loop trainer: restart the section a touch faster each pass.
            beat = loopStartBeat();
            engine.reset(beat);
            setSpeed(Math.min(160, speed + 4), false);
          } else if (Number.isFinite(total())) {
            beat = total();
            setPlaying(false);
          }
        }
      }
    }
    if (o.ensure) o.ensure(beat + 40);
    if (playing && !starting) engine.sync(beat, speed, score, { sound: soundOn, metronome: metroOn });
    renderer.draw(score, { beat, lookahead: 2, names: showNames, zoom: large ? 1.35 : 1 });
    label();
  };
  raf = requestAnimationFrame(frame);

  canvas.addEventListener('click', (ev) => {
    const r = canvas.getBoundingClientRect();
    const b = renderer.beatAt(ev.clientX - r.left, beat);
    if (Number.isFinite(b)) seekTo(b);
  });

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    if (ev.key === ' ') {
      ev.preventDefault();
      toggle();
    } else if (ev.key === 'ArrowLeft') stepMeasure(-1);
    else if (ev.key === 'ArrowRight') stepMeasure(1);
    else if (ev.key === 'r' || ev.key === 'R') seekTo(0);
    else if (ev.key === 'l' || ev.key === 'L') {
      if (finite) {
        loop.on = !loop.on;
        if (loop.on && (loop.from >= barCount || loop.to >= barCount)) {
          loop.from = 0;
          loop.to = Math.max(0, barCount - 1);
        }
        syncToggles();
      }
    } else if (ev.key === 'n' || ev.key === 'N') {
      showNames = !showNames;
      syncToggles();
    } else if (ev.key === 'Escape') o.onExit();
  };

  const onVisible = () => {
    // Re-acquire the wake lock if the tablet dozed while playing.
    if (playing && document.visibilityState === 'visible') void lockScreen();
  };

  play.addEventListener('click', toggle);
  restart.addEventListener('click', () => seekTo(0));
  prev.addEventListener('click', () => stepMeasure(-1));
  next.addEventListener('click', () => stepMeasure(1));
  back.addEventListener('click', o.onExit);
  loopBtn.addEventListener('click', () => {
    loop.on = !loop.on;
    syncToggles();
  });
  tdown.addEventListener('click', () => setSpeed(speed - 2));
  tup.addEventListener('click', () => setSpeed(speed + 2));
  tempo.addEventListener('input', () => setSpeed(parseFloat(tempo.value)));
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    if (soundOn) {
      engine.unlock();
      applyLevels();
    }
    savePrefs();
    syncToggles();
  });
  metroBtn.addEventListener('click', () => {
    metroOn = !metroOn;
    if (metroOn) {
      engine.unlock();
      applyLevels();
    }
    savePrefs();
    syncToggles();
  });
  mixBtn.addEventListener('click', () => {
    mixOpen = !mixOpen;
    syncToggles();
    resize();
  });
  namesBtn.addEventListener('click', () => {
    showNames = !showNames;
    syncToggles();
  });
  sizeBtn.addEventListener('click', () => {
    large = !large;
    prefs.large = large;
    savePrefs();
    syncToggles();
  });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisible);
  resize();

  return () => {
    cancelAnimationFrame(raf);
    o.onStats?.({
      bars: maxBeat <= 0 ? 0 : measureAt(score, maxBeat - 1e-4) + 1,
      topTempo: Math.round(maxSpeed)
    });
    ro.disconnect();
    engine.dispose();
    unlockScreen();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisible);
    root.remove();
  };
}

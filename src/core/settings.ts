import { DARK, LIGHT, setPalette } from './engraver';

export type ThemeChoice = 'auto' | 'light' | 'dark';

export interface Settings {
  theme: ThemeChoice;
  /** Bluetooth/audio delay measured by calibration, in ms (added to judge rhythm). */
  latencyMs: number;
  /** Latency was measured at least once. */
  calibrated: boolean;
  metronome: boolean;
  /** Ear training: play the phrases on the piano (MIDI) rather than on this device. */
  earOnPiano: boolean;
}

const KEY = 'piano-reader:settings:v1';
const DEFAULTS: Settings = { theme: 'auto', latencyMs: 0, calibrated: false, metronome: true, earOnPiano: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return {
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto',
      latencyMs: typeof s.latencyMs === 'number' && Number.isFinite(s.latencyMs) ? Math.max(-300, Math.min(400, s.latencyMs)) : 0,
      calibrated: s.calibrated ?? false,
      metronome: s.metronome ?? DEFAULTS.metronome,
      earOnPiano: s.earOnPiano ?? DEFAULTS.earOnPiano
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // settings are a nicety
  }
}

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function isDark(choice: ThemeChoice): boolean {
  return choice === 'dark' || (choice === 'auto' && !!media?.matches);
}

/** Apply the theme to the page and the score canvas. Returns true when dark. */
export function applyTheme(choice: ThemeChoice): boolean {
  const dark = isDark(choice);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  setPalette(dark ? DARK : LIGHT);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a1916' : '#fbfaf7');
  return dark;
}

/** Call fn when the system theme flips (only matters in 'auto'). */
export function onSystemTheme(fn: () => void): void {
  media?.addEventListener?.('change', fn);
}

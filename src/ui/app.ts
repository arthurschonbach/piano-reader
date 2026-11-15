import { Metronome } from '../core/audio';
import { applyTheme, isDark, loadSettings, onSystemTheme, saveSettings, type Settings } from '../core/settings';
import { NoteBus } from '../input/bus';
import { MidiManager } from '../input/midi';
import { loadProgress, saveProgress, type Progress } from '../progress/store';

/** Shared state for every screen. */
export interface App {
  bus: NoteBus;
  midi: MidiManager;
  metronome: Metronome;
  progress: Progress;
  setProgress(p: Progress): void;
  settings: Settings;
  setSettings(s: Settings): void;
  /** Flip between light and dark (leaves "auto"). */
  toggleTheme(): void;
  onTheme(fn: () => void): () => void;
  go(hash: string): void;
  /** Redraw the current screen (set by the router). */
  refresh(): void;
}

export function createApp(): App {
  const bus = new NoteBus();
  const themeListeners = new Set<() => void>();
  const fireTheme = () => {
    applyTheme(app.settings.theme);
    for (const fn of themeListeners) fn();
  };
  const app: App = {
    bus,
    midi: new MidiManager(bus),
    metronome: new Metronome(),
    progress: loadProgress(),
    setProgress(p) {
      app.progress = p;
      saveProgress(p);
    },
    settings: loadSettings(),
    setSettings(s) {
      const themeChanged = s.theme !== app.settings.theme;
      app.settings = s;
      saveSettings(s);
      if (themeChanged) fireTheme();
    },
    toggleTheme() {
      app.setSettings({ ...app.settings, theme: isDark(app.settings.theme) ? 'light' : 'dark' });
    },
    onTheme(fn) {
      themeListeners.add(fn);
      return () => themeListeners.delete(fn);
    },
    go(hash) {
      location.hash = hash;
    },
    refresh() {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  };
  applyTheme(app.settings.theme);
  onSystemTheme(() => {
    if (app.settings.theme === 'auto') fireTheme();
  });
  return app;
}

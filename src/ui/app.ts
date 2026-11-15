import { NoteBus } from '../input/bus';
import { MidiManager } from '../input/midi';
import { loadProgress, saveProgress, type Progress } from '../progress/store';

/** Shared state for every screen. */
export interface App {
  bus: NoteBus;
  midi: MidiManager;
  progress: Progress;
  setProgress(p: Progress): void;
  go(hash: string): void;
}

export function createApp(): App {
  const bus = new NoteBus();
  const app: App = {
    bus,
    midi: new MidiManager(bus),
    progress: loadProgress(),
    setProgress(p) {
      app.progress = p;
      saveProgress(p);
    },
    go(hash) {
      location.hash = hash;
    }
  };
  return app;
}

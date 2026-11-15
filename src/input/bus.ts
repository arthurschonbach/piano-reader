/** A note pressed or released, from any source (MIDI piano, on-screen keys, tests). */
export interface NoteEvent {
  midi: number;
  on: boolean;
  velocity: number;
  /** performance.now() timebase, in ms. */
  time: number;
}

export type NoteListener = (e: NoteEvent) => void;

/**
 * Every input source pushes into one bus; exercises listen to it.
 * The bus also tracks which keys are held, so chords can be matched.
 */
export class NoteBus {
  private listeners = new Set<NoteListener>();
  readonly held = new Set<number>();

  emit(e: NoteEvent): void {
    if (e.on) this.held.add(e.midi);
    else this.held.delete(e.midi);
    for (const fn of this.listeners) fn(e);
  }

  on(fn: NoteListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Forget held keys (e.g. after a device disconnects mid-note). */
  releaseAll(time: number): void {
    for (const midi of [...this.held]) this.emit({ midi, on: false, velocity: 0, time });
  }
}

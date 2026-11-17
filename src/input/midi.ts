import type { NoteBus, NoteEvent } from './bus';

/** Decode one raw MIDI message. Pure, so it can be unit tested. */
export function parseMidi(data: ArrayLike<number>, time: number): NoteEvent | null {
  if (data.length < 3) return null;
  const kind = data[0] & 0xf0;
  const midi = data[1] & 0x7f;
  const velocity = data[2] & 0x7f;
  if (kind === 0x90 && velocity > 0) return { midi, on: true, velocity, time };
  if (kind === 0x80 || (kind === 0x90 && velocity === 0)) return { midi, on: false, velocity: 0, time };
  return null;
}

export type MidiStatus =
  | { state: 'unsupported' }
  | { state: 'idle' }
  | { state: 'asking' }
  | { state: 'denied' }
  | { state: 'ready'; devices: string[] };

interface MidiPortLike {
  id: string;
  name?: string | null;
  state?: string;
  onmidimessage: ((ev: { data: Uint8Array; timeStamp: number }) => void) | null;
}

interface MidiOutLike {
  name?: string | null;
  state?: string;
  send(data: number[], timestamp?: number): void;
  open?: () => Promise<unknown>;
}

interface MidiAccessLike {
  inputs: { forEach(cb: (port: MidiPortLike) => void): void };
  outputs?: { forEach(cb: (port: MidiOutLike) => void): void };
  onstatechange: (() => void) | null;
}

type RequestMidi = (opts?: { sysex?: boolean }) => Promise<MidiAccessLike>;

function requestFn(): RequestMidi | null {
  const nav = navigator as unknown as { requestMIDIAccess?: RequestMidi };
  return typeof nav.requestMIDIAccess === 'function' ? nav.requestMIDIAccess.bind(navigator) : null;
}

/**
 * Connects every MIDI input (the FP-10 over USB) to the note bus.
 * iPad/iPhone browsers have no Web MIDI: status stays 'unsupported'.
 */
export class MidiManager {
  status: MidiStatus;
  private access: MidiAccessLike | null = null;
  /** MIDI outputs, to play notes on the piano (ear training). All of them get the notes. */
  private outs: MidiOutLike[] = [];
  private timers = new Set<number>();
  private listeners = new Set<(s: MidiStatus) => void>();

  constructor(private bus: NoteBus) {
    this.status = requestFn() ? { state: 'idle' } : { state: 'unsupported' };
    // iPad "Web MIDI" browsers (MIDIWeb Browser…) may inject the API after the
    // page scripts run: look again a few times before giving up.
    if (this.status.state === 'unsupported' && typeof window !== 'undefined') {
      let tries = 0;
      const timer = window.setInterval(() => {
        if (requestFn()) {
          window.clearInterval(timer);
          this.set({ state: 'idle' });
          void this.restore();
        } else if (++tries >= 10) window.clearInterval(timer);
      }, 300);
    }
  }

  onChange(fn: (s: MidiStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get connected(): boolean {
    return this.status.state === 'ready' && this.status.devices.length > 0;
  }

  /** Reconnect silently if the permission was granted on an earlier visit. */
  async restore(): Promise<void> {
    if (this.status.state !== 'idle') return;
    try {
      const perms = navigator.permissions as Permissions | undefined;
      const p = await perms?.query({ name: 'midi' as PermissionName });
      if (p?.state === 'granted') await this.request();
    } catch {
      // permissions API without 'midi': wait for the button
    }
  }

  async request(): Promise<void> {
    const req = requestFn();
    if (!req) return;
    if (this.access) return this.refresh();
    this.set({ state: 'asking' });
    try {
      this.access = await req({ sysex: false });
      this.access.onstatechange = () => this.refresh();
      this.refresh();
    } catch {
      this.set({ state: 'denied' });
    }
  }

  private refresh(): void {
    if (!this.access) return;
    const devices: string[] = [];
    this.access.inputs.forEach((port) => {
      if (port.state === 'disconnected') return;
      devices.push(port.name || 'Clavier MIDI');
      port.onmidimessage = (ev) => {
        const e = parseMidi(ev.data, ev.timeStamp || performance.now());
        if (e) this.bus.emit(e);
      };
    });
    if (!devices.length) this.bus.releaseAll(performance.now());
    this.outs = [];
    this.access.outputs?.forEach((port) => {
      if (port.state === 'disconnected' || typeof port.send !== 'function') return;
      this.outs.push(port);
      // Opening is implicit on send, but some Android stacks only deliver once opened.
      void port.open?.().catch(() => undefined);
    });
    this.set({ state: 'ready', devices });
  }

  /** True when there is somewhere to send notes to. */
  get canPlay(): boolean {
    return this.connected && this.outs.length > 0;
  }

  /** Names of the MIDI outputs found (for the sound test in the settings). */
  get outputNames(): string[] {
    return this.outs.map((o) => o.name || 'Sortie MIDI');
  }

  private sendNow(data: number[]): boolean {
    let ok = false;
    for (const o of this.outs) {
      try {
        // No timestamp: some Bluetooth stacks drop messages scheduled in the future.
        o.send(data);
        ok = true;
      } catch {
        // this output refused: try the others
      }
    }
    return ok;
  }

  /** Play a note on the piano: on at `atMs`, off `durMs` later (performance.now clock). */
  playNote(midi: number, atMs: number, durMs: number, velocity = 64): boolean {
    if (!this.outs.length) return false;
    const at = (ms: number, data: number[]) => {
      const id = window.setTimeout(() => {
        this.timers.delete(id);
        this.sendNow(data);
      }, Math.max(0, ms - performance.now()));
      this.timers.add(id);
    };
    at(atMs, [0x90, midi, velocity]);
    at(atMs + durMs, [0x80, midi, 0]);
    return true;
  }

  /** Stop everything scheduled and silence the piano (leaving a screen). */
  stopNotes(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    // All notes off, channel 1.
    this.sendNow([0xb0, 123, 0]);
  }

  private set(s: MidiStatus): void {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }
}

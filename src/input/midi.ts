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

/** A list of ports: a Map in browsers, but bridges (iPad MIDI browsers) may hand an array or a plain object. */
type PortList<T> = { forEach?: (cb: (port: T) => void) => void; values?: () => Iterable<T> } | T[] | Record<string, T>;

interface MidiAccessLike {
  inputs: PortList<MidiPortLike>;
  outputs?: PortList<MidiOutLike>;
  onstatechange: (() => void) | null;
}

/** Every port of a list, whatever shape the list has. */
export function portsOf<T>(list: PortList<T> | undefined | null): T[] {
  if (!list) return [];
  try {
    if (Array.isArray(list)) return list;
    const l = list as { forEach?: (cb: (port: T) => void) => void; values?: () => Iterable<T> };
    if (typeof l.forEach === 'function') {
      const out: T[] = [];
      l.forEach((p: T) => out.push(p));
      return out;
    }
    if (typeof l.values === 'function') return [...l.values()];
    return Object.values(list as Record<string, T>);
  } catch {
    return [];
  }
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
    } catch {
      // Only a refused request means "denied": a problem afterwards is ours, not the user's.
      this.set({ state: 'denied' });
      return;
    }
    try {
      this.access.onstatechange = () => this.refresh();
    } catch {
      // read-only on some bridges: reconnecting then needs the button
    }
    this.refresh();
  }

  private refresh(): void {
    if (!this.access) return;
    const devices: string[] = [];
    for (const port of portsOf(this.access.inputs)) {
      if (port.state === 'disconnected') continue;
      devices.push(port.name || 'Clavier MIDI');
      port.onmidimessage = (ev) => {
        const e = parseMidi(ev.data, ev.timeStamp || performance.now());
        if (e) this.bus.emit(e);
      };
    }
    if (!devices.length) this.bus.releaseAll(performance.now());
    // Outputs are a bonus (ear training): whatever happens here must not cost the input.
    this.outs = [];
    for (const port of portsOf(this.access.outputs)) {
      if (port.state === 'disconnected' || typeof port.send !== 'function') continue;
      this.outs.push(port);
      try {
        // Opening is implicit on send, but some Android stacks only deliver once opened.
        const opened = port.open?.() as unknown;
        if (opened && typeof (opened as Promise<unknown>).catch === 'function') (opened as Promise<unknown>).catch(() => undefined);
      } catch {
        // a bridge without a working open(): sending still opens the port
      }
    }
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

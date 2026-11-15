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

interface MidiAccessLike {
  inputs: { forEach(cb: (port: MidiPortLike) => void): void };
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
    this.set({ state: 'ready', devices });
  }

  private set(s: MidiStatus): void {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }
}

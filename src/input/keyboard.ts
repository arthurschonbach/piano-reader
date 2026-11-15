import type { NoteBus } from './bus';
import { noteName, spellOfMidi } from '../core/model';

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * On-screen piano keys: the fallback when no MIDI piano is connected
 * (iPad, or the phone without its cable). Each key carries data-midi.
 */
export function mountKeyboard(root: HTMLElement, bus: NoteBus, lo: number, hi: number): () => void {
  const wrap = document.createElement('div');
  wrap.className = 'kbd';
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const ww = 100 / whites.length;
  const down = new Map<number, number>();

  const press = (key: HTMLElement, midi: number, pointer: number) => {
    down.set(pointer, midi);
    key.classList.add('down');
    bus.emit({ midi, on: true, velocity: 80, time: performance.now() });
  };
  const release = (pointer: number) => {
    const midi = down.get(pointer);
    if (midi === undefined) return;
    down.delete(pointer);
    wrap.querySelector(`[data-midi="${midi}"]`)?.classList.remove('down');
    bus.emit({ midi, on: false, velocity: 0, time: performance.now() });
  };

  for (let m = lo; m <= hi; m++) {
    const black = BLACK.has(m % 12);
    const key = document.createElement('button');
    key.type = 'button';
    key.className = black ? 'key black' : 'key white';
    key.dataset.midi = String(m);
    const name = noteName(spellOfMidi(m));
    key.setAttribute('aria-label', name);
    if (!black) {
      const i = whites.indexOf(m);
      key.style.left = `${i * ww}%`;
      key.style.width = `${ww}%`;
      // Octave numbers on the Cs, so C4 (middle C) is easy to find.
      if (m % 12 === 0) key.textContent = `C${m / 12 - 1}`;
    } else {
      const i = whites.indexOf(m - 1);
      key.style.left = `${(i + 1) * ww - ww * 0.3}%`;
      key.style.width = `${ww * 0.6}%`;
    }
    key.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      try {
        key.setPointerCapture?.(ev.pointerId);
      } catch {
        // synthetic or already-gone pointer: the press still counts
      }
      press(key, m, ev.pointerId);
    });
    key.addEventListener('pointerup', (ev) => release(ev.pointerId));
    key.addEventListener('pointercancel', (ev) => release(ev.pointerId));
    wrap.append(key);
  }
  root.append(wrap);
  return () => {
    for (const p of [...down.keys()]) release(p);
    wrap.remove();
  };
}

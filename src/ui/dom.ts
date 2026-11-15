export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Keep the screen awake while a phone sits on the music stand. */
export function keepAwake(): () => void {
  let lock: { release: () => Promise<void> } | null = null;
  let alive = true;
  const nav = navigator as unknown as { wakeLock?: { request: (k: string) => Promise<{ release: () => Promise<void> }> } };
  const grab = async () => {
    try {
      if (alive && nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
    } catch {
      lock = null;
    }
  };
  const onVis = () => void grab();
  document.addEventListener('visibilitychange', onVis);
  void grab();
  return () => {
    alive = false;
    document.removeEventListener('visibilitychange', onVis);
    void lock?.release().catch(() => undefined);
  };
}

/** Rounded down, so 94.7 % never shows as a passing 95 %. */
export const percent = (x: number): string => `${Math.floor(x * 100 + 1e-9)} %`;
export const seconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

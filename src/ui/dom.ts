import { isDark } from '../core/settings';
import type { App } from './app';

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

/** Sun/moon button that flips the theme. */
export function themeButton(app: App): HTMLButtonElement {
  const b = button('', 'btn icon theme-toggle', () => app.toggleTheme());
  let off: () => void = () => undefined;
  const sync = () => {
    // Screens are rebuilt on navigation: drop the listener once the button is gone.
    if (b.dataset.mounted && !b.isConnected) return off();
    if (b.isConnected) b.dataset.mounted = '1';
    const dark = isDark(app.settings.theme);
    b.textContent = dark ? '☀︎' : '☾';
    b.setAttribute('aria-label', dark ? 'Passer en thème clair' : 'Passer en thème sombre');
    b.title = b.getAttribute('aria-label')!;
  };
  sync();
  off = app.onTheme(sync);
  requestAnimationFrame(() => {
    if (b.isConnected) b.dataset.mounted = '1';
  });
  return b;
}

/** Keep the screen awake while the device sits on the music stand. */
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

export interface StatLine {
  value: string;
  label: string;
  ok?: boolean;
}

export interface CardAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

/** The end-of-exercise card: headline, figures, remarks, buttons. */
export function resultCard(o: { title: string; stats: StatLine[]; notes?: string[]; list?: { heading: string; items: string[] }; actions: CardAction[]; celebrate?: string }): HTMLElement {
  const card = h('div', 'card results');
  card.append(h('h2', undefined, o.title));
  if (o.celebrate) card.append(h('p', 'celebrate', o.celebrate));
  if (o.stats.length) {
    const grid = h('div', 'stats');
    for (const s of o.stats) {
      const el = h('div', `stat${s.ok === undefined ? '' : s.ok ? ' good' : ' bad'}`);
      el.append(h('div', 'v', s.value), h('div', 'l', s.label));
      grid.append(el);
    }
    card.append(grid);
  }
  for (const n of o.notes ?? []) card.append(h('p', 'note', n));
  if (o.list && o.list.items.length) {
    const ul = h('ul', 'conf');
    for (const it of o.list.items) ul.append(h('li', undefined, it));
    card.append(h('h3', undefined, o.list.heading), ul);
  }
  const actions = h('div', 'actions');
  for (const a of o.actions) actions.append(button(a.label, a.primary ? 'btn primary big' : 'btn', a.onClick));
  card.append(actions);
  return card;
}

/** Top bar used by every inner screen. */
export function topBar(app: App, title: string, onBack: () => void, extra?: HTMLElement): HTMLElement {
  const bar = h('header', 'topbar');
  const back = button('‹', 'btn quiet back', onBack);
  back.setAttribute('aria-label', 'Retour');
  bar.append(back, h('div', 'tb-title', title));
  if (extra) bar.append(extra);
  bar.append(themeButton(app));
  return bar;
}

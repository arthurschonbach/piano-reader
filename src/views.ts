import { keyLabel, type Hands, type KeyId, type Level } from './generator';
import { parseMusicXml } from './musicxml';
import type { Score } from './model';
import type { PracticeStat } from './stats';

export interface LibraryItem {
  id: string;
  title: string;
  detail: string;
  score: Score;
}

export interface PracticeChoice {
  hands: Hands;
  level: Level;
  key: KeyId;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function describeScore(s: Score): string {
  if (s.infinite) return 'Endless practice';
  const bars = s.measures.length;
  return bars === 1 ? '1 bar' : `${bars} bars`;
}

export function renderHome(
  root: HTMLElement,
  items: LibraryItem[],
  stats: PracticeStat[],
  cb: {
    onOpen: (it: LibraryItem) => void;
    onRemove: (it: LibraryItem) => void;
    onImport: (score: Score) => void;
    onPractice: (choice: PracticeChoice) => void;
  }
): void {
  root.innerHTML = '';
  const page = h('div', 'page');
  page.append(
    h('h1', 'title', 'Piano Reader'),
    h('p', 'sub', 'Play your scores. Train your reading.')
  );

  // --- Your music ---
  page.append(h('h2', 'sect', 'Your music'));
  const list = h('div', 'list');
  const redraw = () => {
    list.innerHTML = '';
    if (!items.length) {
      list.append(h('p', 'empty', 'Nothing here yet. Import a MusicXML file to start playing.'));
    }
    for (const it of items) {
      const row = h('div', 'row');
      const meta = h('div', 'meta');
      meta.append(h('div', 't', it.title), h('div', 'd', it.detail));
      const open = h('button', 'btn', 'Open');
      open.addEventListener('click', () => cb.onOpen(it));
      row.append(meta, open);
      if (!it.id.startsWith('built-in')) {
        const del = h('button', 'btn quiet', 'Remove');
        del.addEventListener('click', () => cb.onRemove(it));
        row.append(del);
      }
      list.append(row);
    }
  };
  redraw();
  page.append(list);

  const err = h('div', 'err');
  err.setAttribute('role', 'alert');
  const file = h('input') as HTMLInputElement;
  file.type = 'file';
  file.accept = '.musicxml,.xml,.mxl';
  file.hidden = true;

  const handleFile = async (f: File) => {
    err.textContent = '';
    try {
      const score = await parseMusicXml(f);
      cb.onImport(score);
    } catch (e) {
      err.textContent = `Could not import that file: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';
    if (f) void handleFile(f);
  });

  const importBtn = h('button', 'btn', 'Import MusicXML');
  importBtn.addEventListener('click', () => file.click());
  const dropHint = h('span', 'hint-inline', 'or drop a file anywhere on this page');
  const impRow = h('div', 'import-row');
  impRow.append(importBtn, dropHint, file);
  page.append(impRow, err);

  // Drag and drop across the page, with a subtle overlay.
  const overlay = h('div', 'drop-overlay', 'Drop to import');
  page.append(overlay);
  let dragDepth = 0;
  page.addEventListener('dragenter', (ev) => {
    ev.preventDefault();
    dragDepth++;
    page.classList.add('dragging');
  });
  page.addEventListener('dragover', (ev) => ev.preventDefault());
  page.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) page.classList.remove('dragging');
  });
  page.addEventListener('drop', (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    page.classList.remove('dragging');
    const f = ev.dataTransfer?.files?.[0];
    if (f) void handleFile(f);
  });

  // --- Sight-reading ---
  page.append(h('h2', 'sect', 'Sight-reading'));
  page.append(h('p', 'note', 'Endless exercises, written for your level. Nothing is saved — just read and play.'));
  const form = h('div', 'form');
  const mkSel = <T extends string>(label: string, opts: [T, string][], init: T, on: (v: T) => void): void => {
    const lab = h('label', 'fld');
    lab.append(h('span', undefined, label));
    const sel = h('select') as HTMLSelectElement;
    for (const [v, l] of opts) {
      const o = h('option') as HTMLOptionElement;
      o.value = v;
      o.textContent = l;
      sel.append(o);
    }
    sel.value = init;
    sel.addEventListener('change', () => on(sel.value as T));
    lab.append(sel);
    form.append(lab);
  };
  const choice: PracticeChoice = { hands: 'right', level: 1, key: 'C' };
  mkSel<Hands>(
    'Hand',
    [
      ['right', 'Right'],
      ['left', 'Left'],
      ['both', 'Both']
    ],
    choice.hands,
    (v) => (choice.hands = v)
  );
  mkSel<string>(
    'Level',
    [
      ['1', '1 · Whole + half notes'],
      ['2', '2 · Quarter notes'],
      ['3', '3 · Eighth notes']
    ],
    '1',
    (v) => (choice.level = parseInt(v, 10) as Level)
  );
  mkSel<KeyId>(
    'Key',
    (['C', 'G', 'F', 'Am'] as KeyId[]).map((k): [KeyId, string] => [k, keyLabel(k)]),
    choice.key,
    (v) => (choice.key = v)
  );
  const start = h('button', 'btn primary', 'Start reading');
  start.addEventListener('click', () => cb.onPractice({ ...choice }));
  form.append(start);
  page.append(form);
  page.append(h('p', 'tip', 'Tip: one slow, clean pass beats three fast ones.'));

  if (stats.length) {
    page.append(h('h2', 'sect', 'Progress'));
    const plist = h('div', 'list');
    for (const s of stats) {
      const row = h('div', 'row slim');
      const meta = h('div', 'meta');
      meta.append(h('div', 't', s.label));
      const bits = [`${s.sessions} ${s.sessions === 1 ? 'session' : 'sessions'}`, `${s.bars} bars`];
      if (s.topTempo > 0) bits.push(`up to ${s.topTempo} bpm`);
      meta.append(h('div', 'd', bits.join(' · ')));
      row.append(meta);
      plist.append(row);
    }
    page.append(plist);
  }

  root.append(page);
}

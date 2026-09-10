import { HAND } from './engraver';
import { makeDemoScore } from './demo';
import { keyOf, makeGeneratorScore, type GenConfig, type GenScore } from './generator';
import { parseMusicXml } from './musicxml';
import type { Score } from './model';

export const MIDI_LO = 36;
export const MIDI_HI = 84;

const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export interface HomeCallbacks {
  onScore: (s: Score) => void;
  onGenerate: () => void;
}

export function renderHome(root: HTMLElement, cb: HomeCallbacks): void {
  const home = el('div', 'home');
  const header = el('header', 'home-head');
  header.append(
    el('h1', undefined, '🎹 Piano Reader'),
    el('p', undefined, 'Lire et jouer : tempo réglable, défilement continu sans coupure, indicateur visuel de progression.')
  );
  const cards = el('div', 'cards');

  const importCard = el('button', 'card big', '<span>📂</span><b>Importer une partition</b><small>MusicXML (.musicxml, .xml, .mxl)</small>');
  const demoCard = el('button', 'card big', '<span>🎹</span><b>Partition démo</b><small>Ah ! vous dirai-je maman</small>');
  const genCard = el('button', 'card big', '<span>🎲</span><b>Générateur infini</b><small>Choisissez les notes de chaque main</small>');
  cards.append(importCard, demoCard, genCard);

  const drop = el('div', 'drop', '…ou glissez-déposez un fichier ici');
  const err = el('div', 'error');
  const file = el('input') as HTMLInputElement;
  file.type = 'file';
  file.accept = '.musicxml,.xml,.mxl';
  file.hidden = true;

  const handleFile = async (f: File) => {
    err.textContent = '';
    try {
      const score = await parseMusicXml(f);
      cb.onScore(score);
    } catch (e) {
      err.textContent = `Import impossible : ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  importCard.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    if (file.files?.[0]) void handleFile(file.files[0]);
    file.value = '';
  });
  demoCard.addEventListener('click', () => cb.onScore(makeDemoScore()));
  genCard.addEventListener('click', () => cb.onGenerate());
  genCard.addEventListener('click', () => cb.onGenerate());

  const onDragOver = (ev: DragEvent) => {
    ev.preventDefault();
    drop.classList.add('over');
  };
  const onDragLeave = () => drop.classList.remove('over');
  const onDrop = (ev: DragEvent) => {
    ev.preventDefault();
    drop.classList.remove('over');
    const f = ev.dataTransfer?.files?.[0];
    if (f) void handleFile(f);
  };
  home.addEventListener('dragover', onDragOver);
  home.addEventListener('dragleave', onDragLeave);
  home.addEventListener('drop', onDrop);

  home.append(header, cards, drop, err, file);
  root.append(home);
}

export function renderGenerator(root: HTMLElement, onPlay: (g: GenScore) => void): void {
  const cfg: GenConfig = {
    rh: { enabled: true, notes: [60, 62, 64, 65, 67], level: 2, long: 2, chords: 3 },
    lh: { enabled: true, notes: [48, 50, 52, 53, 55], level: 1, long: 2, chords: 3 },
    time: [4, 4],
    bpm: 80,
    seed: Math.floor(Math.random() * 1e9)
  };

  const wrap = el('div', 'gen');
  const head = el('header', 'gen-head');
  const back = el('button', 'icon', '←');
  back.addEventListener('click', () => (location.hash = '#/'));
  head.append(back, el('h1', undefined, 'Générateur infini'));

  const err = el('div', 'error');

  const handCard = (h: 0 | 1): HTMLElement => {
    const hand = h === 0 ? cfg.rh : cfg.lh;
    const card = el('section', 'hand');
    const top = el('div', 'hand-top');
    const name = el('h2', undefined, h === 0 ? '🖐 Main droite' : '🖐 Main gauche');
    name.style.color = HAND[h];
    const on = el('label', 'chk');
    const onChk = el('input') as HTMLInputElement;
    onChk.type = 'checkbox';
    onChk.checked = hand.enabled;
    on.append(onChk, document.createTextNode('Active'));
    top.append(name, on);
    card.append(top);

    const flds = el('div', 'flds');
    const mkField = (lbl: string, options: [string, string][], initial: string, onchange: (v: string) => void) => {
      const f = el('label', 'fld');
      f.append(el('span', undefined, lbl));
      const sel = el('select') as HTMLSelectElement;
      for (const [v, oLbl] of options) {
        const o = el('option');
        o.value = v;
        o.textContent = oLbl;
        if (v === initial) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => onchange(sel.value));
      f.append(sel);
      flds.append(f);
    };
    mkField('Rythme', [['1', 'Noires'], ['2', '+ Croches'], ['3', '+ Doubles'], ['4', 'Dense']], String(hand.level), (v) => (hand.level = parseInt(v)));
    mkField('Notes longues', [['0', 'Courtes'], ['2', '+ Blanches'], ['4', 'Blanches et rondes']], String(hand.long ?? 2), (v) => (hand.long = parseInt(v) as 0 | 2 | 4));
    mkField('Accords', [['0', 'Aucun'], ['3', 'Triades'], ['4', 'Triades + 7ᵉ']], String(hand.chords ?? 0), (v) => (hand.chords = parseInt(v) as 0 | 3 | 4));

    const kb = el('canvas', 'keys');
    const KW = 22;
    const KH = 96;
    const whites: number[] = [];
    for (let m = MIDI_LO; m <= MIDI_HI; m++) if (WHITE_PC.has(((m % 12) + 12) % 12)) whites.push(m);
    kb.width = whites.length * KW;
    kb.height = KH;

    const octs = el('div', 'octs');
    const chipRefresh: (() => void)[] = [];
    const octChip = (oct: number): void => {
      const lo = (oct + 1) * 12;
      const notes = Array.from({ length: 12 }, (_, i) => lo + i).filter((n) => n >= MIDI_LO && n <= MIDI_HI);
      const b = el('button', 'chip oct', `Oct ${oct}`);
      b.title = `Toutes les notes de l'octave ${oct}`;
      const refresh = () => b.classList.toggle('on', notes.every((n) => hand.notes.includes(n)));
      b.addEventListener('click', () => {
        const full = notes.every((n) => hand.notes.includes(n));
        if (full) hand.notes = hand.notes.filter((n) => !notes.includes(n));
        else hand.notes = [...new Set([...hand.notes, ...notes])];
        drawKb();
      });
      chipRefresh.push(refresh);
      octs.append(b);
    };
    [2, 3, 4, 5].forEach(octChip);
    octs.append(el('span', 'octs-hint', '— cliquez pour tout l\'octave, touchez le clavier pour affiner'));

    const drawKb = () => {
      const ctx = kb.getContext('2d')!;
      ctx.clearRect(0, 0, kb.width, kb.height);
      const set = new Set(hand.notes);
      ctx.strokeStyle = '#94a3b8';
      whites.forEach((midi, i) => {
        const sel = set.has(midi);
        ctx.fillStyle = sel ? HAND[h] : '#ffffff';
        ctx.fillRect(i * KW + 1, 1, KW - 2, KH - 2);
        if (sel) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '600 9px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(NOTE_NAMES[midi % 12], i * KW + KW / 2, KH - 5);
        }
        ctx.strokeRect(i * KW + 0.5, 0.5, KW, KH);
      });
      for (let i = 0; i < whites.length - 1; i++) {
        const pc = ((whites[i] % 12) + 12) % 12;
        if (WHITE_PC.has(pc) && [0, 2, 5, 7, 9].includes(pc)) {
          const midi = whites[i] + 1;
          if (midi > MIDI_HI) continue;
          const sel = set.has(midi);
          const bx = (i + 1) * KW;
          ctx.fillStyle = sel ? HAND[h] : '#1e293b';
          ctx.fillRect(bx - 7, 0, 14, KH * 0.62);
          if (sel) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bx - 1, 0, 2, KH * 0.62);
          }
          ctx.strokeStyle = '#0f172a';
          ctx.strokeRect(bx - 7 + 0.5, 0.5, 14, KH * 0.62);
        }
      }
      for (const r of chipRefresh) r();
      keyLbl.textContent = `Tonalité : ${keyOf(cfg)}`;
    };
    drawKb();

    const hit = (ev: MouseEvent): number | null => {
      const r = kb.getBoundingClientRect();
      const x = (ev.clientX - r.left) * (kb.width / r.width);
      const y = (ev.clientY - r.top) * (kb.height / r.height);
      const blackTop = KH * 0.62;
      if (y < blackTop) {
        for (let i = Math.max(0, Math.floor(x / KW) - 1); i <= Math.min(whites.length - 1, Math.floor(x / KW) + 1); i++) {
          const pc = ((whites[i] % 12) + 12) % 12;
          if ([0, 2, 5, 7, 9].includes(pc)) {
            const bx = (i + 1) * KW;
            if (x >= bx - 8 && x <= bx + 8) {
              const midi = whites[i] + 1;
              if (midi <= MIDI_HI) return midi;
            }
          }
        }
        return null;
      }
      const idx = Math.floor(x / KW);
      return idx >= 0 && idx < whites.length ? whites[idx] : null;
    };

    kb.addEventListener('click', (ev) => {
      const m = hit(ev as MouseEvent);
      if (m === null) return;
      const i = hand.notes.indexOf(m);
      if (i >= 0) hand.notes.splice(hand.notes.indexOf(m), 1);
      else hand.notes.push(m);
      drawKb();
    });

    const presets = el('div', 'presets');
    const mkPreset = (lbl: string, fn: () => void) => {
      const b = el('button', 'chip', lbl);
      b.addEventListener('click', () => {
        fn();
        drawKb();
      });
      presets.append(b);
    };
    mkPreset('5 doigts', () => {
      const base = h === 0 ? 60 : 48;
      hand.notes = [base, base + 2, base + 4, base + 5, base + 7];
    });
    mkPreset('Gamme C (2 oct.)', () => {
      const base = h === 0 ? 60 : 48;
      hand.notes = [];
      for (let d = 0; d < 15; d++) {
        const pc = [0, 2, 4, 5, 7, 9, 11][d % 7];
        hand.notes.push(base + 12 * Math.floor(d / 7) + pc);
      }
    });
    mkPreset('Effacer', () => (hand.notes = []));
    mkPreset('Tout', () => {
      hand.notes = [];
      for (let m = MIDI_LO; m <= MIDI_HI; m++) hand.notes.push(m);
    });

    onChk.addEventListener('change', () => {
      hand.enabled = onChk.checked;
      card.classList.toggle('off', !hand.enabled);
    });

    card.append(flds, octs, kb, presets);
    return card;
  };

  const keyLbl = el('span', 'gl key-lbl', `Tonalité : ${keyOf(cfg)}`);

  const hands = el('div', 'hands');
  hands.append(handCard(1), handCard(0));

  const genGlobal = el('div', 'gen-global');
  const timeSel = el('select') as HTMLSelectElement;
  for (const t of ['4/4', '3/4', '2/4']) {
    const o = el('option');
    o.value = t;
    o.textContent = t;
    timeSel.append(o);
  }
  const tempoB = el('input') as HTMLInputElement;
  tempoB.type = 'range';
  tempoB.min = '40';
  tempoB.max = '180';
  tempoB.value = String(cfg.bpm);
  const tempoLbl = el('span', 'bpm', `♩ = ${cfg.bpm}`);
  tempoB.addEventListener('input', () => {
    cfg.bpm = parseInt(tempoB.value);
    tempoLbl.textContent = `♩ = ${cfg.bpm}`;
  });
  const seedIn = el('input') as HTMLInputElement;
  seedIn.type = 'number';
  seedIn.value = String(cfg.seed);
  const dice = el('button', 'chip', '🎲');
  dice.addEventListener('click', () => {
    cfg.seed = Math.floor(Math.random() * 1e9);
    seedIn.value = String(cfg.seed);
  });
  seedIn.addEventListener('change', () => (cfg.seed = parseInt(seedIn.value) || 1));
  genGlobal.append(keyLbl, el('span', 'gl', 'Mesure'), timeSel, el('span', 'gl', 'Tempo'), tempoB, tempoLbl, el('span', 'gl', 'Graine'), seedIn, dice);

  const start = el('button', 'primary', '▶ Générer et jouer');
  start.addEventListener('click', () => {
    err.textContent = '';
    if ((cfg.rh.enabled && !cfg.rh.notes.length) || (cfg.lh.enabled && !cfg.lh.notes.length)) {
      err.textContent = 'Chaque main activée doit avoir au moins une note sélectionnée.';
      return;
    }
    cfg.time = timeSel.value.split('/').map((x) => parseInt(x)) as [number, number];
    onPlay(makeGeneratorScore(cfg));
  });

  wrap.append(head, hands, genGlobal, start, err);
  root.append(wrap);
}
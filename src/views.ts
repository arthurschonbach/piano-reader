import { HAND } from './engraver';
import { makeDemoScore } from './demo';
import { Generator, keyOf, makeGeneratorScore, type Accompaniment, type Contour, type GenConfig, type GenScore, type Harmony, type Tri } from './generator';
import { parseMusicXml } from './musicxml';
import type { Score } from './model';

export const MIDI_LO = 36;
export const MIDI_HI = 84;

const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FR_ROOTS = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

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
    seed: Math.floor(Math.random() * 1e9),
    key: 'auto',
    contour: 'wave',
    accompaniment: 'alberti',
    harmony: 'classic',
    motif: 1,
    syncop: 0,
    rests: 1
  };

  const wrap = el('div', 'gen');
  const head = el('header', 'gen-head');
  const back = el('button', 'icon', '←');
  back.addEventListener('click', () => (location.hash = '#/'));
  head.append(back, el('h1', undefined, 'Générateur infini'));

  const err = el('div', 'error');
  const syncUI: (() => void)[] = [];
  const keyLbl = el('span', 'gl key-lbl');
  const refreshKey = () => (keyLbl.textContent = `Tonalité : ${keyOf(cfg)}`);

  const mkSelect = (parent: HTMLElement, lbl: string, options: [string, string][], get: () => string, set: (v: string) => void): HTMLSelectElement => {
    const f = el('label', 'fld');
    f.append(el('span', undefined, lbl));
    const sel = el('select') as HTMLSelectElement;
    for (const [v, oLbl] of options) {
      const o = el('option');
      o.value = v;
      o.textContent = oLbl;
      sel.append(o);
    }
    sel.addEventListener('change', () => {
      set(sel.value);
      refreshKey();
    });
    f.append(sel);
    syncUI.push(() => (sel.value = get()));
    sel.value = get();
    parent.append(f);
    return sel;
  };

  const keyOptions: [string, string][] = [['auto', 'Auto (déduite)']];
  for (let r = 0; r < 12; r++) {
    keyOptions.push([`${r}M`, `${FR_ROOTS[r]} majeur`]);
    keyOptions.push([`${r}m`, `${FR_ROOTS[r]} mineur`]);
  }
  const keyStr = (k: GenConfig['key']): string => (k && k !== 'auto' ? `${k.root}${k.minor ? 'm' : 'M'}` : 'auto');
  const parseKey = (v: string): GenConfig['key'] =>
    v === 'auto' ? 'auto' : { root: parseInt(v.slice(0, -1), 10), minor: v.slice(-1) === 'm' };

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
    mkSelect(flds, 'Rythme', [['1', 'Noires'], ['2', '+ Croches'], ['3', '+ Doubles'], ['4', 'Dense']], () => String(hand.level), (v) => (hand.level = parseInt(v)));
    mkSelect(flds, 'Notes longues', [['0', 'Courtes'], ['2', '+ Blanches'], ['4', 'Blanches et rondes']], () => String(hand.long ?? 2), (v) => (hand.long = parseInt(v) as 0 | 2 | 4));
    mkSelect(flds, 'Accords', [['0', 'Aucun'], ['3', 'Triades'], ['4', 'Triades + 7ᵉ']], () => String(hand.chords ?? 0), (v) => (hand.chords = parseInt(v) as 0 | 3 | 4));
    if (h === 1) {
      mkSelect(flds, 'Accompagnement', [['basic', 'Basique'], ['alberti', 'Alberti'], ['arpeggio', 'Arpèges'], ['sustained', 'Tenus'], ['pulse', 'Pulsé']], () => cfg.accompaniment ?? 'basic', (v) => (cfg.accompaniment = v as Accompaniment));
    }

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
      refreshKey();
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

  const amb = el('div', 'presets amb');
  const rand = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  interface HandPatch {
    level?: number;
    long?: 0 | 2 | 4;
    chords?: 0 | 3 | 4;
  }
  interface StylePatch {
    contour?: Contour;
    accompaniment?: Accompaniment;
    harmony?: Harmony;
    motif?: Tri;
    syncop?: Tri;
    rests?: Tri;
    bpm?: number;
    rh?: HandPatch;
    lh?: HandPatch;
  }
  const setStyle = (o: StylePatch) => {
    if (o.contour !== undefined) cfg.contour = o.contour;
    if (o.accompaniment !== undefined) cfg.accompaniment = o.accompaniment;
    if (o.harmony !== undefined) cfg.harmony = o.harmony;
    if (o.motif !== undefined) cfg.motif = o.motif;
    if (o.syncop !== undefined) cfg.syncop = o.syncop;
    if (o.rests !== undefined) cfg.rests = o.rests;
    if (o.bpm !== undefined) cfg.bpm = o.bpm;
    if (o.rh) Object.assign(cfg.rh, o.rh);
    if (o.lh) Object.assign(cfg.lh, o.lh);
  };
  const toggleMode = () => {
    const g = new Generator(cfg);
    cfg.key = { root: (g.root + (g.minor ? 3 : 9)) % 12, minor: !g.minor };
  };
  const mkAmb = (lbl: string, fn: () => void) => {
    const b = el('button', 'chip', lbl);
    b.addEventListener('click', () => {
      fn();
      for (const f of syncUI) f();
      refreshKey();
    });
    amb.append(b);
  };
  mkAmb('🌼 Naïf', () =>
    setStyle({ contour: 'smooth', accompaniment: 'alberti', harmony: 'classic', motif: 2, syncop: 0, rests: 0, bpm: 96, rh: { level: 2, long: 2, chords: 3 }, lh: { level: 2, long: 2, chords: 3 } })
  );
  mkAmb('🌙 Calme', () =>
    setStyle({ contour: 'smooth', accompaniment: 'sustained', harmony: 'classic', motif: 1, syncop: 0, rests: 0, bpm: 66, rh: { level: 1, long: 4, chords: 3 }, lh: { level: 1, long: 4, chords: 3 } })
  );
  mkAmb('☀️ Joyeux', () =>
    setStyle({ contour: 'wave', accompaniment: 'alberti', harmony: 'loop', motif: 1, syncop: 1, rests: 1, bpm: 112, rh: { level: 3, long: 0, chords: 3 }, lh: { level: 2, long: 0, chords: 3 } })
  );
  mkAmb('🌧 Mélancolique', () => {
    toggleMode();
    setStyle({ contour: 'smooth', accompaniment: 'arpeggio', harmony: 'classic', motif: 1, syncop: 0, rests: 1, bpm: 72, rh: { level: 2, long: 2, chords: 3 }, lh: { level: 1, long: 2, chords: 3 } });
  });
  mkAmb('⚡ Épique', () =>
    setStyle({ contour: 'leap', accompaniment: 'pulse', harmony: 'classic', motif: 2, syncop: 1, rests: 0, bpm: 100, rh: { level: 2, long: 2, chords: 4 }, lh: { level: 2, long: 2, chords: 4 } })
  );
  mkAmb('🎷 Jazzy', () =>
    setStyle({ contour: 'leap', accompaniment: 'alberti', harmony: 'varied', motif: 1, syncop: 2, rests: 1, bpm: 126, rh: { level: 3, long: 0, chords: 4 }, lh: { level: 2, long: 0, chords: 4 } })
  );
  mkAmb('🎲 Surprends-moi', () => {
    cfg.contour = rand(['smooth', 'wave', 'leap'] as const);
    cfg.accompaniment = rand(['alberti', 'arpeggio', 'sustained', 'pulse'] as const);
    cfg.harmony = rand(['classic', 'varied', 'loop'] as const);
    cfg.motif = rand([0, 1, 2] as const);
    cfg.syncop = rand([0, 1, 2] as const);
    cfg.rests = rand([0, 1, 2] as const);
    cfg.bpm = 60 + Math.floor(Math.random() * 70);
    cfg.seed = Math.floor(Math.random() * 1e9);
  });

  const hands = el('div', 'hands');
  hands.append(handCard(1), handCard(0));

  const settings = el('div', 'gen-global');
  const genTop = el('div', 'gen-top');
  genTop.append(el('span', 'gl sec-title', 'Réglages musicaux'), keyLbl);
  const sflds = el('div', 'flds');
  settings.append(genTop, sflds);

  mkSelect(sflds, 'Tonalité', keyOptions, () => keyStr(cfg.key), (v) => (cfg.key = parseKey(v)));
  mkSelect(sflds, 'Harmonie', [['classic', 'Classique'], ['varied', 'Variée'], ['loop', 'Boucle']], () => cfg.harmony ?? 'classic', (v) => (cfg.harmony = v as Harmony));
  mkSelect(sflds, 'Mélodie', [['smooth', 'Conjointe'], ['wave', 'Ondulante'], ['leap', 'Sautillante']], () => cfg.contour ?? 'wave', (v) => (cfg.contour = v as Contour));
  mkSelect(sflds, 'Syncopes', [['0', 'Aucune'], ['1', 'Quelques-unes'], ['2', 'Rythmées']], () => String(cfg.syncop ?? 0), (v) => (cfg.syncop = parseInt(v) as 0 | 1 | 2));
  mkSelect(sflds, 'Thème', [['0', 'Libre'], ['1', 'Modéré'], ['2', 'Insistant']], () => String(cfg.motif ?? 1), (v) => (cfg.motif = parseInt(v) as 0 | 1 | 2));
  mkSelect(sflds, 'Silences', [['0', 'Rares'], ['1', 'Normaux'], ['2', 'Aérés']], () => String(cfg.rests ?? 1), (v) => (cfg.rests = parseInt(v) as 0 | 1 | 2));
  mkSelect(sflds, 'Mesure', [['4/4', '4/4'], ['3/4', '3/4'], ['2/4', '2/4']], () => `${cfg.time[0]}/${cfg.time[1]}`, (v) => {
    const [a, b] = v.split('/').map((x) => parseInt(x));
    cfg.time = [a, b];
  });

  const tempoBox = el('label', 'fld');
  tempoBox.append(el('span', undefined, 'Tempo'));
  const tempoRow = el('div', 'tempo-row');
  const tempoB = el('input') as HTMLInputElement;
  tempoB.type = 'range';
  tempoB.min = '40';
  tempoB.max = '180';
  const tempoLbl = el('span', 'bpm');
  tempoB.addEventListener('input', () => {
    cfg.bpm = parseInt(tempoB.value);
    tempoLbl.textContent = `♩ = ${cfg.bpm}`;
  });
  tempoRow.append(tempoB, tempoLbl);
  tempoBox.append(tempoRow);
  syncUI.push(() => {
    tempoB.value = String(cfg.bpm);
    tempoLbl.textContent = `♩ = ${cfg.bpm}`;
  });
  sflds.append(tempoBox);

  const seedBox = el('label', 'fld');
  seedBox.append(el('span', undefined, 'Graine'));
  const seedRow = el('div', 'seed-row');
  const seedIn = el('input') as HTMLInputElement;
  seedIn.type = 'number';
  const dice = el('button', 'chip', '🎲');
  dice.addEventListener('click', () => {
    cfg.seed = Math.floor(Math.random() * 1e9);
    seedIn.value = String(cfg.seed);
  });
  seedIn.addEventListener('change', () => (cfg.seed = parseInt(seedIn.value) || 1));
  seedRow.append(seedIn, dice);
  seedBox.append(seedRow);
  syncUI.push(() => (seedIn.value = String(cfg.seed)));
  sflds.append(seedBox);

  for (const f of syncUI) f();
  refreshKey();

  const start = el('button', 'primary', '▶ Générer et jouer');
  start.addEventListener('click', () => {
    err.textContent = '';
    if ((cfg.rh.enabled && !cfg.rh.notes.length) || (cfg.lh.enabled && !cfg.lh.notes.length)) {
      err.textContent = 'Chaque main activée doit avoir au moins une note sélectionnée.';
      return;
    }
    onPlay(makeGeneratorScore(cfg));
  });

  wrap.append(head, amb, hands, settings, start, err);
  root.append(wrap);
}
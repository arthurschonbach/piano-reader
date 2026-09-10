import { unzipSync, strFromU8 } from 'fflate';
import { makeNote, type Measure, type Score, type Spelled } from './model';

const TYPE_BASE: Record<string, number> = {
  maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1,
  eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 0.03125
};

function els(el: Element, tag: string): Element[] {
  return Array.from(el.getElementsByTagName(tag));
}

function one(el: Element | null, tag: string): Element | null {
  return el ? el.getElementsByTagName(tag)[0] ?? null : null;
}

function num(el: Element | null, fallback = 0): number {
  if (!el) return fallback;
  const v = parseFloat((el.textContent ?? '').trim());
  return Number.isFinite(v) ? v : fallback;
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').trim();
}

export function parseXmlDoc(doc: Document, fallbackTitle: string): Score {
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML invalide');
  const root = doc.getElementsByTagName('score-partwise')[0];
  if (!root) throw new Error('MusicXML « score-partwise » introuvable');

  const title =
    text(one(root, 'movement-title')) ||
    text(one(root, 'work-title')) ||
    fallbackTitle.replace(/\.(mxl|musicxml|xml)$/i, '') ||
    'Partition';

  const parts = root.getElementsByTagName('part');
  if (!parts.length) throw new Error('Aucune partie dans le fichier');
  const part = parts[0];

  let divisions = 1;
  let fifths = 0;
  let time: [number, number] = [4, 4];
  let bpm = 0;
  let staves = 1;
  const clefByStaff = new Map<number, string>();

  const measures: Measure[] = [];
  let startBeat = 0;

  for (const mEl of Array.from(part.getElementsByTagName('measure'))) {
    let cursor = 0;
    let maxCursor = 0;
    const notes: ReturnType<typeof makeNote>[] = [];
    let lastPrimary: ReturnType<typeof makeNote> | null = null;
    let keyChange = false;
    let timeChange = false;
    let measureFifths = fifths;

    for (const child of Array.from(mEl.children)) {
      const tag = child.tagName;
      if (tag === 'attributes') {
        const divEl = one(child, 'divisions');
        if (divEl) divisions = Math.max(1, num(divEl, divisions));
        const keyEl = one(child, 'key');
        if (keyEl) {
          const f = Math.round(num(one(keyEl, 'fifths'), fifths));
          if (f !== fifths) keyChange = true;
          fifths = f;
          measureFifths = f;
        }
        const stavesEl = one(child, 'staves');
        if (stavesEl) staves = Math.max(staves, Math.min(2, Math.round(num(stavesEl, 1))));
        for (const clefEl of els(child, 'clef')) {
          const staffNo = Math.max(1, parseInt(clefEl.getAttribute('number') ?? '1', 10) || 1);
          const sign = text(one(clefEl, 'sign')).toUpperCase();
          if (sign) clefByStaff.set(staffNo - 1, sign === 'F' || sign === 'C' ? 'F' : 'G');
        }
        const timeEl = one(child, 'time');
        if (timeEl) {
          const t: [number, number] = [
            Math.max(1, Math.round(num(one(timeEl, 'beats'), time[0]))),
            Math.max(1, Math.round(num(one(timeEl, 'beat-type'), time[1])))
          ];
          if (t[0] !== time[0] || t[1] !== time[1]) timeChange = true;
          time = t;
        }
      } else if (tag === 'direction' || tag === 'sound') {
        for (const s of tag === 'direction' ? els(child, 'sound') : [child]) {
          const t = parseFloat(s.getAttribute('tempo') ?? '');
          if (Number.isFinite(t) && t > 0 && bpm === 0) bpm = t;
        }
      } else if (tag === 'note') {
        const grace = !!one(child, 'grace');
        const isChord = !!one(child, 'chord');
        const durEl = one(child, 'duration');
        let d = durEl ? num(durEl) / divisions : 0;
        if (grace) d = 0;

        const typeBase = TYPE_BASE[text(one(child, 'type')).toLowerCase()] ?? 1;
        const dots = els(child, 'dot').length;

        let spell: Spelled | null = null;
        const pitchEl = one(child, 'pitch');
        if (pitchEl) {
          const stepName = text(one(pitchEl, 'step')).toUpperCase();
          const step = 'CDEFGAB'.indexOf(stepName);
          if (step >= 0) {
            spell = {
              step,
              alter: Math.round(num(one(pitchEl, 'alter'), 0)),
              octave: Math.round(num(one(pitchEl, 'octave'), 4))
            };
          }
        }
        const rest = !spell;

        let staffIdx = 0;
        const staffEl = one(child, 'staff');
        if (staffEl) staffIdx = Math.min(1, Math.max(0, Math.round(num(staffEl, 1)) - 1));
        const voice = staffIdx === 0 ? 1 : Math.max(1, Math.round(num(one(child, 'voice'), 1)));

        let tieStart = false;
        let tieStop = false;
        for (const tie of els(child, 'tie')) {
          const t = tie.getAttribute('type');
          if (t === 'start') tieStart = true;
          if (t === 'stop') tieStop = true;
        }

        const accEl = one(child, 'accidental');
        const printed = accEl ? text(accEl) : null;

        if (isChord && lastPrimary && !rest) {
          const c = makeNote({
            beat: lastPrimary.beat,
            dur: lastPrimary.dur,
            base: lastPrimary.base,
            staff: staffIdx,
            voice,
            chord: true,
            spell: spell ?? undefined
          });
          c.dots = lastPrimary.dots;
          notes.push(c);
          continue;
        }

        if (rest) {
          const restEl = one(child, 'rest');
          if (restEl && restEl.getAttribute('measure') === 'yes') {
            const nominal = (time[0] * 4) / time[1];
            d = Math.max(0, nominal - cursor);
          }
        }

        const beat = startBeat + cursor;
        if (!grace) {
          cursor += d;
          if (cursor > maxCursor) maxCursor = cursor;
        }

        const note = makeNote({
          beat,
          dur: d,
          base: grace ? 0.5 : typeBase,
          staff: staffIdx,
          voice,
          rest,
          grace,
          spell: spell ?? undefined
        });
        note.tieStart = tieStart;
        note.tieStop = tieStop;
        note.dots = dots;
        note.printed = printed || null;
        notes.push(note);
        lastPrimary = note;
      } else if (tag === 'backup') {
        cursor = Math.max(0, cursor - num(one(child, 'duration')) / divisions);
      } else if (tag === 'forward') {
        cursor += num(one(child, 'duration')) / divisions;
        if (cursor > maxCursor) maxCursor = cursor;
      }
    }

    const nominal = (time[0] * 4) / time[1];
    const length = maxCursor > 0 ? maxCursor : nominal;
    if (!notes.length) {
      notes.push(makeNote({ beat: startBeat, dur: length, base: 4, rest: true }));
    }
    notes.sort((a, b) => a.beat - b.beat);
    measures.push({
      number: measures.length + 1,
      startBeat,
      length,
      key: measureFifths,
      keyChange: keyChange || measures.length === 0,
      time: timeChange || measures.length === 0 ? [...time] : null,
      notes
    });
    startBeat += length;
  }

  const clefs: string[] = [clefByStaff.get(0) ?? 'G', clefByStaff.get(1) ?? 'F'];
  if (staves < 2 && measures.length && !measures.some((m) => m.notes.some((n) => n.staff === 1))) staves = 1;

  return { title, bpm: bpm > 0 ? bpm : 100, measures, infinite: false, staves, clefs };
}

export async function parseMusicXml(file: File): Promise<Score> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let xml: string;
  let name = file.name;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = unzipSync(bytes);
    let mainPath: string | null = null;
    const container = entries['META-INF/container.xml'];
    if (container) {
      const cdoc = new DOMParser().parseFromString(strFromU8(container), 'application/xml');
      mainPath = cdoc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path') ?? null;
    }
    if (!mainPath || !entries[mainPath]) {
      mainPath =
        Object.keys(entries).find((k) => !k.startsWith('META-INF') && k.toLowerCase().endsWith('.xml')) ??
        Object.keys(entries).find((k) => k.toLowerCase().endsWith('.xml')) ??
        null;
    }
    if (!mainPath || !entries[mainPath]) throw new Error('Archive .mxl illisible');
    xml = strFromU8(entries[mainPath]);
    name = mainPath.split('/').pop() ?? name;
  } else {
    xml = new TextDecoder('utf-8').decode(bytes);
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return parseXmlDoc(doc, name);
}
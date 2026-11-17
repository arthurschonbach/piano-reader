import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { DARK, LIGHT, ScoreRenderer, setPalette, type Mark } from '../src/core/engraver';
import { generateExercise } from '../src/curriculum/generate';
import { LESSONS } from '../src/curriculum/lessons';
import { PIECES, pieceScore } from '../src/curriculum/pieces';
import { buildSteps } from '../src/exercise/wait';
import type { NoteItem, Score } from '../src/core/model';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    fails++;
    console.error(`FAIL: ${msg}`);
  } else console.log(`ok: ${msg}`);
};

const W = 900;
const H = 300;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const renderer = new ScoreRenderer(canvas as unknown as HTMLCanvasElement);
renderer.resize(W, H);

function stats(): { ink: number; green: number; orange: number; red: number; blue: number; dark: number; light: number } {
  const d = ctx.getImageData(0, 0, W, H).data;
  let ink = 0, green = 0, orange = 0, red = 0, blue = 0, dark = 0, light = 0;
  const bg = [d[0], d[1], d[2]];
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    const lum = (r + g + b) / 3;
    if (lum < 60) dark++;
    if (lum > 200) light++;
    if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) < 20) continue;
    ink++;
    if (g > r + 30 && g > b + 15) green++;
    if (r > 190 && g > 110 && g < 175 && b < 80) orange++;
    if (r > 190 && g < 110 && b < 110) red++;
    if (b > 170 && b > r + 60 && b > g + 30) blue++;
  }
  const n = d.length / 4;
  return { ink: ink / n, green: green / n, orange: orange / n, red: red / n, blue: blue / n, dark: dark / n, light: light / n };
}

const draw = (score: Score, beat: number, marks?: Map<NoteItem, Mark>, extra: Record<string, unknown> = {}) =>
  renderer.draw(score, { beat, lookahead: 0, names: false, zoom: 2.4, pxPerBeat: 4.5, anchor: 0.08, cursor: false, marks, ...extra });

// Wait-mode marks.
const score = generateExercise(LESSONS[0], { seed: 3 });
const steps = buildSteps(score);
const marks = new Map<NoteItem, Mark>();
marks.set(steps[0].notes[0], 'ok');
draw(score, steps[0].beat, marks);
ok(stats().green > 0.0002, 'right-first-time note is green');
marks.set(steps[1].notes[0], 'late');
marks.set(steps[2].notes[0], 'bad');
draw(score, steps[2].beat, marks);
const c = stats();
ok(c.ink > 0.02, `lesson score renders (${(c.ink * 100).toFixed(1)}% ink)`);
ok(c.orange > 0.0002, 'corrected note is orange');
ok(c.red > 0.0002, 'wrong-key note is red');
writeFileSync(new URL('./out-lesson.png', import.meta.url), canvas.toBuffer('image/png'));

const lh = generateExercise(LESSONS[1], { seed: 4 });
draw(lh, 0);
ok(stats().ink > 0.02, 'left-hand lesson renders');
writeFileSync(new URL('./out-bass.png', import.meta.url), canvas.toBuffer('image/png'));

draw(generateExercise(LESSONS.find((l) => l.id === 'sol-majeur')!, { seed: 2 }), 0);
ok(stats().ink > 0.02, 'G major grand staff renders');
writeFileSync(new URL('./out-grand.png', import.meta.url), canvas.toBuffer('image/png'));

// A label on notes held the wrong length: "court" in red, "long" in amber.
const held = generateExercise(LESSONS.find((l) => l.id === 'en-rythme')!, { seed: 4 });
const firstNotes = held.measures[0].notes.filter((n) => !n.rest);
draw(held, 0, undefined, { pxPerBeat: 9 });
const noFlags = stats();
draw(held, 0, undefined, { pxPerBeat: 9, holdFlags: new Map([[firstNotes[0], 'short' as const]]) });
const shortFlag = stats();
ok(shortFlag.blue > noFlags.blue + 0.0005, `"court" label in blue, like everything too soon (${(shortFlag.blue * 100).toFixed(2)}%)`);
writeFileSync(new URL('./out-holds.png', import.meta.url), canvas.toBuffer('image/png'));
draw(held, 0, undefined, { pxPerBeat: 9, holdFlags: new Map([[firstNotes[0], 'long' as const]]) });
ok(stats().orange > noFlags.orange + 0.0005, '"long" label in orange, like everything too late');
const early = new Map([[firstNotes[0], 'early' as const]]);
draw(held, 0, early, { pxPerBeat: 9 });
ok(stats().blue > noFlags.blue + 0.0002, 'note played early turns blue');

const piece = pieceScore(PIECES[2], 'both');
draw(piece, 0, undefined, { fingers: false });
const noFingers = stats().ink;
draw(piece, 0);
ok(stats().ink > noFingers, 'finger numbers add ink');
writeFileSync(new URL('./out-piece.png', import.meta.url), canvas.toBuffer('image/png'));

setPalette(DARK);
draw(piece, 0);
const dk = stats();
ok(dk.dark > 0.8 && dk.light > 0.003, `dark theme: dark paper, light notes (${(dk.dark * 100).toFixed(0)}% dark)`);
writeFileSync(new URL('./out-dark.png', import.meta.url), canvas.toBuffer('image/png'));
setPalette(LIGHT);

renderer.resize(380, 260);
ctx.clearRect(0, 0, W, H);
draw(score, 0);
const px = ctx.getImageData(0, 0, 380, 260).data;
let darkPx = 0;
for (let i = 0; i < px.length; i += 4) if (px[i] < 120) darkPx++;
ok(darkPx > 80, `narrow portrait canvas renders (${darkPx} dark px)`);

if (fails) {
  console.error(`\n${fails} failing check(s)`);
  process.exit(1);
}
console.log('\nRender OK.');

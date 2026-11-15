import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { ScoreRenderer, type Mark } from '../src/core/engraver';
import { generateExercise } from '../src/curriculum/generate';
import { LESSONS } from '../src/curriculum/lessons';
import { buildSteps } from '../src/exercise/wait';
import type { NoteItem } from '../src/core/model';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    fails++;
    console.error(`FAIL: ${msg}`);
  } else console.log(`ok: ${msg}`);
};

// Phone in landscape on the music stand.
const W = 800;
const H = 220;
const canvas = createCanvas(W, H);
const renderer = new ScoreRenderer(canvas as unknown as HTMLCanvasElement);
renderer.resize(W, H);

function colors(): { ink: number; green: number; orange: number; red: number } {
  const d = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  let ink = 0, green = 0, orange = 0, red = 0;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    if (r > 240 && g > 240 && b > 240) continue;
    ink++;
    if (g > r + 40 && g > b + 20) green++;
    if (r > 200 && g > 120 && g < 160 && b < 60) orange++;
    if (r > 190 && g < 70 && b < 70) red++;
  }
  const n = d.length / 4;
  return { ink: ink / n, green: green / n, orange: orange / n, red: red / n };
}

const score = generateExercise(LESSONS[0], { seed: 3 });
const steps = buildSteps(score);
const marks = new Map<NoteItem, Mark>();
marks.set(steps[0].notes[0], 'ok');
marks.set(steps[1].notes[0], 'late');
marks.set(steps[2].notes[0], 'bad');
const draw = (beat: number, names = false, labels?: Set<NoteItem>) =>
  renderer.draw(score, { beat, lookahead: 0, names, zoom: 2.4, pxPerBeat: 4.5, anchor: 0.08, cursor: false, marks, labels });

draw(steps[0].beat);
ok(colors().green > 0.0002, 'right-first-time note is green');
draw(steps[2].beat);
const c = colors();
ok(c.ink > 0.02, `lesson score renders (${(c.ink * 100).toFixed(1)}% ink)`);
ok(c.orange > 0.0002, 'corrected note is orange');
ok(c.red > 0.0002, 'wrong-key note is red');
writeFileSync(new URL('../tests/out-lesson.png', import.meta.url), canvas.toBuffer('image/png'));

const inkNoNames = colors().ink;
draw(steps[2].beat, true);
ok(colors().ink > inkNoNames, 'note names add ink');

marks.clear();
draw(steps[5].beat, false, new Set([steps[5].notes[0]]));
ok(colors().ink > 0.02, 'hint label renders');

// Portrait phone: still draws.
renderer.resize(380, 260);
canvas.getContext('2d').clearRect(0, 0, W, H);
draw(0);
const px = canvas.getContext('2d').getImageData(0, 0, 380, 260).data;
let dark = 0;
for (let i = 0; i < px.length; i += 4) if (px[i] < 120) dark++;
ok(dark > 80, `narrow portrait canvas renders (${dark} dark px)`);

if (fails) {
  console.error(`\n${fails} failing check(s)`);
  process.exit(1);
}
console.log('\nRender OK.');

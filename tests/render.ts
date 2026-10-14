import { createCanvas } from '@napi-rs/canvas';
import { ScoreRenderer } from '../src/engraver';
import { makeDemoScore } from '../src/demo';
import { makeExercise } from '../src/generator';
import { computeTies, measureAt } from '../src/model';

const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
};

const W = 1200;
const H = 420;
const canvas = createCanvas(W, H);
const renderer = new ScoreRenderer(canvas as unknown as HTMLCanvasElement);
renderer.resize(W, H);

function inkRatio(): { ink: number; blue: number; accent: number } {
  const data = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
  let ink = 0;
  let blue = 0;
  let accent = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue;
    if (r > 245 && g > 245 && b > 245) continue;
    ink++;
    if (b > r + 40 && b > 100) blue++;
    // Persimmon accent cursor (#d9481c): strong red, low blue, mid green.
    if (r > b + 40 && r > 150 && g > 40 && g < 140) accent++;
  }
  return { ink: ink / (data.length / 4), blue: blue / (data.length / 4), accent: accent / (data.length / 4) };
}

const demo = makeDemoScore();
computeTies(demo);
canvas.getContext('2d')!.clearRect(0, 0, W, H);
renderer.draw(demo, { beat: 2, lookahead: 2, names: false, zoom: 1 });
let m = inkRatio();
assert(m.ink > 0.02, `demo: ink present (${(m.ink * 100).toFixed(1)}%)`);
assert(m.blue < 0.0005, `no blue leftovers (${(m.blue * 100).toFixed(3)}%)`);
assert(m.accent > 0.0002 && m.accent < 0.01, `accent cursor visible but restrained (${(m.accent * 100).toFixed(3)}%)`);

canvas.getContext('2d')!.clearRect(0, 0, W, H);
renderer.draw(demo, { beat: 0, lookahead: 2, names: false, zoom: 1 });
m = inkRatio();
assert(m.ink > 0.02, `demo from start: ink present (${(m.ink * 100).toFixed(1)}%)`);

const gen = makeExercise({ hands: 'both', level: 2, key: 'C', bpm: 80, seed: 7 });
gen.ensure(150);
canvas.getContext('2d')!.clearRect(0, 0, W, H);
renderer.draw(gen.score, { beat: 100, lookahead: 2, names: false, zoom: 1 });
m = inkRatio();
assert(m.ink > 0.02, `exercise: renders around bar 25 (${(m.ink * 100).toFixed(1)}%)`);

canvas.getContext('2d')!.clearRect(0, 0, W, H);
const single = makeDemoScore();
single.staves = 1;
renderer.draw(single, { beat: 1, lookahead: 2, names: false, zoom: 1 });
assert(inkRatio().ink > 0.01, 'single staff: renders fine');

const geo = renderer.beatAt(0, 0);
assert(Number.isFinite(geo), 'beatAt returns a number');

assert(measureAt(demo, 0) === 0, 'measureAt start');
assert(measureAt(demo, 4) === 1, 'measureAt bar 2');
assert(measureAt(demo, 31.9) === 7, 'measureAt end');
assert(measureAt(demo, 100) === 7, 'measureAt past the end');

renderer.beatAt(500, 2);
console.log('\nRender OK.');

import { createCanvas } from '@napi-rs/canvas';
import { ScoreRenderer } from '../src/engraver';
import { makeDemoScore } from '../src/demo';
import { makeGeneratorScore } from '../src/generator';
import { computeTies, measureAt } from '../src/model';

const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error(`ÉCHEC: ${msg}`);
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
};

const W = 1200;
const H = 420;
const canvas = createCanvas(W, H);
const renderer = new ScoreRenderer(canvas as unknown as HTMLCanvasElement);
renderer.resize(W, H);

function inkRatio(): { ink: number; blue: number; orange: number } {
  const data = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
  let ink = 0;
  let blue = 0;
  let orange = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue;
    if (r > 245 && g > 245 && b > 245) continue;
    ink++;
    if (b > r + 40 && b > 100) blue++;
    if (r > b + 40 && r > 150 && g > 60 && g < 140) orange++;
  }
  return { ink: ink / ((data.length / 4)), blue: blue / (data.length / 4), orange: orange / (data.length / 4) };
}

const demo = makeDemoScore();
computeTies(demo);
canvas.getContext('2d')!.clearRect(0, 0, W, H);
renderer.draw(demo, { beat: 2, lookahead: 2, names: true, zoom: 1 });
let m = inkRatio();
assert(m.ink > 0.02, `démo: encre présente (${(m.ink * 100).toFixed(1)}%)`);
assert(m.blue > 0.001, `démo: notes RH bleues visibles (${(m.blue * 100).toFixed(2)}%)`);
assert(m.orange > 0.0003, `démo: notes LH oranges visibles (${(m.orange * 100).toFixed(2)}%)`);

canvas.getContext('2d')!.clearRect(0, 0, W, H);
renderer.draw(demo, { beat: 0, lookahead: 2, names: false, zoom: 1 });
m = inkRatio();
assert(m.ink > 0.02, `démo au début: encre présente (${(m.ink * 100).toFixed(1)}%)`);

const gen = makeGeneratorScore({
  rh: { enabled: true, notes: [60, 62, 64, 65, 67, 69], level: 3 },
  lh: { enabled: true, notes: [48, 50, 52, 55, 57], level: 2 },
  time: [4, 4],
  bpm: 80,
  seed: 7
});
gen.ensure(150);
canvas.getContext('2d')!.clearRect(0, 0, W, H);
renderer.draw(gen.score, { beat: 100, lookahead: 4, names: true, zoom: 1.4 });
m = inkRatio();
assert(m.ink > 0.02, `génération: rendu à la mesure ~25 (${(m.ink * 100).toFixed(1)}%)`);

canvas.getContext('2d')!.clearRect(0, 0, W, H);
const single = makeDemoScore();
single.staves = 1;
renderer.draw(single, { beat: 1, lookahead: 2, names: true, zoom: 0.75 });
assert(inkRatio().ink > 0.01, 'portée unique: rendu ok');

const geo = renderer.beatAt(0, 0);
assert(Number.isFinite(geo), 'beatAt renvoie un nombre');

assert(measureAt(demo, 0) === 0, 'measureAt début');
assert(measureAt(demo, 4) === 1, 'measureAt mesure 2');
assert(measureAt(demo, 31.9) === 7, 'measureAt fin');
assert(measureAt(demo, 100) === 7, 'measureAt au-delà de la fin');

renderer.beatAt(500, 2);
console.log('\nRendu OK.');
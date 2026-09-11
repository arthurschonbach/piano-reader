import { chromium } from 'playwright';
import { createServer } from 'vite';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    fails++;
    console.error('ÉCHEC:', msg);
  } else console.log('ok:', msg);
};

const server = await createServer({ root: '/home/arthur/Documents/dev/piano-reader', server: { port: 5199 } });
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto('http://localhost:5199/#/generate');
await page.waitForSelector('.gen');
await page.waitForTimeout(300);

const selectCount = await page.$$eval('select', (els) => els.length);
ok(selectCount === 14, `14 selects dans le DOM (trouvé: ${selectCount})`);

const states = await page.$$eval('select', (els) =>
  els.map((s) => ({
    v: (s as HTMLSelectElement).value,
    n: (s as HTMLSelectElement).options.length,
    lbl: (s.closest('label')?.querySelector('span')?.textContent ?? '').trim()
  }))
);
ok(states.every((s) => s.n > 1), `chaque select a des options (${states.map((s) => `${s.lbl}:${s.v}/${s.n}`).join(', ')})`);
ok(states[0].v === '1' && states[3].v === 'alberti' && states[4].v === '2' && states[7].v === 'auto', `valeurs initiales (LH rythme=${states[0].v}, accomp=${states[3].v}, RH rythme=${states[4].v}, tonalité=${states[7].v})`);

// Interaction: changer "Rythme" main droite (select 4) vers Doubles (3)
await page.selectOption(states ? '.gen select >> nth=4' : '', '3');
const rhLvl = await page.$eval('.gen select >> nth=4', (s: Element) => (s as HTMLSelectElement).value);
ok(rhLvl === '3', `changement Rythme RH appliqué (${rhLvl})`);

// Preset d'ambiance: Calme → doit mettre à jour les selects affichés
const ambBtns = await page.$$('.presets.amb .chip');
await ambBtns[1].click();
const calmVals = await page.$$eval('.gen-global select', (els) => els.map((s) => (s as HTMLSelectElement).value));
ok(calmVals[1] === 'classic', `preset Calme → harmonie classic (${calmVals[1]})`);
ok(calmVals[2] === 'smooth', `preset Calme → mélodie conjointe (${calmVals[2]})`);
ok(calmVals[3] === '0', `preset Calme → syncopes aucune (${calmVals[3]})`);
const calmAcc = await page.$eval('.gen select >> nth=3', (s: Element) => (s as HTMLSelectElement).value);
ok(calmAcc === 'sustained', `preset Calme → accompagnement tenus (${calmAcc})`);
const calmTempo = await page.$eval('.tempo-row .bpm', (e) => e.textContent);
ok(calmTempo === '♩ = 66', `preset Calme → tempo affiché (${calmTempo})`);

// Générer et vérifier que la config est bien utilisée (tempo du score)
await page.click('button.primary');
await page.waitForSelector('.player');
const bpm = await page.$eval('.pbar input[type=range]', (e) => (e as HTMLInputElement).value);
ok(bpm === '66', `score généré avec tempo du preset (${bpm})`);

ok(errors.length === 0, `aucune erreur JS (${errors.join(' | ')})`);
console.log(fails ? `${fails} ÉCHECS` : 'UI OK');
await browser.close();
await server.close();
process.exit(fails ? 1 : 0);
/**
 * End-to-end in a real browser with a fake FP-10 behind Web MIDI:
 * level test, a rhythm lesson played in time, the daily session, a piece stage,
 * the theme toggle, and an iPad-like browser without MIDI.
 *
 * Run with: npm run test:ui   (needs the Playwright chromium)
 */
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    fails++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
};

const server = await createServer({ root: process.cwd(), server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();

/** Plain JS strings: tsx would otherwise inject helpers the page doesn't have. */
const FAKE_MIDI = `
  const input = { id: 'fp10', name: 'FP-10', state: 'connected', onmidimessage: null };
  const access = { inputs: new Map([['fp10', input]]), onstatechange: null };
  Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: () => Promise.resolve(access), configurable: true });
  const q = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (d) => d.name === 'midi' ? Promise.resolve({ state: 'prompt' }) : q(d);
  window.__midi = (s, n, v) => input.onmidimessage && input.onmidimessage({ data: new Uint8Array([s, n, v]), timeStamp: performance.now() });
  // Play the rhythm-mode score exactly in time, from the page's own clock.
  window.__playInTime = () => {
    const ex = document.querySelector('.ex');
    const t0 = Number(ex.dataset.t0), spb = Number(ex.dataset.msPerBeat), lat = Number(ex.dataset.latency);
    for (const [beat, midi] of JSON.parse(ex.dataset.onsets)) {
      const at = t0 + beat * spb + lat - performance.now();
      setTimeout(() => { window.__midi(0x90, midi, 90); setTimeout(() => window.__midi(0x80, midi, 0), 80); }, Math.max(0, at));
    }
  };
`;
const NO_MIDI = `Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: undefined, configurable: true });`;

async function newPage(init: string, viewport = { width: 1024, height: 700 }): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => (errors.push(e.message), console.error('PAGEERROR', e.message, e.stack?.split('\n').slice(0, 4).join(' | '))));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript({ content: init });
  return { page, errors };
}

/** Wait mode: play whatever is circled until the results card shows. */
async function playWait(page: Page, opts: { wrongFirst?: boolean } = {}): Promise<void> {
  await page.evaluate(async (wrongFirst) => {
    const w = window as unknown as { __midi: (s: number, n: number, v: number) => void };
    const ex = document.querySelector('.ex') as HTMLElement;
    let guard = 0;
    let first = true;
    while (ex.dataset.expected && ex.dataset.phase === 'play' && guard++ < 400) {
      const ms = ex.dataset.expected.split(',').map(Number);
      if (first && wrongFirst) w.__midi(0x90, ms[0] + 1, 80), w.__midi(0x80, ms[0] + 1, 0);
      first = false;
      for (const m of ms) w.__midi(0x90, m, 80);
      for (const m of ms) w.__midi(0x80, m, 0);
      await new Promise((r) => setTimeout(r, 15));
    }
  }, !!opts.wrongFirst);
  try {
    await page.waitForSelector('.results', { timeout: 5000 });
  } catch (e) {
    console.error('state:', await page.evaluate(() => {
      const ex = document.querySelector('.ex') as HTMLElement;
      return { phase: ex?.dataset.phase, expected: ex?.dataset.expected, count: document.querySelector('.count')?.textContent, fb: document.querySelector('.feedback')?.textContent };
    }));
    throw e;
  }
}

const startExercise = async (page: Page) => {
  await page.waitForSelector('.ex');
  await page.click('.intro >> text=C’est parti');
};

// ---------- Phone/iPad with the FP-10 ----------
{
  const { page, errors } = await newPage(FAKE_MIDI);
  await page.goto('http://localhost:5199/#/');
  await page.waitForSelector('.piano-status');
  await page.click('text=Connecter le piano');
  await page.waitForSelector('.piano-status[data-state="connected"]');
  ok((await page.textContent('.ps-text'))!.includes('FP-10'), 'FP-10 connected');
  ok(await page.isVisible('.hero'), 'first visit: level test offered');

  // Theme toggle persists.
  const before = await page.getAttribute('html', 'data-theme');
  await page.click('.navdock .theme-toggle');
  const after = await page.getAttribute('html', 'data-theme');
  ok(before !== after, `theme toggles (${before} → ${after})`);
  await page.reload();
  await page.waitForSelector('.piano-status');
  ok((await page.getAttribute('html', 'data-theme')) === after, 'theme remembered after reload');
  await page.click('.navdock .theme-toggle');
  // The fake permission is never "granted", so connect again after the reload.
  await page.click('text=Connecter le piano');
  await page.waitForSelector('.piano-status[data-state="connected"]');

  // Level test, all right: everything acquired, rhythm lesson becomes current.
  await page.click('text=Faire le test de niveau');
  await startExercise(page);
  await playWait(page);
  const res = await page.textContent('.results');
  ok(!!res && res.includes('9') && res.includes('leçon 4'), 'level test: all blocks passed, path resumes at lesson 4');
  await page.click('text=Voir ma séance du jour');
  await page.waitForSelector('.lessons');
  ok((await page.textContent('.lesson.current .t')) === 'Jouer en rythme', 'current lesson is the rhythm one');
  ok(!(await page.isVisible('.hero')), 'welcome card gone');

  // Rhythm lesson played in time.
  await page.goto('http://localhost:5199/#/lecon/en-rythme');
  await startExercise(page);
  await page.evaluate(() => (window as unknown as { __playInTime: () => void }).__playInTime());
  // The score is moved by a compositor animation, not redrawn each frame.
  await page.waitForTimeout(5500);
  const scroll = (await page.evaluate(`(async () => {
    const strip = document.querySelector('.strip');
    const a = new DOMMatrix(getComputedStyle(strip).transform).m41;
    await new Promise((r) => setTimeout(r, 500));
    const b = new DOMMatrix(getComputedStyle(strip).transform).m41;
    return { anims: strip.getAnimations().length, moved: a - b, tiles: document.querySelectorAll('.strip-tile').length };
  })()`)) as { anims: number; moved: number; tiles: number };
  ok(scroll.anims === 1 && scroll.moved > 20 && scroll.tiles >= 2, `rhythm: score scrolls by animation (${JSON.stringify(scroll)})`);
  await page.waitForSelector('.results', { timeout: 60000 });
  const rr = await page.textContent('.results');
  ok(!!rr && rr.includes('Séance validée'), `rhythm lesson validated when played in time (${rr?.slice(0, 80)})`);

  // Daily session: warm-up first, then "Continuer".
  await page.goto('http://localhost:5199/#/seance');
  await startExercise(page);
  ok((await page.textContent('.tb-title'))!.includes('1/'), 'session shows its step count');
  await playWait(page, { wrongFirst: true });
  ok((await page.textContent('.results'))!.includes('Échauffement terminé'), 'warm-up done');
  ok(await page.isVisible('.results >> text=/Continuer/'), 'session offers to continue');
  await page.click('.results >> text=/Continuer/');
  await page.waitForSelector('.intro');
  ok((await page.textContent('.tb-title'))!.includes('2/'), 'session moves to step 2');

  // A piece: first stage, right hand alone.
  await page.goto('http://localhost:5199/#/morceau/agneau');
  await page.waitForSelector('.stages');
  ok((await page.locator('.pstage').count()) === 5, 'piece page lists 5 stages');
  await page.click('.pstage.current >> text=Travailler');
  await startExercise(page);
  ok((await page.getAttribute('.ex', 'data-mode')) === 'wait', 'stage 1 is in wait mode');
  await playWait(page);
  ok((await page.textContent('.results'))!.includes('Étape validée'), 'stage 1 validated');
  await page.click('.results button >> text=Étape suivante');
  await page.waitForSelector('.intro');
  ok((await page.textContent('.intro h2')) === 'Main gauche seule', 'next stage: left hand');

  // Library, piece sheet, glossary.
  await page.goto('http://localhost:5199/#/bibliotheque');
  await page.waitForSelector('.chips');
  const all = await page.locator('.pieces .piece').count();
  ok(all >= 15, `library lists ${all} pieces`);
  await page.click('.chip >> text=/Avancé/');
  ok((await page.locator('.pieces .piece').count()) < all, 'level filter narrows the list');
  await page.click('.chip >> text=/Tous/');
  await page.click('.piece:has-text("Menuet en sol") >> text=Ouvrir');
  await page.waitForSelector('.sheet-line');
  ok((await page.locator('.sheet-line').count()) >= 4, 'piece page shows the full score in lines');
  await page.click('text=Choisir comme morceau en cours');
  await page.waitForSelector('text=/ton morceau en cours/');
  ok(true, 'piece chosen as current');
  await page.goto('http://localhost:5199/#/');
  await page.waitForSelector('.pieces');
  ok((await page.textContent('.pieces .piece.current .t')) === 'Menuet en sol (Minuet in G)', 'home shows the chosen piece');
  await page.goto('http://localhost:5199/#/lexique');
  await page.waitForSelector('.glossary');
  await page.fill('.search', 'quarter');
  const found = (await page.locator('.glossary').allTextContents()).join(' ');
  ok(!!found && found.includes('noire') && found.includes('soupir'), 'glossary search finds French terms from English');

  // A 3/4 piece with a pickup plays in rhythm mode.
  await page.goto('http://localhost:5199/#/morceau/joyeux-anniversaire/4');
  await startExercise(page);
  await page.evaluate(() => (window as unknown as { __playInTime: () => void }).__playInTime());
  await page.waitForSelector('.results', { timeout: 60000 });
  ok((await page.textContent('.results'))!.includes('100 %'), '3/4 piece with pickup: every note judged on time');

  // Progress and settings pages render.
  await page.goto('http://localhost:5199/#/progres');
  await page.waitForSelector('.notemap');
  ok((await page.locator('.nm-key.seen').count()) > 5, 'progress: played notes coloured on the keyboard');
  ok((await page.locator('.cal .day.on').count()) >= 1, 'progress: today marked');
  await page.goto('http://localhost:5199/#/reglages');
  await page.waitForSelector('.seg');
  await page.click('.seg >> text=Sombre');
  ok((await page.getAttribute('html', 'data-theme')) === 'dark', 'settings: dark theme');
  await page.click('text=Copier mon code');
  ok(((await page.inputValue('textarea.code')) ?? '').length > 50, 'settings: progress code exported');

  ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await page.close();
}

// ---------- Browser without Web MIDI ----------
{
  const { page, errors } = await newPage(NO_MIDI, { width: 844, height: 390 });
  await page.goto('http://localhost:5199/#/lecon/do-main-droite');
  await page.waitForSelector('.kbd');
  ok((await page.locator('.key').count()) > 12, 'no MIDI: on-screen keyboard');
  await page.click('.intro >> text=C’est parti');
  const exp = Number(await page.getAttribute('.ex', 'data-expected'));
  await page.locator(`.key[data-midi="${exp}"]`).dispatchEvent('pointerdown', { pointerId: 1 });
  await page.locator(`.key[data-midi="${exp}"]`).dispatchEvent('pointerup', { pointerId: 1 });
  ok((await page.textContent('.count'))!.startsWith('1 /'), 'no MIDI: tapping the right key advances');
  await page.goto('http://localhost:5199/#/');
  await page.waitForSelector('.piano-status');
  ok((await page.getAttribute('.piano-status', 'data-state')) === 'unsupported', 'no MIDI: explained on home');
  ok(errors.length === 0, `no MIDI: no page errors (${errors.join(' | ')})`);
  await page.close();
}

await browser.close();
await server.close();
if (fails) {
  console.error(`\n${fails} failing check(s)`);
  process.exit(1);
}
console.log('\nUI OK.');

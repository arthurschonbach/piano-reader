/**
 * End-to-end check in a real browser, phone-sized:
 *  - a fake FP-10 behind Web MIDI: connect, test a note, play a full lesson by MIDI;
 *  - an "iPad" with no Web MIDI: explanation + on-screen keyboard.
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

/**
 * Replaces Web MIDI with one fake input; window.__midi(status, note, vel) plays on it.
 * Plain JS strings: tsx would otherwise inject helpers the page doesn't have.
 */
const FAKE_MIDI = `
  const input = { id: 'fp10', name: 'FP-10', state: 'connected', onmidimessage: null };
  const access = { inputs: new Map([['fp10', input]]), onstatechange: null };
  Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: () => Promise.resolve(access), configurable: true });
  const q = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (d) => d.name === 'midi' ? Promise.resolve({ state: 'prompt' }) : q(d);
  window.__midi = (s, n, v) => input.onmidimessage && input.onmidimessage({ data: new Uint8Array([s, n, v]), timeStamp: performance.now() });
`;

const NO_MIDI = `Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: undefined, configurable: true });`;

async function newPage(init: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript({ content: init });
  return { page, errors };
}

const midi = (page: Page, status: number, note: number, vel: number) =>
  page.evaluate(([s, n, v]) => (window as unknown as { __midi: (s: number, n: number, v: number) => void }).__midi(s, n, v), [status, note, vel]);
const strike = async (page: Page, note: number) => {
  await midi(page, 0x90, note, 90);
  await midi(page, 0x80, note, 0);
};

// ---------- Android phone + FP-10 ----------
{
  const { page, errors } = await newPage(FAKE_MIDI);
  await page.goto('http://localhost:5199/#/');
  await page.waitForSelector('.piano-card');
  ok((await page.textContent('.pc-title')) === 'Branche ton piano', 'phone: asks to plug the piano');
  await page.click('text=Connecter le piano');
  await page.waitForSelector('.piano-card[data-state="connected"]');
  ok((await page.textContent('.pc-title'))!.includes('FP-10'), 'phone: FP-10 shown as connected');
  await strike(page, 64);
  ok((await page.textContent('.pc-live'))!.includes('Mi'), 'phone: test note shows its name');

  await page.click('.lesson >> text=Commencer');
  await page.waitForSelector('.ex');
  ok((await page.locator('.kbd').count()) === 0, 'phone: no on-screen keys with a piano connected');
  ok((await page.textContent('.source'))!.includes('FP-10'), 'phone: input source is the FP-10');

  await strike(page, 50); // any key starts
  ok((await page.getAttribute('.ex', 'data-phase')) === 'play', 'phone: a key on the piano starts the exercise');

  const expected = async () => page.getAttribute('.ex', 'data-expected');
  const first = Number(await expected());
  const wrong = first === 65 ? 64 : 65;
  await strike(page, wrong);
  ok((await page.textContent('.feedback'))!.startsWith('✗'), 'phone: wrong key gets a ✗');
  ok((await page.getAttribute('.feedback', 'data-tone')) === 'bad', 'phone: wrong key is shown in red');
  ok(Number(await expected()) === first, 'phone: wrong key does not move on');

  // Pedal and stray controller messages must not count as notes.
  await midi(page, 0xb0, 64, 127);
  ok(Number(await expected()) === first, 'phone: sustain pedal is ignored');

  let guard = 0;
  let e: string | null;
  while ((e = await expected()) && guard++ < 80) await strike(page, Number(e));
  await page.waitForSelector('.results', { timeout: 3000 });
  const res = await page.textContent('.results');
  ok(!!res && res.includes('juste du premier coup'), 'phone: results screen after the last note');
  ok(!!res && res.includes(`joué au lieu de`), 'phone: the mistake is listed as a confusion');

  await page.click('text=Retour au parcours');
  await page.waitForSelector('.lessons');
  ok((await page.textContent('.lesson .st'))!.includes('dernière séance'), 'phone: lesson remembers the session');
  const stored = await page.evaluate(() => localStorage.getItem('piano-reader:progress:v2'));
  ok(!!stored && JSON.parse(stored).lessons['do-main-droite'].sessions.length === 1, 'phone: progress saved');

  await page.click('.lesson >> text=Jouer');
  await page.waitForSelector('.ex');
  await page.click('text=C’est parti');
  await page.click('text=Noms des notes');
  ok(await page.isVisible('.assisted'), 'phone: showing names warns the session will not count');
  ok(errors.length === 0, `phone: no page errors (${errors.join(' | ')})`);
  await page.close();
}

// ---------- iPad: no Web MIDI ----------
{
  const { page, errors } = await newPage(NO_MIDI);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('http://localhost:5199/#/');
  await page.waitForSelector('.piano-card');
  ok((await page.getAttribute('.piano-card', 'data-state')) === 'unsupported', 'iPad: explains there is no MIDI');
  await page.click('.lesson >> text=Commencer');
  await page.waitForSelector('.kbd');
  ok((await page.locator('.key').count()) > 12, 'iPad: on-screen keyboard offered');
  await page.click('text=C’est parti');
  const exp = Number(await page.getAttribute('.ex', 'data-expected'));
  await page.locator(`.key[data-midi="${exp}"]`).dispatchEvent('pointerdown', { pointerId: 1 });
  await page.locator(`.key[data-midi="${exp}"]`).dispatchEvent('pointerup', { pointerId: 1 });
  ok((await page.textContent('.count'))!.startsWith('1 /'), 'iPad: tapping the right key advances');
  ok(errors.length === 0, `iPad: no page errors (${errors.join(' | ')})`);
  await page.close();
}

await browser.close();
await server.close();
if (fails) {
  console.error(`\n${fails} failing check(s)`);
  process.exit(1);
}
console.log('\nUI OK.');

/**
 * End-to-end check of the real user flows on a tablet-size viewport:
 * home (library + practice) -> player (transport, toggles, mixer, loop)
 * -> back home, plus a MusicXML file import.
 *
 * Run with: npm run test:ui   (needs the Playwright chromium, already installed)
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    fails++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
};

const server = await createServer({ root: process.cwd(), server: { port: 5199 } });
await server.listen();

const browser = await chromium.launch();
// Tablet landscape on a music stand.
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto('http://localhost:5199/#/');
await page.waitForSelector('.page');

// Home: the two jobs.
ok((await page.textContent('.title')) === 'Piano Reader', 'home title');
const sects = await page.$$eval('.sect', (els) => els.map((e) => e.textContent));
ok(sects.includes('Your music') && sects.includes('Sight-reading'), `two sections (${sects.join(' / ')})`);
ok((await page.locator('.list .row').count()) >= 1, 'sample piece listed');

// Practice: 3 selects, start an endless exercise.
ok((await page.locator('.form select').count()) === 3, 'practice form has Hand/Level/Key');
await page.selectOption('.form select >> nth=1', '2');
await page.click('text=Start reading');
await page.waitForSelector('.player');
ok((await page.textContent('.psub')) === 'Sight-reading · endless', 'practice subtitle');
ok((await page.textContent('.pos')) === 'Bar 1 · ∞', 'practice starts at bar 1');

// Player transport + tablet toggles.
for (const label of ['Play', 'Sound', 'Click', 'Mix', 'A–G', 'Large', 'New page']) {
  ok((await page.locator('.player button', { hasText: label }).count()) >= 1, `player has ${label}`);
}
ok((await page.locator('.loopbar:not(.hidden)').count()) === 0, 'no loop UI on endless practice');

// Play/pause flips.
await page.click('.player button.play');
await page.waitForTimeout(400);
ok((await page.textContent('.player button.play')) === 'Pause', 'playing state');
await page.click('.player button.play');
ok((await page.textContent('.player button.play')) === 'Play', 'paused state');

// Mixer opens, sliders move.
await page.click('.player button:has-text("Mix")');
ok(await page.locator('.mixpanel:not(.hidden)').isVisible(), 'mixer panel opens');
await page.locator('.mixrow input[type=range]').first().fill('50');

// Back home, open the sample piece: finite UI gains a Loop button.
await page.click('text=‹ Library');
await page.waitForSelector('.page');
await page.locator('.list .row', { hasText: 'Twinkle' }).locator('button:has-text("Open")').click();
await page.waitForSelector('.player');
ok((await page.textContent('.psub')) === 'Your music', 'piece subtitle');
ok((await page.locator('.player button:has-text("Loop")').count()) === 1, 'loop toggle on finite pieces');
await page.click('.player button:has-text("Loop")');
ok(await page.locator('.loopbar:not(.hidden)').isVisible(), 'loop range bar appears');
await page.waitForFunction(() => (document.querySelector('.pos')?.textContent ?? '').includes('loop 1–8'));
ok(true, 'position shows the loop range');

// Import a two-part MusicXML file through the file input.
const dir = mkdtempSync(join(tmpdir(), 'piano-reader-'));
const xmlPath = join(dir, 'hands.xml');
writeFileSync(
  xmlPath,
  `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1">` +
    `<work><work-title>Both Hands</work-title></work>` +
    `<part-list><score-part id="P1"/><score-part id="P2"/></part-list>` +
    `<part id="P1"><measure number="1"><attributes><divisions>1</divisions>` +
    `<clef><sign>G</sign><line>2</line></clef></attributes>` +
    `<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>` +
    `</measure></part>` +
    `<part id="P2"><measure number="1"><attributes><divisions>1</divisions>` +
    `<clef><sign>F</sign><line>4</line></clef></attributes>` +
    `<note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>` +
    `</measure></part></score-partwise>`
);
await page.click('text=‹ Library');
await page.waitForSelector('.page');
await page.locator('.page input[type=file]').setInputFiles(xmlPath);
await page.waitForSelector('.player');
ok(((await page.textContent('.ptitle')) ?? '').includes('Both Hands'), 'imported two-part file opens');

ok(errors.length === 0, `no JS errors (${errors.join(' | ')})`);
console.log(fails ? `${fails} FAILURES` : 'UI OK');
await browser.close();
await server.close();
process.exit(fails ? 1 : 0);

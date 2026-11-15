/** The technique page: every drill, its tempo and how far it is from the goal. */
import { availableDrills, drillOfTheDay } from '../curriculum/coach';
import { lessonById } from '../curriculum/lessons';
import { DRILLS, type Drill } from '../curriculum/technique';
import type { App } from './app';
import { button, h, topBar } from './dom';

function drillRow(app: App, d: Drill, today: Drill | null, open: boolean): HTMLElement {
  const rec = app.progress.technique[d.id];
  const li = h('li', `piece${rec?.reached ? ' learnt' : ''}${d === today ? ' current' : ''}`);
  const meta = h('div', 'meta');
  meta.append(h('div', 't', d.title), h('div', 'd', d.desc));
  const bpm = rec?.bpm ?? d.startBpm;
  let st: string;
  if (rec?.reached) st = `✓ Tempo final atteint · ${d.goalBpm} bpm`;
  else if (rec?.sessions.length) st = `${bpm} / ${d.goalBpm} bpm · record ${rec.best || '—'}`;
  else st = `Départ à ${d.startBpm} bpm, objectif ${d.goalBpm}`;
  if (!open && d.after) st += ` · après la leçon ${lessonById(d.after)?.number ?? '?'}`;
  if (d === today) st += ' · aujourd’hui';
  meta.append(h('div', 'st', st));
  const bar = h('div', 'tempo-bar');
  const fill = h('span');
  fill.style.width = `${Math.round((100 * Math.max(0, bpm - d.startBpm)) / Math.max(1, d.goalBpm - d.startBpm))}%`;
  bar.append(fill);
  meta.append(bar);
  li.append(meta, button('Jouer', d === today ? 'btn primary' : 'btn', () => app.go(`#/technique/${d.id}`)));
  return li;
}

export function renderTechnique(root: HTMLElement, app: App): () => void {
  const view = h('div', 'subpage');
  view.append(topBar(app, 'Technique', () => app.go('#/')));
  const page = h('div', 'page');
  page.append(
    h('h1', 'title', 'Technique'),
    h(
      'p',
      'sub',
      'Gammes, arpèges et accords, avec leur doigté. Chaque exercice a son propre tempo : il monte un peu après chaque passage propre (justes, réguliers, liés), jamais avant. La séance du jour en propose un par jour.'
    )
  );
  const today = drillOfTheDay(app.progress);
  const avail = new Set(availableDrills(app.progress));
  for (const group of ['Gammes', 'Arpèges', 'Accords'] as const) {
    page.append(h('h2', 'sect', group));
    const ul = h('ul', 'pieces');
    for (const d of DRILLS.filter((x) => x.group === group)) ul.append(drillRow(app, d, today, avail.has(d)));
    page.append(ul);
  }
  page.append(h('p', 'hint', 'Les exercices marqués « après la leçon N » sont jouables tout de suite ; ils entrent dans la séance du jour une fois la leçon faite.'));
  view.append(page);
  root.append(view);
  return () => view.remove();
}

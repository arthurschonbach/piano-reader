/** Piece library, piece page and the full-score sheet view. */
import { ScoreRenderer } from '../core/engraver';
import type { Score } from '../core/model';
import { currentPiece, duePieces } from '../curriculum/coach';
import { PIECES, PIECE_STAGES, pieceById, pieceScore, pieceTags, type Piece } from '../curriculum/pieces';
import type { App } from './app';
import { button, h, topBar } from './dom';

export const LEVEL_NAMES = ['', 'Débutant', 'Facile', 'Moyen', 'Intermédiaire', 'Avancé'];

export function levelBadge(level: number): HTMLElement {
  const b = h('span', `level l${level}`, `${'●'.repeat(level)}${'○'.repeat(5 - level)} ${LEVEL_NAMES[level]}`);
  b.title = `Niveau ${level} sur 5`;
  return b;
}

function status(app: App, pc: Piece): string {
  const r = app.progress.pieces[pc.id];
  const stage = r?.stage ?? 0;
  if (stage >= PIECE_STAGES.length) {
    return duePieces(app.progress).some((x) => x.id === pc.id) ? '↻ Révision aujourd’hui' : `✓ Appris · révision le ${r?.due?.split('-').reverse().slice(0, 2).join('/')}`;
  }
  if (stage > 0) return `Étape ${stage + 1} / ${PIECE_STAGES.length} · ${PIECE_STAGES[stage].label}`;
  return '';
}

/** One row in a piece list. */
export function pieceRow(app: App, pc: Piece): HTMLElement {
  const cur = currentPiece(app.progress);
  const stage = app.progress.pieces[pc.id]?.stage ?? 0;
  const li = h('li', `piece${stage >= PIECE_STAGES.length ? ' learnt' : ''}${pc === cur ? ' current' : ''}`);
  const meta = h('div', 'meta');
  const top = h('div', 't', pc.title);
  meta.append(top, h('div', 'd', pc.origin));
  const badges = h('div', 'badges');
  badges.append(levelBadge(pc.level));
  for (const t of pieceTags(pc)) badges.append(h('span', 'tag', t));
  meta.append(badges);
  const st = status(app, pc) || (pc === cur ? 'Morceau en cours' : '');
  if (st) meta.append(h('div', 'st', st));
  li.append(meta, button('Ouvrir', pc === cur ? 'btn primary' : 'btn', () => app.go(`#/morceau/${pc.id}`)));
  return li;
}

export function renderLibrary(root: HTMLElement, app: App): () => void {
  const view = h('div', 'subpage');
  view.append(topBar(app, 'Bibliothèque', () => app.go('#/')));
  const page = h('div', 'page');
  page.append(
    h('h1', 'title', 'Bibliothèque'),
    h('p', 'sub', `${PIECES.length} morceaux libres de droits, du plus simple au plus avancé. Choisis ceux qui te plaisent : chacun s’apprend en ${PIECE_STAGES.length} étapes, puis revient en révision espacée.`)
  );
  const chips = h('div', 'chips');
  const list = h('ul', 'pieces');
  let filter = 0;
  const draw = () => {
    chips.innerHTML = '';
    for (const lv of [0, 1, 2, 3, 4, 5]) {
      const n = lv ? PIECES.filter((p) => p.level === lv).length : PIECES.length;
      if (lv && !n) continue;
      const b = button(lv ? `${LEVEL_NAMES[lv]} (${n})` : `Tous (${n})`, `chip${filter === lv ? ' on' : ''}`, () => {
        filter = lv;
        draw();
      });
      b.setAttribute('aria-pressed', String(filter === lv));
      chips.append(b);
    }
    list.innerHTML = '';
    for (const pc of PIECES.filter((p) => !filter || p.level === filter)) list.append(pieceRow(app, pc));
  };
  draw();
  page.append(chips, list);
  page.append(
    h('p', 'hint', 'Les niveaux : 1 = position fixe, notes longues · 2 = croches ou notes pointées, petite extension de la main · 3 = armure, mesure à 3 temps ou main gauche mobile · 4 = deux mains plus actives · 5 = croches partout, la main se déplace.')
  );
  view.append(page);
  root.append(view);
  return () => view.remove();
}

/** Static full score, wrapped in lines that fit the width. */
export function mountSheet(container: HTMLElement, app: App, score: Score): () => void {
  const wrap = h('div', 'sheet');
  container.append(wrap);
  const renderers: { canvas: HTMLCanvasElement; r: ScoreRenderer; line: Score; beats: number }[] = [];

  const build = () => {
    wrap.innerHTML = '';
    renderers.length = 0;
    const width = wrap.clientWidth || 600;
    const per = width > 900 ? 4 : width > 560 ? 3 : 2;
    const ms = score.measures;
    for (let i = 0; i < ms.length; i += per) {
      const slice = ms.slice(i, i + per);
      const shift = slice[0].startBeat;
      const line: Score = {
        ...score,
        infinite: i + per < ms.length,
        measures: slice.map((m, k) => ({
          ...m,
          number: k + 1,
          label: m.number,
          startBeat: m.startBeat - shift,
          keyChange: k === 0,
          time: i === 0 && k === 0 ? m.time : null,
          notes: m.notes.map((n) => ({ ...n, beat: n.beat - shift, tieEnd: n.tieEnd - shift }))
        }))
      };
      const beats = slice.reduce((a, m) => a + m.length, 0);
      const canvas = h('canvas');
      canvas.className = 'sheet-line';
      canvas.style.height = `${score.staves > 1 ? 230 : 130}px`;
      wrap.append(canvas);
      renderers.push({ canvas, r: new ScoreRenderer(canvas), line, beats });
    }
    paint();
  };
  const paint = () => {
    for (const x of renderers) {
      const rect = x.canvas.getBoundingClientRect();
      x.r.resize(rect.width, rect.height);
      x.r.draw(x.line, { beat: 0, lookahead: 0, names: false, zoom: 1, fitBeats: x.beats, cursor: false });
    }
  };
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    if (Math.abs(wrap.clientWidth - lastW) > 20) {
      lastW = wrap.clientWidth;
      build();
    }
  });
  ro.observe(wrap);
  const offTheme = app.onTheme(paint);
  return () => {
    ro.disconnect();
    offTheme();
    wrap.remove();
  };
}

export function renderPiece(root: HTMLElement, app: App, id: string): () => void {
  const piece = pieceById(id);
  if (!piece) {
    app.go('#/bibliotheque');
    return () => undefined;
  }
  const r = app.progress.pieces[piece.id];
  const stage = r?.stage ?? 0;
  const view = h('div', 'subpage');
  view.append(topBar(app, piece.title, () => app.go('#/bibliotheque')));
  const page = h('div', 'page wide');
  page.append(h('h1', 'title', piece.title), h('p', 'sub', `${piece.origin} · tempo cible ${piece.bpm} bpm`));
  const badges = h('div', 'badges');
  badges.append(levelBadge(piece.level));
  for (const t of pieceTags(piece)) badges.append(h('span', 'tag', t));
  page.append(badges);

  const isCurrent = currentPiece(app.progress) === piece;
  if (stage < PIECE_STAGES.length) {
    if (isCurrent) page.append(h('p', 'note', '★ C’est ton morceau en cours : la séance du jour te fait avancer dessus.'));
    else {
      page.append(
        button('Choisir comme morceau en cours', 'btn primary', () => {
          app.setProgress({ ...app.progress, focusPiece: piece.id });
          app.refresh();
        })
      );
    }
  }

  page.append(h('p', 'setup', `🖐 ${piece.setup}`));
  const tips = h('ul', 'tips');
  for (const t of piece.tips) tips.append(h('li', undefined, t));
  page.append(tips);

  page.append(h('h2', 'sect', 'Apprendre étape par étape'));
  const ol = h('ol', 'stages');
  PIECE_STAGES.forEach((st, i) => {
    const done = i < stage;
    const li = h('li', `pstage${done ? ' done' : ''}${i === stage ? ' current' : ''}`);
    li.append(h('span', 'num', done ? '✓' : String(i + 1)), h('span', 'lbl', st.label + (st.tempo ? ` (${Math.round(piece.bpm * st.tempo)} bpm)` : '')));
    li.append(button(i === stage ? 'Travailler' : 'Jouer', i === stage ? 'btn primary' : 'btn', () => app.go(`#/morceau/${piece.id}/${i}`)));
    ol.append(li);
  });
  page.append(ol);
  if (stage >= PIECE_STAGES.length) {
    page.append(h('p', 'note', `✓ Appris. ${r?.due ? `Prochaine révision le ${r.due.split('-').reverse().join('/')}` : ''} (${r?.reviews ?? 0} révision${(r?.reviews ?? 0) > 1 ? 's' : ''} réussie${(r?.reviews ?? 0) > 1 ? 's' : ''}).`));
  }
  page.append(h('p', 'hint', 'Une étape validée débloque la suivante. Ne fais pas tout le même jour : reprendre le lendemain fixe le morceau.'));

  page.append(h('h2', 'sect', 'Partition complète'), h('p', 'hint', 'Pour lire en avance ou travailler de ton côté. Les chiffres sont les doigtés (1 = pouce).'));
  const offSheet = mountSheet(page, app, pieceScore(piece, 'both'));

  view.append(page);
  root.append(view);
  return () => {
    offSheet();
    view.remove();
  };
}

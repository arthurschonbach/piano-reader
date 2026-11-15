/** French ↔ English music vocabulary, for someone who learnt from English videos. */
import type { App } from './app';
import { h, topBar } from './dom';

interface Term {
  fr: string;
  en: string;
  def: string;
}

const GROUPS: { title: string; terms: Term[] }[] = [
  {
    title: 'Durées des notes',
    terms: [
      { fr: 'ronde', en: 'whole note', def: '4 temps. Tête blanche, sans queue.' },
      { fr: 'blanche', en: 'half note', def: '2 temps. Tête blanche avec une queue.' },
      { fr: 'noire', en: 'quarter note', def: '1 temps. Tête noire avec une queue.' },
      { fr: 'croche', en: 'eighth note', def: '½ temps. Noire avec un crochet ; plusieurs croches sont reliées par une barre (beam).' },
      { fr: 'double croche', en: 'sixteenth note', def: '¼ de temps. Deux crochets ou deux barres.' },
      { fr: 'note pointée', en: 'dotted note', def: 'Le point ajoute la moitié de la durée : blanche pointée = 3 temps, noire pointée = 1 temps ½.' },
      { fr: 'liaison', en: 'tie / slur', def: 'Entre deux notes identiques : on tient sans rejouer (tie). Entre notes différentes : on joue lié (slur, legato).' },
      { fr: 'triolet', en: 'triplet', def: 'Trois notes dans le temps de deux.' }
    ]
  },
  {
    title: 'Silences',
    terms: [
      { fr: 'pause', en: 'whole rest', def: 'Silence de 4 temps (ou d’une mesure entière). Petit rectangle sous une ligne.' },
      { fr: 'demi-pause', en: 'half rest', def: 'Silence de 2 temps. Petit rectangle posé sur une ligne.' },
      { fr: 'soupir', en: 'quarter rest', def: 'Silence d’1 temps.' },
      { fr: 'demi-soupir', en: 'eighth rest', def: 'Silence d’½ temps.' }
    ]
  },
  {
    title: 'La portée',
    terms: [
      { fr: 'portée', en: 'staff (stave)', def: 'Les 5 lignes horizontales.' },
      { fr: 'grande portée', en: 'grand staff', def: 'Deux portées reliées : clé de sol en haut (main droite), clé de fa en bas (main gauche).' },
      { fr: 'ligne / interligne', en: 'line / space', def: 'Une note est soit sur une ligne, soit dans un interligne (l’espace entre deux lignes).' },
      { fr: 'ligne supplémentaire', en: 'ledger line', def: 'Petite ligne ajoutée au-dessus ou en dessous de la portée, comme pour le C central.' },
      { fr: 'clé de sol', en: 'treble clef (G clef)', def: 'S’enroule autour de la 2e ligne : cette ligne est un G4.' },
      { fr: 'clé de fa', en: 'bass clef (F clef)', def: 'Ses deux points entourent la 4e ligne : cette ligne est un F3.' },
      { fr: 'C central', en: 'middle C (C4)', def: 'Le C au milieu du clavier, juste à gauche des deux touches noires centrales.' },
      { fr: 'mesure', en: 'bar (measure)', def: 'Une case entre deux barres verticales.' },
      { fr: 'barre de mesure', en: 'bar line', def: 'Le trait vertical qui sépare les mesures. Double barre finale = fin du morceau.' },
      { fr: 'chiffrage (de la mesure)', en: 'time signature', def: 'Les deux chiffres au début : 4/4 (four-four) = 4 noires par mesure, 3/4 = 3 noires.' },
      { fr: 'temps', en: 'beat', def: 'Une pulsation, ce que compte le métronome.' },
      { fr: 'levée (anacrouse)', en: 'pickup (anacrusis)', def: 'Une ou quelques notes avant la première mesure complète.' },
      { fr: 'reprise', en: 'repeat sign', def: 'Barre avec deux points : on rejoue le passage.' }
    ]
  },
  {
    title: 'Hauteur des notes',
    terms: [
      { fr: 'do ré mi fa sol la si', en: 'C D E F G A B', def: 'Les mêmes notes, en solfège français et en lettres. L’app utilise les lettres.' },
      { fr: 'dièse ♯', en: 'sharp', def: 'Monte d’un demi-ton : la touche juste à droite (souvent une noire).' },
      { fr: 'bémol ♭', en: 'flat', def: 'Descend d’un demi-ton : la touche juste à gauche.' },
      { fr: 'bécarre ♮', en: 'natural', def: 'Annule un dièse ou un bémol jusqu’à la fin de la mesure.' },
      { fr: 'altération', en: 'accidental', def: 'Un ♯, ♭ ou ♮ écrit devant une note.' },
      { fr: 'armure', en: 'key signature', def: 'Les ♯ ou ♭ écrits après la clé : ils valent pour tout le morceau.' },
      { fr: 'demi-ton / ton', en: 'half step (semitone) / whole step', def: 'Demi-ton : deux touches voisines (noires comprises). Ton : deux demi-tons.' },
      { fr: 'intervalle', en: 'interval', def: 'L’écart entre deux notes : seconde (2nd), tierce (3rd), quarte (4th), quinte (5th), octave.' },
      { fr: 'octave', en: 'octave', def: 'Même note, 8 notes plus haut ou plus bas. C3 → C4 → C5.' },
      { fr: 'gamme', en: 'scale', def: 'Les notes d’une tonalité dans l’ordre : C D E F G A B C.' },
      { fr: 'tonalité', en: 'key', def: 'Ré majeur = D major, la mineur = A minor. L’armure l’indique.' },
      { fr: 'majeur / mineur', en: 'major / minor', def: 'Deux couleurs de gamme : plutôt lumineuse / plutôt sombre.' },
      { fr: 'accord', en: 'chord', def: 'Plusieurs notes jouées ensemble.' },
      { fr: 'arpège', en: 'arpeggio (broken chord)', def: 'Les notes d’un accord jouées l’une après l’autre.' },
      { fr: 'accords I, IV, V7', en: 'primary chords (tonic, subdominant, dominant 7th)', def: 'Les trois accords principaux d’une tonalité. En C : C-E-G, C-F-A, B-F-G.' },
      { fr: 'accord plaqué / brisé', en: 'block chord / broken chord', def: 'Toutes les notes ensemble / l’une après l’autre.' },
      { fr: 'basse d’Alberti', en: 'Alberti bass', def: 'Accord brisé en croches : bas, haut, milieu, haut (C-G-E-G).' },
      { fr: 'basse-accord', en: 'oom-pah (bass and chord)', def: 'La basse seule, puis le reste de l’accord, en alternance.' },
      { fr: 'cadence', en: 'cadence', def: 'La fin d’une phrase : V → I sonne conclusif, une fin sur V reste en suspens.' },
      { fr: 'motif / séquence', en: 'motif / sequence', def: 'Un petit dessin mélodique / le même dessin répété une note plus haut ou plus bas.' },
      { fr: 'imitation', en: 'imitation', def: 'Une main reprend le motif que l’autre vient de jouer.' },
      { fr: 'phrase', en: 'phrase', def: 'Une idée musicale complète, souvent 4 mesures, qui finit par une cadence.' }
    ]
  },
  {
    title: 'Au clavier',
    terms: [
      { fr: 'main droite / main gauche', en: 'right hand (RH) / left hand (LH)', def: 'Abréviations fréquentes sur les partitions : m.d. / m.g. en français.' },
      { fr: 'doigté', en: 'fingering', def: 'Les chiffres sur la partition : 1 = pouce (thumb), 2 = index, 3 = majeur, 4 = annulaire, 5 = auriculaire (pinky).' },
      { fr: 'position de C', en: 'C position (five-finger position)', def: 'Un doigt par touche, de C à G, sans bouger la main.' },
      { fr: 'passage du pouce', en: 'thumb under', def: 'Le pouce passe sous la main pour continuer une gamme.' },
      { fr: 'mains séparées / ensemble', en: 'hands separately / hands together', def: 'D’abord chaque main seule, puis les deux.' },
      { fr: 'mouvement parallèle / contraire', en: 'parallel / contrary motion', def: 'Les deux mains vont dans le même sens / en sens inverse, comme dans un miroir.' },
      { fr: 'lecture à vue', en: 'sight-reading', def: 'Jouer une partition jamais vue, d’un bout à l’autre sans s’arrêter.' },
      { fr: 'lecture anticipée', en: 'reading ahead (look-ahead)', def: 'Lire une ou deux notes plus loin que celle qu’on joue.' },
      { fr: 'pédale forte', en: 'sustain pedal (damper pedal)', def: 'La pédale de droite : les notes continuent de sonner.' }
    ]
  },
  {
    title: 'Tempo et caractère',
    terms: [
      { fr: 'tempo / pulsation', en: 'tempo / pulse', def: 'La vitesse, en battements par minute (bpm).' },
      { fr: 'métronome', en: 'metronome', def: 'Il clique sur chaque temps ; le premier temps de la mesure est accentué.' },
      { fr: 'décompte', en: 'count-in', def: 'Les clics avant de commencer : une mesure d’amorce.' },
      { fr: 'nuances', en: 'dynamics', def: 'p (piano) = doux, f (forte) = fort, mf = mezzo-forte, crescendo = de plus en plus fort.' },
      { fr: 'lié / détaché', en: 'legato / staccato', def: 'Notes enchaînées sans trou / notes courtes et séparées (un point au-dessus).' },
      { fr: 'liaison de durée', en: 'tie', def: 'Arc entre deux notes de même hauteur : on joue une fois, on tient les deux durées.' },
      { fr: 'liaison d’expression', en: 'slur', def: 'Arc sur des notes différentes : on les joue liées.' },
      { fr: 'note pointée', en: 'dotted note', def: 'Le point ajoute la moitié de la valeur : noire pointée = 1 temps et demi.' },
      { fr: 'syncope / contretemps', en: 'syncopation / off-beat', def: 'Note qui commence entre deux temps et enjambe le temps suivant.' },
      { fr: 'chiffrage (3/4, 6/8)', en: 'time signature', def: 'Nombre de temps par mesure et leur valeur : 3/4 = trois noires, 6/8 = six croches en deux groupes.' },
      { fr: 'ralentir / accélérer', en: 'ritardando / accelerando', def: 'rit. / accel. sur la partition.' },
      { fr: 'point d’orgue', en: 'fermata', def: 'On tient la note plus longtemps que prévu.' }
    ]
  }
];

export function renderGlossary(root: HTMLElement, app: App): () => void {
  const view = h('div', 'subpage');
  view.append(topBar(app, 'Lexique', () => app.go('#/')));
  const page = h('div', 'page');
  page.append(h('h1', 'title', 'Lexique français ↔ anglais'), h('p', 'sub', 'Les mots de l’app et leurs équivalents dans les vidéos en anglais.'));
  const search = h('input', 'search');
  search.type = 'search';
  search.placeholder = 'Chercher (ex. « noire », « quarter », « armure »)…';
  search.setAttribute('aria-label', 'Chercher un terme');
  page.append(search);
  const body = h('div');
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const draw = () => {
    const q = norm(search.value.trim());
    body.innerHTML = '';
    for (const g of GROUPS) {
      const terms = g.terms.filter((t) => !q || norm(`${t.fr} ${t.en} ${t.def}`).includes(q));
      if (!terms.length) continue;
      body.append(h('h2', 'sect', g.title));
      const dl = h('dl', 'glossary');
      for (const t of terms) {
        const dt = h('dt');
        dt.append(h('span', 'fr', t.fr), h('span', 'arrow', ' · '), h('span', 'en', t.en));
        dl.append(dt, h('dd', undefined, t.def));
      }
      body.append(dl);
    }
    if (!body.childElementCount) body.append(h('p', 'note', 'Aucun terme trouvé.'));
  };
  search.addEventListener('input', draw);
  draw();
  page.append(body);
  view.append(page);
  root.append(view);
  return () => view.remove();
}

"""Ne garde que les icônes Tabler utilisées par l'appli : police réduite + feuille de style réduite.
À relancer après avoir ajouté une icône dans le code : python3 scripts/build-icons.py
(les icônes des cadeaux déjà en base sont listées dans EXTRA).
Règle : toujours écrire le nom complet d'une icône dans le code ('ti-chevron-up'), jamais un morceau ('ti-chevron-' + x)."""
import re, os, glob
from fontTools import subset
ROOT = os.path.join(os.path.dirname(__file__), '..')
PKG = os.path.join(ROOT, 'node_modules/@tabler/icons-webfont/dist')
EXTRA = 'arrows-exchange ball-football bath beach bottle calendar-check cash certificate chef-hat clock-pause coffee device-mobile device-mobile-message door-exit glass glass-full movie music plane salad shirt shopping-bag sparkles speakerphone sun switch-horizontal tent ticket tools-kitchen-2 trophy gift'.split()
css = open(f'{PKG}/tabler-icons.min.css').read()
icons = dict(re.findall(r'\.ti-([a-z0-9-]+):before\{content:"\\([0-9a-f]+)"\}', css))
code = ''.join(open(f).read() for f in glob.glob(os.path.join(ROOT, 'src/**/*.js*'), recursive=True))
tokens = set(re.findall(r'[a-z0-9]+(?:-[a-z0-9]+)*', code))
tokens |= {t[3:] for t in tokens if t.startswith('ti-')}
used = sorted(n for n in icons if n in tokens or n in EXTRA)
cps = [int(icons[n], 16) for n in used]
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = []; opts.notdef_outline = True
font = subset.load_font(f'{PKG}/fonts/tabler-icons.ttf', opts)
sub = subset.Subsetter(opts); sub.populate(unicodes=cps); sub.subset(font)
subset.save_font(font, os.path.join(ROOT, 'src/assets/tabler-subset.woff2'), opts)
base = re.search(r'\.ti\{[^}]*\}', css).group(0)
out = ['/* Généré par scripts/build-icons.py : seules les icônes utilisées par Daraja. */',
       '@font-face{font-family:"tabler-icons";font-style:normal;font-weight:400;font-display:block;src:url("./assets/tabler-subset.woff2") format("woff2")}',
       base] + [f'.ti-{n}:before{{content:"\\{icons[n]}"}}' for n in used]
open(os.path.join(ROOT, 'src/icons.css'), 'w').write('\n'.join(out) + '\n')
print(len(used), 'icônes gardées sur', len(icons), '·', os.path.getsize(os.path.join(ROOT, 'src/assets/tabler-subset.woff2')) // 1024, 'Ko')

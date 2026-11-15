// Bibliothèque d'avatars : chaque combinaison style × graine a son image toute prête dans public/av/
export const AV_SEEDS = ['Shaker', 'Glacon', 'Citron', 'Olive', 'Safran', 'Zama', 'Momo', 'Tonic', 'Mojito', 'Negroni', 'Spritz', 'Martini', 'Paprika', 'Cumin', 'Tajine', 'Couscous', 'Mezcal', 'Bitter', 'Sirop', 'Menthe']
export const AV_STYLES = ['fun-emoji', 'bottts', 'big-smile', 'croodles', 'thumbs', 'adventurer', 'pixel-art', 'avataaars']
export const avFile = v => '/av/' + v.replace(':', '_') + '.svg'

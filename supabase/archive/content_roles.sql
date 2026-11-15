insert into daraja.questions(venue, level, kind, cat, theme, question, options, answer_idx, explanation, payload) values
-- CUISINE ET HYGIÈNE
(null,1,'qcm','cuisine','Cuisine','À quelle température garde-t-on les produits frais au réfrigérateur ?','["Entre 0 et 4 °C","Entre 8 et 12 °C","Autour de 15 °C","À −18 °C"]',0,'0 à 4 °C pour les produits très périssables. Au-dessus, les bactéries se multiplient vite.',null),
(null,1,'qcm','cuisine','Cuisine','La température d''un congélateur doit être de…','["−18 °C ou moins","−5 °C","0 °C","−2 °C"]',0,'−18 °C bloque le développement des bactéries.',null),
(null,1,'qcm','cuisine','Cuisine','Comment décongèle-t-on un produit ?','["Au réfrigérateur","Sur le plan de travail","Dans l''eau chaude","Au soleil"]',0,'Lentement au froid : jamais à température ambiante.',null),
(null,1,'tf','cuisine','Cuisine','On peut recongeler un produit qui a été décongelé.','["Vrai","Faux"]',1,'Faux ! Un produit décongelé ne se recongèle jamais tel quel. On le cuisine, ou on le jette.',null),
(null,1,'qcm','cuisine','Cuisine','La planche à découper rouge est réservée…','["À la viande crue","Aux légumes","Au poisson","Au pain"]',0,'Code couleur courant : rouge viande crue, bleu poisson, vert légumes, jaune volaille, blanc pain et laitages.',null),
(null,1,'qcm','cuisine','Cuisine','Un plat chaud en attente de service doit rester à…','["63 °C minimum","40 °C","25 °C","Température ambiante"]',0,'En dessous de 63 °C, on entre dans la zone où les bactéries se développent.',null),
(null,2,'qcm','cuisine','Cuisine','Combien d''allergènes majeurs doivent être signalés selon la réglementation européenne ?','["14","5","8","30"]',0,'Gluten, crustacés, œufs, poissons, arachides, soja, lait, fruits à coque, céleri, moutarde, sésame, sulfites, lupin, mollusques.',null),
(null,2,'qcm','cuisine','Cuisine','La « contamination croisée », c''est…','["Le transfert de bactéries ou d''allergènes d''un aliment à un autre","Un plat trop cuit","Un mélange de deux sauces","Une erreur de commande"]',0,'Exemple : couper du poulet cru puis une salade avec le même couteau.',null),
(null,2,'qcm','cuisine','Cuisine','Une préparation maison mise au frigo doit porter…','["Son nom, sa date de fabrication et sa date limite","Le prénom du cuisinier uniquement","Rien si c''est pour le jour même","Seulement le prix"]',0,'Sans étiquette, un produit maison doit être jeté.',null),
(null,2,'qcm','cuisine','Cuisine','Une friteuse prend feu. Le bon réflexe ?','["Couper le feu et étouffer avec un couvercle ou une couverture anti-feu","Jeter de l''eau","Souffler dessus","Déplacer la friteuse"]',0,'Jamais d''eau sur de l''huile en feu : elle provoque une explosion de flammes.',null),
(null,2,'qcm','cuisine','Cuisine','Un client allergique aux fruits à coque commande. Que fais-tu en cuisine ?','["Vérifier la recette, utiliser des ustensiles propres et prévenir le chef","Enlever les noix visibles","Rien, c''est au serveur de gérer","Ajouter un peu moins de fruits à coque"]',0,'Une trace suffit à déclencher une réaction grave.',null),
(null,2,'qcm','cuisine','Cuisine','Dans une brigade, qui seconde directement le chef ?','["Le sous-chef","Le commis","Le plongeur","Le chef de rang"]',0,'Le sous-chef (ou second) remplace le chef en son absence.',null),
(null,2,'tf','cuisine','Cuisine','Les montres et bracelets sont interdits en cuisine.','["Vrai","Faux"]',0,'Vrai ! Ils retiennent les bactéries et peuvent tomber dans les plats.',null),
(null,3,'qcm','cuisine','Cuisine','Un refroidissement rapide doit faire passer un plat de 63 °C à moins de 10 °C en…','["Moins de 2 heures","Une nuit","6 heures","30 minutes exactement"]',0,'C''est le rôle de la cellule de refroidissement.',null),
(null,3,'qcm','cuisine','Cuisine','Que veut dire HACCP ?','["Analyse des dangers et points critiques pour leur maîtrise","Hygiène, alimentation, cuisine, contrôle, propreté","Haute cuisine et contrôle des produits","Une marque de détergent"]',0,'La méthode qui organise la sécurité alimentaire en cuisine.',null),
(null,3,'qcm','cuisine','Cuisine','Lequel fait partie des 14 allergènes majeurs ?','["Le sésame","La tomate","Le poulet","Le riz"]',0,'Le sésame est très présent dans les cuisines orientales : attention au tahiné.',null),
(null,3,'qcm','cuisine','Cuisine','Une « brunoise », c''est…','["Une taille en tout petits dés","Une sauce brune","Une cuisson au four","Un dessert"]',0,'Julienne = fins bâtonnets, brunoise = petits dés réguliers.',null),
(null,3,'qcm','cuisine','Cuisine','Quelle différence entre DLC et DDM ?','["DLC : date stricte à ne pas dépasser ; DDM : date de qualité optimale","Aucune","DDM est plus stricte","DLC concerne seulement les boissons"]',0,'Après la DLC, on jette. Après la DDM, le produit peut perdre en goût sans être dangereux.',null),
(null,1,'match','cuisine','Associations','Relie chaque planche à son usage','[]',0,'Le code couleur évite les contaminations.','{"pairs":[["Rouge","Viande crue"],["Bleue","Poisson"],["Verte","Légumes"],["Jaune","Volaille"]]}'),
-- SÉCURITÉ
(null,1,'qcm','securite','Sécurité','Les issues de secours doivent être…','["Toujours dégagées et accessibles","Fermées à clé pendant le service","Utilisées pour stocker les caisses","Masquées par la déco"]',0,'Une issue encombrée est une faute rouge dans la charte.',null),
(null,1,'scene','securite','Sécurité','Un client visiblement ivre demande un autre verre.','["Je refuse poliment, je propose de l''eau ou un taxi et je préviens le responsable","Je le sers, c''est un client","Je lui dis qu''il a trop bu devant tout le monde","Je l''ignore"]',0,'Servir un client ivre est une faute rouge. La politesse évite l''escalade.',null),
(null,1,'qcm','securite','Sécurité','Une bagarre éclate. Que fais-tu ?','["Je n''interviens pas seul, j''alerte le responsable et j''éloigne les autres clients","Je m''interpose seul","Je filme","Je continue mon service"]',0,'Ta sécurité d''abord. On agit à plusieurs et on appelle la police si besoin.',null),
(null,1,'tf','securite','Sécurité','On peut utiliser un extincteur à eau sur un feu électrique.','["Vrai","Faux"]',1,'Faux ! Sur un feu électrique, on utilise un extincteur à CO2.',null),
(null,2,'qcm','securite','Sécurité','Au Maroc, quel numéro appelle les pompiers (protection civile) ?','["15","19","177","112"]',0,'15 pour les pompiers et secours, 19 pour la police en ville, 177 pour la gendarmerie.',null),
(null,2,'qcm','securite','Sécurité','Un client oublie son téléphone. Tu…','["Le remets au responsable et on le note au registre des objets trouvés","Le gardes jusqu''à son retour","Le laisses sur la table","Le mets au bar sans rien dire"]',0,'Traçabilité : on note l''heure, la table, et qui l''a remis.',null),
(null,2,'scene','securite','Sécurité','Un client devient agressif à l''entrée parce qu''il n''a pas de réservation.','["Je reste calme, voix posée, j''explique et j''appelle le responsable","Je hausse le ton pour me faire respecter","Je le pousse dehors","Je le laisse entrer pour éviter le problème"]',0,'Le calme désamorce. On ne répond jamais à une provocation.',null),
(null,2,'qcm','securite','Sécurité','En cas d''évacuation, le bon réflexe :','["Guider les clients vers les sorties, sans courir, jusqu''au point de rassemblement","Récupérer la caisse d''abord","Finir le service en cours","Prendre l''ascenseur"]',0,'Les clients d''abord, puis on vérifie que personne ne manque.',null),
(null,3,'scene','securite','Sécurité','Tu dois refuser l''entrée à un groupe. Ta phrase ?','["Je suis désolé, ce soir nous ne pouvons pas vous accueillir. Je vous souhaite une bonne soirée.","Vous ne rentrez pas, c''est tout.","Vous n''avez pas le style.","Revenez quand vous serez mieux habillés."]',0,'On peut refuser sans humilier. La réputation du lieu se joue aussi à la porte.',null),
(null,3,'tf','securite','Sécurité','L''agent de sécurité est souvent la première personne que le client voit.','["Vrai","Faux"]',0,'Vrai ! Un bonjour et un sourire à la porte, c''est le début de l''expérience.',null),
-- CAISSE, ACHATS ET STOCK
(null,1,'qcm','caisse','Caisse','Comment rendre la monnaie ?','["En comptant devant le client","En la posant vite sur la table","Sans la compter","En arrondissant à mon avantage"]',0,'Compter devant le client évite les litiges.',null),
(null,1,'qcm','caisse','Caisse','Il manque de l''argent dans ta caisse en fin de service. Tu…','["Le signales tout de suite au responsable","Complètes de ta poche sans rien dire","Le caches jusqu''à demain","Modifies le ticket"]',0,'Un écart signalé se comprend. Un écart caché devient une faute grave.',null),
(null,1,'tf','caisse','Caisse','Chaque produit servi doit avoir un bon ou un ticket enregistré.','["Vrai","Faux"]',0,'Vrai ! Un produit servi sans ticket est une faute dans la charte.',null),
(null,2,'qcm','caisse','Caisse','Qui peut annuler un ticket déjà encaissé ?','["Le responsable, après validation","N''importe quel serveur","Le client","Personne ne le vérifie"]',0,'Une annulation sans validation est une faute grave.',null),
(null,2,'qcm','caisse','Achats','Quand tu fais un achat pour l''établissement, tu rapportes toujours…','["La facture ou le ticket au nom de la société","Rien, on te fait confiance","Juste la monnaie","Une photo du magasin"]',0,'Sans pièce justificative, la dépense ne peut pas être comptabilisée.',null),
(null,2,'qcm','caisse','Stock','À la réception d''une livraison, avant de signer, tu vérifies…','["Quantités, prix, dates limites, température et état","Seulement le nombre de cartons","Rien, le livreur est pressé","Uniquement la facture"]',0,'Une fois signé, il est trop tard pour réclamer.',null),
(null,2,'qcm','caisse','Achats','Tu ramènes du poisson frais du marché. Comment le transportes-tu ?','["Dans une glacière ou un sac isotherme, et directement au froid","Dans un sac plastique au soleil","Dans le coffre toute la journée","Peu importe"]',0,'La chaîne du froid commence dès l''achat.',null),
(null,2,'qcm','caisse','Caisse','Un billet te paraît suspect. Tu…','["Vérifies le filigrane et le fil de sécurité, refuses poliment et préviens le responsable","L''acceptes pour ne pas vexer","Accuses le client","Le déchires"]',0,'On reste courtois : le client peut être de bonne foi.',null),
(null,3,'qcm','caisse','Caisse','Le « Z » de caisse, c''est…','["Le rapport de clôture qui récapitule les ventes de la journée","Une remise client","Le code de la caisse","Un ticket annulé"]',0,'Il sert à contrôler les recettes chaque soir.',null),
(null,3,'qcm','caisse','Stock','À quoi sert l''inventaire ?','["Comparer le stock théorique et le stock réel pour détecter les écarts","Ranger la réserve","Commander au hasard","Compter les clients"]',0,'Un écart révèle une perte, une casse ou une erreur de saisie.',null),
(null,3,'qcm','caisse','Stock','Un cocktail coûte 25 DH en ingrédients et se vend 125 DH. Son coût matière est de…','["20 %","25 %","50 %","80 %"]',0,'25 ÷ 125 = 0,20, soit 20 %.',null),
(null,1,'qcm','caisse','Stock','La règle FIFO à la réserve, c''est…','["Premier entré, premier sorti","Le plus récent d''abord","Le plus cher d''abord","Au hasard"]',0,'On place les nouveaux produits derrière les anciens.',null);

insert into daraja.missions(family, title) values
('salle','Raconte l''histoire d''un cocktail signature à 3 tables différentes'),
('salle','Retiens et utilise le prénom de 3 clients pendant le service'),
('salle','Propose un dessert ou un digestif à chaque table de ta zone pendant 3 services'),
('salle','Obtiens un avis Google qui cite ton prénom'),
('salle','Propose une bouteille de vin avec un accord à 2 tables'),
('salle','Accueille chaque table de ta zone en moins de 30 secondes toute la semaine'),
('bar','Présente la Mixology Class à 3 clients'),
('bar','Raconte l''origine d''un cocktail classique à 3 clients'),
('bar','Zéro préparation maison sans étiquette au bar toute la semaine'),
('bar','Propose une montée en gamme (gin ou whisky premium) à 5 clients'),
('bar','Poste impeccable à la fermeture 5 soirs d''affilée'),
('bar','Imagine une suggestion sans alcool pour un client qui ne boit pas'),
('cuisine','Zéro produit sans étiquette dans ta zone toute la semaine'),
('cuisine','Propose au chef une idée pour réduire le gaspillage'),
('cuisine','Relève et note les températures des frigos chaque jour de la semaine'),
('cuisine','Fais goûter et décris un plat à un serveur pour qu''il le vende mieux'),
('cuisine','Poste nettoyé à fond 5 soirs d''affilée'),
('cuisine','Aide un collègue d''un autre poste pendant un rush'),
('support','Accueille chaque client par un bonjour et un sourire 5 soirs d''affilée'),
('support','Zéro écart de caisse toute la semaine'),
('support','Chaque achat de la semaine avec sa facture au nom de la société'),
('support','Vérifie chaque soir que les issues de secours sont dégagées'),
('support','Apprends et utilise 3 phrases d''accueil en anglais'),
('support','Remonte une idée d''amélioration à ton manager');

with p as (
  select q.id, q.options->>q.answer_idx as correct,
    (select jsonb_agg(e order by random()) from jsonb_array_elements(q.options) e) as shuffled
  from daraja.questions q where q.cat in ('cuisine','securite','caisse') and q.kind in ('qcm','scene') and q.answer_idx = 0
)
update daraja.questions q set options = p.shuffled,
  answer_idx = (select (ord - 1)::int from jsonb_array_elements_text(p.shuffled) with ordinality t(v, ord) where v = p.correct limit 1)
from p where p.id = q.id;
select cat, count(*) from daraja.questions group by 1 order by 1;

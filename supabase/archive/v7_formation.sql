-- Formation vente : fiches (storytelling, accords cocktail et vin, phrase de vente) par établissement,
-- questions du défi tirées des fiches, et « à vendre » demandés par les managers (vente déclarée puis validée).

create table if not exists daraja.fiches (
  id uuid primary key default gen_random_uuid(),
  venue text not null references daraja.venues(id),
  section text not null default 'plat' check (section in ('entree', 'plat', 'dessert', 'boisson')),
  title text not null,
  story text,
  cocktail text,
  wine text,
  why text,
  pitch text,
  sort integer not null default 100,
  active boolean not null default true,
  updated_by uuid references daraja.staff(id) on delete set null,
  updated_at timestamp with time zone not null default now()
);
alter table daraja.fiches enable row level security;
create index if not exists fiches_venue_idx on daraja.fiches(venue, active);

create table if not exists daraja.sell_asks (
  id uuid primary key default gen_random_uuid(),
  venue text not null references daraja.venues(id),
  title text not null,
  note text,
  fiche_id uuid references daraja.fiches(id) on delete set null,
  points integer not null check (points between 5 and 200),
  starts date not null,
  ends date not null,
  active boolean not null default true,
  created_by uuid references daraja.staff(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  check (ends >= starts)
);
alter table daraja.sell_asks enable row level security;

alter table daraja.point_events drop constraint if exists point_events_kind_check;
alter table daraja.point_events add constraint point_events_kind_check CHECK (kind = ANY (ARRAY['quiz', 'avis', 'bonus', 'malus', 'cadeau', 'vente']));
alter table daraja.point_events add column if not exists ask_id uuid references daraja.sell_asks(id) on delete set null;

insert into daraja.rule_values(key, val) values ('sale_cap', 10) on conflict (key) do nothing;

-- Les ventes validées comptent pour les niveaux, comme les avis clients.
CREATE OR REPLACE FUNCTION daraja.earned(p_staff uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select coalesce(sum(amount),0)::int from daraja.point_events where staff_id = p_staff and status = 'ok' and kind in ('quiz','avis','bonus','vente') $function$;

-- Questions du défi tirées d'une fiche : « quel cocktail / quel vin conseiller avec ce plat ? ».
-- Les mauvaises réponses sont prises dans les autres fiches du même établissement, de longueur voisine.
CREATE OR REPLACE FUNCTION daraja.fiche_sync(p_fiche uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare f daraja.fiches; k text; good text; wrong text[]; opts jsonb; pos int; q text; qid uuid;
begin
  select * into f from daraja.fiches where id = p_fiche;
  foreach k in array array['cocktail', 'wine'] loop
    -- une question par fiche et par type ; jamais supprimée (l'historique des réponses y est lié), seulement mise à jour ou éteinte
    select id into qid from daraja.questions where payload->>'fiche' = p_fiche::text and payload->>'k' = k;
    good := case when f.active and f.section <> 'boisson' then nullif(trim(case k when 'cocktail' then f.cocktail else f.wine end), '') end;
    wrong := null;
    if good is not null then
      select array_agg(x.v) into wrong from (
        select v from (select distinct trim(case k when 'cocktail' then o.cocktail else o.wine end) v
          from daraja.fiches o where o.venue = f.venue and o.active and o.id <> f.id) d
        where v is not null and v <> '' and lower(v) <> lower(good)
        order by abs(length(v) - length(good)), v limit 3) x;
    end if;
    if good is null or coalesce(cardinality(wrong), 0) < 3
       or length(good) > 1.25 * (select max(length(w)) from unnest(wrong) w) then
      update daraja.questions set active = false where id = qid;
      continue;
    end if;
    pos := (abs(hashtext(f.id::text || k)) % 4);
    opts := to_jsonb(wrong[1:pos] || array[good] || wrong[pos + 1:3]);
    q := case k when 'cocktail' then 'Quel cocktail conseiller avec « ' || f.title || ' » ?'
                else 'Quel vin conseiller avec « ' || f.title || ' » ?' end;
    if qid is null then
      insert into daraja.questions(venue, theme, question, options, answer_idx, explanation, active, level, kind, payload, cat)
        values (f.venue, 'Accords', q, opts, pos, coalesce(f.why, f.pitch), true, 2, 'qcm', jsonb_build_object('fiche', f.id, 'k', k), 'vente');
    else
      update daraja.questions set question = q, options = opts, answer_idx = pos, explanation = coalesce(f.why, f.pitch), active = true where id = qid;
    end if;
  end loop;
end $function$;

-- Bibliothèque : chacun voit celle de son établissement ; la direction choisit l'établissement.
CREATE OR REPLACE FUNCTION public.daraja_fiches(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, 'baro') else s.venue end;
  return json_build_object('venue', v, 'can_edit', s.role in ('admin', 'super'),
    'items', (select coalesce(json_agg(json_build_object('id', f.id, 'section', f.section, 'title', f.title, 'story', f.story,
        'cocktail', f.cocktail, 'wine', f.wine, 'why', f.why, 'pitch', f.pitch, 'sort', f.sort)
        order by case f.section when 'entree' then 1 when 'plat' then 2 when 'dessert' then 3 else 4 end, f.sort, f.title), '[]'::json)
      from daraja.fiches f where f.venue = v and f.active));
end $function$;

-- Modifier ou créer une fiche : managers (leur établissement) et direction.
CREATE OR REPLACE FUNCTION public.daraja_fiche_save(p_token text, p_venue text, p_fiche jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; fid uuid; t text := left(trim(coalesce(p_fiche->>'title', '')), 60); sec text := coalesce(p_fiche->>'section', 'plat');
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  if length(t) < 2 then return json_build_object('ok', false, 'error', 'title'); end if;
  if sec not in ('entree', 'plat', 'dessert', 'boisson') then return json_build_object('ok', false, 'error', 'section'); end if;
  fid := nullif(p_fiche->>'id', '')::uuid;
  if fid is null then
    insert into daraja.fiches(venue, section, title, story, cocktail, wine, why, pitch, updated_by)
      values (v, sec, t, left(p_fiche->>'story', 600), left(p_fiche->>'cocktail', 60), left(p_fiche->>'wine', 80),
              left(p_fiche->>'why', 600), left(p_fiche->>'pitch', 400), s.id) returning id into fid;
  else
    update daraja.fiches set section = sec, title = t, story = left(p_fiche->>'story', 600), cocktail = left(p_fiche->>'cocktail', 60),
      wine = left(p_fiche->>'wine', 80), why = left(p_fiche->>'why', 600), pitch = left(p_fiche->>'pitch', 400),
      updated_by = s.id, updated_at = now()
      where id = fid and venue = v and active;
    if not found then return json_build_object('ok', false, 'error', 'fiche'); end if;
  end if;
  -- les questions de toutes les fiches de l'établissement suivent (les mauvaises réponses viennent des autres fiches)
  perform daraja.fiche_sync(f.id) from daraja.fiches f where f.venue = v and f.active;
  return json_build_object('ok', true, 'id', fid);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_fiche_delete(p_token text, p_fiche uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  select venue into v from daraja.fiches where id = p_fiche and active;
  if v is null then return json_build_object('ok', false); end if;
  perform daraja.can_admin(s, v);
  update daraja.fiches set active = false, updated_by = s.id, updated_at = now() where id = p_fiche;
  perform daraja.fiche_sync(f.id) from daraja.fiches f where f.venue = v;
  return json_build_object('ok', true);
end $function$;

-- « À vendre » en cours pour l'équipier, avec ce qu'il a déjà déclaré aujourd'hui.
CREATE OR REPLACE FUNCTION public.daraja_asks(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; d date := daraja.today();
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, 'baro') else s.venue end;
  return coalesce((select json_agg(json_build_object('id', a.id, 'title', a.title, 'note', a.note, 'points', a.points, 'ends', a.ends,
      'fiche', a.fiche_id,
      'mine_today', (select count(*) from daraja.point_events e where e.staff_id = s.id and e.ask_id = a.id
                     and e.status <> 'rejected' and (e.created_at at time zone 'Africa/Casablanca')::date = d),
      'validated', (select count(*) from daraja.point_events e where e.staff_id = s.id and e.ask_id = a.id and e.status = 'ok'),
      'team', (select count(*) from daraja.point_events e where e.ask_id = a.id and e.status = 'ok')) order by a.created_at desc)
    from daraja.sell_asks a where a.venue = v and a.active and d between a.starts and a.ends), '[]'::json);
end $function$;

-- Un équipier déclare une vente : en attente jusqu'à la validation du manager (comme un avis client).
CREATE OR REPLACE FUNCTION public.daraja_sale_declare(p_token text, p_ask uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; a daraja.sell_asks; d date := daraja.today(); n int;
begin
  s := daraja.who(p_token);
  if s.role <> 'staff' then return json_build_object('ok', false, 'error', 'role'); end if;
  select * into a from daraja.sell_asks where id = p_ask for update;
  if a.id is null or not a.active or a.venue <> s.venue or d not between a.starts and a.ends then
    return json_build_object('ok', false, 'error', 'closed'); end if;
  select count(*) into n from daraja.point_events e where e.staff_id = s.id and e.ask_id = a.id
    and e.status <> 'rejected' and (e.created_at at time zone 'Africa/Casablanca')::date = d;
  if n >= daraja.rv('sale_cap') then return json_build_object('ok', false, 'error', 'cap'); end if;
  insert into daraja.point_events(staff_id, kind, amount, note, status, ask_id) values (s.id, 'vente', a.points, left(a.title, 120), 'pending', a.id);
  return json_build_object('ok', true, 'mine_today', n + 1);
end $function$;

-- Managers et direction : liste des demandes, création, arrêt.
CREATE OR REPLACE FUNCTION public.daraja_admin_asks(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  return coalesce((select json_agg(json_build_object('id', a.id, 'title', a.title, 'note', a.note, 'points', a.points, 'starts', a.starts, 'ends', a.ends,
      'live', a.active and daraja.today() between a.starts and a.ends,
      'sold', (select count(*) from daraja.point_events e where e.ask_id = a.id and e.status = 'ok'),
      'pending', (select count(*) from daraja.point_events e where e.ask_id = a.id and e.status = 'pending')) order by a.active desc, a.ends desc, a.created_at desc)
    from daraja.sell_asks a where a.venue = v and (a.active or a.ends >= daraja.today() - 30)), '[]'::json);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_ask_save(p_token text, p_venue text, p_ask jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; t text := left(trim(coalesce(p_ask->>'title', '')), 80); pts int; days int; fid uuid; aid uuid;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  if length(t) < 2 then return json_build_object('ok', false, 'error', 'title'); end if;
  pts := coalesce((p_ask->>'points')::int, 0);
  if pts not between 5 and 200 then return json_build_object('ok', false, 'error', 'points'); end if;
  days := coalesce((p_ask->>'days')::int, 1);
  if days not between 1 and 31 then return json_build_object('ok', false, 'error', 'days'); end if;
  fid := nullif(p_ask->>'fiche', '')::uuid;
  if fid is not null and not exists (select 1 from daraja.fiches where id = fid and venue = v) then fid := null; end if;
  insert into daraja.sell_asks(venue, title, note, fiche_id, points, starts, ends, created_by)
    values (v, t, left(p_ask->>'note', 200), fid, pts, daraja.today(), daraja.today() + days - 1, s.id) returning id into aid;
  return json_build_object('ok', true, 'id', aid);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_ask_stop(p_token text, p_ask uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  select venue into v from daraja.sell_asks where id = p_ask;
  if v is null then return json_build_object('ok', false); end if;
  perform daraja.can_admin(s, v);
  update daraja.sell_asks set active = false where id = p_ask;
  return json_build_object('ok', true);
end $function$;

-- Validation : avis clients et ventes déclarées passent par la même liste.
CREATE OR REPLACE FUNCTION public.daraja_admin_review(p_token text, p_event uuid, p_ok boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin_staff(s, (select e.staff_id from daraja.point_events e where e.id = p_event), false);
  update daraja.point_events set status = case when p_ok then 'ok' else 'rejected' end, by_staff = s.id
    where id = p_event and kind in ('avis', 'vente') and status = 'pending';
  return json_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_admin(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  return json_build_object(
    'reviews', (select coalesce(json_agg(json_build_object('id', e.id, 'name', o.name, 'note', e.note, 'kind', e.kind, 'amount', e.amount) order by e.created_at), '[]'::json)
      from daraja.point_events e join daraja.staff o on o.id = e.staff_id
      where o.venue = v and e.kind in ('avis', 'vente') and e.status = 'pending'),
    'gifts', (select coalesce(json_agg(json_build_object('id', e.id, 'name', o.name, 'note', e.note) order by e.created_at), '[]'::json)
      from daraja.point_events e join daraja.staff o on o.id = e.staff_id
      where o.venue = v and e.kind = 'cadeau' and not e.delivered),
    'staff', (select coalesce(json_agg(json_build_object('id', o.id, 'name', o.name, 'alias', o.alias, 'avatar', o.avatar, 'role', o.role,
        'post', o.post, 'post_label', p.label, 'family', daraja.family(o), 'phone', o.phone, 'birthday', o.birthday, 'points', daraja.balance(o.id),
        'mission_done', exists(select 1 from daraja.mission_done m where m.staff_id = o.id and m.week = daraja.week_start())) order by o.name), '[]'::json)
      from daraja.staff o left join daraja.posts p on p.id = o.post where o.venue = v and o.active and o.role <> 'super'));
end $function$;

revoke execute on function daraja.fiche_sync(uuid) from public, anon, authenticated;
revoke execute on function public.daraja_fiches(text, text), public.daraja_fiche_save(text, text, jsonb), public.daraja_fiche_delete(text, uuid),
  public.daraja_asks(text, text), public.daraja_sale_declare(text, uuid), public.daraja_admin_asks(text, text),
  public.daraja_ask_save(text, text, jsonb), public.daraja_ask_stop(text, uuid) from public, authenticated;
grant execute on function public.daraja_fiches(text, text), public.daraja_fiche_save(text, text, jsonb), public.daraja_fiche_delete(text, uuid),
  public.daraja_asks(text, text), public.daraja_sale_declare(text, uuid), public.daraja_admin_asks(text, text),
  public.daraja_ask_save(text, text, jsonb), public.daraja_ask_stop(text, uuid) to anon;

-- Premier lot de fiches (validé le 16/11/2026), puis leurs questions.
insert into daraja.fiches(venue, section, title, story, cocktail, wine, why, pitch, sort)
select * from (values
('baro', 'plat', 'Le Tigre qui pleure', 'Le nom vient de Thaïlande : le cuisinier pleurait devant une viande trop bonne pour la partager.', 'Marrakesh Market', 'S de Siroua (Syrah)', 'La marinade asiatique et le bœuf appellent du poivré : le ras el hanout du cocktail et la Syrah reprennent cette chaleur sans l''écraser.', '« C''est notre bœuf le plus parfumé. Avec, je vous conseille la Syrah de Siroua, elle est née pour les épices. »', 10),
('baro', 'plat', 'Pêche Atlantique', 'Le poisson du jour arrive de l''Atlantique marocain.', 'Rosée du Matin', 'Petit Chablis', 'Le beurre blanc demande un vin tendu et minéral qui nettoie le palais ; rose et camomille restent légères comme le poisson.', '« Le poisson est arrivé ce matin. Un Petit Chablis bien frais, et vous êtes au bord de l''océan. »', 20),
('baro', 'plat', 'Tortellonis aux cèpes', 'La tuile de parmesan du Truffle on the Rocks répond au vieux parmesan de l''émulsion.', 'Truffle on the Rocks', 'Bourgogne Pinot Noir', 'Cèpes, parmesan et truffe parlent la langue de l''umami ; le Pinot Noir a des arômes de sous-bois qui prolongent le plat.', '« Pour les tortellonis, je vous propose le Pinot Noir : il sent la forêt, comme les cèpes. »', 30),
('baro', 'plat', 'Héritage Marocain', 'Une recette de grand-mère ; l''Apothicaire, signature de la maison depuis 2016, s''inspire des remèdes de nos aïeules.', 'Apothicaire', 'Ait Souala Viognier', 'Le citron confit appelle acidité et herbes ; le Viognier, aux notes d''abricot, adoucit la sauce sans la couvrir.', '« Deux recettes de grand-mère sur la même table : le poulet au citron confit et l''Apothicaire. »', 40),
('baro', 'entree', 'Pastilla aux fruits de mer', 'Le safran vient de Taliouine, où le soleil fait naître l''épice la plus chère du monde.', 'Liquid Sunshine', 'Roslane 1er Cru blanc', 'La crème au safran répond au safran infusé dans la tequila ; le Chardonnay, rond, épouse la crème.', '« Le safran de Taliouine dans l''assiette et dans le verre : on fait le voyage en entier ? »', 50),
('baro', 'entree', 'Cigars de Lalla', 'Des cigares au poulet et gingembre, roulés à la main comme pour les fêtes.', 'Penicillin', 'Pinot Grigio', 'Le gingembre du plat et du cocktail se répondent ; le Pinot Grigio, frais et léger, coupe le croustillant.', '« Les cigares de Lalla partent vite : je vous en mets une portion pour la table avec vos cocktails ? »', 60),
('baro', 'entree', 'Toast de bœuf chimichurri', 'Le Jimi Hendrix rend hommage au musicien, tombé sous le charme du Maroc dans les années 60.', 'Jimi Hendrix', 'Côtes du Rhône Guigal', 'Le chimichurri est fait d''herbes vertes : le cocktail reprend basilic, thym et origan ; le Rhône apporte le fruit noir pour le bœuf.', '« Le toast est piquant et plein d''herbes : le Jimi Hendrix a exactement les mêmes. »', 70),
('baro', 'entree', 'Daurade façon ceviche', 'Le ceviche vient du Pérou ; ici il rencontre la mangue et le wonton croustillant.', 'Lust Martini', 'Touraine Sauvignon Blanc', 'La mangue du ceviche se retrouve dans le cocktail ; le Sauvignon, vif, prolonge le citron de la marinade.', '« Un plat frais et un peu piquant : avec le Lust Martini, c''est la mangue des deux côtés. »', 80),
('baro', 'entree', 'Carpaccio de bœuf', 'Le carpaccio est né au Harry''s Bar de Venise, le Negroni à Florence.', 'Negroni Fizz', 'Chianti', 'L''amertume et la fraise du Negroni Fizz réveillent le bœuf cru ; le Chianti a l''acidité qui va avec le parmesan.', '« Un plat italien, un vin toscan : le Chianti, tout simplement. »', 90),
('baro', 'entree', 'Brie pané et poire', 'Le Mooja, « la vague » : un tourbillon entre parfum de fleur et fruit exotique.', 'Mooja', 'Studio by Miraval rosé', 'Le fondant et la poire aiment le fruité et la fleur d''oranger du Mooja ; le rosé reste frais face au fromage chaud.', '« Pour le brie, un cocktail doux et floral : le Mooja. »', 100),
('baro', 'dessert', 'Tarte chocolat et entremets noisette', 'Pâte d''amande, crémeux mangue-passion, caramel, et un entremets croustillant aux noisettes.', 'Martini Espresso', 'Amaretto (digestif)', 'Le café et le chocolat se renforcent ; l''amande de l''Amaretto répond à la pâte d''amande et à la noisette.', '« Pour finir, un Martini Espresso avec le chocolat ? C''est le dessert et le café en un. »', 110),
('zz', 'entree', 'Tanjia Marrakchia', 'La tanjia est le plat de Marrakech cuit toute une nuit dans les cendres du hammam ; ici, elle devient croustillante.', 'Marrakesh Market', 'Côtes du Rhône Guigal', 'Le jarret confit au safran aime les épices chaudes du cocktail ; le Rhône a la rondeur d''une viande mijotée.', '« C''est le plat le plus marrakchi de la carte. Avec un Marrakesh Market, vous avez la médina dans l''assiette et dans le verre. »', 120),
('zz', 'entree', 'Burrata Beldi', '« Beldi » veut dire « de chez nous » : une burrata relevée par la mélasse de grenade du Levant.', 'Tomatini', 'Studio by Miraval rosé', 'Le Tomatini reprend la tomate, l''origan et la note fromagère ; le rosé reste frais face à la crème de la burrata.', '« Pour ouvrir, la burrata et un Tomatini : une salade de tomates dans un verre, en plus surprenant. »', 130),
('zz', 'entree', 'Gambas de Carthage', 'Carthage, port de Tunisie, patrie de la harissa.', 'Mojito Soltane', 'Petit Chablis', 'La harissa chauffe, la menthe et le prosecco rafraîchissent ; le Chablis, minéral, tient tête au beurre citronné.', '« Les gambas sont relevées : un Mojito Soltane pour les calmer, ou un Petit Chablis bien frais. »', 140),
('zz', 'entree', 'Ceviche Barba', 'La marinade berbère à la coriandre rencontre le ceviche d''Amérique du Sud.', 'Rose de Damas', 'Touraine Sauvignon Blanc', 'L''hibiscus et la rose rejoignent la douceur de la betterave ; le Sauvignon prolonge la coriandre et le citron.', '« Un plat frais et très coloré : la Rose de Damas a la même couleur, et la même légèreté. »', 150),
('zz', 'entree', 'Tfaya chèvre chaud', 'La tfaya est la garniture des grands couscous de fête, oignons confits à la cannelle.', 'Berberliner', 'Ait Souala Viognier', 'Oignons à la cannelle, amlou et miel d''amande parlent le même sucré-salé ; le Viognier adoucit le chèvre.', '« Le chèvre avec la tfaya des couscous de fête : avec le Berberliner à l''amlou, c''est un goûter de grand-mère revisité. »', 160),
('zz', 'entree', 'Kefta Meshwya', 'Le CB Signature est la cuvée de la maison.', 'Scorpion', 'CB Signature', 'Le grillé et le poivron fumé répondent aux poivrons et à la harissa du Scorpion ; le CB Signature a le fruit pour la viande grillée.', '« Pour les grillades, notre propre vin, le CB Signature. »', 170),
('zz', 'plat', 'Perles du Maghreb', 'La mhamssa, perles de blé roulées à la main, cuisinée comme un risotto.', 'NoorShems', 'Chassagne-Montrachet', 'La crème de safran et les palourdes appellent un blanc riche ; le NoorShems est infusé au même safran.', '« Les perles de blé au safran : le NoorShems est le cocktail du safran, ils sont faits l''un pour l''autre. »', 180),
('zz', 'plat', 'Le Tigre qui Danse', 'Le tigre danse et le serpent danse : les deux danseurs de la maison réunis.', 'Snake Dance', 'S de Siroua (Syrah)', 'Gingembre et ras el hanout dans le plat, gingembre et vanille pimentée dans le verre ; la Syrah est poivrée comme la sauce.', '« Le Tigre qui Danse avec un Snake Dance : nos deux danseurs. »', 190),
('zz', 'plat', 'Osso Bucco Mrozia', 'La mrozia est le plat de l''Aïd, sucré-salé aux sept épices.', 'Old Fashioned', 'Marqués de Cáceres Reserva', 'La viande longuement cuite demande des tanins fondus ; le whisky répond au caramel du jus réduit.', '« Pour la viande, un Rioja : il est généreux avec les épices. »', 200),
('zz', 'plat', 'Agneau Samarkand', 'Samarkand, l''étape de la route de la soie.', 'Mezcal Negroni', 'Château Le Vieux Fort', 'Le beurre noisette et les câpres aiment un Bordeaux souple ; le fumé du mezcal répond à la côtelette grillée.', '« Avec l''agneau, un Bordeaux : le Château Le Vieux Fort. »', 210),
('zz', 'plat', 'Loup Bar doré', 'La chermoula est la marinade de tous les poissons du Maroc, d''Essaouira à Tétouan.', 'Cardarita', 'Ait Souala Gris', 'La chermoula est herbacée et citronnée comme le céleri et la cardamome du Cardarita ; un gris marocain est le vin naturel du tajine de poisson.', '« Avec le tajine de poisson, un gris marocain : c''est l''accord de chez nous. »', 220),
('zz', 'dessert', 'Fondant Amlou', 'Les dattes et l''amande : les deux douceurs du Maroc.', 'Dolce Hayat', 'Perrier-Jouët Blason Rosé', 'Les dattes du Dolce Hayat et l''amande de l''amlou se répondent ; les bulles allègent un dessert riche.', '« On fête quelque chose ce soir ? Le Fondant Amlou avec deux coupes de rosé. »', 230)
) v(venue, section, title, story, cocktail, wine, why, pitch, sort)
where not exists (select 1 from daraja.fiches);
select daraja.fiche_sync(id) from daraja.fiches;

-- Notifications : vente validée (famille cadeaux et points), ventes à valider (alertes managers).
CREATE OR REPLACE FUNCTION daraja.push_candidates(p_now timestamp with time zone)
 RETURNS TABLE(staff_id uuid, family text, ref text, tag text, title text, body text, url text, prio integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare cfg jsonb := daraja.push_cfg(); d date := (p_now at time zone 'Africa/Casablanca')::date;
  h int := extract(hour from p_now at time zone 'Africa/Casablanca'); m date := date_trunc('month', d)::date;
begin
  return query
  with subs as (select ps.staff_id sid, min(ps.created_at) since from daraja.push_subscriptions ps group by ps.staff_id),
  ppl as (select st.*, subs.since from daraja.staff st join subs on subs.sid = st.id where st.active
          and (cfg->>'mode' = 'all' or (cfg->>'mode' = 'direction' and st.role = 'super'))),
  played as (select q.staff_id from daraja.quiz_sessions q where q.day = d and cardinality(q.answered) >= cardinality(q.question_ids)),
  serie as (select p.id from ppl p where p.role = 'staff' and p.streak >= 2 and p.last_quiz_day = d - 1
            and h >= (cfg->>'serie_hour')::int and p.id not in (select played.staff_id from played))
  -- Série en danger (le soir) : prioritaire sur le simple rappel
  select p.id, 'serie', 'serie:' || d, 'quiz', 'Ta série : ' || p.streak || ' jours 🔥', 'Un défi ce soir et elle continue.', '/?go=quiz', 1
    from ppl p where p.id in (select serie.id from serie)
  union all
  -- Rappel du défi du jour, s'il n'a pas joué
  select p.id, 'quiz', 'quiz:' || d, 'quiz', 'Ton défi du jour t''attend', '5 questions, 2 minutes. À toi de jouer !', '/?go=quiz', 2
    from ppl p where p.role = 'staff' and h >= coalesce((cfg->>'quiz_hour')::int, 12) and p.id not in (select played.staff_id from played) and p.id not in (select serie.id from serie)
  union all
  -- Nouveau défi reçu (duel du même établissement)
  select du.opponent, 'defi', 'duel:' || du.id, 'duel-' || du.id, 'Nouveau défi ⚔️', daraja.push_alias(du.challenger) || ' te lance un duel.', '/?go=duels', 1
    from daraja.duels du join ppl p on p.id = du.opponent and p.venue = du.venue
    where du.status = 'pending' and du.created_at > greatest(p.since, p_now - interval '24 hours')
  union all
  -- Dépassé au classement du mois (même établissement)
  select p.id, 'defi', 'rank:' || m || ':' || daraja.push_month_rank(p.id), 'rang', 'On t''a dépassé 📈',
         'Tu es ' || daraja.push_month_rank(p.id) || 'e ce mois-ci. Reprends ta place !', '/?go=board', 2
    from ppl p join daraja.push_rank r on r.staff_id = p.id and r.month = m
    where p.role = 'staff' and daraja.push_month_rank(p.id) > r.rank
  union all
  -- Cadeau remis, avis validé, bonus du mois, malus (sans aucun détail)
  select e.staff_id, 'cadeaux', 'pe:' || e.id,
    case when e.kind = 'malus' then 'message' else 'points' end,
    case when e.kind = 'cadeau' then 'Ton cadeau est prêt 🎁' when e.kind = 'avis' then 'Ton avis est validé ⭐' when e.kind = 'vente' then 'Ta vente est validée 🎯'
         when e.kind = 'malus' then 'Un message t''attend' else 'Bonus du mois 🎉' end,
    case when e.kind = 'cadeau' then 'Passe le récupérer auprès de ton manager.' when e.kind in ('avis', 'vente') then 'Bravo ! Tes points sont crédités.'
         when e.kind = 'malus' then 'Ton manager t''a laissé un message.' else 'Un mois exemplaire, bravo !' end,
    case when e.kind = 'malus' then '/?go=profile' else '/?go=shop' end, 2
    from daraja.point_events e join ppl p on p.id = e.staff_id
    where e.created_at > greatest(p.since, p_now - interval '7 days') and (
      (e.kind = 'cadeau' and e.delivered) or (e.kind in ('avis', 'vente') and e.status = 'ok') or e.kind = 'malus'
      or (e.kind = 'bonus' and e.note like 'Mois exemplaire %'))
  union all
  -- Alertes des managers (leur établissement) et de la direction
  select p.id, 'alertes', 'alertes:' || d, 'alertes', 'À valider 📋', n || ' demande' || case when n > 1 then 's attendent' else ' attend' end || ' ta validation.', '/?go=admin', 2
    from ppl p cross join lateral (
      select (select count(*) from daraja.point_events e join daraja.staff o on o.id = e.staff_id
               where (p.role = 'super' or o.venue = p.venue)
                 and ((e.kind in ('avis', 'vente') and e.status = 'pending') or (e.kind = 'cadeau' and not e.delivered)))
           + case when p.role = 'super' then (select count(*) from daraja.conduct_records where needs_direction) else 0 end n) x
    where p.role in ('admin', 'super') and x.n > 0;
end $function$;

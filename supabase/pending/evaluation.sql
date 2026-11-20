-- Évaluation mensuelle : grille par famille (critères métier liés aux thèmes des défis + savoir-être pour tous),
-- fiche remplie par le manager quand il veut, validée par la direction (la direction évalue les managers),
-- puis défi du jour ciblé : une part des questions vise les 2 axes de progrès de chacun, au niveau qui lui correspond.
-- Niveaux : 1 À découvrir · 2 En progrès · 3 Solide · 4 Expert.

create table if not exists daraja.eval_criteria (
  id serial primary key,
  family text,
  kind text not null default 'metier',
  label text not null,
  cats text[] not null default '{}',
  sort integer not null default 100,
  active boolean not null default true,
  constraint eval_criteria_family_check check (family is null or family in ('salle', 'bar', 'cuisine', 'support', 'manager')),
  constraint eval_criteria_kind_check check (kind in ('metier', 'savoir'))
);
alter table daraja.eval_criteria enable row level security;

create table if not exists daraja.evals (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references daraja.staff(id) on delete cascade,
  venue text references daraja.venues(id),
  grid text not null,
  scores jsonb not null default '{}'::jsonb,
  goal text,
  status text not null default 'pending',
  note text,
  by_staff uuid references daraja.staff(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  validated_at timestamp with time zone,
  validated_by uuid references daraja.staff(id) on delete set null,
  coins integer not null default 0,
  gains jsonb not null default '[]'::jsonb,
  seen boolean not null default false,
  constraint evals_status_check check (status in ('pending', 'returned', 'ok'))
);
alter table daraja.evals enable row level security;
create index if not exists evals_staff_idx on daraja.evals(staff_id, status, validated_at);
-- une seule fiche ouverte (à valider ou renvoyée) par personne
create unique index if not exists evals_open_idx on daraja.evals(staff_id) where status <> 'ok';

-- défi du jour : questions qui visent les axes de progrès
alter table daraja.quiz_sessions add column if not exists targeted uuid[] not null default '{}'::uuid[];

insert into daraja.rule_values(key, val) values ('eval_up', 20), ('eval_cap', 60), ('eval_target', 2), ('eval_weight', 50)
on conflict do nothing;

-- Grille de départ (validée le 20/11/2026), modifiable dans Admin › Réglages › Évaluation.
insert into daraja.eval_criteria(family, kind, label, cats, sort)
select * from (values
  ('salle', 'metier', 'Carte', '{carte}'::text[], 10), ('salle', 'metier', 'Cocktails', '{cocktails}', 20),
  ('salle', 'metier', 'Vins', '{vins,terroirs}', 30), ('salle', 'metier', 'Vente', '{vente}', 40),
  ('salle', 'metier', 'Anglais', '{anglais}', 50), ('salle', 'metier', 'Culture Marrakech', '{marrakech,legendes,escapades,artisanat,agenda,histoire}', 60),
  ('salle', 'metier', 'Hygiène et sécurité', '{securite}', 70),
  ('bar', 'metier', 'Cocktails', '{cocktails}', 10), ('bar', 'metier', 'Vins', '{vins,terroirs}', 20),
  ('bar', 'metier', 'Carte', '{carte}', 30), ('bar', 'metier', 'Vente', '{vente}', 40),
  ('bar', 'metier', 'Anglais', '{anglais}', 50), ('bar', 'metier', 'Culture Marrakech', '{marrakech,legendes,escapades,artisanat,agenda,histoire}', 60),
  ('bar', 'metier', 'Hygiène et sécurité', '{securite}', 70),
  ('cuisine', 'metier', 'Carte et recettes', '{carte}', 10), ('cuisine', 'metier', 'Hygiène et sécurité', '{cuisine,securite}', 20),
  ('cuisine', 'metier', 'Culture Marrakech', '{marrakech,legendes,escapades,artisanat,agenda,histoire,terroirs}', 30),
  ('support', 'metier', 'Caisse', '{caisse}', 10), ('support', 'metier', 'Anglais', '{anglais}', 20),
  ('support', 'metier', 'Hygiène et sécurité', '{securite}', 30), ('support', 'metier', 'Culture Marrakech', '{marrakech,legendes,escapades,artisanat,agenda,histoire}', 40),
  ('manager', 'metier', 'Animer l''équipe', '{}', 10), ('manager', 'metier', 'Transmettre', '{}', 20),
  ('manager', 'metier', 'Organiser le service', '{}', 30), ('manager', 'metier', 'Montrer l''exemple', '{}', 40),
  (null, 'savoir', 'Accueil et sourire', '{}', 110), (null, 'savoir', 'Ponctualité et tenue', '{}', 120),
  (null, 'savoir', 'Esprit d''équipe', '{}', 130), (null, 'savoir', 'Initiative', '{}', 140)
) v(family, kind, label, cats, sort)
where not exists (select 1 from daraja.eval_criteria);

-- Grille d'une personne : les managers ont la grille « manager », les autres celle de leur poste.
CREATE OR REPLACE FUNCTION daraja.eval_grid(s daraja.staff)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'public'
AS $function$ select case when s.role = 'admin' then 'manager' else daraja.family(s) end $function$;

-- Critères actifs d'une grille : ceux de la famille, puis ceux pour tous (savoir-être).
CREATE OR REPLACE FUNCTION daraja.eval_crit(p_grid text)
 RETURNS SETOF daraja.eval_criteria
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$ select * from daraja.eval_criteria where active and (family = p_grid or family is null) order by kind, sort, id $function$;

-- Taux de bonnes réponses d'une personne sur des thèmes, sur les 30 derniers jours.
CREATE OR REPLACE FUNCTION daraja.eval_acc(p_staff uuid, p_cats text[])
 RETURNS TABLE(acc integer, n integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
  select round(avg(a.correct::int) * 100)::int, count(*)::int
  from daraja.answers a join daraja.questions q on q.id = a.question_id
  where a.staff_id = p_staff and coalesce(q.cat, 'hospitalite') = any(p_cats) and a.at > now() - interval '30 days' $function$;

-- Dernière évaluation validée.
CREATE OR REPLACE FUNCTION daraja.eval_last(p_staff uuid)
 RETURNS daraja.evals
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$ select * from daraja.evals where staff_id = p_staff and status = 'ok' order by validated_at desc limit 1 $function$;

-- Les 2 axes de progrès : critères métier du poste (liés à des thèmes), du plus faible au moins faible.
-- Score sur 100 = note du manager (part eval_weight) + bonnes réponses des 30 derniers jours (le reste).
-- Sans évaluation validée, seuls les défis comptent ; sans défis (moins de 5 réponses), seule la note compte.
CREATE OR REPLACE FUNCTION daraja.eval_targets(p_staff uuid)
 RETURNS TABLE(crit integer, label text, cats text[], score integer, lvl integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; e daraja.evals; w numeric := least(100, greatest(0, coalesce(daraja.rv('eval_weight'), 50)));
begin
  select * into s from daraja.staff where id = p_staff;
  e := daraja.eval_last(p_staff);
  return query
  with c as (
    select k.id, k.label, k.cats, (e.scores ->> k.id::text)::int m, x.acc, x.n
    from daraja.eval_criteria k cross join lateral daraja.eval_acc(p_staff, k.cats) x
    where k.active and k.kind = 'metier' and k.family = daraja.family(s) and cardinality(k.cats) > 0
  ), sc as (
    select c.id, c.label, c.cats,
      case when c.m is not null and c.n >= 5 then round((c.m - 1) * 100.0 / 3 * w / 100 + c.acc * (100 - w) / 100)::int
           when c.m is not null then round((c.m - 1) * 100.0 / 3)::int
           when c.n >= 5 then c.acc end score
    from c
  )
  select sc.id, sc.label, sc.cats, sc.score, case when sc.score < 34 then 1 when sc.score < 67 then 2 else 3 end
  from sc where sc.score is not null order by sc.score, sc.id limit 2;
end $function$;

-- Questions ciblées du défi : eval_target questions, réparties tour à tour sur les axes,
-- au niveau de la personne, en évitant celles déjà réussies ces 30 derniers jours.
CREATE OR REPLACE FUNCTION daraja.pick_targeted(s daraja.staff, v text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare f text := daraja.family(s); k int := least(5, greatest(0, coalesce(daraja.rv('eval_target'), 0))); out uuid[];
begin
  if k = 0 then return '{}'::uuid[]; end if;
  with t as (select x.crit, x.cats, x.lvl, row_number() over (order by x.score, x.crit) ord from daraja.eval_targets(s.id) x),
  cand as (
    select q.id, t.ord, row_number() over (partition by t.ord order by abs(q.level - t.lvl),
        exists (select 1 from daraja.answers a where a.staff_id = s.id and a.question_id = q.id and a.correct and a.at > now() - interval '30 days'),
        random()) rn
    from t join daraja.questions q on q.active and (q.venue is null or q.venue = v) and coalesce(q.cat, 'hospitalite') = any(t.cats)
      and daraja.is_enabled(v, f, 'level:' || q.level) and daraja.is_enabled(v, f, 'cat:' || coalesce(q.cat, 'hospitalite'))
  ), uniq as (select distinct on (cand.id) cand.id, cand.ord, cand.rn from cand order by cand.id, cand.rn)
  select coalesce(array_agg(z.id), '{}'::uuid[]) into out from (select uniq.id from uniq order by uniq.rn, uniq.ord limit k) z;
  return out;
end $function$;

-- Défi du jour : les questions ciblées, complétées par le tirage habituel, rangées par niveau.
CREATE OR REPLACE FUNCTION daraja.pick_daily(s daraja.staff, v text)
 RETURNS TABLE(ids uuid[], targeted uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare tg uuid[] := daraja.pick_targeted(s, v); base uuid[] := daraja.pick_questions(v, daraja.family(s)); rest uuid[];
begin
  select coalesce(array_agg(z.x), '{}'::uuid[]) into rest
    from (select x from unnest(coalesce(base, '{}'::uuid[])) x where x <> all(tg) order by random() limit greatest(0, 5 - cardinality(tg))) z;
  ids := (select array_agg(q.id order by q.level, random()) from daraja.questions q where q.id = any(tg || rest));
  targeted := tg;
  return next;
end $function$;

-- Évolution entre les deux dernières évaluations validées : 'up' si les niveaux montent, 'flat' sinon, nul si moins de deux.
CREATE OR REPLACE FUNCTION daraja.eval_trend(p_staff uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
  with l as (select scores, row_number() over (order by validated_at desc) r from daraja.evals where staff_id = p_staff and status = 'ok')
  select case when (select count(*) from l) < 2 then null
    when coalesce((select sum(a.value::int - (b.scores ->> a.key)::int) from l x cross join jsonb_each_text(x.scores) a
                   join l b on b.r = 2 where x.r = 1 and b.scores ? a.key), 0) > 0 then 'up' else 'flat' end $function$;

-- Qui peut évaluer qui : la direction évalue tout le monde (managers compris), un manager évalue les équipiers
-- de son établissement. Personne ne s'évalue soi-même. Rend l'établissement de la personne évaluée.
CREATE OR REPLACE FUNCTION daraja.eval_guard(s daraja.staff, p_target uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare t daraja.staff;
begin
  select * into t from daraja.staff where id = p_target;
  if t.id is null or not t.active then raise exception 'staff'; end if;
  if t.id = s.id then raise exception 'self'; end if;
  if t.role = 'super' then raise exception 'admin'; end if;
  if s.role = 'super' then return t.venue; end if;
  if s.role = 'admin' and t.role = 'staff' and t.venue = s.venue then return t.venue; end if;
  raise exception 'admin';
end $function$;

-- Validation : record battu = pièces (eval_up par niveau au-dessus du meilleur déjà validé, plafond eval_cap),
-- niveaux gagnés depuis la dernière évaluation = célébration à l'ouverture de l'appli.
CREATE OR REPLACE FUNCTION daraja.eval_apply(p_eval uuid, p_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare e daraja.evals; l daraja.evals; k text; lv int; best int; was int; up int := 0; g jsonb := '[]'::jsonb; c int;
begin
  select * into e from daraja.evals where id = p_eval for update;
  l := daraja.eval_last(e.staff_id);
  for k, lv in select key, value::int from jsonb_each_text(e.scores) loop
    select max((x.scores ->> k)::int) into best from daraja.evals x where x.staff_id = e.staff_id and x.status = 'ok' and x.id <> e.id;
    was := (l.scores ->> k)::int;
    if was is not null and lv > was then g := g || jsonb_build_array(jsonb_build_object('id', k::int, 'from', was, 'to', lv)); end if;
    if best is not null and lv > best then up := up + (lv - best); end if;
  end loop;
  c := least(greatest(coalesce(daraja.rv('eval_cap'), 0), 0), up * greatest(coalesce(daraja.rv('eval_up'), 0), 0));
  update daraja.evals set status = 'ok', validated_at = now(), validated_by = p_by, coins = c, gains = g, seen = false, note = null where id = e.id;
  if c > 0 then
    insert into daraja.point_events(staff_id, kind, amount, note, by_staff) values (e.staff_id, 'bonus', c, 'Bilan : niveau gagné', p_by);
  end if;
end $function$;

-- Admin › Équipe › Évaluations : l'équipe (dernière fiche, évolution, fiche ouverte) et, pour la direction,
-- les fiches à valider des deux établissements (pour n'en oublier aucune).
CREATE OR REPLACE FUNCTION public.daraja_eval_team(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := daraja.can_admin(s, p_venue);
  return json_build_object(
    'can_validate', s.role = 'super',
    'pending', case when s.role <> 'super' then '[]'::json else (select coalesce(json_agg(json_build_object(
        'id', e.id, 'staff', o.id, 'name', daraja.display_name(o), 'avatar', o.avatar, 'role', o.role,
        'venue', e.venue, 'venue_name', (select name from daraja.venues where id = e.venue),
        'by', (select daraja.display_name(b) from daraja.staff b where b.id = e.by_staff), 'at', e.updated_at, 'goal', e.goal,
        'items', (select json_agg(json_build_object('label', c.label, 'kind', c.kind, 'lv', (e.scores ->> c.id::text)::int,
            'prev', (l.scores ->> c.id::text)::int) order by c.kind, c.sort, c.id) from daraja.eval_criteria c where e.scores ? c.id::text)
      ) order by e.updated_at), '[]'::json)
      from daraja.evals e join daraja.staff o on o.id = e.staff_id
      left join lateral (select x.scores from daraja.evals x where x.staff_id = e.staff_id and x.status = 'ok' order by x.validated_at desc limit 1) l on true
      where e.status = 'pending') end,
    'people', (select coalesce(json_agg(json_build_object(
        'id', o.id, 'name', daraja.display_name(o), 'avatar', o.avatar, 'role', o.role, 'post_label', p.label,
        'last', (select max(x.validated_at) from daraja.evals x where x.staff_id = o.id and x.status = 'ok'),
        'open', (select x.status from daraja.evals x where x.staff_id = o.id and x.status <> 'ok'),
        'trend', daraja.eval_trend(o.id)
      ) order by (select max(x.validated_at) from daraja.evals x where x.staff_id = o.id and x.status = 'ok') nulls first, o.name), '[]'::json)
      from daraja.staff o left join daraja.posts p on p.id = o.post
      where o.venue = v and o.active and o.id <> s.id and (o.role = 'staff' or (o.role = 'admin' and s.role = 'super')))
  );
end $function$;

-- Fiche d'une personne : grille, réussite aux défis par critère, fiche ouverte, dernière fiche, 6 dernières (courbe), axes.
CREATE OR REPLACE FUNCTION public.daraja_eval_sheet(p_token text, p_staff uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; t daraja.staff; g text; op daraja.evals; la daraja.evals;
begin
  s := daraja.who(p_token);
  perform daraja.eval_guard(s, p_staff);
  select * into t from daraja.staff where id = p_staff;
  g := daraja.eval_grid(t);
  select * into op from daraja.evals where staff_id = p_staff and status <> 'ok';
  la := daraja.eval_last(p_staff);
  return json_build_object(
    'staff', json_build_object('id', t.id, 'name', daraja.display_name(t), 'avatar', t.avatar, 'role', t.role,
      'post_label', (select label from daraja.posts where id = t.post)),
    'can_validate', s.role = 'super',
    'criteria', (select coalesce(json_agg(json_build_object('id', c.id, 'kind', c.kind, 'label', c.label, 'acc', x.acc, 'n', x.n)
        order by c.kind, c.sort, c.id), '[]'::json) from daraja.eval_crit(g) c cross join lateral daraja.eval_acc(t.id, c.cats) x),
    'open', case when op.id is null then null else json_build_object('id', op.id, 'status', op.status, 'scores', op.scores,
        'goal', op.goal, 'note', op.note, 'at', op.updated_at) end,
    'last', case when la.id is null then null else json_build_object('scores', la.scores, 'goal', la.goal, 'at', la.validated_at) end,
    'history', (select coalesce(json_agg(json_build_object('at', h.validated_at, 'scores', h.scores) order by h.validated_at), '[]'::json)
      from (select x.validated_at, x.scores from daraja.evals x where x.staff_id = t.id and x.status = 'ok' order by x.validated_at desc limit 6) h),
    'axes', (select coalesce(json_agg(json_build_object('id', a.crit, 'label', a.label) order by a.score, a.crit), '[]'::json) from daraja.eval_targets(t.id) a)
  );
end $function$;

-- Enregistrer une fiche : tous les critères de la grille, niveau 1 à 4, objectif du mois facultatif.
-- Manager : envoyée à la direction (rien ne compte avant validation). Direction : validée tout de suite.
CREATE OR REPLACE FUNCTION public.daraja_eval_save(p_token text, p_staff uuid, p_scores jsonb, p_goal text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; t daraja.staff; v text; g text; clean jsonb; eid uuid; gl text := left(nullif(trim(coalesce(p_goal, '')), ''), 140);
begin
  s := daraja.who(p_token);
  v := daraja.eval_guard(s, p_staff);
  select * into t from daraja.staff where id = p_staff;
  g := daraja.eval_grid(t);
  select coalesce(jsonb_object_agg(c.id::text, (p_scores ->> c.id::text)::int), '{}'::jsonb) into clean
    from daraja.eval_crit(g) c where (p_scores ->> c.id::text) ~ '^[1-4]$';
  if (select count(*) from daraja.eval_crit(g)) = 0 or (select count(*) from daraja.eval_crit(g)) <> (select count(*) from jsonb_object_keys(clean)) then
    return json_build_object('ok', false, 'error', 'missing');
  end if;
  select id into eid from daraja.evals where staff_id = p_staff and status <> 'ok' for update;
  if eid is null then
    insert into daraja.evals(staff_id, venue, grid, scores, goal, by_staff) values (p_staff, v, g, clean, gl, s.id) returning id into eid;
  else
    update daraja.evals set venue = v, grid = g, scores = clean, goal = gl, by_staff = s.id, status = 'pending', note = null, updated_at = now() where id = eid;
  end if;
  if s.role = 'super' then
    perform daraja.eval_apply(eid, s.id);
    return json_build_object('ok', true, 'status', 'ok', 'coins', (select coins from daraja.evals where id = eid));
  end if;
  return json_build_object('ok', true, 'status', 'pending');
end $function$;

-- Direction : valider (compte tout de suite) ou renvoyer au manager avec un mot.
CREATE OR REPLACE FUNCTION public.daraja_eval_validate(p_token text, p_eval uuid, p_ok boolean, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; e daraja.evals;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  select * into e from daraja.evals where id = p_eval;
  if e.id is null or e.status <> 'pending' then return json_build_object('ok', false, 'error', 'status'); end if;
  if p_ok then
    perform daraja.eval_apply(e.id, s.id);
    return json_build_object('ok', true, 'coins', (select coins from daraja.evals where id = e.id));
  end if;
  update daraja.evals set status = 'returned', note = left(nullif(trim(coalesce(p_note, '')), ''), 200), updated_at = now() where id = e.id;
  return json_build_object('ok', true, 'returned', true);
end $function$;

-- Ce que voit la personne évaluée : 3 forces au plus (Solide ou Expert), ses 2 axes, l'objectif du mois,
-- et la célébration tant qu'elle n'a pas été vue. Jamais les niveaux détaillés.
CREATE OR REPLACE FUNCTION public.daraja_eval_mine(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; e daraja.evals;
begin
  s := daraja.who(p_token);
  e := daraja.eval_last(s.id);
  return json_build_object(
    'at', e.validated_at, 'goal', e.goal,
    'strengths', (select coalesce(json_agg(z.label order by z.lv desc, z.kind, z.sort), '[]'::json) from (
        select c.label, c.kind, c.sort, (e.scores ->> c.id::text)::int lv from daraja.eval_criteria c
        where e.scores ? c.id::text and (e.scores ->> c.id::text)::int >= 3 order by 4 desc, c.kind, c.sort limit 3) z),
    'axes', (select coalesce(json_agg(a.label order by a.score, a.crit), '[]'::json) from daraja.eval_targets(s.id) a),
    'new', case when e.id is null or e.seen then null else json_build_object(
        'first', not exists (select 1 from daraja.evals x where x.staff_id = s.id and x.status = 'ok' and x.id <> e.id),
        'coins', e.coins,
        'gains', (select coalesce(json_agg(json_build_object('label', c.label, 'to', (g.value ->> 'to')::int)), '[]'::json)
                  from jsonb_array_elements(e.gains) g join daraja.eval_criteria c on c.id = (g.value ->> 'id')::int)) end
  );
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_eval_seen(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  update daraja.evals set seen = true where staff_id = s.id and status = 'ok' and not seen;
  return json_build_object('ok', true);
end $function$;

-- Admin › Réglages › Évaluation (direction) : la grille, les thèmes de questions, les valeurs réglables.
CREATE OR REPLACE FUNCTION public.daraja_admin_eval_criteria(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  return json_build_object(
    'criteria', (select coalesce(json_agg(json_build_object('id', c.id, 'family', c.family, 'kind', c.kind, 'label', c.label, 'cats', c.cats,
        'sort', c.sort, 'active', c.active, 'used', exists (select 1 from daraja.evals e where e.scores ? c.id::text)) order by c.kind, c.sort, c.id), '[]'::json)
      from daraja.eval_criteria c),
    'cats', (select coalesce(json_agg(json_build_object('key', k, 'label', daraja.cat_label(k)) order by daraja.cat_label(k)), '[]'::json)
      from (select distinct coalesce(cat, 'hospitalite') k from daraja.questions where active) q),
    'values', (select json_object_agg(key, val) from daraja.rule_values where key in ('eval_up', 'eval_cap', 'eval_target', 'eval_weight'))
  );
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_admin_eval_criterion_save(p_token text, p jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; fam text := nullif(p ->> 'family', ''); knd text := coalesce(p ->> 'kind', 'metier');
  lab text := left(trim(coalesce(p ->> 'label', '')), 60); cs text[]; rid int;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  if lab = '' then return json_build_object('ok', false, 'error', 'label'); end if;
  if knd not in ('metier', 'savoir') or (fam is not null and fam not in ('salle', 'bar', 'cuisine', 'support', 'manager')) then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  cs := case when knd = 'savoir' then '{}'::text[] else
    coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'cats', '[]'::jsonb)) x where x ~ '^[a-z_]{2,30}$'), '{}'::text[]) end;
  if (p ->> 'id') is null then
    insert into daraja.eval_criteria(family, kind, label, cats, sort)
    values (fam, knd, lab, cs, coalesce((select max(sort) from daraja.eval_criteria where family is not distinct from fam), 0) + 10)
    returning id into rid;
  else
    rid := (p ->> 'id')::int;
    update daraja.eval_criteria set family = fam, kind = knd, label = lab, cats = cs where id = rid;
    if not found then return json_build_object('ok', false, 'error', 'invalid'); end if;
  end if;
  return json_build_object('ok', true, 'id', rid);
end $function$;

-- Retirer un critère : supprimé s'il n'a jamais servi, sinon rangé (l'historique des fiches reste lisible).
CREATE OR REPLACE FUNCTION public.daraja_admin_eval_criterion_delete(p_token text, p_id integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  if exists (select 1 from daraja.evals e where e.scores ? p_id::text) then
    update daraja.eval_criteria set active = false where id = p_id;
    return json_build_object('ok', true, 'archived', true);
  end if;
  delete from daraja.eval_criteria where id = p_id;
  return json_build_object('ok', true, 'archived', false);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_admin_eval_criterion_restore(p_token text, p_id integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  update daraja.eval_criteria set active = true where id = p_id;
  return json_build_object('ok', true);
end $function$;

-- Valeurs réglables : pièces par niveau (0-200), plafond par fiche (0-1000), questions ciblées sur 5 (0-4), part du manager en % (0-100).
CREATE OR REPLACE FUNCTION public.daraja_admin_eval_value(p_token text, p_key text, p_val integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  if p_key = 'eval_up' and p_val between 0 and 200 or p_key = 'eval_cap' and p_val between 0 and 1000
     or p_key = 'eval_target' and p_val between 0 and 4 or p_key = 'eval_weight' and p_val between 0 and 100 then
    update daraja.rule_values set val = p_val where key = p_key;
    return json_build_object('ok', true, 'key', p_key, 'val', p_val);
  end if;
  return json_build_object('ok', false, 'error', 'range');
end $function$;

-- Défi du jour : tirage ciblé, et la liste des questions ciblées pour les marquer à l'écran.
CREATE OR REPLACE FUNCTION public.daraja_quiz(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; qs daraja.quiz_sessions; p record; today_pts int; v text;
begin
  s := daraja.who(p_token);
  v := coalesce(s.venue, 'baro');
  select * into qs from daraja.quiz_sessions where staff_id = s.id and day = daraja.today();
  if qs.staff_id is null then
    select * into p from daraja.pick_daily(s, v);
    if p.ids is null then return json_build_object('questions', '[]'::json, 'answered', '{}'::uuid[], 'correct', 0, 'today_points', 0); end if;
    insert into daraja.quiz_sessions(staff_id, day, question_ids, targeted) values (s.id, daraja.today(), p.ids, p.targeted) returning * into qs;
  end if;
  select coalesce(sum(amount),0) into today_pts from daraja.point_events
    where staff_id = s.id and kind = 'quiz' and (created_at at time zone 'Africa/Casablanca')::date = daraja.today();
  return json_build_object('answered', qs.answered, 'correct', qs.correct, 'today_points', today_pts, 'started', qs.started,
    'now', extract(epoch from clock_timestamp()), 'questions', daraja.q_json(qs.question_ids), 'targeted', qs.targeted);
end $function$;


-- Profil : fiches à traiter (direction : à valider ; manager : renvoyées) et bilan pas encore vu (célébration).
CREATE OR REPLACE FUNCTION public.daraja_me(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; rk int; done boolean;
begin
  s := daraja.who(p_token);
  perform daraja.conduct_bonus(s.id); perform daraja.eotm_resolve(coalesce(s.venue, 'baro'));
  if s.role = 'staff' then perform daraja.progress_bonus(s.id); end if;
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  select count(*)+1 into rk from daraja.staff o where o.venue = v and o.active and o.role = 'staff'
    and daraja.month_quiz(o.id) > daraja.month_quiz(s.id);
  select exists(select 1 from daraja.quiz_sessions q where q.staff_id = s.id and q.day = daraja.today()
    and cardinality(q.answered) >= cardinality(q.question_ids)) into done;
  return json_build_object(
    'id', s.id, 'name', s.name, 'alias', s.alias, 'display', daraja.display_name(s), 'avatar', s.avatar,
    'role', s.role, 'venue', v,
    'venue_name', (select name from daraja.venues where id = v),
    'points', daraja.balance(s.id), 'earned', daraja.earned(s.id), 'month', daraja.month_points(s.id),
    'rank', rk,
    'streak', daraja.live_streak(s), 'flame', daraja.flame_state(s),
    'next_bonus', daraja.rv('streak_step') * least(daraja.live_streak(s) + 1, daraja.rv('streak_days')), 'rules', (select json_object_agg(key, val) from daraja.rule_values),
    'quiz_done', done,
    'chest', daraja.chest_state(s.id), 'chest_left', greatest(0, daraja.rv('chest_week') - (select count(*) from daraja.chests c where c.staff_id = s.id and c.day >= daraja.week_start())),
    'review', daraja.review_day(s.id),
    'story_read', exists(select 1 from daraja.story_reads r where r.staff_id = s.id and r.day = daraja.today()),
    'week', (select json_agg(exists(select 1 from daraja.quiz_sessions q where q.staff_id = s.id and q.day = daraja.today() - g
      and cardinality(q.answered) >= cardinality(q.question_ids)) order by g desc) from generate_series(0, 6) g),
    'tickets', daraja.tickets(s.id, daraja.today()),
    'eotm', (select count(*) from daraja.eotm where winner = s.id), 'birthday', s.birthday, 'avis', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'avis' and status = 'ok'),
    'perfect', (select count(*) from daraja.quiz_sessions where staff_id = s.id and correct >= 5),
    'gifts', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'cadeau'),
    'exemplary', exists(select 1 from daraja.point_events where staff_id = s.id and kind = 'bonus'
        and note = 'Mois exemplaire ' || to_char(now() at time zone 'Africa/Casablanca' - interval '1 month', 'YYYY-MM')),
    'pending_ack', (select count(*) from daraja.conduct_records where staff_id = s.id and acknowledged_at is null),
    'errors_24h', case when s.role = 'super' then (select count(*) from daraja.client_errors where last_at > now() - interval '24 hours') else 0 end,
    'rt', 'dj-' || s.rt,
    'direction_todo', case when s.role = 'super' then (select count(*) from daraja.conduct_records where needs_direction) else 0 end,
    'eval_todo', case when s.role = 'super' then (select count(*) from daraja.evals where status = 'pending')
      when s.role = 'admin' then (select count(*) from daraja.evals where status = 'returned' and venue = s.venue) else 0 end,
    'eval_new', exists (select 1 from daraja.evals where staff_id = s.id and status = 'ok' and not seen)
  );
end $function$;

revoke execute on all functions in schema daraja from public, anon, authenticated;
revoke execute on function public.daraja_eval_team(text, text), public.daraja_eval_sheet(text, uuid), public.daraja_eval_save(text, uuid, jsonb, text),
  public.daraja_eval_validate(text, uuid, boolean, text), public.daraja_eval_mine(text), public.daraja_eval_seen(text),
  public.daraja_admin_eval_criteria(text), public.daraja_admin_eval_criterion_save(text, jsonb), public.daraja_admin_eval_criterion_delete(text, integer),
  public.daraja_admin_eval_criterion_restore(text, integer), public.daraja_admin_eval_value(text, text, integer) from public, authenticated;
grant execute on function public.daraja_eval_team(text, text), public.daraja_eval_sheet(text, uuid), public.daraja_eval_save(text, uuid, jsonb, text),
  public.daraja_eval_validate(text, uuid, boolean, text), public.daraja_eval_mine(text), public.daraja_eval_seen(text),
  public.daraja_admin_eval_criteria(text), public.daraja_admin_eval_criterion_save(text, jsonb), public.daraja_admin_eval_criterion_delete(text, integer),
  public.daraja_admin_eval_criterion_restore(text, integer), public.daraja_admin_eval_value(text, text, integer) to anon;

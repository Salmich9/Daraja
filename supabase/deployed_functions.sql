-- Dump of all deployed daraja functions (source of truth)
CREATE OR REPLACE FUNCTION daraja.balance(p_staff uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select coalesce(sum(amount),0)::int from daraja.point_events where staff_id = p_staff and status = 'ok' $function$
;

CREATE OR REPLACE FUNCTION daraja.can_admin(s daraja.staff, p_venue text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
begin
  if s.role = 'super' then return coalesce(p_venue, s.venue, 'baro'); end if;
  if s.role = 'admin' and (p_venue is null or p_venue = s.venue) then return s.venue; end if;
  raise exception 'admin';
end $function$
;

CREATE OR REPLACE FUNCTION daraja.cat_label(c text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
 select case c when 'hospitalite' then 'Hospitalité et règlement' when 'vente' then 'Vente et relation client'
  when 'cocktails' then 'Cocktails et spiritueux' when 'vins' then 'Vins et accords' when 'anglais' then 'Anglais'
  when 'carte' then 'Notre carte' when 'histoire' then 'Histoire du lieu' when 'cuisine' then 'Cuisine et hygiène'
  when 'securite' then 'Sécurité' when 'caisse' then 'Caisse, achats et stock' else c end $function$
;

CREATE OR REPLACE FUNCTION daraja.conduct_bonus(p_staff uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare st daraja.staff; m date; tag text;
begin
  select * into st from daraja.staff where id = p_staff;
  if st.role <> 'staff' then return; end if;
  m := (date_trunc('month', st.created_at at time zone 'Africa/Casablanca') + interval '1 month')::date;
  while m < date_trunc('month', now() at time zone 'Africa/Casablanca')::date loop
    tag := 'Mois exemplaire ' || to_char(m, 'YYYY-MM');
    if not exists (select 1 from daraja.point_events where staff_id = p_staff and kind = 'bonus' and note = tag)
       and not exists (select 1 from daraja.conduct_records where staff_id = p_staff and line in ('grise','rouge')
            and (occurred_at at time zone 'Africa/Casablanca')::date >= m
            and (occurred_at at time zone 'Africa/Casablanca')::date < (m + interval '1 month')::date) then
      insert into daraja.point_events(staff_id, kind, amount, note) values (p_staff, 'bonus', 100, tag);
    end if;
    m := (m + interval '1 month')::date;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION daraja.conduct_compute(p_staff uuid, p_rule integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare r daraja.conduct_rules; occ int; eff text; sanc text; esc text; n_grise int; n_rouge int; ladder text[]; lad text; malus int;
begin
  select * into r from daraja.conduct_rules where id = p_rule;
  if r.id is null then raise exception 'rule'; end if;
  ladder := array['Avertissement écrit','Blâme','Deuxième blâme ou mise à pied (8 jours max)','Troisième blâme ou mutation','Licenciement'];

  select count(*) + 1 into occ from daraja.conduct_records c
   where c.staff_id = p_staff and c.rule_id = p_rule
     and c.occurred_at > now() - case r.line when 'blanche' then interval '30 days' when 'grise' then interval '60 days' else interval '365 days' end;

  if r.grave then
    eff := 'rouge'; sanc := 'Faute grave (licenciement)';
  elsif r.line = 'blanche' then
    if occ >= 4 then eff := 'rouge'; sanc := daraja.strip_line(r.recid2); esc := occ || 'e blanche identique en 30 jours';
    elsif occ = 3 then eff := 'grise'; sanc := daraja.strip_line(r.recid1); esc := '3e blanche identique en 30 jours';
    else eff := 'blanche'; sanc := r.base_sanction; end if;
  elsif r.line = 'grise' then
    if occ >= 3 then eff := 'rouge'; sanc := daraja.strip_line(r.recid2); esc := occ || 'e fois en 60 jours';
    elsif occ = 2 then eff := 'rouge'; sanc := daraja.strip_line(r.recid1); esc := '2e fois en 60 jours';
    else eff := 'grise'; sanc := r.base_sanction; end if;
  else
    eff := 'rouge';
    if occ >= 3 then sanc := daraja.strip_line(r.recid2); esc := occ || 'e fois en 12 mois';
    elsif occ = 2 then sanc := daraja.strip_line(r.recid1); esc := '2e fois en 12 mois';
    else sanc := r.base_sanction; end if;
    if sanc ilike 'Sans objet%' then sanc := 'Licenciement'; end if;
  end if;

  if eff = 'grise' then
    select count(*) into n_grise from daraja.conduct_records c
     where c.staff_id = p_staff and c.line = 'grise' and c.occurred_at > now() - interval '60 days';
    if n_grise >= 1 then
      eff := 'rouge'; sanc := 'Avertissement écrit';
      esc := coalesce(esc || ' · ', '') || '2e grise en 60 jours';
    end if;
  end if;

  if eff = 'rouge' and not r.grave then
    select count(*) into n_rouge from daraja.conduct_records c
     where c.staff_id = p_staff and c.line = 'rouge' and c.occurred_at > now() - interval '365 days';
    lad := ladder[least(n_rouge + 1, 5)];
    if daraja.sanction_rank(lad) > daraja.sanction_rank(sanc) then
      sanc := lad;
      esc := coalesce(esc || ' · ', '') || (n_rouge + 1) || 'e rouge en 12 mois';
    end if;
  end if;

  malus := case when r.grave then 1000 when eff = 'rouge' then 300 when eff = 'grise' then 100 else 20 end;
  return json_build_object('rule_id', r.id, 'base_line', r.line, 'line', eff, 'occurrence', occ, 'sanction', sanc,
    'escalation', esc, 'malus', malus, 'grave', r.grave, 'behavior', r.behavior, 'domain', r.domain,
    'direction', (r.direction_only or eff = 'rouge'));
end $function$
;

CREATE OR REPLACE FUNCTION daraja.default_enabled(p_family text, p_key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
 select case
  when p_key like 'level:%' then true
  when p_family in ('salle','bar') then p_key in ('cat:hospitalite','cat:vente','cat:cocktails','cat:vins','cat:anglais','cat:carte','cat:histoire','cat:securite')
  when p_family = 'cuisine' then p_key in ('cat:hospitalite','cat:carte','cat:histoire','cat:cuisine','cat:securite')
  when p_family = 'support' then p_key in ('cat:hospitalite','cat:histoire','cat:securite','cat:caisse','cat:anglais')
  else true end $function$
;

CREATE OR REPLACE FUNCTION daraja.display_name(s daraja.staff)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select coalesce(nullif(trim(s.alias), ''), s.name) $function$
;

CREATE OR REPLACE FUNCTION daraja.duel_close(d daraja.duels)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare cs int; os int; ct numeric; ot numeric; w uuid;
begin
  if d.status = 'done' then return; end if;
  select count(*) filter (where (d.c_ans->(qid::text)->>'ok')::boolean),
         count(*) filter (where (d.o_ans->(qid::text)->>'ok')::boolean),
         sum(coalesce((d.c_ans->(qid::text)->>'t')::numeric, coalesce(d.limits[k], 8) + 1.5)),
         sum(coalesce((d.o_ans->(qid::text)->>'t')::numeric, coalesce(d.limits[k], 8) + 1.5))
    into cs, os, ct, ot from unnest(d.question_ids) with ordinality u(qid, k);
  w := case when cs > os then d.challenger when os > cs then d.opponent
            when cs = 0 then null
            when ct < ot then d.challenger when ot < ct then d.opponent else null end;
  update daraja.duels set status = 'done', winner = w, done_at = now() where id = d.id;
  if w is not null then
    insert into daraja.point_events(staff_id, kind, amount, note) values (w, 'bonus', 20, 'Duel gagné');
  elsif cs > 0 then
    insert into daraja.point_events(staff_id, kind, amount, note) values (d.challenger, 'bonus', 10, 'Duel nul'), (d.opponent, 'bonus', 10, 'Duel nul');
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION daraja.duel_end(d daraja.duels)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select daraja.duel_slot(d, cardinality(d.limits)) $function$
;

CREATE OR REPLACE FUNCTION daraja.duel_slot(d daraja.duels, i integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
  select extract(epoch from d.start_at) + coalesce((select sum(l + 4) from unnest(d.limits[1:i]) l), 0) $function$
;

CREATE OR REPLACE FUNCTION daraja.duel_tick(p_id uuid)
 RETURNS daraja.duels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare d daraja.duels; nw timestamptz := clock_timestamp();
begin
  select * into d from daraja.duels where id = p_id for update;
  if d.status = 'pending' and d.created_at < nw - interval '24 hours' then
    update daraja.duels set status = 'expired', done_at = nw where id = d.id returning * into d;
  elsif d.status = 'ready' and d.accepted_at < nw - interval '24 hours' then
    update daraja.duels set status = 'expired', done_at = nw where id = d.id returning * into d;
  elsif d.status = 'ready' and d.c_seen > nw - interval '8 seconds' and d.o_seen > nw - interval '8 seconds' then
    update daraja.duels set status = 'live', start_at = nw + interval '4 seconds' where id = d.id returning * into d;
  elsif d.status = 'live' and extract(epoch from nw) > daraja.duel_end(d) then
    perform daraja.duel_close(d);
    select * into d from daraja.duels where id = p_id;
  end if;
  return d;
end $function$
;

CREATE OR REPLACE FUNCTION daraja.earned(p_staff uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select coalesce(sum(amount),0)::int from daraja.point_events where staff_id = p_staff and status = 'ok' and kind in ('quiz','avis','bonus') $function$
;

CREATE OR REPLACE FUNCTION daraja.eotm_resolve(p_venue text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare m text := to_char(date_trunc('month', daraja.today()) - interval '1 month', 'YYYY-MM'); w record;
begin
  if exists (select 1 from daraja.eotm where venue = p_venue and month = m) then return; end if;
  if not exists (select 1 from daraja.votes where venue = p_venue and month = m) then return; end if;
  perform pg_advisory_xact_lock(hashtext('eotm' || p_venue || m));
  if exists (select 1 from daraja.eotm where venue = p_venue and month = m) then return; end if;
  select candidate, count(*) n into w from daraja.votes where venue = p_venue and month = m
    group by candidate order by count(*) desc, max(at) asc limit 1;
  insert into daraja.eotm(venue, month, winner, votes) values (p_venue, m, w.candidate, w.n);
  insert into daraja.point_events(staff_id, kind, amount, note) values (w.candidate, 'bonus', 100, 'Employé du mois ' || m);
end $function$
;

CREATE OR REPLACE FUNCTION daraja.family(s daraja.staff)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select coalesce((select family from daraja.posts where id = s.post), 'salle') $function$
;

CREATE OR REPLACE FUNCTION daraja.flame_state(s daraja.staff)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select case
    when s.last_quiz_day is null then 'new'
    when s.last_quiz_day = daraja.today() then 'lit'
    when s.last_quiz_day = daraja.today() - 1 then 'waiting'
    when s.last_quiz_day = daraja.today() - 2 then 'danger'
    else 'out' end $function$
;

CREATE OR REPLACE FUNCTION daraja.grade(q daraja.questions, p_choice integer, p_answer jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
  select case when q.kind = 'order' then coalesce(p_answer = q.payload->'answer', false)
              when q.kind = 'match' then coalesce((p_answer->>'mistakes')::int, 99) <= 1
              else coalesce(p_choice = q.answer_idx, false) end $function$
;

CREATE OR REPLACE FUNCTION daraja.is_enabled(p_venue text, p_family text, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
 select coalesce((select enabled from daraja.quiz_settings where venue = p_venue and family = p_family and key = p_key),
                 daraja.default_enabled(p_family, p_key)) $function$
;

CREATE OR REPLACE FUNCTION daraja.live_streak(s daraja.staff)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select case when s.last_quiz_day >= daraja.today() - 2 then s.streak else 0 end $function$
;

CREATE OR REPLACE FUNCTION daraja.month_points(p_staff uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select coalesce(sum(amount),0)::int from daraja.point_events
   where staff_id = p_staff and status = 'ok' and kind <> 'cadeau'
   and date_trunc('month', created_at at time zone 'Africa/Casablanca') = date_trunc('month', now() at time zone 'Africa/Casablanca') $function$
;

CREATE OR REPLACE FUNCTION daraja.pick_questions(v text, f text, f2 text DEFAULT NULL::text, p_kind text DEFAULT NULL::text)
 RETURNS uuid[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
  with pool as (
    select q.id, q.level, row_number() over (partition by q.level
        order by random() * case when q.kind = 'qcm' then 1 when q.kind = 'image' then 0.7 else 0.3 end) rn
    from daraja.questions q
    where q.active and (q.venue is null or q.venue = v)
      and (p_kind is null or q.kind = p_kind)
      and daraja.is_enabled(v, f, 'level:' || q.level)
      and daraja.is_enabled(v, f, 'cat:' || coalesce(q.cat, 'hospitalite'))
      and (f2 is null or (daraja.is_enabled(v, f2, 'level:' || q.level) and daraja.is_enabled(v, f2, 'cat:' || coalesce(q.cat, 'hospitalite'))))
  ), picked as (
    select id, level from pool where (level = 1 and rn <= 2) or (level = 2 and rn <= 2) or (level = 3 and rn <= 1)
  ), filler as (
    select id, level from pool where id not in (select id from picked) order by random()
    limit greatest(0, 5 - (select count(*) from picked))
  )
  select array_agg(id order by level, random()) from (select * from picked union all select * from filler) x $function$
;

CREATE OR REPLACE FUNCTION daraja.progress_bonus(p_staff uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare m date := (date_trunc('month', now() at time zone 'Africa/Casablanca') - interval '1 month')::date;
  tag text; a1 numeric; n1 int; a0 numeric; n0 int;
begin
  tag := 'Progression ' || to_char(m, 'YYYY-MM');
  if exists (select 1 from daraja.point_events where staff_id = p_staff and note = tag) then return; end if;
  select avg(correct::int) * 100, count(*) into a1, n1 from daraja.answers where staff_id = p_staff
    and (at at time zone 'Africa/Casablanca')::date >= m and (at at time zone 'Africa/Casablanca')::date < (m + interval '1 month')::date;
  select avg(correct::int) * 100, count(*) into a0, n0 from daraja.answers where staff_id = p_staff
    and (at at time zone 'Africa/Casablanca')::date >= (m - interval '1 month')::date and (at at time zone 'Africa/Casablanca')::date < m;
  if n1 >= 20 and n0 >= 20 and a1 >= a0 + 5 then
    insert into daraja.point_events(staff_id, kind, amount, note) values (p_staff, 'bonus', 50, tag);
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION daraja.q_json(ids uuid[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
  select json_agg(json_build_object('id', q.id, 'theme', q.theme, 'question', q.question, 'options', q.options,
      'level', q.level, 'kind', q.kind, 'limit', daraja.q_limit(q.kind),
      'payload', case q.kind
        when 'order' then jsonb_build_object('words', (select jsonb_agg(w order by random()) from jsonb_array_elements(q.payload->'answer') w))
        when 'match' then jsonb_build_object('pairs', q.payload->'pairs')
        when 'image' then q.payload
        else null end)
    order by array_position(ids, q.id))
  from daraja.questions q where q.id = any(ids) $function$
;

CREATE OR REPLACE FUNCTION daraja.q_limit(k text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
  select case when k in ('order','match') then 15 else 6 end $function$
;

CREATE OR REPLACE FUNCTION daraja.reward_check(p_staff uuid, c jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare out jsonb := '[]'::jsonb; n int; have int;
begin
  if (c->>'clean_days') is not null then
    n := (c->>'clean_days')::int;
    select count(*) into have from daraja.conduct_records where staff_id = p_staff and line in ('grise','rouge')
      and occurred_at > now() - make_interval(days => n);
    out := out || jsonb_build_object('key','clean','label','Aucune ligne grise ou rouge depuis '||n||' jours','ok', have = 0,'have',have,'need',0);
  end if;
  if coalesce((c->>'no_recid')::boolean, false) then
    select count(*) into have from daraja.conduct_records where staff_id = p_staff and occurrence > 1
      and occurred_at > now() - interval '90 days';
    out := out || jsonb_build_object('key','recid','label','Pas de récidive depuis 90 jours','ok', have = 0,'have',have,'need',0);
  end if;
  if (c->>'max_late') is not null then
    n := (c->>'max_late')::int;
    select coalesce(sum(case when not late_ok then late_min else 0 end),0) + 1000 * count(*) filter (where status = 'absent')
      into have from daraja.attendance where staff_id = p_staff and day > daraja.today() - 30;
    out := out || jsonb_build_object('key','late','label','Moins de '||n||' min de retard sur 30 jours, sans absence injustifiée','ok', have < n,'have',least(have,999),'need',n);
  end if;
  if (c->>'min_days') is not null then
    n := (c->>'min_days')::int;
    select count(*) into have from daraja.quiz_sessions where staff_id = p_staff and day > daraja.today() - 30
      and cardinality(answered) >= cardinality(question_ids);
    out := out || jsonb_build_object('key','days','label',n||' jours de quiz sur les 30 derniers jours','ok', have >= n,'have',have,'need',n);
  end if;
  return out;
end $function$
;

CREATE OR REPLACE FUNCTION daraja.sanction_rank(t text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
  select case
    when t ilike '%faute grave%' or t ilike '%licenci%' then 5
    when t ilike '%mutation%' then 4
    when t ilike '%mise à pied%' then 3
    when t ilike '%blâme%' then 2
    when t ilike '%écrit%' then 1
    else 0 end $function$
;

CREATE OR REPLACE FUNCTION daraja.strip_line(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
  select upper(left(x, 1)) || substr(x, 2) from (select trim(regexp_replace(coalesce(t,''), '^(Rouge|Grise|Blanche)\s*:\s*', '', 'i')) x) s $function$
;

CREATE OR REPLACE FUNCTION daraja.tickets(p_staff uuid, p_month date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
  select (select count(*) from daraja.quiz_sessions q where q.staff_id = p_staff
            and date_trunc('month', q.day) = date_trunc('month', p_month) and cardinality(q.answered) >= cardinality(q.question_ids))::int
       + 2 * (select count(*) from daraja.point_events e where e.staff_id = p_staff and e.note like 'Ponctualité semaine %'
            and date_trunc('month', substr(e.note, 21)::date) = date_trunc('month', p_month))::int
$function$
;

CREATE OR REPLACE FUNCTION daraja.today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select (now() at time zone 'Africa/Casablanca')::date $function$
;

CREATE OR REPLACE FUNCTION daraja.week_mission(p_family text)
 RETURNS daraja.missions
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
  select m.* from daraja.missions m where m.active and m.family = p_family order by m.id
  offset ((daraja.week_start() - date '2026-01-05') / 7) % greatest(1, (select count(*) from daraja.missions where active and family = p_family))
  limit 1 $function$
;

CREATE OR REPLACE FUNCTION daraja.week_start()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$ select date_trunc('week', daraja.today())::date $function$
;

CREATE OR REPLACE FUNCTION daraja.who(p_token text)
 RETURNS daraja.staff
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff;
begin
  select st.* into s from daraja.sessions se join daraja.staff st on st.id = se.staff_id
  where se.token = p_token and st.active;
  if s.id is null then raise exception 'session'; end if;
  return s;
end $function$
;

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
    'reviews', (select coalesce(json_agg(json_build_object('id', e.id, 'name', o.name, 'note', e.note) order by e.created_at), '[]'::json)
      from daraja.point_events e join daraja.staff o on o.id = e.staff_id
      where o.venue = v and e.kind = 'avis' and e.status = 'pending'),
    'gifts', (select coalesce(json_agg(json_build_object('id', e.id, 'name', o.name, 'note', e.note) order by e.created_at), '[]'::json)
      from daraja.point_events e join daraja.staff o on o.id = e.staff_id
      where o.venue = v and e.kind = 'cadeau' and not e.delivered),
    'staff', (select coalesce(json_agg(json_build_object('id', o.id, 'name', o.name, 'alias', o.alias, 'avatar', o.avatar, 'role', o.role,
        'post', o.post, 'post_label', p.label, 'family', daraja.family(o), 'phone', o.phone, 'birthday', o.birthday, 'points', daraja.balance(o.id),
        'mission_done', exists(select 1 from daraja.mission_done m where m.staff_id = o.id and m.week = daraja.week_start())) order by o.name), '[]'::json)
      from daraja.staff o left join daraja.posts p on p.id = o.post where o.venue = v and o.active and o.role <> 'super'));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_add_staff(p_token text, p_name text, p_pin text, p_role text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  if p_pin !~ '^[0-9]{4}$' then return json_build_object('ok', false, 'error', 'pin'); end if;
  if length(trim(coalesce(p_name,''))) = 0 then return json_build_object('ok', false, 'error', 'name'); end if;
  if p_role not in ('staff','admin') or (p_role = 'admin' and s.role <> 'super') then raise exception 'role'; end if;
  if exists(select 1 from daraja.staff where active and pin_hash = crypt(p_pin, pin_hash)) then
    return json_build_object('ok', false, 'error', 'taken'); end if;
  insert into daraja.staff(venue, name, pin_hash, role) values (v, trim(p_name), crypt(p_pin, gen_salt('bf')), p_role);
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_add_staff2(p_token text, p_name text, p_pin text, p_role text, p_venue text, p_post text, p_phone text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; v text; ph text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  if p_pin !~ '^[0-9]{4}$' then return json_build_object('ok', false, 'error', 'pin'); end if;
  if length(trim(coalesce(p_name,''))) = 0 then return json_build_object('ok', false, 'error', 'name'); end if;
  if p_role not in ('staff','admin') or (p_role = 'admin' and s.role <> 'super') then raise exception 'role'; end if;
  if p_post is not null and not exists (select 1 from daraja.posts where id = p_post) then raise exception 'post'; end if;
  if exists(select 1 from daraja.staff where active and pin_hash = crypt(p_pin, pin_hash)) then
    return json_build_object('ok', false, 'error', 'taken'); end if;
  ph := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if ph like '0%' then ph := '212' || substr(ph, 2); end if;
  insert into daraja.staff(venue, name, pin_hash, role, post, phone) values (v, trim(p_name), crypt(p_pin, gen_salt('bf')), p_role, p_post, nullif(ph, ''));
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_attendance(p_token text, p_venue text, p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, p_venue);
  return (select coalesce(json_agg(json_build_object('id', o.id, 'name', o.name, 'display', daraja.display_name(o), 'avatar', o.avatar,
      'days', (select coalesce(json_agg(json_build_object('day', a.day, 'status', a.status, 'late', a.late_min, 'late_ok', a.late_ok,
          'note', a.note, 'source', a.source) order by a.day), '[]'::json)
        from daraja.attendance a where a.staff_id = o.id and a.day between p_from and p_to),
      'late', (select coalesce(sum(case when not a.late_ok then a.late_min else 0 end),0) from daraja.attendance a
        where a.staff_id = o.id and a.day between p_from and p_to),
      'absent', (select count(*) from daraja.attendance a where a.staff_id = o.id and a.day between p_from and p_to and a.status = 'absent'),
      'bonus', exists(select 1 from daraja.point_events e where e.staff_id = o.id and e.note = 'Ponctualité semaine ' || p_from))
      order by o.name), '[]'::json)
    from daraja.staff o where o.venue = p_venue and o.active and o.role in ('staff','admin'));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_attendance_set(p_token text, p_rows jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; r jsonb; o daraja.staff; n int := 0;
begin
  s := daraja.who(p_token);
  for r in select * from jsonb_array_elements(p_rows) loop
    select * into o from daraja.staff where id = (r->>'staff')::uuid;
    if o.id is null then raise exception 'staff'; end if; perform daraja.can_admin(s, o.venue);
    insert into daraja.attendance(staff_id, day, status, late_min, late_ok, note, source, by_staff, updated_at)
    values (o.id, (r->>'day')::date, coalesce(r->>'status','present'), greatest(0, coalesce((r->>'late')::int, 0)),
      coalesce((r->>'late_ok')::boolean, false), nullif(r->>'note',''), coalesce(r->>'source','manuel'), s.id, now())
    on conflict (staff_id, day) do update set status = excluded.status, late_min = excluded.late_min, late_ok = excluded.late_ok,
      note = excluded.note, source = excluded.source, by_staff = excluded.by_staff, updated_at = now();
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'n', n);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_close_week(p_token text, p_venue text, p_week date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; o record; tag text; n int := 0; names text[] := '{}';
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, p_venue);
  if p_week + 6 >= daraja.today() then raise exception 'week_not_over'; end if;
  tag := 'Ponctualité semaine ' || p_week;
  for o in
    select st.id, daraja.display_name(st) dn from daraja.staff st
    where st.venue = p_venue and st.active and st.role = 'staff'
      and exists (select 1 from daraja.attendance a where a.staff_id = st.id and a.day between p_week and p_week + 6 and a.status = 'present')
      and not exists (select 1 from daraja.attendance a where a.staff_id = st.id and a.day between p_week and p_week + 6 and a.status = 'absent')
      and (select coalesce(sum(case when not a.late_ok then a.late_min else 0 end),0) from daraja.attendance a
           where a.staff_id = st.id and a.day between p_week and p_week + 6) < 10
      and not exists (select 1 from daraja.point_events e where e.staff_id = st.id and e.note = tag)
  loop
    insert into daraja.point_events(staff_id, kind, amount, note, by_staff) values (o.id, 'bonus', 25, tag, s.id);
    n := n + 1; names := names || o.dn;
  end loop;
  return json_build_object('ok', true, 'n', n, 'names', names);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_contacts(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  return (select coalesce(json_object_agg(role, json_build_object('name', name, 'phone', phone)), '{}'::json)
    from daraja.venue_contacts where venue = v);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_deliver(p_token text, p_event uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select o.venue from daraja.point_events e join daraja.staff o on o.id = e.staff_id where e.id = p_event));
  update daraja.point_events set delivered = true, by_staff = s.id where id = p_event and kind = 'cadeau';
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_draw(p_token text, p_venue text, p_month date, p_prize text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; m date := date_trunc('month', p_month)::date; tot int; pick int; w record; d daraja.draws; pool json; players int;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, p_venue);
  if nullif(trim(p_prize), '') is null then raise exception 'prize'; end if;
  if exists (select 1 from daraja.draws where venue = p_venue and month = to_char(m, 'YYYY-MM')) then raise exception 'already'; end if;
  select coalesce(json_agg(json_build_object('id', id, 'n', n)), '[]'::json) into pool from (
    select st.id, daraja.tickets(st.id, m) n from daraja.staff st
    where st.venue = p_venue and st.active and st.role = 'staff'
      and not exists (select 1 from daraja.conduct_records c where c.staff_id = st.id and c.line in ('grise','rouge')
        and date_trunc('month', c.occurred_at at time zone 'Africa/Casablanca') = m)) z where n > 0;
  select coalesce(sum((e->>'n')::int), 0), count(*) into tot, players from json_array_elements(pool) e;
  if tot = 0 then return json_build_object('ok', false, 'error', 'no_tickets'); end if;
  pick := floor(random() * tot)::int;
  select id, n into w from (
    select (e->>'id')::uuid id, (e->>'n')::int n, sum((e->>'n')::int) over (order by e->>'id') hi from json_array_elements(pool) e) x
  where pick < hi and pick >= hi - n;
  insert into daraja.draws(venue, month, prize, winner, tickets, total, by_staff)
    values (p_venue, to_char(m, 'YYYY-MM'), trim(p_prize), w.id, w.n, tot, s.id) returning * into d;
  return json_build_object('ok', true, 'winner', (select daraja.display_name(st) from daraja.staff st where st.id = w.id),
    'name', (select name from daraja.staff where id = w.id), 'phone', (select phone from daraja.staff where id = w.id),
    'tickets', w.n, 'total', tot, 'players', players);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_missions(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token); perform daraja.can_admin(s, p_venue);
  return (select json_object_agg(f, (daraja.week_mission(f)).title) from unnest(array['salle','bar','cuisine','support']) f);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_points(p_token text, p_staff uuid, p_kind text, p_amount integer, p_note text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select venue from daraja.staff where id = p_staff));
  if p_kind not in ('bonus','malus','avis') then raise exception 'kind'; end if;
  insert into daraja.point_events(staff_id, kind, amount, note, by_staff)
    values (p_staff, p_kind, case when p_kind = 'malus' then -abs(p_amount) else abs(p_amount) end, p_note, s.id);
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_review(p_token text, p_event uuid, p_ok boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select o.venue from daraja.point_events e join daraja.staff o on o.id = e.staff_id where e.id = p_event));
  update daraja.point_events set status = case when p_ok then 'ok' else 'rejected' end, by_staff = s.id
    where id = p_event and kind = 'avis' and status = 'pending';
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_reward_save(p_token text, p jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; rid uuid;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  if nullif(trim(p->>'name'), '') is null or coalesce((p->>'cost')::int, 0) <= 0 then raise exception 'invalid'; end if;
  if (p->>'id') is null then
    insert into daraja.rewards(venue, name, icon, cost, tier, active, conditions, stock)
    values (nullif(p->>'venue',''), trim(p->>'name'), coalesce(nullif(p->>'icon',''),'gift'), (p->>'cost')::int,
      coalesce(p->>'tier','bon'), coalesce((p->>'active')::boolean, true), coalesce(p->'conditions','{}'::jsonb), (p->>'stock')::int)
    returning id into rid;
  else
    update daraja.rewards set venue = nullif(p->>'venue',''), name = trim(p->>'name'), icon = coalesce(nullif(p->>'icon',''), icon),
      cost = (p->>'cost')::int, tier = coalesce(p->>'tier', tier), active = coalesce((p->>'active')::boolean, active),
      conditions = coalesce(p->'conditions', conditions), stock = (p->>'stock')::int
    where id = (p->>'id')::uuid returning id into rid;
  end if;
  return json_build_object('ok', true, 'id', rid);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_rewards(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  return (select coalesce(json_agg(json_build_object('id', id, 'venue', venue, 'name', name, 'icon', icon, 'cost', cost,
      'tier', tier, 'active', active, 'library', library, 'stock', stock, 'conditions', conditions,
      'claimed', (select count(*) from daraja.point_events e where e.reward_id = r.id))
      order by active desc, cost), '[]'::json) from daraja.rewards r);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_set_birthday(p_token text, p_staff uuid, p_mmdd text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select venue from daraja.staff where id = p_staff));
  if nullif(p_mmdd, '') is not null and p_mmdd !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then return json_build_object('ok', false); end if;
  update daraja.staff set birthday = nullif(p_mmdd, '') where id = p_staff;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_set_contact(p_token text, p_venue text, p_role text, p_name text, p_phone text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; ph text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  ph := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if ph like '0%' then ph := '212' || substr(ph, 2); end if;
  if ph <> '' and length(ph) < 10 then return json_build_object('ok', false, 'error', 'phone'); end if;
  insert into daraja.venue_contacts(venue, role, name, phone) values (v, p_role, nullif(trim(p_name), ''), nullif(ph, ''))
    on conflict (venue, role) do update set name = excluded.name, phone = excluded.phone;
  return json_build_object('ok', true, 'phone', ph);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_update_staff(p_token text, p_staff uuid, p_post text, p_phone text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; ph text;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select venue from daraja.staff where id = p_staff));
  if p_post is not null and not exists (select 1 from daraja.posts where id = p_post) then raise exception 'post'; end if;
  ph := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if ph like '0%' then ph := '212' || substr(ph, 2); end if;
  if ph <> '' and length(ph) < 10 then return json_build_object('ok', false, 'error', 'phone'); end if;
  update daraja.staff set post = p_post, phone = nullif(ph, '') where id = p_staff;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_admin_validate_mission(p_token text, p_staff uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; st daraja.staff; m daraja.missions; n int;
begin
  s := daraja.who(p_token);
  select * into st from daraja.staff where id = p_staff;
  perform daraja.can_admin(s, st.venue);
  m := daraja.week_mission(daraja.family(st));
  if m.id is null then return json_build_object('ok', false); end if;
  insert into daraja.mission_done(staff_id, week, mission_id, validated_by) values (p_staff, daraja.week_start(), m.id, s.id)
    on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into daraja.point_events(staff_id, kind, amount, note, by_staff) values (p_staff, 'bonus', 10, 'Mission · ' || m.title, s.id);
  end if;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_answer(p_token text, p_question uuid, p_choice integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; qs daraja.quiz_sessions; q daraja.questions; ok boolean; finished boolean; today_pts int;
begin
  s := daraja.who(p_token);
  select * into qs from daraja.quiz_sessions where staff_id = s.id and day = daraja.today() for update;
  if qs.staff_id is null or not (p_question = any(qs.question_ids)) then raise exception 'question'; end if;
  select * into q from daraja.questions where id = p_question;
  if not (p_question = any(qs.answered)) then
    ok := (p_choice = q.answer_idx);
    update daraja.quiz_sessions set answered = answered || p_question, correct = correct + (case when ok then 1 else 0 end)
      where staff_id = s.id and day = qs.day returning * into qs;
    if ok then
      insert into daraja.point_events(staff_id, kind, amount, note) values (s.id, 'quiz', 10 * q.level, q.theme);
    end if;
    if cardinality(qs.answered) >= cardinality(qs.question_ids) then
      update daraja.staff set
        streak = case when last_quiz_day = daraja.today() then streak
                      when last_quiz_day = daraja.today() - 1 then streak + 1 else 1 end,
        last_quiz_day = daraja.today()
      where id = s.id;
    end if;
  end if;
  finished := cardinality(qs.answered) >= cardinality(qs.question_ids);
  select coalesce(sum(amount),0) into today_pts from daraja.point_events
    where staff_id = s.id and kind = 'quiz' and (created_at at time zone 'Africa/Casablanca')::date = daraja.today();
  return json_build_object('correct', ok, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
    'finished', finished, 'score', qs.correct, 'points', 10 * q.level, 'today_points', today_pts);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_answer_v2(p_token text, p_question uuid, p_choice integer, p_answer jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; qs daraja.quiz_sessions; q daraja.questions; ok boolean; finished boolean; today_pts int; ns int; sb int := 0; pres int := 0; late boolean := false;
begin
  s := daraja.who(p_token);
  select * into qs from daraja.quiz_sessions where staff_id = s.id and day = daraja.today() for update;
  if qs.staff_id is null or not (p_question = any(qs.question_ids)) then raise exception 'question'; end if;
  select * into q from daraja.questions where id = p_question;
  if not (p_question = any(qs.answered)) then
    late := (qs.started ? p_question::text)
      and extract(epoch from clock_timestamp()) - (qs.started->>p_question::text)::numeric > daraja.q_limit(q.kind) + 2.5;
    ok := not late and daraja.grade(q, p_choice, p_answer);
    insert into daraja.answers(staff_id, question_id, correct) values (s.id, q.id, ok);
    update daraja.quiz_sessions set answered = answered || p_question, correct = correct + (case when ok then 1 else 0 end)
      where staff_id = s.id and day = qs.day returning * into qs;
    if ok then
      insert into daraja.point_events(staff_id, kind, amount, note) values (s.id, 'quiz', 10 * q.level, q.theme);
    end if;
    if cardinality(qs.answered) >= cardinality(qs.question_ids) and coalesce(s.last_quiz_day, date '2000-01-01') < daraja.today() then
      ns := case when s.last_quiz_day >= daraja.today() - 2 then s.streak + 1 else 1 end;
      update daraja.staff set streak = ns, last_quiz_day = daraja.today() where id = s.id;
      pres := 3;
      insert into daraja.point_events(staff_id, kind, amount, note) values (s.id, 'bonus', pres, 'Présence');
      if ns >= 2 then
        sb := 5 * least(ns, 20);
        insert into daraja.point_events(staff_id, kind, amount, note) values (s.id, 'bonus', sb, 'Série jour ' || ns);
      end if;
    end if;
  end if;
  finished := cardinality(qs.answered) >= cardinality(qs.question_ids);
  select coalesce(sum(amount),0) into today_pts from daraja.point_events
    where staff_id = s.id and kind = 'quiz' and (created_at at time zone 'Africa/Casablanca')::date = daraja.today();
  return json_build_object('correct', ok, 'timeout', late, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
    'solution', case when q.kind = 'order' then q.payload->'answer' else null end,
    'finished', finished, 'score', qs.correct, 'points', 10 * q.level, 'today_points', today_pts, 'streak_bonus', sb, 'presence', pres);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_avatars_taken(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  return (select coalesce(json_agg(avatar), '[]'::json) from daraja.staff where active and avatar is not null and id <> s.id);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_birthdays(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; t date := daraja.today(); rr record;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  for rr in select id from daraja.staff where venue = v and active and birthday = to_char(t, 'MM-DD') loop
    if not exists (select 1 from daraja.point_events where staff_id = rr.id and note = 'Anniversaire ' || to_char(t, 'YYYY')) then
      insert into daraja.point_events(staff_id, kind, amount, note) values (rr.id, 'bonus', 50, 'Anniversaire ' || to_char(t, 'YYYY'));
    end if;
  end loop;
  return (select coalesce(json_agg(x order by x.in_days, x.display), '[]'::json) from (
    select o.id, daraja.display_name(o) display, o.avatar, o.phone, o.birthday, o.id = s.id me,
      (select min(g) from generate_series(0, 7) g where to_char(t + g, 'MM-DD') = o.birthday) in_days
    from daraja.staff o where o.venue = v and o.active and o.birthday is not null) x where x.in_days is not null);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_conduct_ack(p_token text, p_record uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  update daraja.conduct_records set acknowledged_at = now() where id = p_record and staff_id = s.id and acknowledged_at is null;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_conduct_add(p_token text, p_staff uuid, p_rule integer, p_facts text, p_witnesses text, p_applied text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; c json; r daraja.conduct_rules; rec uuid;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select venue from daraja.staff where id = p_staff));
  if p_staff = s.id then raise exception 'self'; end if;
  select * into r from daraja.conduct_rules where id = p_rule and active;
  if r.id is null then raise exception 'rule'; end if;
  if r.direction_only and s.role <> 'super' then return json_build_object('ok', false, 'error', 'direction'); end if;
  if length(trim(coalesce(p_facts, ''))) < 3 then return json_build_object('ok', false, 'error', 'facts'); end if;
  perform pg_advisory_xact_lock(hashtext(p_staff::text));
  c := daraja.conduct_compute(p_staff, p_rule);
  insert into daraja.conduct_records(staff_id, rule_id, line, occurrence, escalation, sanction_planned, sanction_applied,
      facts, witnesses, malus, recorded_by, needs_direction)
    values (p_staff, p_rule, c->>'line', (c->>'occurrence')::int, c->>'escalation', c->>'sanction',
      nullif(trim(coalesce(p_applied, '')), ''), left(p_facts, 1000), left(p_witnesses, 300), (c->>'malus')::int, s.id,
      (c->>'line') = 'rouge' and s.role <> 'super')
    returning id into rec;
  insert into daraja.point_events(staff_id, kind, amount, note, by_staff)
    values (p_staff, 'malus', -((c->>'malus')::int), 'Conduite · ' || initcap(c->>'line') || ' · ' || r.behavior, s.id);
  return json_build_object('ok', true, 'id', rec, 'result', c);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_conduct_mine(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; last_at timestamptz;
begin
  s := daraja.who(p_token);
  select max(occurred_at) into last_at from daraja.conduct_records where staff_id = s.id;
  return json_build_object(
    'days_clean', (daraja.today() - (coalesce(last_at, s.created_at) at time zone 'Africa/Casablanca')::date),
    'blanche', (select count(*) from daraja.conduct_records where staff_id = s.id and line = 'blanche' and occurred_at > now() - interval '6 months'),
    'grise', (select count(*) from daraja.conduct_records where staff_id = s.id and line = 'grise' and occurred_at > now() - interval '6 months'),
    'rouge', (select count(*) from daraja.conduct_records where staff_id = s.id and line = 'rouge' and occurred_at > now() - interval '12 months'),
    'records', (select coalesce(json_agg(json_build_object('id', c.id, 'line', c.line, 'behavior', r.behavior,
        'sanction', c.sanction_planned, 'malus', c.malus, 'at', c.occurred_at, 'escalation', c.escalation,
        'ack', c.acknowledged_at is not null) order by c.occurred_at desc), '[]'::json)
      from daraja.conduct_records c join daraja.conduct_rules r on r.id = c.rule_id
      where c.staff_id = s.id and c.occurred_at > now() - interval '12 months'));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_conduct_notify(p_token text, p_record uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'direction'; end if;
  update daraja.conduct_records set notified_at = now(), notified_by = s.id, needs_direction = false
   where id = p_record and line = 'rouge';
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_conduct_preview(p_token text, p_staff uuid, p_rule integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select venue from daraja.staff where id = p_staff));
  return daraja.conduct_compute(p_staff, p_rule);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_conduct_register(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  return (select coalesce(json_agg(json_build_object('id', c.id, 'staff', o.name, 'staff_id', o.id, 'line', c.line,
      'behavior', r.behavior, 'domain', r.domain, 'sanction', c.sanction_planned, 'applied', c.sanction_applied,
      'escalation', c.escalation, 'facts', c.facts, 'witnesses', c.witnesses, 'malus', c.malus,
      'at', c.occurred_at, 'by', b.name, 'ack', c.acknowledged_at is not null, 'notified', c.notified_at is not null,
      'needs_direction', c.needs_direction) order by c.occurred_at desc), '[]'::json)
    from daraja.conduct_records c join daraja.staff o on o.id = c.staff_id join daraja.conduct_rules r on r.id = c.rule_id
    left join daraja.staff b on b.id = c.recorded_by
    where o.venue = v and c.occurred_at > now() - interval '365 days');
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_conduct_rules(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role = 'staff' then raise exception 'admin'; end if;
  return (select coalesce(json_agg(json_build_object('id', id, 'line', line, 'domain', domain, 'behavior', behavior,
      'base_sanction', base_sanction, 'locked', (direction_only and s.role <> 'super')) order by sort), '[]'::json)
    from daraja.conduct_rules where active);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_contacts(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  return (select coalesce(json_agg(json_build_object('role', role, 'name', name, 'phone', phone)), '[]'::json)
    from daraja.venue_contacts where venue = v and coalesce(phone, '') <> '');
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_draw_info(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; m date := date_trunc('month', daraja.today())::date; ld daraja.draws;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  select * into ld from daraja.draws where venue = v order by month desc limit 1;
  return json_build_object('tickets', daraja.tickets(s.id, m),
    'days_left', (m + interval '1 month')::date - daraja.today(),
    'last', case when ld.id is null then null else json_build_object('month', ld.month, 'prize', ld.prize,
      'winner', (select daraja.display_name(st) from daraja.staff st where st.id = ld.winner),
      'avatar', (select avatar from daraja.staff where id = ld.winner), 'me', ld.winner = s.id) end);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_answer(p_token text, p_duel uuid, p_question uuid, p_choice integer, p_answer jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; d daraja.duels; q daraja.questions; ok boolean; t numeric; st numeric; mine jsonb; late boolean := false;
begin
  s := daraja.who(p_token);
  select * into d from daraja.duels where id = p_duel and (challenger = s.id or opponent = s.id) and status = 'open' for update;
  if d.id is null or not (p_question = any(d.question_ids)) then raise exception 'duel'; end if;
  select * into q from daraja.questions where id = p_question;
  mine := case when d.challenger = s.id then d.c_ans else d.o_ans end;
  if not (mine ? p_question::text) then
    st := (d.started->(s.id::text)->>p_question::text)::numeric;
    t := case when st is null then daraja.q_limit(q.kind) else extract(epoch from clock_timestamp()) - st end;
    late := t > daraja.q_limit(q.kind) + 2.5;
    ok := not late and daraja.grade(q, p_choice, p_answer);
    mine := mine || jsonb_build_object(p_question::text, jsonb_build_object('ok', ok, 't', least(t, daraja.q_limit(q.kind) + 2.5)));
    if d.challenger = s.id then update daraja.duels set c_ans = mine where id = d.id returning * into d;
    else update daraja.duels set o_ans = mine where id = d.id returning * into d; end if;
    if (select count(*) from jsonb_object_keys(d.c_ans)) >= cardinality(d.question_ids)
       and (select count(*) from jsonb_object_keys(d.o_ans)) >= cardinality(d.question_ids) then
      perform daraja.duel_close(d);
    end if;
  else
    ok := (mine->p_question::text->>'ok')::boolean;
  end if;
  return json_build_object('correct', ok, 'timeout', late, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
    'solution', case when q.kind = 'order' then q.payload->'answer' else null end, 'points', 0,
    'score', (select count(*) from jsonb_each(mine) e where (e.value->>'ok')::boolean));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_badge(p_token text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  return (select count(*) from daraja.duels where ((opponent = s.id and status = 'pending' and created_at > now() - interval '24 hours')
    or ((challenger = s.id or opponent = s.id) and status in ('ready','live') and coalesce(accepted_at, created_at) > now() - interval '24 hours')));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_cancel(p_token text, p_duel uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; d daraja.duels;
begin
  s := daraja.who(p_token);
  select * into d from daraja.duels where id = p_duel and (challenger = s.id or opponent = s.id) for update;
  if d.id is null then raise exception 'duel'; end if;
  if d.status not in ('pending','ready') then return json_build_object('ok', false, 'error', d.status); end if;
  update daraja.duels set status = 'cancelled', done_at = now() where id = d.id;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_get(p_token text, p_duel uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; d daraja.duels; mine jsonb;
begin
  s := daraja.who(p_token);
  select * into d from daraja.duels where id = p_duel and (challenger = s.id or opponent = s.id);
  if d.id is null then raise exception 'duel'; end if;
  mine := case when d.challenger = s.id then d.c_ans else d.o_ans end;
  return json_build_object('id', d.id, 'status', d.status, 'questions', daraja.q_json(d.question_ids),
    'answered', (select coalesce(json_agg(k), '[]'::json) from jsonb_object_keys(mine) k),
    'correct', (select count(*) from jsonb_each(mine) e where (e.value->>'ok')::boolean),
    'started', coalesce(d.started->(s.id::text), '{}'::jsonb), 'now', extract(epoch from clock_timestamp()));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_new(p_token text, p_opponent uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; o daraja.staff; ids uuid[]; d uuid;
begin
  s := daraja.who(p_token);
  if s.role <> 'staff' then return json_build_object('ok', false, 'error', 'role'); end if;
  select * into o from daraja.staff where id = p_opponent and active and role = 'staff';
  if o.id is null or o.venue <> s.venue or o.id = s.id then return json_build_object('ok', false, 'error', 'opponent'); end if;
  perform pg_advisory_xact_lock(hashtext('duel' || least(s.id::text, o.id::text) || greatest(s.id::text, o.id::text)));
  if (select count(*) from daraja.duels where challenger = s.id and (created_at at time zone 'Africa/Casablanca')::date = daraja.today()) >= 3 then
    return json_build_object('ok', false, 'error', 'limit'); end if;
  if exists (select 1 from daraja.duels where status in ('pending','ready','live','open')
             and ((challenger = s.id and opponent = o.id) or (challenger = o.id and opponent = s.id))
             and created_at > now() - interval '48 hours') then
    return json_build_object('ok', false, 'error', 'open'); end if;
  ids := daraja.pick_questions(s.venue, daraja.family(s), daraja.family(o));
  if ids is null or cardinality(ids) < 3 then ids := daraja.pick_questions(s.venue, daraja.family(s)); end if;
  if ids is null then return json_build_object('ok', false, 'error', 'questions'); end if;
  insert into daraja.duels(venue, challenger, opponent, question_ids, status, limits)
  values (s.venue, s.id, o.id, ids, 'pending',
    (select array_agg(daraja.q_limit(q.kind) order by array_position(ids, q.id)) from daraja.questions q where q.id = any(ids)))
  returning id into d;
  return json_build_object('ok', true, 'id', d);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_play(p_token text, p_duel uuid, p_idx integer, p_choice integer, p_answer jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; d daraja.duels; q daraja.questions; ok boolean; nw numeric; st numeric; mine jsonb; qid uuid;
begin
  s := daraja.who(p_token);
  select * into d from daraja.duels where id = p_duel and (challenger = s.id or opponent = s.id) for update;
  if d.id is null or d.status <> 'live' or p_idx < 0 or p_idx >= cardinality(d.question_ids) then
    return json_build_object('ok', false, 'error', 'state'); end if;
  nw := extract(epoch from clock_timestamp());
  st := daraja.duel_slot(d, p_idx);
  if nw < st or nw > st + d.limits[p_idx + 1] + 1.5 then return json_build_object('ok', false, 'error', 'time'); end if;
  qid := d.question_ids[p_idx + 1];
  mine := case when d.challenger = s.id then d.c_ans else d.o_ans end;
  if mine ? qid::text then return json_build_object('ok', false, 'error', 'done'); end if;
  select * into q from daraja.questions where id = qid;
  ok := daraja.grade(q, p_choice, p_answer);
  mine := mine || jsonb_build_object(qid::text, jsonb_build_object('ok', ok, 't', round(nw - st, 2)));
  if d.challenger = s.id then update daraja.duels set c_ans = mine where id = d.id;
  else update daraja.duels set o_ans = mine where id = d.id; end if;
  return json_build_object('ok', true, 'correct', ok, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
    'solution', case when q.kind = 'order' then q.payload->'answer' end);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_respond(p_token text, p_duel uuid, p_accept boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; d daraja.duels;
begin
  s := daraja.who(p_token);
  d := daraja.duel_tick(p_duel);
  if d.id is null or d.opponent <> s.id then raise exception 'duel'; end if;
  if d.status <> 'pending' then return json_build_object('ok', false, 'error', d.status); end if;
  if p_accept then
    update daraja.duels set status = 'ready', accepted_at = now(), o_seen = clock_timestamp() where id = d.id;
  else
    update daraja.duels set status = 'declined', done_at = now() where id = d.id;
  end if;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_start(p_token text, p_duel uuid, p_question uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; d daraja.duels; me text;
begin
  s := daraja.who(p_token); me := s.id::text;
  select * into d from daraja.duels where id = p_duel and (challenger = s.id or opponent = s.id) and status = 'open' for update;
  if d.id is null or not (p_question = any(d.question_ids)) then raise exception 'duel'; end if;
  if not coalesce((d.started->me) ? p_question::text, false) then
    update daraja.duels set started = jsonb_set(started, array[me], coalesce(started->me, '{}'::jsonb) || jsonb_build_object(p_question::text, extract(epoch from clock_timestamp())))
      where id = d.id returning * into d;
  end if;
  return json_build_object('elapsed', extract(epoch from clock_timestamp()) - (d.started->me->>p_question::text)::numeric);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duel_state(p_token text, p_duel uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; d daraja.duels; me_c boolean; nw numeric; n int; cur int := -1; i int;
  mine jsonb; theirs jsonb; other daraja.staff; oseen timestamptz;
begin
  s := daraja.who(p_token);
  select * into d from daraja.duels where id = p_duel and (challenger = s.id or opponent = s.id);
  if d.id is null then raise exception 'duel'; end if;
  me_c := d.challenger = s.id;
  if d.status in ('ready','live') then
    if me_c then update daraja.duels set c_seen = clock_timestamp() where id = d.id;
    else update daraja.duels set o_seen = clock_timestamp() where id = d.id; end if;
  end if;
  d := daraja.duel_tick(d.id);
  nw := extract(epoch from clock_timestamp());
  n := coalesce(cardinality(d.limits), 0);
  if d.status = 'live' then
    for i in 0 .. n - 1 loop
      if nw >= daraja.duel_slot(d, i) then cur := i; end if;
    end loop;
  end if;
  mine := case when me_c then d.c_ans else d.o_ans end;
  theirs := case when me_c then d.o_ans else d.c_ans end;
  select * into other from daraja.staff where id = case when me_c then d.opponent else d.challenger end;
  oseen := case when me_c then d.o_seen else d.c_seen end;
  return json_build_object(
    'id', d.id, 'status', d.status, 'now', nw, 'mine', me_c,
    'start_at', extract(epoch from d.start_at), 'limits', d.limits,
    'slots', case when d.start_at is null then null else (select json_agg(daraja.duel_slot(d, g) order by g) from generate_series(0, n - 1) g) end,
    'cur', cur,
    'questions', case when d.status = 'done' then daraja.q_json(d.question_ids)
                      when d.status = 'live' and cur >= 0 then daraja.q_json(d.question_ids[1:cur + 1]) else '[]'::json end,
    'answers', case when d.status in ('live','done') then (select json_agg(json_build_object(
          'qid', qid,
          'me', mine->(qid::text),
          'them', case when d.status = 'done' or nw > daraja.duel_slot(d, (k - 1)::int) + d.limits[k] + 1 or mine ? qid::text then theirs->(qid::text) else null end,
          'answer_idx', case when d.status = 'done' or nw > daraja.duel_slot(d, (k - 1)::int) + d.limits[k] + 1 or mine ? qid::text then (select answer_idx from daraja.questions where id = qid) end,
          'explanation', case when d.status = 'done' or nw > daraja.duel_slot(d, (k - 1)::int) + d.limits[k] + 1 or mine ? qid::text then (select explanation from daraja.questions where id = qid) end,
          'solution', case when d.status = 'done' or nw > daraja.duel_slot(d, (k - 1)::int) + d.limits[k] + 1 or mine ? qid::text then (select case when kind = 'order' then payload->'answer' end from daraja.questions where id = qid) end)
        order by k) from unnest(d.question_ids) with ordinality u(qid, k) where k - 1 <= greatest(cur, case when d.status = 'done' then n else -1 end)) end,
    'my_score', (select count(*) from jsonb_each(mine) e where (e.value->>'ok')::boolean),
    'their_score', (select count(*) from jsonb_each(theirs) e where (e.value->>'ok')::boolean),
    'winner', case when d.winner is null then null else d.winner = s.id end,
    'other', json_build_object('display', daraja.display_name(other), 'avatar', other.avatar,
      'online', oseen > clock_timestamp() - interval '8 seconds'),
    'me', json_build_object('display', daraja.display_name(s), 'avatar', s.avatar));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_duels(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; r record;
begin
  s := daraja.who(p_token);
  for r in select id from daraja.duels where (challenger = s.id or opponent = s.id) and status in ('pending','ready','live') loop
    perform daraja.duel_tick(r.id);
  end loop;
  update daraja.duels set status = 'expired', done_at = now() where status = 'open' and (challenger = s.id or opponent = s.id);
  return (select coalesce(json_agg(x order by x.prio, x.created_at desc), '[]'::json) from (
    select d.id, d.status, d.created_at, d.challenger = s.id mine,
      (select daraja.display_name(o) from daraja.staff o where o.id = case when d.challenger = s.id then d.opponent else d.challenger end) other,
      (select avatar from daraja.staff o where o.id = case when d.challenger = s.id then d.opponent else d.challenger end) other_avatar,
      (select count(*) from jsonb_each(case when d.challenger = s.id then d.c_ans else d.o_ans end) e where (e.value->>'ok')::boolean) my_score,
      (select count(*) from jsonb_each(case when d.challenger = s.id then d.o_ans else d.c_ans end) e where (e.value->>'ok')::boolean) other_score,
      case when d.winner is null then null else d.winner = s.id end won,
      case when d.status in ('live','ready') then 0 when d.status = 'pending' and d.opponent = s.id then 1 when d.status = 'pending' then 2 else 3 end prio,
      (d.status = 'pending' and d.opponent = s.id) or d.status in ('ready','live') todo
    from daraja.duels d where (d.challenger = s.id or d.opponent = s.id)
      and (d.status in ('pending','ready','live') or d.done_at > now() - interval '3 days')) x);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_eotm(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; m text := to_char(daraja.today(), 'YYYY-MM'); e daraja.eotm;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  perform daraja.eotm_resolve(v);
  select * into e from daraja.eotm where venue = v order by month desc limit 1;
  return json_build_object(
    'can_vote', s.role = 'staff', 'my_vote', (select candidate from daraja.votes where month = m and voter = s.id),
    'voters', (select count(*) from daraja.votes where month = m and venue = v),
    'days_left', (date_trunc('month', daraja.today()) + interval '1 month')::date - daraja.today(),
    'candidates', (select coalesce(json_agg(json_build_object('id', o.id, 'display', daraja.display_name(o), 'avatar', o.avatar) order by daraja.display_name(o)), '[]'::json)
       from daraja.staff o where o.venue = v and o.active and o.role = 'staff' and o.id <> s.id),
    'last', case when e.venue is null then null else json_build_object('month', e.month, 'votes', e.votes, 'me', e.winner = s.id,
      'display', (select daraja.display_name(o) from daraja.staff o where o.id = e.winner),
      'avatar', (select avatar from daraja.staff where id = e.winner)) end);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_leaderboard(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  return (select coalesce(json_agg(x order by x.pts desc, x.name), '[]'::json) from (
    select o.id, daraja.display_name(o) as name, o.avatar, daraja.live_streak(o) streak, daraja.month_points(o.id) pts
    from daraja.staff o where o.venue = v and o.active and o.role = 'staff') x);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_leaderboard2(p_token text, p_venue text DEFAULT NULL::text, p_kind text DEFAULT 'savoir'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; m date := date_trunc('month', daraja.today())::date;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  return (select coalesce(json_agg(x order by x.val desc nulls last, x.name), '[]'::json) from (
    select o.id, daraja.display_name(o) as name, o.avatar, daraja.live_streak(o) streak,
      case p_kind
        when 'assiduite' then (select count(*) from daraja.quiz_sessions q where q.staff_id = o.id and q.day >= m
                               and cardinality(q.answered) >= cardinality(q.question_ids))::numeric
        when 'progression' then (
          select case when count(*) filter (where a.at >= m) >= 10 and count(*) filter (where a.at < m) >= 10
            then round(100 * (avg(a.correct::int) filter (where a.at >= m) - avg(a.correct::int) filter (where a.at < m)))
            else null end
          from daraja.answers a where a.staff_id = o.id and a.at >= (m - interval '1 month'))
        else (select coalesce(sum(e.amount),0) from daraja.point_events e where e.staff_id = o.id and e.kind = 'quiz'
              and e.status = 'ok' and e.created_at >= m)::numeric
      end val
    from daraja.staff o where o.venue = v and o.active and o.role = 'staff') x);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_login(p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; t text;
begin
  if (select count(*) from daraja.login_fails where at > now() - interval '10 minutes') >= 30 then
    return json_build_object('locked', true);
  end if;
  select * into s from daraja.staff where active and pin_hash = crypt(p_pin, pin_hash) limit 1;
  if s.id is null then
    insert into daraja.login_fails default values;
    return null;
  end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into daraja.sessions(token, staff_id) values (t, s.id);
  return json_build_object('token', t);
end $function$
;

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
    and daraja.month_points(o.id) > daraja.month_points(s.id);
  select exists(select 1 from daraja.quiz_sessions q where q.staff_id = s.id and q.day = daraja.today()
    and cardinality(q.answered) >= cardinality(q.question_ids)) into done;
  return json_build_object(
    'id', s.id, 'name', s.name, 'alias', s.alias, 'display', daraja.display_name(s), 'avatar', s.avatar,
    'role', s.role, 'venue', v,
    'venue_name', (select name from daraja.venues where id = v),
    'points', daraja.balance(s.id), 'earned', daraja.earned(s.id), 'month', daraja.month_points(s.id),
    'rank', rk,
    'streak', daraja.live_streak(s), 'flame', daraja.flame_state(s),
    'next_bonus', 5 * least(daraja.live_streak(s) + 1, 20),
    'quiz_done', done,
    'tickets', daraja.tickets(s.id, daraja.today()),
    'eotm', (select count(*) from daraja.eotm where winner = s.id), 'birthday', s.birthday, 'avis', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'avis' and status = 'ok'),
    'perfect', (select count(*) from daraja.quiz_sessions where staff_id = s.id and correct >= 5),
    'gifts', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'cadeau'),
    'exemplary', exists(select 1 from daraja.point_events where staff_id = s.id and kind = 'bonus'
        and note = 'Mois exemplaire ' || to_char(now() at time zone 'Africa/Casablanca' - interval '1 month', 'YYYY-MM')),
    'pending_ack', (select count(*) from daraja.conduct_records where staff_id = s.id and acknowledged_at is null),
    'direction_todo', case when s.role = 'super' then (select count(*) from daraja.conduct_records where needs_direction) else 0 end
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_mission(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; m daraja.missions;
begin
  s := daraja.who(p_token);
  m := daraja.week_mission(daraja.family(s));
  if m.id is null then return null; end if;
  return json_build_object('title', m.title, 'family', m.family,
    'done', exists(select 1 from daraja.mission_done where staff_id = s.id and week = daraja.week_start()),
    'days_left', 6 - (daraja.today() - daraja.week_start()));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_posts(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
begin
  perform daraja.who(p_token);
  return (select json_agg(json_build_object('id', id, 'family', family, 'label', label) order by sort) from daraja.posts);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_q_start(p_token text, p_question uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; qs daraja.quiz_sessions; t numeric;
begin
  s := daraja.who(p_token);
  select * into qs from daraja.quiz_sessions where staff_id = s.id and day = daraja.today() for update;
  if qs.staff_id is null or not (p_question = any(qs.question_ids)) then raise exception 'question'; end if;
  if not (qs.started ? p_question::text) then
    update daraja.quiz_sessions set started = started || jsonb_build_object(p_question::text, extract(epoch from clock_timestamp()))
      where staff_id = s.id and day = qs.day returning * into qs;
  end if;
  t := (qs.started->>p_question::text)::numeric;
  return json_build_object('elapsed', extract(epoch from clock_timestamp()) - t);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_quiz(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; qs daraja.quiz_sessions; ids uuid[]; today_pts int; v text;
begin
  s := daraja.who(p_token);
  v := coalesce(s.venue, 'baro');
  select * into qs from daraja.quiz_sessions where staff_id = s.id and day = daraja.today();
  if qs.staff_id is null then
    ids := daraja.pick_questions(v, daraja.family(s));
    if ids is null then return json_build_object('questions', '[]'::json, 'answered', '{}'::uuid[], 'correct', 0, 'today_points', 0); end if;
    insert into daraja.quiz_sessions(staff_id, day, question_ids) values (s.id, daraja.today(), ids) returning * into qs;
  end if;
  select coalesce(sum(amount),0) into today_pts from daraja.point_events
    where staff_id = s.id and kind = 'quiz' and (created_at at time zone 'Africa/Casablanca')::date = daraja.today();
  return json_build_object('answered', qs.answered, 'correct', qs.correct, 'today_points', today_pts, 'started', qs.started,
    'now', extract(epoch from clock_timestamp()), 'questions', daraja.q_json(qs.question_ids));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_quote(p_token text, p_random boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; n int; q daraja.quotes;
begin
  s := daraja.who(p_token);
  select count(*) into n from daraja.quotes where active;
  if n = 0 then return null; end if;
  if p_random then
    select * into q from daraja.quotes where active order by random() limit 1;
  else
    select * into q from daraja.quotes where active order by id
      offset ((daraja.today() - date '2026-01-01') % n) limit 1;
  end if;
  return json_build_object('kind', q.kind, 'body', q.body, 'author', q.author);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_redeem(p_token text, p_reward uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; r daraja.rewards; ck jsonb;
begin
  s := daraja.who(p_token);
  perform pg_advisory_xact_lock(hashtext(s.id::text));
  if exists (select 1 from daraja.conduct_records c join daraja.conduct_rules ru on ru.id = c.rule_id
             where c.staff_id = s.id and ru.grave and c.occurred_at > now() - interval '365 days') then
    return json_build_object('ok', false, 'error', 'blocked');
  end if;
  select * into r from daraja.rewards where id = p_reward and active for update;
  if r.id is null then raise exception 'reward'; end if;
  if coalesce(r.stock, 1) <= 0 then return json_build_object('ok', false, 'error', 'stock'); end if;
  ck := daraja.reward_check(s.id, r.conditions);
  if exists (select 1 from jsonb_array_elements(ck) e where not (e->>'ok')::boolean) then
    return json_build_object('ok', false, 'error', 'conditions', 'checks', ck);
  end if;
  if daraja.balance(s.id) < r.cost then return json_build_object('ok', false); end if;
  insert into daraja.point_events(staff_id, kind, amount, note, reward_id) values (s.id, 'cadeau', -r.cost, r.name, r.id);
  if r.stock is not null then update daraja.rewards set stock = stock - 1 where id = r.id; end if;
  return json_build_object('ok', true, 'points', daraja.balance(s.id));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_report(p_token text, p_venue text, p_period text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text; d int; t0 timestamptz; p0 timestamptz; t_end timestamptz;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  d := case p_period when 'day' then 1 when 'week' then 7 else 30 end;
  t_end := (daraja.today() + 1)::timestamp at time zone 'Africa/Casablanca';
  t0 := t_end - make_interval(days => d);
  p0 := t0 - make_interval(days => d);
  return json_build_object(
    'days', d,
    'staff', (select coalesce(json_agg(x order by x.days_played desc, x.acc desc nulls last), '[]'::json) from (
      select o.id, o.name, daraja.display_name(o) display, o.avatar, o.phone, p.label post, daraja.family(o) family,
        daraja.live_streak(o) streak, o.last_quiz_day last_day,
        (select count(distinct (a.at at time zone 'Africa/Casablanca')::date) from daraja.answers a where a.staff_id = o.id and a.at >= t0 and a.at < t_end) days_played,
        (select count(*) from daraja.answers a where a.staff_id = o.id and a.at >= t0 and a.at < t_end) answered,
        (select round(100.0 * avg(a.correct::int)) from daraja.answers a where a.staff_id = o.id and a.at >= t0 and a.at < t_end) acc,
        (select round(100.0 * avg(a.correct::int)) from daraja.answers a where a.staff_id = o.id and a.at >= p0 and a.at < t0) prev_acc,
        (select coalesce(sum(e.amount), 0) from daraja.point_events e where e.staff_id = o.id and e.status = 'ok' and e.kind in ('quiz','bonus','avis') and e.created_at >= t0 and e.created_at < t_end) pts,
        (select count(*) from daraja.conduct_records c where c.staff_id = o.id and c.line in ('grise','rouge') and c.occurred_at >= t0 and c.occurred_at < t_end) conduct
      from daraja.staff o left join daraja.posts p on p.id = o.post
      where o.venue = v and o.active and o.role = 'staff') x),
    'themes', (select coalesce(json_agg(json_build_object('cat', t.cat, 'label', daraja.cat_label(t.cat), 'acc', t.acc, 'n', t.n) order by t.acc), '[]'::json) from (
      select q.cat, round(100.0 * avg(a.correct::int)) acc, count(*) n
      from daraja.answers a join daraja.questions q on q.id = a.question_id join daraja.staff o on o.id = a.staff_id
      where o.venue = v and a.at >= t0 and a.at < t_end group by q.cat) t),
    'traps', (select coalesce(json_agg(t), '[]'::json) from (
      select q.question, q.theme, round(100.0 * (1 - avg(a.correct::int))) err, count(*) n
      from daraja.answers a join daraja.questions q on q.id = a.question_id join daraja.staff o on o.id = a.staff_id
      where o.venue = v and a.at >= t0 and a.at < t_end group by q.id, q.question, q.theme
      having count(*) >= 2 and avg(a.correct::int) < 0.6 order by avg(a.correct::int), count(*) desc limit 3) t),
    'gifts', (select count(*) from daraja.point_events e join daraja.staff o on o.id = e.staff_id where o.venue = v and e.kind = 'cadeau' and e.created_at >= t0 and e.created_at < t_end),
    'reviews', (select count(*) from daraja.point_events e join daraja.staff o on o.id = e.staff_id where o.venue = v and e.kind = 'avis' and e.status = 'ok' and e.created_at >= t0 and e.created_at < t_end)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_report_review(p_token text, p_note text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  insert into daraja.point_events(staff_id, kind, amount, note, status) values (s.id, 'avis', 100, left(p_note, 200), 'pending');
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_rewards(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  return (select coalesce(json_agg(json_build_object('id', r.id, 'name', r.name, 'icon', r.icon, 'cost', r.cost, 'tier', r.tier,
      'stock', r.stock, 'checks', daraja.reward_check(s.id, r.conditions)) order by r.cost), '[]'::json)
    from daraja.rewards r where r.active and (r.venue is null or r.venue = v) and coalesce(r.stock, 1) > 0);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_rulebook(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
begin
  perform daraja.who(p_token);
  return (select coalesce(json_agg(json_build_object('line', line, 'domain', domain, 'behavior', behavior, 'sanction', base_sanction,
      'recid1', recid1, 'recid2', recid2, 'grave', grave,
      'malus', case when grave then 1000 when line = 'rouge' then 300 when line = 'grise' then 100 else 20 end) order by sort), '[]'::json)
    from daraja.conduct_rules where active);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_set_profile(p_token text, p_alias text, p_avatar text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; a text;
begin
  s := daraja.who(p_token);
  a := nullif(trim(coalesce(p_alias, '')), '');
  if a is not null and length(a) > 24 then return json_build_object('ok', false, 'error', 'alias'); end if;
  if p_avatar is not null and p_avatar !~ '^[a-z-]+:[A-Za-z0-9-]{1,30}$' then return json_build_object('ok', false, 'error', 'avatar'); end if;
  if p_avatar is not null and exists (select 1 from daraja.staff where avatar = p_avatar and active and id <> s.id) then
    return json_build_object('ok', false, 'error', 'taken');
  end if;
  update daraja.staff set alias = a, avatar = coalesce(p_avatar, avatar) where id = s.id;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_set_setting(p_token text, p_venue text, p_family text, p_key text, p_enabled boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  if p_family not in ('salle','bar','cuisine','support') or p_key !~ '^(level:[123]|cat:[a-z]+)$' then raise exception 'key'; end if;
  insert into daraja.quiz_settings(venue, family, key, enabled) values (v, p_family, p_key, p_enabled)
    on conflict (venue, family, key) do update set enabled = excluded.enabled;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_settings(p_token text, p_venue text, p_family text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  return json_build_object(
    'levels', (select json_agg(json_build_object('key', 'level:' || l, 'label', case l when 1 then 'Facile' when 2 then 'Confirmé' else 'Expert' end,
        'enabled', daraja.is_enabled(v, p_family, 'level:' || l)) order by l) from generate_series(1,3) l),
    'cats', (select json_agg(json_build_object('key', 'cat:' || c, 'label', daraja.cat_label(c), 'enabled', daraja.is_enabled(v, p_family, 'cat:' || c),
        'count', (select count(*) from daraja.questions q where q.active and q.cat = c and (q.venue is null or q.venue = v))) order by o)
      from unnest(array['hospitalite','vente','cocktails','vins','anglais','carte','histoire','cuisine','securite','caisse']) with ordinality t(c, o)));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_story(p_token text, p_back integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare n int; idx int; st daraja.stories; b int;
begin
  perform daraja.who(p_token);
  select count(*) into n from daraja.stories;
  if n = 0 then return null; end if;
  b := greatest(0, least(coalesce(p_back, 0), 30));
  idx := ((daraja.today() - date '2026-10-26' - b) % n + n) % n;
  select * into st from daraja.stories order by id offset idx limit 1;
  return json_build_object('title', st.title, 'person', st.person, 'cat', st.cat, 'body', st.body, 'lesson', st.lesson,
    'back', b, 'num', idx + 1, 'total', n);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_test_answer(p_token text, p_question uuid, p_choice integer, p_answer jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; q daraja.questions; ok boolean;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  select * into q from daraja.questions where id = p_question;
  ok := daraja.grade(q, p_choice, p_answer);
  return json_build_object('correct', ok, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
    'solution', case when q.kind = 'order' then q.payload->'answer' else null end, 'points', 10 * q.level);
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_test_quiz(p_token text, p_venue text, p_post text, p_kind text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; f text; ids uuid[];
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  f := coalesce((select family from daraja.posts where id = p_post), 'salle');
  ids := daraja.pick_questions(coalesce(p_venue, 'baro'), f, null, nullif(p_kind, ''));
  return json_build_object('answered', '[]'::json, 'correct', 0, 'questions', coalesce(daraja.q_json(ids), '[]'::json));
end $function$
;

CREATE OR REPLACE FUNCTION public.daraja_vote(p_token text, p_candidate uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; c daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'staff' then return json_build_object('ok', false, 'error', 'role'); end if;
  select * into c from daraja.staff where id = p_candidate and active and role = 'staff';
  if c.id is null or c.venue <> s.venue or c.id = s.id then return json_build_object('ok', false, 'error', 'candidate'); end if;
  insert into daraja.votes(month, voter, candidate, venue) values (to_char(daraja.today(), 'YYYY-MM'), s.id, c.id, s.venue)
    on conflict (month, voter) do update set candidate = excluded.candidate, at = now();
  return json_build_object('ok', true);
end $function$
;
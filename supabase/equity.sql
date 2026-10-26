-- Équité, conditions cadeaux, pointage, tirage, 3 classements
alter table daraja.rewards add column if not exists tier text;
alter table daraja.rewards add column if not exists conditions jsonb not null default '{}'::jsonb;
alter table daraja.rewards add column if not exists stock int;
alter table daraja.rewards add column if not exists library boolean not null default false;

create table if not exists daraja.attendance (
  staff_id uuid not null references daraja.staff(id),
  day date not null,
  status text not null default 'present' check (status in ('present','absent','conge','recup','maladie','autorise','repos')),
  late_min int not null default 0,
  late_ok boolean not null default false,
  note text,
  source text not null default 'manuel',
  by_staff uuid,
  updated_at timestamptz not null default now(),
  primary key (staff_id, day)
);
alter table daraja.attendance enable row level security;

create table if not exists daraja.draws (
  id uuid primary key default gen_random_uuid(),
  venue text not null,
  month text not null,
  prize text not null,
  winner uuid references daraja.staff(id),
  tickets int,
  total int,
  by_staff uuid,
  created_at timestamptz not null default now(),
  unique (venue, month)
);
alter table daraja.draws enable row level security;

update daraja.rewards set tier = case
  when cost < 400 then 'plaisir' when name ilike '%repos%' then 'temps'
  when cost < 3000 then 'bon' when cost < 5000 then 'experience' else 'gros' end
where tier is null;

insert into daraja.rewards(venue, name, icon, cost, tier, active, library) values
(null,'Jus frais ou mocktail offert','glass',100,'plaisir',false,true),
(null,'Choisir la playlist d''un début de service','music',200,'plaisir',false,true),
(null,'Avatar ou badge exclusif','sparkles',150,'plaisir',false,true),
(null,'Bravo de la direction sur le groupe','speakerphone',120,'plaisir',false,true),
(null,'Pause prolongée de 15 min','clock-pause',250,'plaisir',false,true),
(null,'Repas du personnel amélioré','salad',300,'plaisir',false,true),
(null,'Partir 1 h plus tôt','door-exit',500,'temps',false,true),
(null,'Échange de planning prioritaire','arrows-exchange',450,'temps',false,true),
(null,'½ journée off','sun',1200,'temps',false,true),
(null,'Journée off payée','beach',2500,'temps',false,true),
(null,'Recharge téléphone 50 DH','device-mobile-message',400,'bon',false,true),
(null,'Places de cinéma pour 2','movie',800,'bon',false,true),
(null,'Place pour un match','ball-football',1500,'bon',false,true),
(null,'Barbier, hammam ou spa','bath',1200,'bon',false,true),
(null,'Bon Decathlon 300 DH','shopping-bag',1500,'bon',false,true),
(null,'Baskets ou tenue','shirt',2000,'bon',false,true),
(null,'Dîner pour 2 à Baromètre ou ZamaZama','tools-kitchen-2',1800,'experience',false,true),
(null,'Vis ma vie : une journée dans un autre poste','switch-horizontal',1000,'experience',false,true),
(null,'Visite d''un domaine viticole','bottle',2500,'experience',false,true),
(null,'Dégustation chez un fournisseur','glass-full',1500,'experience',false,true),
(null,'Formation certifiante (WSET 1, barista)','certificate',5000,'gros',false,true),
(null,'Week-end à Agafay ou Essaouira','tent',8000,'gros',false,true),
(null,'Soirée dans un bar du 50 Best','trophy',6000,'gros',false,true),
(null,'Prime exceptionnelle 1 000 DH','cash',5000,'gros',false,true);

-- conditions d'un cadeau pour une personne : [{key,label,ok,have,need}]
create or replace function daraja.reward_check(p_staff uuid, c jsonb) returns jsonb
language plpgsql stable security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_rewards(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  return (select coalesce(json_agg(json_build_object('id', r.id, 'name', r.name, 'icon', r.icon, 'cost', r.cost, 'tier', r.tier,
      'stock', r.stock, 'checks', daraja.reward_check(s.id, r.conditions)) order by r.cost), '[]'::json)
    from daraja.rewards r where r.active and (r.venue is null or r.venue = v) and coalesce(r.stock, 1) > 0);
end $$;

create or replace function public.daraja_redeem(p_token text, p_reward uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- catalogue (super admins seulement)
create or replace function public.daraja_admin_rewards(p_token text) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  return (select coalesce(json_agg(json_build_object('id', id, 'venue', venue, 'name', name, 'icon', icon, 'cost', cost,
      'tier', tier, 'active', active, 'library', library, 'stock', stock, 'conditions', conditions,
      'claimed', (select count(*) from daraja.point_events e where e.reward_id = r.id))
      order by active desc, cost), '[]'::json) from daraja.rewards r);
end $$;

create or replace function public.daraja_admin_reward_save(p_token text, p jsonb) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- pointage
create or replace function public.daraja_admin_attendance(p_token text, p_venue text, p_from date, p_to date) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- p_rows: [{staff, day, status, late, late_ok, note, source}]
create or replace function public.daraja_admin_attendance_set(p_token text, p_rows jsonb) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- +25 par semaine : retard injustifié cumulé < 10 min et aucune absence injustifiée (lundi = p_week)
create or replace function public.daraja_admin_close_week(p_token text, p_venue text, p_week date) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- bonus progression du mois précédent (+50) : ≥ 20 réponses sur 2 mois, précision +5 pts
create or replace function daraja.progress_bonus(p_staff uuid) returns void
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function daraja.tickets(p_staff uuid, p_month date) returns int
language sql stable security definer set search_path = daraja, public as $$
  select (select count(*) from daraja.quiz_sessions q where q.staff_id = p_staff
            and date_trunc('month', q.day) = date_trunc('month', p_month) and cardinality(q.answered) >= cardinality(q.question_ids))::int
       + 2 * (select count(*) from daraja.point_events e where e.staff_id = p_staff and e.note like 'Ponctualité semaine %'
            and date_trunc('month', substr(e.note, 21)::date) = date_trunc('month', p_month))::int
$$;

-- tirage : pondéré par les tickets, exclu si ligne grise/rouge dans le mois
create or replace function public.daraja_admin_draw(p_token text, p_venue text, p_month date, p_prize text) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_draw_info(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- 3 classements du mois : savoir, assiduite, progression
create or replace function public.daraja_leaderboard2(p_token text, p_venue text default null, p_kind text default 'savoir') returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_me(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; v text; rk int; done boolean;
begin
  s := daraja.who(p_token);
  perform daraja.conduct_bonus(s.id);
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
    'avis', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'avis' and status = 'ok'),
    'perfect', (select count(*) from daraja.quiz_sessions where staff_id = s.id and correct >= 5),
    'gifts', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'cadeau'),
    'exemplary', exists(select 1 from daraja.point_events where staff_id = s.id and kind = 'bonus'
        and note = 'Mois exemplaire ' || to_char(now() at time zone 'Africa/Casablanca' - interval '1 month', 'YYYY-MM')),
    'pending_ack', (select count(*) from daraja.conduct_records where staff_id = s.id and acknowledged_at is null),
    'direction_todo', case when s.role = 'super' then (select count(*) from daraja.conduct_records where needs_direction) else 0 end
  );
end $$;

-- +3 points de présence à chaque session terminée (même avec des erreurs)
create or replace function public.daraja_answer_v2(p_token text, p_question uuid, p_choice integer, p_answer jsonb) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; qs daraja.quiz_sessions; q daraja.questions; ok boolean; finished boolean; today_pts int; ns int; sb int := 0; pres int := 0;
begin
  s := daraja.who(p_token);
  select * into qs from daraja.quiz_sessions where staff_id = s.id and day = daraja.today() for update;
  if qs.staff_id is null or not (p_question = any(qs.question_ids)) then raise exception 'question'; end if;
  select * into q from daraja.questions where id = p_question;
  if not (p_question = any(qs.answered)) then
    if q.kind = 'order' then ok := (p_answer = q.payload->'answer');
    elsif q.kind = 'match' then ok := coalesce((p_answer->>'mistakes')::int, 99) <= 1;
    else ok := (p_choice = q.answer_idx); end if;
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
  return json_build_object('correct', ok, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
    'solution', case when q.kind = 'order' then q.payload->'answer' else null end,
    'finished', finished, 'score', qs.correct, 'points', 10 * q.level, 'today_points', today_pts, 'streak_bonus', sb, 'presence', pres);
end $$;

grant execute on function public.daraja_rewards(text, text), public.daraja_redeem(text, uuid), public.daraja_admin_rewards(text),
  public.daraja_admin_reward_save(text, jsonb), public.daraja_admin_attendance(text, text, date, date),
  public.daraja_admin_attendance_set(text, jsonb), public.daraja_admin_close_week(text, text, date),
  public.daraja_admin_draw(text, text, date, text), public.daraja_draw_info(text, text),
  public.daraja_leaderboard2(text, text, text), public.daraja_me(text, text), public.daraja_answer_v2(text, uuid, integer, jsonb) to anon;

alter table daraja.staff add column if not exists post text;

create table if not exists daraja.conduct_rules (
  id serial primary key,
  sort int,
  line text not null check (line in ('blanche','grise','rouge')),
  domain text not null,
  behavior text not null,
  base_sanction text not null,
  decider text,
  recid1 text,
  recid2 text,
  grave boolean not null default false,
  direction_only boolean not null default false,
  active boolean not null default true
);

create table if not exists daraja.conduct_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references daraja.staff(id) on delete cascade,
  rule_id int not null references daraja.conduct_rules(id),
  occurred_at timestamptz not null default now(),
  line text not null,
  occurrence int not null,
  escalation text,
  sanction_planned text not null,
  sanction_applied text,
  facts text,
  witnesses text,
  malus int not null,
  recorded_by uuid references daraja.staff(id),
  needs_direction boolean not null default false,
  acknowledged_at timestamptz,
  notified_at timestamptz,
  notified_by uuid references daraja.staff(id),
  created_at timestamptz not null default now()
);
alter table daraja.conduct_rules enable row level security;
alter table daraja.conduct_records enable row level security;

create or replace function daraja.sanction_rank(t text) returns int language sql immutable as $$
  select case
    when t ilike '%faute grave%' or t ilike '%licenci%' then 5
    when t ilike '%mutation%' then 4
    when t ilike '%mise à pied%' then 3
    when t ilike '%blâme%' then 2
    when t ilike '%écrit%' then 1
    else 0 end $$;

create or replace function daraja.strip_line(t text) returns text language sql immutable as $$
  select trim(regexp_replace(coalesce(t,''), '^(Rouge|Grise|Blanche)\s*:\s*', '', 'i')) $$;

create or replace function daraja.conduct_compute(p_staff uuid, p_rule int) returns json
language plpgsql stable security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_conduct_rules(p_token text) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role = 'staff' then raise exception 'admin'; end if;
  return (select coalesce(json_agg(json_build_object('id', id, 'line', line, 'domain', domain, 'behavior', behavior,
      'base_sanction', base_sanction, 'locked', (direction_only and s.role <> 'super')) order by sort), '[]'::json)
    from daraja.conduct_rules where active);
end $$;

create or replace function public.daraja_conduct_preview(p_token text, p_staff uuid, p_rule int) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select venue from daraja.staff where id = p_staff));
  return daraja.conduct_compute(p_staff, p_rule);
end $$;

create or replace function public.daraja_conduct_add(p_token text, p_staff uuid, p_rule int, p_facts text, p_witnesses text, p_applied text) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_conduct_register(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_conduct_notify(p_token text, p_record uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'direction'; end if;
  update daraja.conduct_records set notified_at = now(), notified_by = s.id, needs_direction = false
   where id = p_record and line = 'rouge';
  return json_build_object('ok', true);
end $$;

create or replace function public.daraja_conduct_mine(p_token text) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_conduct_ack(p_token text, p_record uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  update daraja.conduct_records set acknowledged_at = now() where id = p_record and staff_id = s.id and acknowledged_at is null;
  return json_build_object('ok', true);
end $$;

create or replace function daraja.conduct_bonus(p_staff uuid) returns void
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_redeem(p_token text, p_reward uuid) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; r daraja.rewards;
begin
  s := daraja.who(p_token);
  perform pg_advisory_xact_lock(hashtext(s.id::text));
  if exists (select 1 from daraja.conduct_records c join daraja.conduct_rules ru on ru.id = c.rule_id
             where c.staff_id = s.id and ru.grave and c.occurred_at > now() - interval '365 days') then
    return json_build_object('ok', false, 'error', 'blocked');
  end if;
  select * into r from daraja.rewards where id = p_reward and active;
  if r.id is null then raise exception 'reward'; end if;
  if daraja.balance(s.id) < r.cost then return json_build_object('ok', false); end if;
  insert into daraja.point_events(staff_id, kind, amount, note, reward_id) values (s.id, 'cadeau', -r.cost, r.name, r.id);
  return json_build_object('ok', true, 'points', daraja.balance(s.id));
end $$;

create or replace function public.daraja_me(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; v text; rk int; done boolean;
begin
  s := daraja.who(p_token);
  perform daraja.conduct_bonus(s.id);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  select count(*)+1 into rk from daraja.staff o where o.venue = v and o.active and o.role = 'staff'
    and daraja.month_points(o.id) > daraja.month_points(s.id);
  select exists(select 1 from daraja.quiz_sessions q where q.staff_id = s.id and q.day = daraja.today()
    and cardinality(q.answered) >= cardinality(q.question_ids)) into done;
  return json_build_object(
    'id', s.id, 'name', s.name, 'role', s.role, 'venue', v,
    'venue_name', (select name from daraja.venues where id = v),
    'points', daraja.balance(s.id), 'earned', daraja.earned(s.id), 'month', daraja.month_points(s.id),
    'rank', rk,
    'streak', case when s.last_quiz_day >= daraja.today() - 1 then s.streak else 0 end,
    'quiz_done', done,
    'avis', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'avis' and status = 'ok'),
    'perfect', (select count(*) from daraja.quiz_sessions where staff_id = s.id and correct >= 5),
    'gifts', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'cadeau'),
    'exemplary', exists(select 1 from daraja.point_events where staff_id = s.id and kind = 'bonus'
        and note = 'Mois exemplaire ' || to_char(now() at time zone 'Africa/Casablanca' - interval '1 month', 'YYYY-MM')),
    'pending_ack', (select count(*) from daraja.conduct_records where staff_id = s.id and acknowledged_at is null),
    'direction_todo', case when s.role = 'super' then (select count(*) from daraja.conduct_records where needs_direction) else 0 end
  );
end $$;

revoke all on all functions in schema daraja from public, anon, authenticated;
revoke all on function public.daraja_conduct_rules, public.daraja_conduct_preview, public.daraja_conduct_add,
  public.daraja_conduct_register, public.daraja_conduct_notify, public.daraja_conduct_mine, public.daraja_conduct_ack,
  public.daraja_redeem, public.daraja_me from public;
grant execute on function public.daraja_conduct_rules, public.daraja_conduct_preview, public.daraja_conduct_add,
  public.daraja_conduct_register, public.daraja_conduct_notify, public.daraja_conduct_mine, public.daraja_conduct_ack,
  public.daraja_redeem, public.daraja_me to anon;

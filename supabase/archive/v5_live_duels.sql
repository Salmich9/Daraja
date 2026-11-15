-- Duels en direct : défi -> acceptation (24 h) -> salle d'attente -> partie synchronisée
alter table daraja.duels add column if not exists accepted_at timestamptz;
alter table daraja.duels add column if not exists start_at timestamptz;
alter table daraja.duels add column if not exists c_seen timestamptz;
alter table daraja.duels add column if not exists o_seen timestamptz;
alter table daraja.duels add column if not exists limits int[];
create index if not exists duels_opp_idx on daraja.duels(opponent, status);
create index if not exists duels_ch_idx on daraja.duels(challenger, status);

-- début de chaque manche : start_at + somme des (limite + 4 s de révélation) précédentes
create or replace function daraja.duel_slot(d daraja.duels, i int) returns numeric
language sql immutable as $$
  select extract(epoch from d.start_at) + coalesce((select sum(l + 4) from unnest(d.limits[1:i]) l), 0) $$;
create or replace function daraja.duel_end(d daraja.duels) returns numeric
language sql immutable as $$ select daraja.duel_slot(d, cardinality(d.limits)) $$;

create or replace function daraja.duel_tick(p_id uuid) returns daraja.duels
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_duel_new(p_token text, p_opponent uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_duel_respond(p_token text, p_duel uuid, p_accept boolean) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_duel_cancel(p_token text, p_duel uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; d daraja.duels;
begin
  s := daraja.who(p_token);
  select * into d from daraja.duels where id = p_duel and (challenger = s.id or opponent = s.id) for update;
  if d.id is null then raise exception 'duel'; end if;
  if d.status not in ('pending','ready') then return json_build_object('ok', false, 'error', d.status); end if;
  update daraja.duels set status = 'cancelled', done_at = now() where id = d.id;
  return json_build_object('ok', true);
end $$;

-- état de la partie (appelé ~ chaque seconde) ; ne révèle une question qu'à l'ouverture de sa manche
create or replace function public.daraja_duel_state(p_token text, p_duel uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; d daraja.duels; me_c boolean; nw numeric; n int; cur int := -1; i int;
  mine jsonb; theirs jsonb; qs json; other daraja.staff; oseen timestamptz;
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
          'them', case when d.status = 'done' or nw > daraja.duel_slot(d, k - 1) + d.limits[k] + 1 or mine ? qid::text then theirs->(qid::text) else null end,
          'answer_idx', case when d.status = 'done' or nw > daraja.duel_slot(d, k - 1) + d.limits[k] + 1 or mine ? qid::text then (select answer_idx from daraja.questions where id = qid) end,
          'explanation', case when d.status = 'done' or nw > daraja.duel_slot(d, k - 1) + d.limits[k] + 1 or mine ? qid::text then (select explanation from daraja.questions where id = qid) end,
          'solution', case when d.status = 'done' or nw > daraja.duel_slot(d, k - 1) + d.limits[k] + 1 or mine ? qid::text then (select case when kind = 'order' then payload->'answer' end from daraja.questions where id = qid) end)
        order by k) from unnest(d.question_ids) with ordinality u(qid, k) where k - 1 <= greatest(cur, case when d.status = 'done' then n else -1 end)) end,
    'my_score', (select count(*) from jsonb_each(mine) e where (e.value->>'ok')::boolean),
    'their_score', (select count(*) from jsonb_each(theirs) e where (e.value->>'ok')::boolean),
    'winner', case when d.winner is null then null else d.winner = s.id end,
    'other', json_build_object('display', daraja.display_name(other), 'avatar', other.avatar,
      'online', oseen > clock_timestamp() - interval '8 seconds'),
    'me', json_build_object('display', daraja.display_name(s), 'avatar', s.avatar));
end $$;

create or replace function public.daraja_duel_play(p_token text, p_duel uuid, p_idx int, p_choice int, p_answer jsonb) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_duels(p_token text) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; r record;
begin
  s := daraja.who(p_token);
  for r in select id from daraja.duels where (challenger = s.id or opponent = s.id) and status in ('pending','ready','live','open') loop
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
end $$;

-- un seul appel pour le compteur de l'accueil / pastille de navigation
create or replace function public.daraja_duel_badge(p_token text) returns int
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  return (select count(*) from daraja.duels where ((opponent = s.id and status = 'pending' and created_at > now() - interval '24 hours')
    or ((challenger = s.id or opponent = s.id) and status in ('ready','live') and coalesce(accepted_at, created_at) > now() - interval '24 hours')));
end $$;

revoke execute on function public.daraja_duel_get(text, uuid), public.daraja_duel_start(text, uuid, uuid),
  public.daraja_duel_answer(text, uuid, uuid, integer, jsonb) from anon;
grant execute on function public.daraja_duel_new(text, uuid), public.daraja_duel_respond(text, uuid, boolean),
  public.daraja_duel_cancel(text, uuid), public.daraja_duel_state(text, uuid), public.daraja_duel_play(text, uuid, integer, integer, jsonb),
  public.daraja_duels(text), public.daraja_duel_badge(text) to anon;

create or replace function daraja.duel_close(d daraja.duels) returns void
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- v4 : chrono, images, avatars uniques, employé du mois, anniversaires, duels, mode test, référentiel
alter table daraja.quiz_sessions add column if not exists started jsonb not null default '{}'::jsonb;
alter table daraja.staff add column if not exists birthday text check (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
create unique index if not exists staff_avatar_uniq on daraja.staff(avatar) where avatar is not null and active;

create table if not exists daraja.votes (
  month text not null, voter uuid not null references daraja.staff(id), candidate uuid not null references daraja.staff(id),
  venue text not null, at timestamptz not null default now(), primary key (month, voter));
alter table daraja.votes enable row level security;
create table if not exists daraja.eotm (
  venue text not null, month text not null, winner uuid references daraja.staff(id), votes int, primary key (venue, month));
alter table daraja.eotm enable row level security;

create table if not exists daraja.duels (
  id uuid primary key default gen_random_uuid(), venue text not null,
  challenger uuid not null references daraja.staff(id), opponent uuid not null references daraja.staff(id),
  question_ids uuid[] not null, c_ans jsonb not null default '{}'::jsonb, o_ans jsonb not null default '{}'::jsonb,
  started jsonb not null default '{}'::jsonb, status text not null default 'open', winner uuid,
  created_at timestamptz not null default now(), done_at timestamptz);
alter table daraja.duels enable row level security;

-- limites du chrono
create or replace function daraja.q_limit(k text) returns int language sql immutable as $$
  select case when k in ('order','match') then 15 else 6 end $$;

create or replace function daraja.grade(q daraja.questions, p_choice int, p_answer jsonb) returns boolean
language sql stable as $$
  select case when q.kind = 'order' then coalesce(p_answer = q.payload->'answer', false)
              when q.kind = 'match' then coalesce((p_answer->>'mistakes')::int, 99) <= 1
              else coalesce(p_choice = q.answer_idx, false) end $$;

-- tirage de questions pour une famille (et une 2e famille pour les duels)
create or replace function daraja.pick_questions(v text, f text, f2 text default null, p_kind text default null) returns uuid[]
language sql volatile security definer set search_path = daraja, public as $$
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
  select array_agg(id order by level, random()) from (select * from picked union all select * from filler) x $$;

create or replace function daraja.q_json(ids uuid[]) returns json
language sql stable security definer set search_path = daraja, public as $$
  select json_agg(json_build_object('id', q.id, 'theme', q.theme, 'question', q.question, 'options', q.options,
      'level', q.level, 'kind', q.kind, 'limit', daraja.q_limit(q.kind),
      'payload', case q.kind
        when 'order' then jsonb_build_object('words', (select jsonb_agg(w order by random()) from jsonb_array_elements(q.payload->'answer') w))
        when 'match' then jsonb_build_object('pairs', q.payload->'pairs')
        when 'image' then q.payload
        else null end)
    order by array_position(ids, q.id))
  from daraja.questions q where q.id = any(ids) $$;

create or replace function public.daraja_quiz(p_token text) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
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
end $$;

-- démarre le chrono d'une question (une seule fois : recharger la page ne le remet pas à zéro)
create or replace function public.daraja_q_start(p_token text, p_question uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_answer_v2(p_token text, p_question uuid, p_choice integer, p_answer jsonb) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- avatars uniques
create or replace function public.daraja_avatars_taken(p_token text) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  return (select coalesce(json_agg(avatar), '[]'::json) from daraja.staff where active and avatar is not null and id <> s.id);
end $$;

create or replace function public.daraja_set_profile(p_token text, p_alias text, p_avatar text) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

-- employé du mois (vote secret, +100 au gagnant du mois précédent)
create or replace function daraja.eotm_resolve(p_venue text) returns void
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_eotm(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_vote(p_token text, p_candidate uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; c daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'staff' then return json_build_object('ok', false, 'error', 'role'); end if;
  select * into c from daraja.staff where id = p_candidate and active and role = 'staff';
  if c.id is null or c.venue <> s.venue or c.id = s.id then return json_build_object('ok', false, 'error', 'candidate'); end if;
  insert into daraja.votes(month, voter, candidate, venue) values (to_char(daraja.today(), 'YYYY-MM'), s.id, c.id, s.venue)
    on conflict (month, voter) do update set candidate = excluded.candidate, at = now();
  return json_build_object('ok', true);
end $$;

-- anniversaires (saisis par le manager, +50 le jour J)
create or replace function public.daraja_admin_set_birthday(p_token text, p_staff uuid, p_mmdd text) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select venue from daraja.staff where id = p_staff));
  if nullif(p_mmdd, '') is not null and p_mmdd !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then return json_build_object('ok', false); end if;
  update daraja.staff set birthday = nullif(p_mmdd, '') where id = p_staff;
  return json_build_object('ok', true);
end $$;

create or replace function public.daraja_birthdays(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; v text; t date := daraja.today(); o record;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  for o in select id from daraja.staff where venue = v and active and birthday = to_char(t, 'MM-DD') loop
    if not exists (select 1 from daraja.point_events where staff_id = o.id and note = 'Anniversaire ' || to_char(t, 'YYYY')) then
      insert into daraja.point_events(staff_id, kind, amount, note) values (o.id, 'bonus', 50, 'Anniversaire ' || to_char(t, 'YYYY'));
    end if;
  end loop;
  return (select coalesce(json_agg(x order by x.in_days, x.display), '[]'::json) from (
    select o.id, daraja.display_name(o) display, o.avatar, o.phone, o.birthday, o.id = s.id me,
      (select min(g) from generate_series(0, 7) g where to_char(t + g, 'MM-DD') = o.birthday) in_days
    from daraja.staff o where o.venue = v and o.active and o.birthday is not null) x where x.in_days is not null);
end $$;

-- duels
create or replace function public.daraja_duel_new(p_token text, p_opponent uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; o daraja.staff; ids uuid[]; d uuid;
begin
  s := daraja.who(p_token);
  if s.role <> 'staff' then return json_build_object('ok', false, 'error', 'role'); end if;
  select * into o from daraja.staff where id = p_opponent and active and role = 'staff';
  if o.id is null or o.venue <> s.venue or o.id = s.id then return json_build_object('ok', false, 'error', 'opponent'); end if;
  if (select count(*) from daraja.duels where challenger = s.id and (created_at at time zone 'Africa/Casablanca')::date = daraja.today()) >= 3 then
    return json_build_object('ok', false, 'error', 'limit'); end if;
  if exists (select 1 from daraja.duels where status = 'open' and ((challenger = s.id and opponent = o.id) or (challenger = o.id and opponent = s.id))) then
    return json_build_object('ok', false, 'error', 'open'); end if;
  ids := daraja.pick_questions(s.venue, daraja.family(s), daraja.family(o));
  if ids is null or cardinality(ids) < 3 then ids := daraja.pick_questions(s.venue, daraja.family(s)); end if;
  insert into daraja.duels(venue, challenger, opponent, question_ids) values (s.venue, s.id, o.id, ids) returning id into d;
  return json_build_object('ok', true, 'id', d);
end $$;

create or replace function daraja.duel_close(d daraja.duels) returns void
language plpgsql security definer set search_path = daraja, public as $$
declare cs int; os int; ct numeric; ot numeric; w uuid;
begin
  select count(*) filter (where (value->>'ok')::boolean), coalesce(sum((value->>'t')::numeric), 0) into cs, ct from jsonb_each(d.c_ans);
  select count(*) filter (where (value->>'ok')::boolean), coalesce(sum((value->>'t')::numeric), 0) into os, ot from jsonb_each(d.o_ans);
  w := case when cs > os then d.challenger when os > cs then d.opponent
            when ct < ot then d.challenger when ot < ct then d.opponent else null end;
  update daraja.duels set status = 'done', winner = w, done_at = now() where id = d.id;
  if w is not null then
    insert into daraja.point_events(staff_id, kind, amount, note) values (w, 'bonus', 20, 'Duel gagné');
  else
    insert into daraja.point_events(staff_id, kind, amount, note) values (d.challenger, 'bonus', 10, 'Duel nul'), (d.opponent, 'bonus', 10, 'Duel nul');
  end if;
end $$;

create or replace function public.daraja_duels(p_token text) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  update daraja.duels set status = 'expired', done_at = now() where status = 'open' and created_at < now() - interval '48 hours';
  return (select coalesce(json_agg(x order by x.todo desc, x.created_at desc), '[]'::json) from (
    select d.id, d.status, d.created_at, d.challenger = s.id mine,
      (select daraja.display_name(o) from daraja.staff o where o.id = case when d.challenger = s.id then d.opponent else d.challenger end) other,
      (select avatar from daraja.staff o where o.id = case when d.challenger = s.id then d.opponent else d.challenger end) other_avatar,
      (select count(*) from jsonb_each(case when d.challenger = s.id then d.c_ans else d.o_ans end) e where (e.value->>'ok')::boolean) my_score,
      (select count(*) from jsonb_each(case when d.challenger = s.id then d.o_ans else d.c_ans end) e where (e.value->>'ok')::boolean) other_score,
      (select count(*) from jsonb_each(case when d.challenger = s.id then d.c_ans else d.o_ans end)) my_done,
      (select count(*) from jsonb_each(case when d.challenger = s.id then d.o_ans else d.c_ans end)) other_done,
      cardinality(d.question_ids) n,
      d.status = 'open' and (select count(*) from jsonb_each(case when d.challenger = s.id then d.c_ans else d.o_ans end)) < cardinality(d.question_ids) todo,
      case when d.winner is null then null else d.winner = s.id end won
    from daraja.duels d where (d.challenger = s.id or d.opponent = s.id) and (d.status = 'open' or d.done_at > now() - interval '3 days')) x);
end $$;

create or replace function public.daraja_duel_get(p_token text, p_duel uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_duel_start(p_token text, p_duel uuid, p_question uuid) returns json
language plpgsql security definer set search_path = daraja, public as $$
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
end $$;

create or replace function public.daraja_duel_answer(p_token text, p_duel uuid, p_question uuid, p_choice int, p_answer jsonb) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; d daraja.duels; q daraja.questions; ok boolean; t numeric; st numeric; col text; mine jsonb; late boolean := false;
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
end $$;

-- mode test (super admin) : quiz illimités, rien n'est enregistré
create or replace function public.daraja_test_quiz(p_token text, p_venue text, p_post text, p_kind text default null) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; f text; ids uuid[];
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  f := coalesce((select family from daraja.posts where id = p_post), 'salle');
  ids := daraja.pick_questions(coalesce(p_venue, 'baro'), f, null, nullif(p_kind, ''));
  return json_build_object('answered', '[]'::json, 'correct', 0, 'questions', coalesce(daraja.q_json(ids), '[]'::json));
end $$;

create or replace function public.daraja_test_answer(p_token text, p_question uuid, p_choice int, p_answer jsonb) returns json
language plpgsql security definer set search_path = daraja, public as $$
declare s daraja.staff; q daraja.questions; ok boolean;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  select * into q from daraja.questions where id = p_question;
  ok := daraja.grade(q, p_choice, p_answer);
  return json_build_object('correct', ok, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
    'solution', case when q.kind = 'order' then q.payload->'answer' else null end, 'points', 10 * q.level);
end $$;

-- référentiel lisible par tous
create or replace function public.daraja_rulebook(p_token text) returns json
language plpgsql security definer set search_path = daraja, public as $$
begin
  perform daraja.who(p_token);
  return (select coalesce(json_agg(json_build_object('line', line, 'domain', domain, 'behavior', behavior, 'sanction', base_sanction,
      'recid1', recid1, 'recid2', recid2, 'grave', grave,
      'malus', case when grave then 1000 when line = 'rouge' then 300 when line = 'grise' then 100 else 20 end) order by sort), '[]'::json)
    from daraja.conduct_rules where active);
end $$;

grant execute on function public.daraja_quiz(text), public.daraja_q_start(text, uuid), public.daraja_answer_v2(text, uuid, integer, jsonb),
  public.daraja_avatars_taken(text), public.daraja_set_profile(text, text, text), public.daraja_eotm(text, text), public.daraja_vote(text, uuid),
  public.daraja_admin_set_birthday(text, uuid, text), public.daraja_birthdays(text, text), public.daraja_duel_new(text, uuid),
  public.daraja_duels(text), public.daraja_duel_get(text, uuid), public.daraja_duel_start(text, uuid, uuid),
  public.daraja_duel_answer(text, uuid, uuid, integer, jsonb), public.daraja_test_quiz(text, text, text, text),
  public.daraja_test_answer(text, uuid, integer, jsonb), public.daraja_rulebook(text) to anon;

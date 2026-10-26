create extension if not exists pgcrypto with schema extensions;

create schema if not exists daraja;

create table daraja.venues (id text primary key, name text not null);

create table daraja.staff (
  id uuid primary key default gen_random_uuid(),
  venue text references daraja.venues(id),
  name text not null,
  pin_hash text not null,
  role text not null default 'staff' check (role in ('staff','admin','super')),
  streak int not null default 0,
  last_quiz_day date,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table daraja.sessions (
  token text primary key,
  staff_id uuid references daraja.staff(id) on delete cascade,
  created_at timestamptz default now()
);

create table daraja.questions (
  id uuid primary key default gen_random_uuid(),
  venue text references daraja.venues(id),
  theme text not null,
  question text not null,
  options jsonb not null,
  answer_idx int not null,
  explanation text,
  active boolean default true
);

create table daraja.quiz_sessions (
  staff_id uuid references daraja.staff(id) on delete cascade,
  day date,
  question_ids uuid[] not null,
  answered uuid[] not null default '{}',
  correct int not null default 0,
  primary key (staff_id, day)
);

create table daraja.rewards (
  id uuid primary key default gen_random_uuid(),
  venue text references daraja.venues(id),
  name text not null,
  icon text not null,
  cost int not null,
  active boolean default true
);

create table daraja.point_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references daraja.staff(id) on delete cascade,
  kind text not null check (kind in ('quiz','avis','bonus','malus','cadeau')),
  amount int not null,
  note text,
  status text not null default 'ok' check (status in ('ok','pending','rejected')),
  reward_id uuid references daraja.rewards(id),
  delivered boolean default false,
  by_staff uuid references daraja.staff(id),
  created_at timestamptz default now()
);

alter table daraja.venues enable row level security;
alter table daraja.staff enable row level security;
alter table daraja.sessions enable row level security;
alter table daraja.questions enable row level security;
alter table daraja.quiz_sessions enable row level security;
alter table daraja.rewards enable row level security;
alter table daraja.point_events enable row level security;

create or replace function daraja.today() returns date language sql stable as
$$ select (now() at time zone 'Africa/Casablanca')::date $$;

create or replace function daraja.who(p_token text) returns daraja.staff
language plpgsql stable security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff;
begin
  select st.* into s from daraja.sessions se join daraja.staff st on st.id = se.staff_id
  where se.token = p_token and st.active;
  if s.id is null then raise exception 'session'; end if;
  return s;
end $$;

create or replace function daraja.balance(p_staff uuid) returns int language sql stable as
$$ select coalesce(sum(amount),0)::int from daraja.point_events where staff_id = p_staff and status = 'ok' $$;

create or replace function daraja.earned(p_staff uuid) returns int language sql stable as
$$ select coalesce(sum(amount),0)::int from daraja.point_events where staff_id = p_staff and status = 'ok' and kind in ('quiz','avis','bonus') $$;

create or replace function daraja.month_points(p_staff uuid) returns int language sql stable as
$$ select coalesce(sum(amount),0)::int from daraja.point_events
   where staff_id = p_staff and status = 'ok' and kind <> 'cadeau'
   and date_trunc('month', created_at at time zone 'Africa/Casablanca') = date_trunc('month', now() at time zone 'Africa/Casablanca') $$;

create or replace function public.daraja_login(p_pin text) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; t text;
begin
  select * into s from daraja.staff where active and pin_hash = crypt(p_pin, pin_hash) limit 1;
  if s.id is null then return null; end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into daraja.sessions(token, staff_id) values (t, s.id);
  return json_build_object('token', t);
end $$;

create or replace function public.daraja_me(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; v text; rk int; done boolean;
begin
  s := daraja.who(p_token);
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
    'gifts', (select count(*) from daraja.point_events where staff_id = s.id and kind = 'cadeau')
  );
end $$;

create or replace function public.daraja_quiz(p_token text) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; qs daraja.quiz_sessions; ids uuid[];
begin
  s := daraja.who(p_token);
  select * into qs from daraja.quiz_sessions where staff_id = s.id and day = daraja.today();
  if qs.staff_id is null then
    select array_agg(id) into ids from (
      select q.id from daraja.questions q where q.active and (q.venue is null or q.venue = coalesce(s.venue, 'baro'))
      order by random() limit 5) x;
    if ids is null then return json_build_object('questions', '[]'::json, 'answered', '{}'::uuid[], 'correct', 0); end if;
    insert into daraja.quiz_sessions(staff_id, day, question_ids) values (s.id, daraja.today(), ids)
    returning * into qs;
  end if;
  return json_build_object('answered', qs.answered, 'correct', qs.correct, 'questions', (
    select json_agg(json_build_object('id', q.id, 'theme', q.theme, 'question', q.question, 'options', q.options)
      order by array_position(qs.question_ids, q.id))
    from daraja.questions q where q.id = any(qs.question_ids)));
end $$;

create or replace function public.daraja_answer(p_token text, p_question uuid, p_choice int) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; qs daraja.quiz_sessions; q daraja.questions; ok boolean; finished boolean;
begin
  s := daraja.who(p_token);
  select * into qs from daraja.quiz_sessions where staff_id = s.id and day = daraja.today() for update;
  if qs.staff_id is null or not (p_question = any(qs.question_ids)) then raise exception 'question'; end if;
  select * into q from daraja.questions where id = p_question;
  if p_question = any(qs.answered) then
    return json_build_object('correct', null, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
      'finished', cardinality(qs.answered) >= cardinality(qs.question_ids), 'score', qs.correct);
  end if;
  ok := (p_choice = q.answer_idx);
  update daraja.quiz_sessions set answered = answered || p_question, correct = correct + (case when ok then 1 else 0 end)
    where staff_id = s.id and day = qs.day returning * into qs;
  if ok then
    insert into daraja.point_events(staff_id, kind, amount, note) values (s.id, 'quiz', 10, q.theme);
  end if;
  finished := cardinality(qs.answered) >= cardinality(qs.question_ids);
  if finished then
    update daraja.staff set
      streak = case when last_quiz_day = daraja.today() then streak
                    when last_quiz_day = daraja.today() - 1 then streak + 1 else 1 end,
      last_quiz_day = daraja.today()
    where id = s.id;
  end if;
  return json_build_object('correct', ok, 'answer_idx', q.answer_idx, 'explanation', q.explanation,
    'finished', finished, 'score', qs.correct);
end $$;

create or replace function public.daraja_leaderboard(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  return (select coalesce(json_agg(x order by x.pts desc, x.name), '[]'::json) from (
    select o.id, o.name, daraja.month_points(o.id) pts from daraja.staff o
    where o.venue = v and o.active and o.role = 'staff') x);
end $$;

create or replace function public.daraja_rewards(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, s.venue, 'baro') else s.venue end;
  return (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'icon', icon, 'cost', cost) order by cost), '[]'::json)
    from daraja.rewards where active and (venue is null or venue = v));
end $$;

create or replace function public.daraja_redeem(p_token text, p_reward uuid) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff; r daraja.rewards;
begin
  s := daraja.who(p_token);
  perform pg_advisory_xact_lock(hashtext(s.id::text));
  select * into r from daraja.rewards where id = p_reward and active;
  if r.id is null then raise exception 'reward'; end if;
  if daraja.balance(s.id) < r.cost then return json_build_object('ok', false); end if;
  insert into daraja.point_events(staff_id, kind, amount, note, reward_id) values (s.id, 'cadeau', -r.cost, r.name, r.id);
  return json_build_object('ok', true, 'points', daraja.balance(s.id));
end $$;

create or replace function public.daraja_report_review(p_token text, p_note text) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  insert into daraja.point_events(staff_id, kind, amount, note, status) values (s.id, 'avis', 100, left(p_note, 200), 'pending');
  return json_build_object('ok', true);
end $$;

create or replace function daraja.can_admin(s daraja.staff, p_venue text) returns text language plpgsql as $$
begin
  if s.role = 'super' then return coalesce(p_venue, s.venue, 'baro'); end if;
  if s.role = 'admin' and (p_venue is null or p_venue = s.venue) then return s.venue; end if;
  raise exception 'admin';
end $$;

create or replace function public.daraja_admin(p_token text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
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
    'staff', (select coalesce(json_agg(json_build_object('id', o.id, 'name', o.name, 'role', o.role, 'points', daraja.balance(o.id)) order by o.name), '[]'::json)
      from daraja.staff o where o.venue = v and o.active and o.role <> 'super'));
end $$;

create or replace function public.daraja_admin_review(p_token text, p_event uuid, p_ok boolean) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select o.venue from daraja.point_events e join daraja.staff o on o.id = e.staff_id where e.id = p_event));
  update daraja.point_events set status = case when p_ok then 'ok' else 'rejected' end, by_staff = s.id
    where id = p_event and kind = 'avis' and status = 'pending';
  return json_build_object('ok', true);
end $$;

create or replace function public.daraja_admin_deliver(p_token text, p_event uuid) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select o.venue from daraja.point_events e join daraja.staff o on o.id = e.staff_id where e.id = p_event));
  update daraja.point_events set delivered = true, by_staff = s.id where id = p_event and kind = 'cadeau';
  return json_build_object('ok', true);
end $$;

create or replace function public.daraja_admin_points(p_token text, p_staff uuid, p_kind text, p_amount int, p_note text) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  perform daraja.can_admin(s, (select venue from daraja.staff where id = p_staff));
  if p_kind not in ('bonus','malus','avis') then raise exception 'kind'; end if;
  insert into daraja.point_events(staff_id, kind, amount, note, by_staff)
    values (p_staff, p_kind, case when p_kind = 'malus' then -abs(p_amount) else abs(p_amount) end, p_note, s.id);
  return json_build_object('ok', true);
end $$;

create or replace function public.daraja_admin_add_staff(p_token text, p_name text, p_pin text, p_role text, p_venue text default null) returns json
language plpgsql security definer set search_path = daraja, extensions, public as $$
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
end $$;

revoke all on all functions in schema daraja from public, anon, authenticated;
revoke all on schema daraja from public, anon, authenticated;
revoke all on function public.daraja_login, public.daraja_me, public.daraja_quiz, public.daraja_answer,
  public.daraja_leaderboard, public.daraja_rewards, public.daraja_redeem, public.daraja_report_review,
  public.daraja_admin, public.daraja_admin_review, public.daraja_admin_deliver, public.daraja_admin_points,
  public.daraja_admin_add_staff from public;
grant execute on function public.daraja_login, public.daraja_me, public.daraja_quiz, public.daraja_answer,
  public.daraja_leaderboard, public.daraja_rewards, public.daraja_redeem, public.daraja_report_review,
  public.daraja_admin, public.daraja_admin_review, public.daraja_admin_deliver, public.daraja_admin_points,
  public.daraja_admin_add_staff to anon;

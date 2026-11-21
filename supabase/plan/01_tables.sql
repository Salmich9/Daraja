-- Généré depuis la production le 2026-11-21. Ne pas modifier à la main : régénérer.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists daraja;

create sequence if not exists daraja.eval_criteria_id_seq;
create sequence if not exists daraja.push_sent_id_seq;
create sequence if not exists daraja.conduct_rules_id_seq;
create sequence if not exists daraja.quotes_id_seq;
create sequence if not exists daraja.answers_id_seq;
create sequence if not exists daraja.missions_id_seq;
create sequence if not exists daraja.client_errors_id_seq;

create table if not exists daraja.answers (
  id bigint not null default nextval('daraja.answers_id_seq'::regclass),
  staff_id uuid,
  question_id uuid,
  correct boolean not null,
  at timestamp with time zone not null default now()
);
alter table daraja.answers enable row level security;

create table if not exists daraja.app_settings (
  key text not null,
  value jsonb not null
);
alter table daraja.app_settings enable row level security;

create table if not exists daraja.attendance (
  staff_id uuid not null,
  day date not null,
  status text not null default 'present'::text,
  late_min integer not null default 0,
  late_ok boolean not null default false,
  note text,
  source text not null default 'manuel'::text,
  by_staff uuid,
  updated_at timestamp with time zone not null default now()
);
alter table daraja.attendance enable row level security;

create table if not exists daraja.chests (
  staff_id uuid not null,
  day date not null,
  kind text not null,
  amount integer not null default 0,
  opened_at timestamp with time zone not null default now()
);
alter table daraja.chests enable row level security;

create table if not exists daraja.client_errors (
  id bigint not null generated always as identity,
  first_at timestamp with time zone not null default now(),
  last_at timestamp with time zone not null default now(),
  staff_id uuid,
  venue text,
  message text not null,
  place text,
  detail text,
  agent text,
  hits integer not null default 1
);
alter table daraja.client_errors enable row level security;

create table if not exists daraja.conduct_records (
  id uuid not null default gen_random_uuid(),
  staff_id uuid not null,
  rule_id integer not null,
  occurred_at timestamp with time zone not null default now(),
  line text not null,
  occurrence integer not null,
  escalation text,
  sanction_planned text not null,
  sanction_applied text,
  facts text,
  witnesses text,
  malus integer not null,
  recorded_by uuid,
  needs_direction boolean not null default false,
  acknowledged_at timestamp with time zone,
  notified_at timestamp with time zone,
  notified_by uuid,
  created_at timestamp with time zone not null default now()
);
alter table daraja.conduct_records enable row level security;

create table if not exists daraja.conduct_rules (
  id integer not null default nextval('daraja.conduct_rules_id_seq'::regclass),
  sort integer,
  line text not null,
  domain text not null,
  behavior text not null,
  base_sanction text not null,
  decider text,
  recid1 text,
  recid2 text,
  grave boolean not null default false,
  direction_only boolean not null default false,
  active boolean not null default true,
  malus integer
);
alter table daraja.conduct_rules enable row level security;

create table if not exists daraja.draws (
  id uuid not null default gen_random_uuid(),
  venue text not null,
  month text not null,
  prize text not null,
  winner uuid,
  tickets integer,
  total integer,
  by_staff uuid,
  created_at timestamp with time zone not null default now()
);
alter table daraja.draws enable row level security;

create table if not exists daraja.duels (
  id uuid not null default gen_random_uuid(),
  venue text not null,
  challenger uuid not null,
  opponent uuid not null,
  question_ids uuid[] not null,
  c_ans jsonb not null default '{}'::jsonb,
  o_ans jsonb not null default '{}'::jsonb,
  status text not null default 'open'::text,
  winner uuid,
  created_at timestamp with time zone not null default now(),
  done_at timestamp with time zone,
  accepted_at timestamp with time zone,
  start_at timestamp with time zone,
  c_seen timestamp with time zone,
  o_seen timestamp with time zone,
  limits integer[]
);
alter table daraja.duels enable row level security;

create table if not exists daraja.eotm (
  venue text not null,
  month text not null,
  winner uuid,
  votes integer
);
alter table daraja.eotm enable row level security;

create table if not exists daraja.eval_criteria (
  id integer not null default nextval('daraja.eval_criteria_id_seq'::regclass),
  family text,
  kind text not null default 'metier'::text,
  label text not null,
  cats text[] not null default '{}'::text[],
  sort integer not null default 100,
  active boolean not null default true
);
alter table daraja.eval_criteria enable row level security;

create table if not exists daraja.evals (
  id uuid not null default gen_random_uuid(),
  staff_id uuid not null,
  venue text,
  grid text not null,
  scores jsonb not null default '{}'::jsonb,
  goal text,
  status text not null default 'pending'::text,
  note text,
  by_staff uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  validated_at timestamp with time zone,
  validated_by uuid,
  coins integer not null default 0,
  gains jsonb not null default '[]'::jsonb,
  seen boolean not null default false
);
alter table daraja.evals enable row level security;

create table if not exists daraja.fiches (
  id uuid not null default gen_random_uuid(),
  venue text not null,
  section text not null default 'plat'::text,
  title text not null,
  story text,
  cocktail text,
  wine text,
  why text,
  pitch text,
  sort integer not null default 100,
  active boolean not null default true,
  updated_by uuid,
  updated_at timestamp with time zone not null default now()
);
alter table daraja.fiches enable row level security;

create table if not exists daraja.login_fails (
  at timestamp with time zone default now(),
  device text
);
alter table daraja.login_fails enable row level security;

create table if not exists daraja.mission_done (
  staff_id uuid not null,
  week date not null,
  mission_id integer,
  validated_by uuid,
  at timestamp with time zone default now()
);
alter table daraja.mission_done enable row level security;

create table if not exists daraja.missions (
  id integer not null default nextval('daraja.missions_id_seq'::regclass),
  family text not null,
  title text not null,
  active boolean not null default true
);
alter table daraja.missions enable row level security;

create table if not exists daraja.point_events (
  id uuid not null default gen_random_uuid(),
  staff_id uuid,
  kind text not null,
  amount integer not null,
  note text,
  status text not null default 'ok'::text,
  reward_id uuid,
  delivered boolean default false,
  by_staff uuid,
  created_at timestamp with time zone default now(),
  ask_id uuid
);
alter table daraja.point_events enable row level security;

create table if not exists daraja.posts (
  id text not null,
  family text not null,
  label text not null,
  sort integer
);
alter table daraja.posts enable row level security;

create table if not exists daraja.push_rank (
  staff_id uuid not null,
  month date not null,
  rank integer not null
);
alter table daraja.push_rank enable row level security;

create table if not exists daraja.push_sent (
  id bigint not null generated by default as identity,
  staff_id uuid not null,
  family text not null,
  ref text not null,
  day date not null,
  sent_at timestamp with time zone not null default now()
);
alter table daraja.push_sent enable row level security;

create table if not exists daraja.push_subscriptions (
  id uuid not null default gen_random_uuid(),
  staff_id uuid not null,
  venue text,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamp with time zone not null default now()
);
alter table daraja.push_subscriptions enable row level security;

create table if not exists daraja.questions (
  id uuid not null default gen_random_uuid(),
  venue text,
  theme text not null,
  question text not null,
  options jsonb not null,
  answer_idx integer not null,
  explanation text,
  active boolean default true,
  level integer not null default 1,
  kind text not null default 'qcm'::text,
  payload jsonb,
  cat text
);
alter table daraja.questions enable row level security;

create table if not exists daraja.quiz_sessions (
  staff_id uuid not null,
  day date not null,
  question_ids uuid[] not null,
  answered uuid[] not null default '{}'::uuid[],
  correct integer not null default 0,
  started jsonb not null default '{}'::jsonb,
  picks jsonb not null default '{}'::jsonb,
  targeted uuid[] not null default '{}'::uuid[]
);
alter table daraja.quiz_sessions enable row level security;

create table if not exists daraja.quiz_settings (
  venue text not null,
  family text not null,
  key text not null,
  enabled boolean not null
);
alter table daraja.quiz_settings enable row level security;

create table if not exists daraja.quotes (
  id integer not null default nextval('daraja.quotes_id_seq'::regclass),
  kind text not null default 'citation'::text,
  body text not null,
  author text,
  active boolean not null default true
);
alter table daraja.quotes enable row level security;

create table if not exists daraja.rewards (
  id uuid not null default gen_random_uuid(),
  venue text,
  name text not null,
  icon text not null,
  cost integer not null,
  active boolean default true,
  tier text,
  conditions jsonb not null default '{}'::jsonb,
  stock integer,
  library boolean not null default false,
  archived boolean not null default false
);
alter table daraja.rewards enable row level security;

create table if not exists daraja.rule_values (
  key text not null,
  val integer not null
);
alter table daraja.rule_values enable row level security;

create table if not exists daraja.sell_asks (
  id uuid not null default gen_random_uuid(),
  venue text not null,
  title text not null,
  note text,
  fiche_id uuid,
  points integer not null,
  starts date not null,
  ends date not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamp with time zone not null default now()
);
alter table daraja.sell_asks enable row level security;

create table if not exists daraja.sessions (
  token text not null,
  staff_id uuid,
  created_at timestamp with time zone default now(),
  revoked boolean not null default false
);
alter table daraja.sessions enable row level security;

create table if not exists daraja.staff (
  id uuid not null default gen_random_uuid(),
  venue text,
  name text not null,
  pin_hash text not null,
  role text not null default 'staff'::text,
  streak integer not null default 0,
  last_quiz_day date,
  active boolean not null default true,
  created_at timestamp with time zone default now(),
  post text,
  alias text,
  avatar text,
  phone text,
  birthday text,
  pin_len integer not null default 4,
  rt text not null default encode(gen_random_bytes(12), 'hex'::text)
);
alter table daraja.staff enable row level security;

create table if not exists daraja.story_reads (
  staff_id uuid not null,
  day date not null
);
alter table daraja.story_reads enable row level security;

create table if not exists daraja.venue_contacts (
  venue text not null,
  role text not null,
  name text,
  phone text
);
alter table daraja.venue_contacts enable row level security;

create table if not exists daraja.venues (
  id text not null,
  name text not null
);
alter table daraja.venues enable row level security;

create table if not exists daraja.votes (
  month text not null,
  voter uuid not null,
  candidate uuid not null,
  venue text not null,
  at timestamp with time zone not null default now()
);
alter table daraja.votes enable row level security;

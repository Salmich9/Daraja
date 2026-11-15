-- Temps réel : un duel qui bouge envoie un signal vide aux deux joueurs, sur leur canal secret.
create schema if not exists realtime;
create table if not exists pg_temp.sent(topic text, event text, payload jsonb);
create or replace function realtime.send(p jsonb, e text, t text, priv boolean) returns void language sql as $$ insert into pg_temp.sent values (t, e, p) $$;
do $$ declare me json; r json; n int; begin
  me := public.daraja_me('t_am');
  assert me->>'rt' like 'dj-%' and length(me->>'rt') = 27, 'chaque équipier reçoit son canal';
  assert me->>'rt' <> public.daraja_me('t_ka')->>'rt', 'canaux différents par personne';
  r := public.daraja_duel_new('t_am', '00000000-0000-0000-0000-0000000000b2');
  select count(distinct topic) into n from pg_temp.sent where event = 'duels';
  assert n = 2, 'les deux joueurs sont prévenus';
  assert not exists (select 1 from pg_temp.sent where payload <> '{}'::jsonb), 'le signal ne transporte aucune donnée';
end $$;
-- Sans service temps réel, le duel marche quand même.
drop function realtime.send(jsonb, text, text, boolean);
do $$ declare d uuid; begin
  select id into d from daraja.duels where challenger = '00000000-0000-0000-0000-0000000000b1' and status = 'pending';
  perform public.daraja_duel_respond('t_ka', d, true);
  assert (select status from daraja.duels where id = d) = 'ready', 'le duel avance même sans temps réel';
end $$;

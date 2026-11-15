-- Coffre surprise : après le défi ET l'histoire du jour, une fois par jour, 2 par semaine, gain enregistré.
do $$ declare r json; r2 json; n int; d1 date; d2 date; begin
  assert (public.daraja_chest_open('t_am')->>'error') = 'locked', 'pas de coffre avant le défi du jour';
  insert into daraja.quiz_sessions(staff_id, day, question_ids, answered) values ('00000000-0000-0000-0000-0000000000b1', daraja.today(), '{}', '{}')
    on conflict (staff_id, day) do update set answered = daraja.quiz_sessions.question_ids;
  assert public.daraja_me('t_am')->>'chest' = 'story', 'après le défi, il faut encore lire l''histoire du jour';
  assert (public.daraja_chest_open('t_am')->>'error') = 'story', 'coffre fermé sans l''histoire';
  assert public.daraja_story_read('t_am')->>'chest' = 'ready', 'histoire lue : coffre prêt';
  assert (public.daraja_me('t_am')->>'story_read')::boolean, 'histoire marquée lue';
  assert (public.daraja_me('t_am')->>'chest_left')::int = 2, '2 coffres par semaine';
  r := public.daraja_chest_open('t_am');
  assert (r->>'ok')::boolean and r->>'kind' in ('common','rare','ticket','epic','legend'), 'le coffre donne un lot';
  r2 := public.daraja_chest_open('t_am');
  assert (r2->>'again')::boolean and r2->>'kind' = r->>'kind', 'rouvrir le coffre redonne le même lot, sans regagner';
  select count(*) into n from daraja.point_events where staff_id = '00000000-0000-0000-0000-0000000000b1' and note like 'Coffre %';
  assert n = case when r->>'kind' = 'ticket' then 0 else 1 end, 'un seul gain par jour';
  assert public.daraja_me('t_am')->>'chest' = 'opened', 'coffre marqué ouvert';
  assert (public.daraja_me('t_am')->>'chest_left')::int = 1, 'il reste 1 coffre cette semaine';
  -- quota de la semaine : 2 coffres déjà ouverts d'autres jours → fermé
  delete from daraja.chests where staff_id = '00000000-0000-0000-0000-0000000000b1';
  if daraja.today() - daraja.week_start() < 5 then d1 := daraja.week_start() + 5; d2 := daraja.week_start() + 6;
  else d1 := daraja.week_start(); d2 := daraja.week_start() + 1; end if;
  insert into daraja.chests(staff_id, day, kind) values ('00000000-0000-0000-0000-0000000000b1', d1, 'common'), ('00000000-0000-0000-0000-0000000000b1', d2, 'common');
  assert public.daraja_me('t_am')->>'chest' = 'week', 'quota de 2 par semaine atteint';
  assert (public.daraja_chest_open('t_am')->>'error') = 'week', 'pas de 3e coffre dans la semaine';
  delete from daraja.chests where staff_id = '00000000-0000-0000-0000-0000000000b1';
  -- la direction ouvre en aperçu : un lot s'affiche, rien n'est crédité ni enregistré
  assert (public.daraja_chest_open('t_sup')->>'error') = 'locked', 'aperçu direction aussi après le défi';
  insert into daraja.quiz_sessions(staff_id, day, question_ids, answered) values ('00000000-0000-0000-0000-0000000000a1', daraja.today(), '{}', '{}')
    on conflict (staff_id, day) do update set answered = daraja.quiz_sessions.question_ids;
  perform public.daraja_story_read('t_sup');
  r := public.daraja_chest_open('t_sup');
  assert (r->>'preview')::boolean and r->>'kind' in ('common','rare','ticket','epic','legend'), 'aperçu direction';
  assert not exists (select 1 from daraja.chests where staff_id = '00000000-0000-0000-0000-0000000000a1'), 'aperçu non enregistré';
  assert not exists (select 1 from daraja.point_events where staff_id = '00000000-0000-0000-0000-0000000000a1' and note like 'Coffre %'), 'aperçu non crédité';
  -- le ticket du coffre compte pour le tirage
  n := daraja.tickets('00000000-0000-0000-0000-0000000000b1', daraja.today());
  insert into daraja.chests(staff_id, day, kind) values ('00000000-0000-0000-0000-0000000000b1', daraja.today(), 'ticket');
  assert daraja.tickets('00000000-0000-0000-0000-0000000000b1', daraja.today()) = n + 1, 'un ticket de coffre compte au tirage';
end $$;

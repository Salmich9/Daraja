-- Quiz : le chrono est contrôlé par le serveur, les points tombent une seule fois, +3 de présence à la fin.
do $$ declare q jsonb; ids uuid[]; i int; r jsonb; good int; begin
  q := public.daraja_quiz('t_ka')::jsonb;
  select array_agg((x->>'id')::uuid) into ids from jsonb_array_elements(q->'questions') x;
  assert cardinality(ids) = 5, 'le défi doit compter 5 questions, il en a ' || coalesce(cardinality(ids), 0);
  assert (q->'questions'->0->>'answer_idx') is null, 'la bonne réponse ne doit jamais être envoyée avant de répondre';
  -- 1. réponse sans avoir lancé le chrono : hors délai
  r := public.daraja_answer_v2('t_ka', ids[1], 0, null)::jsonb;
  assert (r->>'timeout')::boolean and not (r->>'correct')::boolean, 'répondre sans chrono doit compter comme hors délai';
  -- 2. chrono lancé puis dépassé : hors délai
  perform public.daraja_q_start('t_ka', ids[2]);
  update daraja.quiz_sessions set started = jsonb_set(started, array[ids[2]::text], to_jsonb(extract(epoch from clock_timestamp()) - 30))
    where staff_id = '00000000-0000-0000-0000-0000000000b2';
  r := public.daraja_answer_v2('t_ka', ids[2], 0, null)::jsonb;
  assert (r->>'timeout')::boolean, 'une réponse après 30 s doit être hors délai';
  -- 3. bonne réponse dans les temps : points
  for i in 3..5 loop
    perform public.daraja_q_start('t_ka', ids[i]);
    r := public.daraja_answer_v2('t_ka', ids[i], (select answer_idx from daraja.questions where id = ids[i]),
      (select payload->'answer' from daraja.questions where id = ids[i]))::jsonb;
  end loop;
  assert (r->>'finished')::boolean, 'le défi doit être terminé après 5 réponses';
  select count(*) into good from daraja.point_events where staff_id = '00000000-0000-0000-0000-0000000000b2' and kind = 'quiz';
  assert good >= 2, 'les bonnes réponses dans les temps doivent rapporter des points';
  -- 4. répondre deux fois à la même question ne rapporte rien de plus
  perform public.daraja_answer_v2('t_ka', ids[5], (select answer_idx from daraja.questions where id = ids[5]), null);
  assert (select count(*) from daraja.point_events where staff_id = '00000000-0000-0000-0000-0000000000b2' and kind = 'quiz') = good, 'pas de points en double';
  assert (select count(*) from daraja.point_events where staff_id = '00000000-0000-0000-0000-0000000000b2' and note = 'Présence') = 1, '+3 de présence une seule fois';
  assert (select streak from daraja.staff where id = '00000000-0000-0000-0000-0000000000b2') = 1, 'la série doit démarrer à 1';
end $$;

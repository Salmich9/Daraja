-- Entraînement : ouvert après le défi du jour, ne rapporte rien.
do $$ declare r json; q json; before int; after int; begin
  assert pg_temp.raises($q$select public.daraja_practice_quiz('t_am')$q$) = 'locked', 'fermé avant le défi du jour';
  insert into daraja.quiz_sessions(staff_id, day, question_ids, answered) values ('00000000-0000-0000-0000-0000000000b1', daraja.today(), '{}', '{}')
    on conflict (staff_id, day) do update set answered = daraja.quiz_sessions.question_ids;
  r := public.daraja_practice_quiz('t_am');
  assert json_array_length(r->'questions') > 0, 'des questions sont servies';
  q := r->'questions'->0;
  assert q->>'answer_idx' is null and q->>'explanation' is null, 'la réponse n''est pas envoyée avant de répondre';
  select coalesce(sum(amount), 0) into before from daraja.point_events where staff_id = '00000000-0000-0000-0000-0000000000b1';
  r := public.daraja_practice_answer('t_am', (q->>'id')::uuid, 0, null);
  assert (r->>'correct') is not null and (r->>'points')::int = 0, 'la correction est donnée, sans points';
  select coalesce(sum(amount), 0) into after from daraja.point_events where staff_id = '00000000-0000-0000-0000-0000000000b1';
  assert before = after, 'l''entraînement ne rapporte aucune pièce';
  r := public.daraja_practice_quiz('t_am');
  assert json_array_length(r->'questions') > 0, 'on peut relancer à volonté';
end $$;

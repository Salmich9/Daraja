-- Accueil : les 7 derniers jours de série, du plus ancien à aujourd'hui.
do $$ declare w json; begin
  insert into daraja.quiz_sessions(staff_id, day, question_ids, answered) values
    ('00000000-0000-0000-0000-0000000000b1', daraja.today() - 2, array[gen_random_uuid()], '{}'),
    ('00000000-0000-0000-0000-0000000000b1', daraja.today() - 1, '{}', '{}')
  on conflict do nothing;
  update daraja.quiz_sessions set answered = question_ids where staff_id = '00000000-0000-0000-0000-0000000000b1' and day = daraja.today() - 2;
  w := public.daraja_me('t_am')->'week';
  assert json_array_length(w) = 7, '7 jours';
  assert (w->>4)::boolean, 'avant-hier joué (défi terminé)';
  assert (w->>5)::boolean, 'hier : défi vide compté terminé';
  assert not (w->>6)::boolean, 'aujourd''hui pas encore joué';
end $$;

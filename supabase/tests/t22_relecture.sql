-- Relecture du défi : visible une fois le défi fini, jusqu'au lancement du défi suivant.
do $$ declare q jsonb; ids uuid[]; i int; r jsonb; begin
  delete from daraja.quiz_sessions where staff_id = '00000000-0000-0000-0000-0000000000b3';
  assert not (public.daraja_quiz_review('t_zi')->>'ok')::boolean, 'rien à relire avant un premier défi';
  q := public.daraja_quiz('t_zi')::jsonb;
  select array_agg((x->>'id')::uuid) into ids from jsonb_array_elements(q->'questions') x;
  perform public.daraja_q_start('t_zi', ids[1]);
  perform public.daraja_answer_v2('t_zi', ids[1], 0, null);
  assert not (public.daraja_quiz_review('t_zi')->>'ok')::boolean, 'pas de relecture pendant le défi (sinon on verrait les réponses)';
  for i in 2..cardinality(ids) loop
    perform public.daraja_q_start('t_zi', ids[i]);
    perform public.daraja_answer_v2('t_zi', ids[i], (select answer_idx from daraja.questions where id = ids[i]),
      (select payload->'answer' from daraja.questions where id = ids[i]));
  end loop;
  r := public.daraja_quiz_review('t_zi')::jsonb;
  assert (r->>'ok')::boolean and (r->>'today')::boolean, 'défi fini : relecture du jour';
  assert jsonb_array_length(r->'items') = cardinality(ids), 'toutes les questions sont là';
  assert (r->'items'->0->'pick'->>'c')::int = 0, 'on retrouve ce que l''équipier a répondu';
  assert r->'items'->0->>'answer_idx' is not null and r->'items'->0 ? 'explanation', 'bonne réponse et explication fournies';
  assert public.daraja_me('t_zi')->>'review' is not null, 'l''accueil sait qu''il y a une relecture';
  -- le lendemain, tant que le nouveau défi n'est pas lancé, on relit encore la veille
  update daraja.quiz_sessions set day = daraja.today() - 1 where staff_id = '00000000-0000-0000-0000-0000000000b3';
  r := public.daraja_quiz_review('t_zi')::jsonb;
  assert (r->>'ok')::boolean and not (r->>'today')::boolean, 'la veille reste relisible';
  -- dès que le nouveau défi est lancé, la veille disparaît
  perform public.daraja_quiz('t_zi');
  assert not (public.daraja_quiz_review('t_zi')->>'ok')::boolean, 'nouveau défi lancé : la veille disparaît';
end $$;

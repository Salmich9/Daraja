-- Duels : demande, refus des doublons, acceptation, partie en direct, réponse cachée, gain une fois.
do $$ declare r jsonb; d uuid; q uuid; s jsonb; begin
  r := public.daraja_duel_new('t_am','00000000-0000-0000-0000-0000000000b2')::jsonb;
  assert (r->>'ok')::boolean, 'un équipier doit pouvoir lancer un défi';
  d := (r->>'id')::uuid;
  assert public.daraja_duel_new('t_ka','00000000-0000-0000-0000-0000000000b1')::jsonb->>'error' = 'open', 'pas deux duels en même temps entre les mêmes personnes';
  assert public.daraja_duel_new('t_am','00000000-0000-0000-0000-0000000000b3')::jsonb->>'error' = 'opponent', 'pas de duel avec un autre lieu';
  assert pg_temp.raises(format($q$select public.daraja_duel_respond('t_am', %L, true)$q$, d)) is not null, 'seul l''adversaire peut accepter';
  assert (public.daraja_duel_respond('t_ka', d, true)::jsonb->>'ok')::boolean, 'l''adversaire accepte';
  s := public.daraja_duel_state('t_am', d)::jsonb;
  assert s->>'status' = 'live', 'les deux présents : le duel démarre';
  -- on avance l'horloge : la manche 1 est ouverte
  update daraja.duels set start_at = now() - interval '1 second' where id = d;
  s := public.daraja_duel_state('t_am', d)::jsonb;
  assert jsonb_array_length(s->'questions') = 1, 'une seule question visible à la fois';
  assert s->'answers'->0->>'answer_idx' is null, 'la réponse reste cachée tant que la manche est ouverte';
  q := (s->'questions'->0->>'id')::uuid;
  assert public.daraja_duel_play('t_am', d, 2, 0, null)::jsonb->>'error' = 'time', 'impossible de répondre à une manche pas encore ouverte';
  r := public.daraja_duel_play('t_am', d, 0, (select answer_idx from daraja.questions where id = q), (select payload->'answer' from daraja.questions where id = q))::jsonb;
  assert (r->>'ok')::boolean, 'réponse acceptée';
  assert public.daraja_duel_play('t_am', d, 0, 0, null)::jsonb->>'error' = 'done', 'une seule réponse par manche';
  -- fin du duel
  update daraja.duels set start_at = now() - interval '300 seconds' where id = d;
  s := public.daraja_duel_state('t_ka', d)::jsonb;
  assert s->>'status' = 'done', 'le duel se termine après la dernière manche';
  assert (select count(*) from daraja.point_events where note = 'Duel gagné' and staff_id = '00000000-0000-0000-0000-0000000000b1') <= 1, 'le gain du duel tombe une seule fois';
  perform public.daraja_duel_state('t_ka', d);
  assert (select count(*) from daraja.point_events where note in ('Duel gagné','Duel nul') and staff_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2')) <= 2, 'rouvrir le duel ne redonne pas de points';
  assert public.daraja_duel_new('t_am','00000000-0000-0000-0000-0000000000b2')::jsonb->>'error' = 'pair', 'un seul duel par jour avec la même personne';
end $$;

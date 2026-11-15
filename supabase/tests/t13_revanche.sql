-- Revanche : 2 duels max par paire et par jour, seulement après un duel terminé.
do $$ declare r json; d uuid; begin
  r := public.daraja_duel_new('t_am', '00000000-0000-0000-0000-0000000000b2'); d := (r->>'id')::uuid;
  assert (public.daraja_duel_rematch('t_am', d)->>'error') = 'duel', 'pas de revanche avant la fin';
  update daraja.duels set status = 'done', done_at = now() where id = d;
  r := public.daraja_duel_rematch('t_ka', d);
  assert (r->>'ok')::boolean, 'le perdant peut demander sa revanche';
  update daraja.duels set status = 'done', done_at = now() where id = (r->>'id')::uuid;
  assert (public.daraja_duel_rematch('t_am', d)->>'error') = 'pair', 'pas de 3e duel le même jour';
  assert (public.daraja_duel_rematch('t_zi', d)->>'error') = 'duel', 'un autre joueur ne peut pas s''en servir';
end $$;

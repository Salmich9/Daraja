-- Paramètres direction : charte modifiable (malus par règle, ligne, ajout, retrait) et cadeaux supprimables.
do $$ declare r json; rid int; prev json; rw uuid; begin
  -- direction seulement
  assert pg_temp.raises($q$select public.daraja_admin_charter('t_mgr')$q$) is not null, 'manager : pas d''accès à la charte';
  assert pg_temp.raises($q$select public.daraja_admin_rule_save('t_mgr', '{"line":"blanche","behavior":"Test"}')$q$) is not null, 'manager ne modifie pas';
  r := public.daraja_admin_charter('t_sup');
  assert json_array_length(r->'rules') > 0, 'charte listée';

  -- nouvelle règle blanche avec malus propre
  r := public.daraja_admin_rule_save('t_sup', '{"line":"blanche","domain":"Tenue","behavior":"Badge oublié","malus":7}');
  assert (r->>'ok')::boolean, 'création';
  rid := (r->>'id')::int;
  prev := daraja.conduct_compute('00000000-0000-0000-0000-0000000000b1', rid);
  assert (prev->>'malus')::int = 7, 'malus propre appliqué';
  -- passer la règle en grise sans malus propre : le malus de la ligne s'applique
  perform public.daraja_admin_rule_save('t_sup', json_build_object('id', rid, 'line', 'grise', 'domain', 'Tenue', 'behavior', 'Badge oublié', 'malus', null)::jsonb);
  prev := daraja.conduct_compute('00000000-0000-0000-0000-0000000000b1', rid);
  assert prev->>'line' = 'grise' and (prev->>'malus')::int = daraja.rv('malus_grise'), 'déplacée en grise';
  -- malus par défaut d'une ligne réglable
  perform public.daraja_admin_line_malus('t_sup', 'grise', 150);
  assert (daraja.conduct_compute('00000000-0000-0000-0000-0000000000b1', rid)->>'malus')::int = 150, 'défaut de ligne modifié';
  assert (public.daraja_admin_line_malus('t_sup', 'grise', 9999)->>'ok')::boolean = false, 'borne';
  -- jamais utilisée : supprimée pour de bon
  assert (public.daraja_admin_rule_delete('t_sup', rid)->>'archived')::boolean = false, 'supprimée';
  assert not exists (select 1 from daraja.conduct_rules where id = rid), 'plus là';

  -- cadeaux : supprimé pour de bon s'il n'a jamais été pris, sinon rangé et remettable
  r := public.daraja_admin_reward_save('t_sup', '{"name":"Test cadeau","cost":300,"icon":"gift"}');
  rw := (r->>'id')::uuid;
  assert (public.daraja_admin_reward_delete('t_sup', rw)->>'archived')::boolean = false, 'cadeau supprimé';
  assert not exists (select 1 from daraja.rewards where id = rw), 'cadeau parti';
  r := public.daraja_admin_reward_save('t_sup', '{"name":"Test cadeau 2","cost":300,"icon":"gift"}');
  rw := (r->>'id')::uuid;
  insert into daraja.point_events(staff_id, kind, amount, note, reward_id) values ('00000000-0000-0000-0000-0000000000b1', 'cadeau', -300, 'Test cadeau 2', rw);
  assert (public.daraja_admin_reward_delete('t_sup', rw)->>'archived')::boolean, 'déjà pris : rangé';
  assert (select archived and not active from daraja.rewards where id = rw), 'rangé et hors boutique';
  assert pg_temp.raises(format($q$select public.daraja_admin_reward_delete('t_mgr', %L)$q$, rw)) is not null, 'manager ne supprime pas';
  perform public.daraja_admin_reward_restore('t_sup', rw);
  assert not (select archived from daraja.rewards where id = rw), 'remis (masqué, prêt à revenir en boutique)';
end $$;

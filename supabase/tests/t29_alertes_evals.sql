-- Alertes « À valider » : les fiches d'évaluation à valider comptent pour la direction et ouvrent l'onglet Évaluations.
do $$ declare t timestamptz := (daraja.today() + time '16:30') at time zone 'Africa/Casablanca'; c record; sc jsonb; begin
  update daraja.app_settings set value = '{"mode":"all","families":{"quiz":true,"serie":true,"defi":true,"cadeaux":true,"alertes":true},"start_hour":10,"end_hour":21,"serie_hour":19,"quiz_hour":12,"cap_day":3,"cap_family":1}' where key = 'push';
  perform public.daraja_push_sub('t_sup', 'https://push.test/sup', 'k', 'a', 'iPhone');
  perform public.daraja_push_sub('t_mgr', 'https://push.test/mgr', 'k', 'a', 'iPhone');
  update daraja.push_subscriptions set created_at = now() - interval '1 hour';
  delete from daraja.point_events where (kind in ('avis', 'vente') and status = 'pending') or (kind = 'cadeau' and not delivered);
  delete from daraja.conduct_records where needs_direction;
  assert not exists (select 1 from daraja.push_candidates(t) x where x.family = 'alertes'), 'rien à valider : pas d''alerte';

  -- le manager envoie une fiche : la direction est prévenue, et la notification ouvre l'onglet Évaluations
  select jsonb_object_agg(k.id::text, 3) into sc from daraja.eval_crit('salle') k;
  perform public.daraja_eval_save('t_mgr', '00000000-0000-0000-0000-0000000000b1', sc, null);
  select * into c from daraja.push_candidates(t) x where x.family = 'alertes' and x.staff_id = '00000000-0000-0000-0000-0000000000a1';
  assert c.body = '1 demande attend ta validation.' and c.url = '/?go=evals', 'fiche seule : ' || coalesce(c.body, '?') || ' ' || coalesce(c.url, '?');
  assert not exists (select 1 from daraja.push_candidates(t) x where x.family = 'alertes' and x.staff_id = '00000000-0000-0000-0000-0000000000a2'), 'le manager n''a rien à valider';

  -- une fiche et un avis : 2 demandes, la notification ouvre Admin › Équipe (l'onglet Évaluations a sa pastille)
  insert into daraja.point_events(staff_id, kind, amount, note, status) values ('00000000-0000-0000-0000-0000000000b2', 'avis', 100, 'Google', 'pending');
  select * into c from daraja.push_candidates(t) x where x.family = 'alertes' and x.staff_id = '00000000-0000-0000-0000-0000000000a1';
  assert c.body = '2 demandes attendent ta validation.' and c.url = '/?go=admin', 'fiche + avis : ' || coalesce(c.body, '?') || ' ' || coalesce(c.url, '?');

  -- fiche validée : elle ne compte plus
  perform public.daraja_eval_validate('t_sup', (select id from daraja.evals where status = 'pending'), true);
  select * into c from daraja.push_candidates(t) x where x.family = 'alertes' and x.staff_id = '00000000-0000-0000-0000-0000000000a1';
  assert c.body = '1 demande attend ta validation.', 'fiche validée : plus comptée';
end $$;

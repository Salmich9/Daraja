-- Alertes « À valider » : seules les demandes visibles dans Admin comptent (jamais celles d'un compte sans établissement).
do $$ declare t timestamptz := (daraja.today() + time '16:30') at time zone 'Africa/Casablanca'; n int; begin
  update daraja.app_settings set value = '{"mode":"all","families":{"quiz":true,"serie":true,"defi":true,"cadeaux":true,"alertes":true},"start_hour":10,"end_hour":21,"serie_hour":19,"quiz_hour":12,"cap_day":3,"cap_family":1}' where key = 'push';
  perform public.daraja_push_sub('t_sup', 'https://push.test/sup', 'k', 'a', 'iPhone');
  perform public.daraja_push_sub('t_mgr', 'https://push.test/mgr', 'k', 'a', 'iPhone');
  update daraja.push_subscriptions set created_at = now() - interval '1 hour';
  delete from daraja.point_events where (kind in ('avis', 'vente') and status = 'pending') or (kind = 'cadeau' and not delivered);
  delete from daraja.conduct_records where needs_direction;

  -- un avis envoyé depuis le compte direction : introuvable dans Admin, donc pas d'alerte
  insert into daraja.point_events(staff_id, kind, amount, note, status) values ('00000000-0000-0000-0000-0000000000a1', 'avis', 100, 'essai', 'pending');
  assert not exists (select 1 from daraja.push_candidates(t) c where c.family = 'alertes'), 'demande de la direction : pas d''alerte';

  -- un avis d'une équipière de Baromètre : la direction et le manager de Baromètre sont prévenus, pas celui de ZamaZama
  insert into daraja.point_events(staff_id, kind, amount, note, status) values ('00000000-0000-0000-0000-0000000000b1', 'avis', 100, 'Google', 'pending');
  select count(*) into n from daraja.push_candidates(t) c where c.family = 'alertes'
    and c.staff_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2') and c.body like '1 demande attend%';
  assert n = 2, 'direction et manager prévenus pour 1 demande, ici ' || n;
  perform public.daraja_push_sub('t_mgrz', 'https://push.test/mgrz', 'k', 'a', 'iPhone');
  update daraja.push_subscriptions set created_at = now() - interval '1 hour';
  assert not exists (select 1 from daraja.push_candidates(t) c where c.family = 'alertes' and c.staff_id = '00000000-0000-0000-0000-0000000000a3'), 'l''autre établissement n''est pas prévenu';
end $$;

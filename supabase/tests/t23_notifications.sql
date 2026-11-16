-- Notifications : interrupteur, heures calmes, plafonds, établissements séparés, alias, malus sans détail, textes courts.
do $$ declare r jsonb; it jsonb; noon timestamptz; eve timestamptz; early timestamptz; n int; begin
  noon := (daraja.today() + time '12:00') at time zone 'Africa/Casablanca';
  eve := (daraja.today() + time '19:30') at time zone 'Africa/Casablanca';
  early := (daraja.today() + time '08:00') at time zone 'Africa/Casablanca';
  -- fermé au téléphone : seules les routes serveur (clé service) peuvent abonner ou envoyer
  assert pg_temp.raises($q$set local role anon; select public.daraja_push_claim()$q$) is not null, 'claim interdit au téléphone';
  reset role;
  assert pg_temp.raises($q$set local role anon; select public.daraja_push_sub('t_am','https://x','k','a','d')$q$) is not null, 'abonnement direct interdit';
  reset role;
  assert pg_temp.raises($q$set local role anon; select * from daraja.push_subscriptions$q$) is not null, 'abonnements illisibles';
  reset role;
  -- abonnements (chacun à son nom)
  perform public.daraja_push_sub('t_am', 'https://push.test/am', 'k', 'a', 'iPhone');
  perform public.daraja_push_sub('t_zi', 'https://push.test/zi', 'k', 'a', 'iPhone');
  perform public.daraja_push_sub('t_mgr', 'https://push.test/mgr', 'k', 'a', 'iPhone');
  assert pg_temp.raises($q$select public.daraja_push_sub('faux', 'https://push.test/x', 'k', 'a', 'd')$q$) is not null, 'session vérifiée';
  update daraja.push_subscriptions set created_at = now() - interval '1 hour';
  -- interrupteur coupé par défaut : rien ne part
  assert jsonb_array_length(public.daraja_push_claim(noon)::jsonb->'items') = 0, 'coupé par défaut';
  assert pg_temp.raises($q$select public.daraja_push_admin('t_mgr', '{"mode":"all"}')$q$) is not null, 'réglages : direction seulement';
  -- mode direction : seul le compte direction recevrait
  perform public.daraja_push_admin('t_sup', '{"mode":"direction"}');
  assert jsonb_array_length(public.daraja_push_claim(noon)::jsonb->'items') = 0, 'mode direction : personne d''autre';
  perform public.daraja_push_admin('t_sup', '{"mode":"all"}');
  assert (public.daraja_push_status('t_am')->>'visible')::boolean, 'ouvert à tous : bouton visible';
  -- heures calmes
  assert (public.daraja_push_claim(early)::jsonb->>'quiet')::boolean, 'rien avant 10 h';
  -- 11 h : pas encore de rappel du défi (il part à partir de quiz_hour, 12 h par défaut)
  assert not exists (select 1 from daraja.push_candidates(noon - interval '1 hour') c where c.family = 'quiz'), 'pas de rappel avant 12 h';
  -- midi : rappel du quiz pour les équipiers qui n'ont pas joué, chacun chez soi
  r := public.daraja_push_claim(noon)::jsonb;
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'staff_id' = '00000000-0000-0000-0000-0000000000b1' and x->>'family' = 'quiz'), 'rappel quiz Baromètre';
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'staff_id' = '00000000-0000-0000-0000-0000000000b3' and x->>'family' = 'quiz'), 'rappel quiz ZamaZama';
  assert jsonb_array_length(public.daraja_push_claim(noon)::jsonb->'items') = 0, 'une alerte dite une fois';
  -- série en danger le soir (prioritaire sur le rappel, jamais les deux)
  perform public.daraja_push_sub('t_ka', 'https://push.test/ka', 'k', 'a', 'Android');
  update daraja.push_subscriptions set created_at = now() - interval '1 hour';
  update daraja.staff set streak = 4, last_quiz_day = daraja.today() - 1 where id = '00000000-0000-0000-0000-0000000000b2';
  assert not exists (select 1 from jsonb_array_elements(public.daraja_push_claim(noon)::jsonb->'items') x where x->>'family' in ('quiz','serie')
    and x->>'staff_id' = '00000000-0000-0000-0000-0000000000b2' and x->>'family' = 'serie'), 'pas de série avant le soir';
  delete from daraja.push_sent where staff_id = '00000000-0000-0000-0000-0000000000b2';
  r := public.daraja_push_claim(eve)::jsonb;
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'staff_id' = '00000000-0000-0000-0000-0000000000b2'
    and x->>'family' = 'serie' and x->>'title' like '%4 jours%'), 'série en danger le soir';
  assert (select count(*) from daraja.push_sent where staff_id = '00000000-0000-0000-0000-0000000000b2' and family in ('quiz','serie')) = 1, 'série OU rappel, pas les deux';
  -- nouveau défi : nom du collègue seulement par son alias
  insert into daraja.duels(venue, challenger, opponent, question_ids, status) values ('baro', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', '{}', 'pending');
  r := public.daraja_push_claim(eve)::jsonb;
  select x into it from jsonb_array_elements(r->'items') x where x->>'family' = 'defi' and x->>'staff_id' = '00000000-0000-0000-0000-0000000000b1';
  assert it->>'body' like 'Un collègue%' and it->>'body' not like '%Karim%', 'pas de vrai nom sans alias';
  -- un duel d'un autre établissement ne part jamais
  insert into daraja.duels(venue, challenger, opponent, question_ids, status) values ('zz', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', '{}', 'pending');
  assert not exists (select 1 from jsonb_array_elements(public.daraja_push_claim(eve)::jsonb->'items') x where x->>'staff_id' = '00000000-0000-0000-0000-0000000000b1' and x->>'family' = 'defi'), 'établissements séparés';
  -- malus : jamais de détail à l'écran verrouillé
  insert into daraja.point_events(staff_id, kind, amount, note) values ('00000000-0000-0000-0000-0000000000b1', 'malus', -300, 'Conduite · Rouge · Insulte envers un client');
  r := public.daraja_push_claim(eve)::jsonb;
  select x into it from jsonb_array_elements(r->'items') x where x->>'family' = 'cadeaux' and x->>'staff_id' = '00000000-0000-0000-0000-0000000000b1';
  assert it->>'title' = 'Un message t''attend' and (it->>'title' || (it->>'body')) !~* 'rouge|grise|insulte|300|malus', 'malus sans détail';
  -- plafond : 3 par jour au total
  insert into daraja.point_events(staff_id, kind, amount, note) values ('00000000-0000-0000-0000-0000000000b1', 'bonus', 100, 'Mois exemplaire 2026-10');
  perform public.daraja_push_claim(eve);
  select count(*) into n from daraja.push_sent where staff_id = '00000000-0000-0000-0000-0000000000b1' and day = daraja.today();
  assert n <= 3, '3 notifications par jour au plus (' || n || ')';
  assert (select count(*) from daraja.push_sent where staff_id = '00000000-0000-0000-0000-0000000000b1' and day = daraja.today() and family = 'cadeaux') = 1, '1 par famille et par jour';
  -- alertes du manager : seulement son établissement
  insert into daraja.point_events(staff_id, kind, amount, note, status) values ('00000000-0000-0000-0000-0000000000b3', 'avis', 100, 'Avis', 'pending');
  assert not exists (select 1 from jsonb_array_elements(public.daraja_push_claim(eve)::jsonb->'items') x where x->>'staff_id' = '00000000-0000-0000-0000-0000000000a2'), 'alerte d''un autre établissement : non';
  insert into daraja.point_events(staff_id, kind, amount, note, status) values ('00000000-0000-0000-0000-0000000000b1', 'avis', 100, 'Avis', 'pending');
  select x into it from jsonb_array_elements(public.daraja_push_claim(eve)::jsonb->'items') x where x->>'staff_id' = '00000000-0000-0000-0000-0000000000a2';
  assert it->>'family' = 'alertes' and it->>'body' like '1 demande%', 'alerte du manager';
  -- textes : titre de 28 caractères au plus, corps d'une ligne, lien vers un écran
  for it in select x from daraja.push_candidates(eve) c, lateral (select to_jsonb(c) x) y loop
    assert length(it->>'title') <= 28, 'titre trop long : ' || (it->>'title');
    assert position(E'\n' in it->>'body') = 0 and length(it->>'body') <= 60, 'corps d''une ligne : ' || (it->>'body');
    assert it->>'url' like '/?go=%', 'le toucher ouvre un écran';
  end loop;
  -- test à soi : direction seulement
  assert pg_temp.raises($q$select public.daraja_push_test('t_mgr')$q$) is not null, 'test : direction seulement';
  -- un désabonnement ne touche que son propre appareil
  perform public.daraja_push_unsub('t_ka', 'https://push.test/am');
  assert exists (select 1 from daraja.push_subscriptions where endpoint = 'https://push.test/am'), 'impossible de couper celui d''un autre';
  perform public.daraja_push_admin('t_sup', '{"mode":"off"}');
end $$;

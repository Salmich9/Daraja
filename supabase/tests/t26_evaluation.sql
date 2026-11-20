-- Évaluation mensuelle : droits, envoi à la direction, renvoi, validation, pièces sur record seulement,
-- ce que voit l'équipier, axes de progrès (note du manager + défis) et défi du jour ciblé.
do $$ declare am uuid := '00000000-0000-0000-0000-0000000000b1'; ka uuid := '00000000-0000-0000-0000-0000000000b2';
  zi uuid := '00000000-0000-0000-0000-0000000000b3'; mgr uuid := '00000000-0000-0000-0000-0000000000a2';
  sc jsonb; r jsonb; eid uuid; vins int; angl int; carte int; cock int; q jsonb; tg uuid[]; ids uuid[]; c int; n int;
begin
  select id into vins from daraja.eval_criteria where family = 'salle' and label = 'Vins';
  select id into angl from daraja.eval_criteria where family = 'salle' and label = 'Anglais';
  select id into carte from daraja.eval_criteria where family = 'salle' and label = 'Carte';
  select id into cock from daraja.eval_criteria where family = 'salle' and label = 'Cocktails';
  assert vins is not null and angl is not null, 'grille de départ en place';

  -- droits
  assert pg_temp.raises(format($q$select public.daraja_eval_sheet('t_ka', %L)$q$, am)) is not null, 'un équipier n''évalue pas';
  assert pg_temp.raises(format($q$select public.daraja_eval_sheet('t_mgr', %L)$q$, zi)) is not null, 'un manager n''évalue pas l''autre établissement';
  assert pg_temp.raises(format($q$select public.daraja_eval_sheet('t_mgr', %L)$q$, '00000000-0000-0000-0000-0000000000a3')) is not null, 'un manager n''évalue pas un manager';
  assert pg_temp.raises(format($q$select public.daraja_eval_sheet('t_mgr', %L)$q$, mgr)) is not null, 'personne ne s''évalue soi-même';
  assert pg_temp.raises($q$select public.daraja_admin_eval_criteria('t_mgr')$q$) is not null, 'grille réglée par la direction seulement';
  assert not exists (select 1 from json_array_elements(public.daraja_eval_team('t_mgrz', null)->'people') p where (p->>'id')::uuid in (am, ka)),
    'un établissement ne voit jamais l''autre';
  assert json_array_length(public.daraja_eval_team('t_mgr', null)->'pending') = 0, 'le manager n''a pas de file de validation';

  -- fiche incomplète refusée
  r := public.daraja_eval_save('t_mgr', am, jsonb_build_object(vins::text, 2))::jsonb;
  assert not (r->>'ok')::boolean and r->>'error' = 'missing', 'tous les critères sont demandés';

  -- 1re fiche du manager : envoyée, rien ne compte avant validation
  select jsonb_object_agg(c.id::text, 2) into sc from daraja.eval_crit('salle') c;
  sc := sc || jsonb_build_object(carte::text, 4, cock::text, 3, vins::text, 1, angl::text, 1);
  r := public.daraja_eval_save('t_mgr', am, sc, 'Proposer un vin à chaque table')::jsonb;
  assert (r->>'ok')::boolean and r->>'status' = 'pending', 'envoyée à la direction';
  assert (public.daraja_eval_mine('t_am')::jsonb->'new') = 'null'::jsonb, 'rien de visible avant validation';
  assert jsonb_array_length(public.daraja_eval_mine('t_am')::jsonb->'strengths') = 0, 'pas de forces avant validation';
  assert not exists (select 1 from daraja.eval_targets(am)), 'pas d''axes sans fiche validée ni défis';
  assert (public.daraja_me('t_sup')::jsonb->>'eval_todo')::int = 1, 'la direction voit 1 fiche à valider';
  select (x->>'id')::uuid into eid from json_array_elements(public.daraja_eval_team('t_sup', 'zz')->'pending') x;
  assert eid is not null, 'file de validation commune aux deux établissements';
  assert pg_temp.raises(format($q$select public.daraja_eval_validate('t_mgr', %L, true)$q$, eid)) is not null, 'seule la direction valide';

  -- renvoi au manager, puis renvoi corrigé
  perform public.daraja_eval_validate('t_sup', eid, false, 'Revois l''anglais');
  assert (select status from daraja.evals where id = eid) = 'returned', 'renvoyée';
  assert (public.daraja_me('t_mgr')::jsonb->>'eval_todo')::int = 1, 'le manager voit la fiche renvoyée';
  assert public.daraja_eval_sheet('t_mgr', am)::jsonb->'open'->>'note' = 'Revois l''anglais', 'le mot de la direction est lisible';
  perform public.daraja_eval_save('t_mgr', am, sc, 'Proposer un vin à chaque table');
  assert (select count(*) from daraja.evals where staff_id = am) = 1, 'même fiche, pas de doublon';
  assert (select status from daraja.evals where id = eid) = 'pending' and (select note from daraja.evals where id = eid) is null, 'renvoyée à nouveau';

  -- validation : 1re fiche, pas de pièces, célébration « premier bilan »
  r := public.daraja_eval_validate('t_sup', eid, true)::jsonb;
  assert (r->>'coins')::int = 0, 'pas de pièces sur une première fiche';
  r := public.daraja_eval_mine('t_am')::jsonb;
  assert (r->'new'->>'first')::boolean, 'célébration du premier bilan';
  assert r->'strengths' = '["Carte", "Cocktails"]'::jsonb, 'forces : Solide ou Expert, du plus fort au moins fort';
  assert r->'axes' = '["Vins", "Anglais"]'::jsonb, 'axes : les deux plus faibles';
  assert r->>'goal' = 'Proposer un vin à chaque table', 'objectif du mois visible';
  assert r::text not like '%"lv"%' and r::text not like '%scores%', 'jamais les niveaux détaillés';
  perform public.daraja_eval_seen('t_am');
  assert (public.daraja_eval_mine('t_am')::jsonb->'new') = 'null'::jsonb, 'célébration montrée une fois';

  -- défi du jour ciblé : 2 questions sur 5 visent les axes
  q := public.daraja_quiz('t_am')::jsonb;
  select array_agg((x->>'id')::uuid) into ids from jsonb_array_elements(q->'questions') x;
  select array_agg(x::uuid) into tg from jsonb_array_elements_text(q->'targeted') x;
  assert cardinality(ids) = 5, 'toujours 5 questions';
  assert cardinality(tg) = 2 and tg <@ ids, '2 questions ciblées dans le défi';
  assert (select count(*) from daraja.questions where id = any(tg) and cat in ('vins', 'terroirs')) = 1
     and (select count(*) from daraja.questions where id = any(tg) and cat = 'anglais') = 1, 'une question par axe';
  assert public.daraja_quiz('t_am')::jsonb->'targeted' = q->'targeted', 'le même défi toute la journée';

  -- 2e fiche : Vins 1 → 3 et Anglais 1 → 3 = 4 niveaux gagnés, 80 pièces plafonnées à 60
  sc := sc || jsonb_build_object(vins::text, 3, angl::text, 3);
  perform public.daraja_eval_save('t_mgr', am, sc, null);
  select id into eid from daraja.evals where staff_id = am and status = 'pending';
  r := public.daraja_eval_validate('t_sup', eid, true)::jsonb;
  assert (r->>'coins')::int = daraja.rv('eval_cap'), 'pièces plafonnées';
  assert exists (select 1 from daraja.point_events where staff_id = am and kind = 'bonus' and amount = daraja.rv('eval_cap')), 'pièces versées';
  r := public.daraja_eval_mine('t_am')::jsonb;
  assert jsonb_array_length(r->'new'->'gains') = 2 and not (r->'new'->>'first')::boolean, 'deux niveaux gagnés à célébrer';
  perform public.daraja_eval_seen('t_am');

  -- pas de pièces pour un niveau déjà atteint : Vins redescend à 2, puis remonte à 3
  sc := sc || jsonb_build_object(vins::text, 2);
  r := public.daraja_eval_save('t_sup', am, sc, null)::jsonb;
  assert r->>'status' = 'ok' and (r->>'coins')::int = 0, 'la direction valide directement ; pas de pièces en baisse';
  sc := sc || jsonb_build_object(vins::text, 3);
  r := public.daraja_eval_save('t_sup', am, sc, null)::jsonb;
  assert (r->>'coins')::int = 0, 'pas de pièces pour un record déjà battu';
  assert jsonb_array_length(public.daraja_eval_mine('t_am')::jsonb->'new'->'gains') = 1, 'mais la remontée se fête';
  assert (select json_array_length(public.daraja_eval_sheet('t_sup', am)->'history')) = 4, 'courbe : 4 fiches validées';
  assert (select p->>'trend' from json_array_elements(public.daraja_eval_team('t_mgr', null)->'people') p where (p->>'id')::uuid = am) = 'up', 'en progrès';

  -- sans fiche : les défis seuls désignent les axes (Karim rate les vins, réussit les cocktails)
  insert into daraja.answers(staff_id, question_id, correct) select ka, id, false from daraja.questions where cat = 'vins' and active limit 8;
  insert into daraja.answers(staff_id, question_id, correct) select ka, id, true from daraja.questions where cat = 'cocktails' and active limit 8;
  assert (select label from daraja.eval_targets(ka) limit 1) = 'Vins', 'axe tiré des défis';

  -- la direction évalue un manager : grille « manager », validée tout de suite, visible par le manager
  select jsonb_object_agg(c.id::text, 3) into sc from daraja.eval_crit('manager') c;
  r := public.daraja_eval_save('t_sup', mgr, sc, null)::jsonb;
  assert r->>'status' = 'ok', 'fiche manager validée';
  assert jsonb_array_length(public.daraja_eval_mine('t_mgr')::jsonb->'strengths') = 3, 'le manager voit ses forces';
  assert (select grid from daraja.evals where staff_id = mgr) = 'manager', 'grille manager';

  -- réglages : questions ciblées à 0 = défi habituel
  assert (public.daraja_admin_eval_value('t_sup', 'eval_target', 9)->>'ok')::boolean = false, 'borne';
  perform public.daraja_admin_eval_value('t_sup', 'eval_target', 0);
  delete from daraja.quiz_sessions where staff_id = am;
  assert jsonb_array_length(public.daraja_quiz('t_am')::jsonb->'targeted') = 0, 'ciblage coupé';

  -- grille : ajout, suppression d'un critère jamais utilisé, rangement d'un critère déjà noté, remise
  r := public.daraja_admin_eval_criterion_save('t_sup', '{"family":"bar","kind":"metier","label":"Café","cats":["cocktails","x;drop"]}')::jsonb;
  c := (r->>'id')::int;
  assert (select cats from daraja.eval_criteria where id = c) = '{cocktails}', 'thèmes filtrés';
  r := public.daraja_admin_eval_criterion_delete('t_sup', c)::jsonb;
  assert not (r->>'archived')::boolean, 'jamais utilisé : supprimé';
  assert not exists (select 1 from daraja.eval_criteria where id = c), 'supprimé pour de bon';
  assert (public.daraja_admin_eval_criterion_delete('t_sup', carte)->>'archived')::boolean, 'déjà noté : rangé';
  assert not exists (select 1 from daraja.eval_crit('salle') x where x.id = carte), 'plus dans la grille';
  assert public.daraja_eval_mine('t_am')::jsonb->'strengths' ? 'Carte', 'l''historique reste lisible';
  perform public.daraja_admin_eval_criterion_restore('t_sup', carte);
  select count(*) into n from daraja.eval_crit('salle');
  assert n = 11, 'grille salle : 7 métier + 4 savoir-être, il y en a ' || n;
end $$;

-- Formation vente : fiches par établissement, questions tirées des fiches, « à vendre » déclarés puis validés.
do $$ declare r json; fid uuid; qid uuid; aid uuid; ev uuid; b0 int; n int; begin
  -- le premier lot est chargé et produit des questions d'accords, chacune dans son établissement
  assert (select count(*) from daraja.fiches where active) >= 20, 'premier lot de fiches';
  assert (select count(*) from daraja.questions q join daraja.fiches f on f.id = (q.payload->>'fiche')::uuid
          where q.active and q.cat = 'vente' and q.venue = f.venue) >= 30, 'questions d''accords générées';
  assert not exists (select 1 from daraja.questions q join daraja.fiches f on f.id = (q.payload->>'fiche')::uuid where q.venue <> f.venue), 'questions dans le bon établissement';
  -- bonne réponse à sa place
  assert not exists (select 1 from daraja.questions q join daraja.fiches f on f.id = (q.payload->>'fiche')::uuid
          where q.active and q.payload->>'k' = 'cocktail' and q.options->>q.answer_idx <> f.cocktail), 'bonne réponse = cocktail de la fiche';

  -- bibliothèque : chacun la sienne, jamais celle de l'autre établissement
  r := public.daraja_fiches('t_zi', 'baro');
  assert r->>'venue' = 'zz', 'équipier Zama : sa bibliothèque seulement';
  assert not (r->>'can_edit')::boolean, 'équipier : lecture seule';
  assert (public.daraja_fiches('t_sup', 'zz')->>'venue') = 'zz', 'direction : choisit l''établissement';

  -- modifier : managers et direction seulement, chacun chez soi
  assert pg_temp.raises($q$select public.daraja_fiche_save('t_am', 'baro', '{"title":"Test"}')$q$) is not null, 'équipier ne modifie pas';
  assert pg_temp.raises($q$select public.daraja_fiche_save('t_mgr', 'zz', '{"title":"Test"}')$q$) is not null, 'manager Baromètre ne touche pas Zama';
  r := public.daraja_fiche_save('t_mgr', 'baro', '{"title":"Mini burgers","section":"entree","cocktail":"Margarita","wine":"Médaillon","why":"Le citron coupe le gras."}');
  assert (r->>'ok')::boolean, 'manager crée une fiche';
  fid := (r->>'id')::uuid;
  assert (select venue from daraja.fiches where id = fid) = 'baro', 'fiche dans son établissement';
  select id into qid from daraja.questions where payload->>'fiche' = fid::text and payload->>'k' = 'cocktail';
  assert qid is not null, 'question créée pour la nouvelle fiche';
  -- modifier la fiche met la question à jour sans la recréer (l'historique des réponses reste lié)
  perform public.daraja_fiche_save('t_mgr', 'baro', json_build_object('id', fid, 'title', 'Mini burgers', 'section', 'entree', 'cocktail', 'Paloma', 'wine', 'Médaillon')::jsonb);
  assert (select options->>answer_idx from daraja.questions where id = qid) = 'Paloma', 'question suit la fiche';
  -- retirer la fiche éteint ses questions
  assert (public.daraja_fiche_delete('t_mgr', fid)->>'ok')::boolean, 'retrait';
  assert not exists (select 1 from daraja.questions where payload->>'fiche' = fid::text and active), 'questions éteintes';
  assert pg_temp.raises(format($q$select public.daraja_fiche_delete('t_mgrz', %L)$q$,
    (select id from daraja.fiches where venue = 'baro' and active limit 1))) is not null, 'Zama ne retire pas une fiche du Baromètre';

  -- « à vendre » : le manager demande, l'équipier déclare, le manager valide
  assert (public.daraja_ask_save('t_mgr', 'baro', '{"title":"Tigre + Syrah","points":2,"days":3}')->>'error') = 'points', 'points bornés';
  r := public.daraja_ask_save('t_mgr', 'baro', '{"title":"Tigre + Syrah","points":30,"days":3}');
  aid := (r->>'id')::uuid;
  assert json_array_length(public.daraja_asks('t_am')) = 1, 'visible au Baromètre';
  assert json_array_length(public.daraja_asks('t_zi')) = 0, 'invisible à ZamaZama';
  assert (public.daraja_sale_declare('t_zi', aid)->>'error') = 'closed', 'un équipier Zama ne déclare pas une vente du Baromètre';
  assert (public.daraja_sale_declare('t_mgr', aid)->>'error') = 'role', 'équipiers seulement';
  b0 := daraja.balance('00000000-0000-0000-0000-0000000000b1');
  assert (public.daraja_sale_declare('t_am', aid)->>'ok')::boolean, 'déclaration';
  assert daraja.balance('00000000-0000-0000-0000-0000000000b1') = b0, 'rien avant validation';
  select (x->>'id')::uuid into ev from json_array_elements(public.daraja_admin('t_mgr', 'baro')->'reviews') x where x->>'kind' = 'vente';
  assert ev is not null, 'la vente attend dans la liste du manager';
  assert pg_temp.raises(format($q$select public.daraja_admin_review('t_mgrz', %L, true)$q$, ev)) is not null, 'Zama ne valide pas le Baromètre';
  perform public.daraja_admin_review('t_mgr', ev, true);
  assert daraja.balance('00000000-0000-0000-0000-0000000000b1') = b0 + 30, 'points crédités à la validation';
  -- plafond par jour
  update daraja.rule_values set val = 2 where key = 'sale_cap';
  perform public.daraja_sale_declare('t_am', aid);
  assert (public.daraja_sale_declare('t_am', aid)->>'error') = 'cap', 'plafond par jour';
  -- arrêt de la demande
  perform public.daraja_ask_stop('t_mgr', aid);
  assert json_array_length(public.daraja_asks('t_am')) = 0, 'demande arrêtée';
  assert (public.daraja_sale_declare('t_am', aid)->>'error') = 'closed', 'plus de déclaration';
end $$;

-- Remettre une fiche retirée : managers et direction, chacun chez soi ; ses questions reviennent.
do $$ declare fid uuid; r json; begin
  select id into fid from daraja.fiches where venue = 'baro' and active order by sort limit 1;
  perform public.daraja_fiche_delete('t_mgr', fid);
  r := public.daraja_fiches('t_mgr', 'baro');
  assert exists (select 1 from json_array_elements(r->'retired') x where (x->>'id')::uuid = fid), 'fiche retirée listée pour le manager';
  assert json_array_length(public.daraja_fiches('t_am')->'retired') = 0, 'équipier : pas de liste des retirées';
  assert pg_temp.raises(format($q$select public.daraja_fiche_restore('t_am', %L)$q$, fid)) is not null, 'équipier ne remet pas';
  assert pg_temp.raises(format($q$select public.daraja_fiche_restore('t_mgrz', %L)$q$, fid)) is not null, 'Zama ne remet pas une fiche du Baromètre';
  assert (public.daraja_fiche_restore('t_mgr', fid)->>'ok')::boolean, 'manager remet';
  assert (select active from daraja.fiches where id = fid), 'fiche active';
  assert (select count(*) from daraja.questions where payload->>'fiche' = fid::text and active) = 2, 'questions revenues';
end $$;

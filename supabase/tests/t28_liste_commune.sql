-- Admin › Équipe : la direction voit les demandes des deux établissements (avec le nom), un manager seulement les siennes.
do $$ declare r json; begin
  delete from daraja.point_events where (kind in ('avis', 'vente') and status = 'pending') or (kind = 'cadeau' and not delivered);
  insert into daraja.point_events(staff_id, kind, amount, note, status) values
    ('00000000-0000-0000-0000-0000000000b1', 'avis', 100, 'Google Baro', 'pending'),
    ('00000000-0000-0000-0000-0000000000b3', 'vente', 10, 'Tomatini', 'pending'),
    ('00000000-0000-0000-0000-0000000000a1', 'avis', 100, 'essai direction', 'pending');
  insert into daraja.point_events(staff_id, kind, amount, note, delivered) values ('00000000-0000-0000-0000-0000000000b3', 'cadeau', -500, 'Café', false);

  -- direction, Baromètre affiché : les demandes de Baromètre et de ZamaZama, jamais la sienne
  r := public.daraja_admin('t_sup', 'baro');
  assert json_array_length(r->'reviews') = 2, 'direction : 2 demandes (les deux établissements), ici ' || json_array_length(r->'reviews');
  assert exists (select 1 from json_array_elements(r->'reviews') x where x->>'note' = 'Tomatini' and x->>'venue_name' = 'ZamaZama'), 'nom de l''établissement sur la ligne';
  assert not exists (select 1 from json_array_elements(r->'reviews') x where x->>'note' = 'essai direction'), 'jamais les demandes du compte direction';
  assert json_array_length(r->'gifts') = 1, 'cadeau de ZamaZama visible depuis Baromètre';
  assert not exists (select 1 from json_array_elements(r->'staff') x where x->>'id' = '00000000-0000-0000-0000-0000000000b3'), 'l''équipe reste celle de l''établissement affiché';

  -- manager de Baromètre : seulement Baromètre
  r := public.daraja_admin('t_mgr', null);
  assert json_array_length(r->'reviews') = 1 and (r->'reviews'->0->>'note') = 'Google Baro', 'manager : son établissement seulement';
  assert json_array_length(r->'gifts') = 0, 'manager : pas le cadeau de l''autre établissement';

  -- la direction valide une demande de l'autre établissement depuis cette liste
  perform public.daraja_admin_review('t_sup', (select (x->>'id')::uuid from json_array_elements(public.daraja_admin('t_sup', 'baro')->'reviews') x where x->>'note' = 'Tomatini'), true);
  assert (select status from daraja.point_events where note = 'Tomatini') = 'ok', 'validée depuis la liste commune';
end $$;

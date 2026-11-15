-- Bonus « une fois par période », ponctualité du lundi, absence justifiée, tirage seulement mois terminé.
do $$ declare r jsonb; mon date; begin
  insert into daraja.point_events(staff_id, kind, amount, note) values
    ('00000000-0000-0000-0000-0000000000b1','bonus',50,'Anniversaire 2026'), ('00000000-0000-0000-0000-0000000000b1','bonus',50,'Anniversaire 2026');
  assert (select count(*) from daraja.point_events where staff_id = '00000000-0000-0000-0000-0000000000b1' and note = 'Anniversaire 2026') = 1, 'un bonus annuel ne doit tomber qu''une fois';
  mon := daraja.today() - (extract(isodow from daraja.today())::int - 1) - 7;
  assert pg_temp.raises(format($q$select public.daraja_admin_close_week('t_mgr','baro',%L)$q$, mon + 1)) like '%monday%', 'la semaine doit commencer un lundi';
  perform public.daraja_admin_attendance_set('t_mgr', jsonb_build_array(
    jsonb_build_object('staff','00000000-0000-0000-0000-0000000000b1','day', mon, 'late', 4),
    jsonb_build_object('staff','00000000-0000-0000-0000-0000000000b2','day', mon, 'status','absent'),
    jsonb_build_object('staff','00000000-0000-0000-0000-0000000000b2','day', mon + 1, 'late', 2)));
  r := public.daraja_admin_close_week('t_mgr','baro', mon)::jsonb;
  assert (r->>'n')::int = 1, 'seule la personne ponctuelle et sans absence doit avoir +25';
  perform public.daraja_admin_attendance_set('t_mgr', jsonb_build_array(jsonb_build_object('staff','00000000-0000-0000-0000-0000000000b2','day', mon, 'status','recup')));
  r := public.daraja_admin_close_week('t_mgr','baro', mon)::jsonb;
  assert (r->>'n')::int = 1, 'une absence justifiée (récup) ne doit plus bloquer le bonus';
  r := public.daraja_admin_close_week('t_mgr','baro', mon)::jsonb;
  assert (r->>'n')::int = 0, 'revalider la semaine ne doit pas redonner le bonus';
  assert pg_temp.raises($q$select public.daraja_admin_draw('t_mgr','baro', daraja.today(), 'Dîner')$q$) like '%month_not_over%', 'pas de tirage avant la fin du mois';
end $$;

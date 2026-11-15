-- Journal des erreurs : accepte même sans session, regroupe les doublons, réservé au super admin en lecture.
do $$ declare n int; begin
  perform public.daraja_log_error('t_am', 'Test erreur écran', 'écran', 'pile', 'iPhone');
  perform public.daraja_log_error('t_am', 'Test erreur écran', 'écran', 'pile', 'iPhone');
  select hits into n from daraja.client_errors where message = 'Test erreur écran' and staff_id = '00000000-0000-0000-0000-0000000000b1';
  assert n = 2, 'la même erreur dans l''heure doit être comptée, pas dupliquée';
  perform public.daraja_log_error('jeton-bidon', 'Test sans session', 'connexion', null, null);
  assert exists (select 1 from daraja.client_errors where message = 'Test sans session' and staff_id is null), 'une erreur sans session doit être notée';
  perform public.daraja_log_error(null, repeat('x', 5000), null, repeat('y', 9000), null);
  assert (select max(length(message)) from daraja.client_errors) <= 300, 'les messages trop longs doivent être coupés';
  assert pg_temp.raises($q$select public.daraja_admin_errors('t_mgr', 7)$q$) is not null, 'seul le super admin lit le journal';
  assert json_array_length(public.daraja_admin_errors('t_sup', 7)) >= 2, 'le super admin voit les erreurs';
  assert pg_temp.raises($q$set local role anon; select count(*) from daraja.client_errors$q$) is not null, 'le journal ne se lit pas en direct';
  reset role;
end $$;

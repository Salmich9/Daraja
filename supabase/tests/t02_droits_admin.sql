-- Droits : un manager ne touche qu'à son lieu, jamais à lui-même ni au super admin ; un équipier n'a aucun droit admin.
do $$ begin
  assert pg_temp.raises($q$select public.daraja_admin_points('t_mgr','00000000-0000-0000-0000-0000000000a2','bonus',100,'x')$q$) is not null, 'un manager ne doit pas se donner de points';
  assert pg_temp.raises($q$select public.daraja_admin_points('t_mgr','00000000-0000-0000-0000-0000000000a1','bonus',100,'x')$q$) is not null, 'un manager ne doit pas toucher au super admin';
  assert pg_temp.raises($q$select public.daraja_admin_points('t_mgr','00000000-0000-0000-0000-0000000000b3','bonus',100,'x')$q$) is not null, 'un manager ne doit pas toucher à un autre lieu';
  assert pg_temp.raises($q$select public.daraja_admin_points('t_mgr','00000000-0000-0000-0000-0000000000b1','bonus',5000,'x')$q$) is not null, 'un bonus doit être plafonné à 500';
  assert pg_temp.raises($q$select public.daraja_admin_points('t_mgr','00000000-0000-0000-0000-0000000000b1','bonus',100,'x')$q$) is null, 'un bonus normal doit passer';
  assert pg_temp.raises($q$select public.daraja_admin_points('t_am','00000000-0000-0000-0000-0000000000b2','bonus',100,'x')$q$) is not null, 'un équipier ne doit pas donner de points';
  assert pg_temp.raises($q$select public.daraja_admin('t_am', null)$q$) is not null, 'un équipier ne doit pas ouvrir l''admin';
  assert pg_temp.raises($q$select public.daraja_report('t_mgr','zz','week')$q$) is not null, 'un manager ne doit pas voir le rapport d''un autre lieu';
  assert pg_temp.raises($q$select public.daraja_admin_reset_pin('t_mgr','00000000-0000-0000-0000-0000000000a1')$q$) is not null, 'un manager ne doit pas changer le code du super admin';
  assert pg_temp.raises($q$select public.daraja_admin_rewards('t_mgr')$q$) is not null, 'le catalogue de cadeaux est réservé au super admin';
  assert pg_temp.raises($q$select public.daraja_test_quiz('t_mgr','baro','serveur',null)$q$) is not null, 'le mode test est réservé au super admin';
  assert pg_temp.raises($q$set local role anon; select count(*) from daraja.staff$q$) is not null, 'personne ne doit lire les tables en direct';
  reset role;
end $$;

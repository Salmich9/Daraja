-- Connexion : codes à 6 chiffres, migration des anciens codes à 4, sessions de 90 jours, déconnexion.
do $$ declare r jsonb; np text; begin
  r := public.daraja_login('663300')::jsonb;
  assert r ? 'token' and r->>'new_pin' is null, 'un code à 6 chiffres valide doit connecter';
  assert public.daraja_login('000000') is null, 'un mauvais code ne doit pas connecter';
  assert public.daraja_login('12a') is null, 'un code mal formé doit être refusé';
  r := public.daraja_login('4321')::jsonb;
  np := r->>'new_pin';
  assert np ~ '^[0-9]{6}$', 'un ancien code à 4 chiffres doit recevoir un nouveau code à 6 chiffres';
  assert public.daraja_login('4321') is null, 'l''ancien code à 4 chiffres ne doit plus marcher';
  assert public.daraja_login(np)::jsonb ? 'token', 'le nouveau code doit marcher';
  insert into daraja.sessions(token, staff_id, created_at) values ('t_old','00000000-0000-0000-0000-0000000000b2', now() - interval '91 days');
  assert pg_temp.raises($q$select public.daraja_me('t_old', null)$q$) like '%session%', 'une session de plus de 90 jours doit expirer';
  perform public.daraja_logout('t_ka');
  assert pg_temp.raises($q$select public.daraja_me('t_ka', null)$q$) like '%session%', 'après déconnexion, la session ne doit plus marcher';
  update daraja.staff set active = false where id = '00000000-0000-0000-0000-0000000000b3';
  assert pg_temp.raises($q$select public.daraja_me('t_zi', null)$q$) like '%session%', 'un équipier désactivé ne doit plus avoir accès';
end $$;

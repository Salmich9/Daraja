-- Ménage : les vieilles traces partent à chaque connexion réussie, les récentes restent.
do $$ declare r json; begin
  insert into daraja.login_fails(at) values (now() - interval '2 days'), (now());
  insert into daraja.sessions(token, staff_id, created_at) values ('t_vieux', '00000000-0000-0000-0000-0000000000b2', now() - interval '100 days');
  update daraja.sessions set revoked = true where token = 't_zi';
  insert into daraja.client_errors(message, last_at) values ('vieille erreur', now() - interval '100 days'), ('erreur récente', now());
  r := public.daraja_login('663300');
  assert r->>'token' is not null, 'la connexion doit marcher';
  assert not exists (select 1 from daraja.login_fails where at < now() - interval '1 day'), 'les vieux codes faux doivent partir';
  assert exists (select 1 from daraja.login_fails), 'les codes faux récents restent (blocage)';
  assert not exists (select 1 from daraja.sessions where token in ('t_vieux', 't_zi')), 'sessions expirées ou révoquées supprimées';
  assert exists (select 1 from daraja.sessions where token = 't_ka'), 'les sessions actives restent';
  assert not exists (select 1 from daraja.client_errors where message = 'vieille erreur'), 'erreurs de plus de 90 jours supprimées';
  assert exists (select 1 from daraja.client_errors where message = 'erreur récente'), 'erreurs récentes gardées';
  assert pg_temp.raises($q$set local role anon; select daraja.prune()$q$) is not null, 'le ménage ne se déclenche pas de l''extérieur';
  reset role;
  assert to_regclass('daraja.stories') is null and to_regproc('public.daraja_answer') is null, 'le code mort est parti';
end $$;

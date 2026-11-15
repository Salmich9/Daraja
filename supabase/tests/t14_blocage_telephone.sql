-- Blocage : seul le téléphone qui se trompe est bloqué, les autres se connectent normalement.
do $$ declare r json; i int; begin
  for i in 1..10 loop perform public.daraja_login('000000', 'tel-farceur'); end loop;
  r := public.daraja_login('663300', 'tel-farceur');
  assert (r->>'locked')::boolean and r->>'scope' = 'device', 'le téléphone fautif est bloqué, même avec le bon code';
  r := public.daraja_login('663300', 'tel-karim');
  assert r->>'token' is not null, 'les autres téléphones ne sont pas bloqués';
  insert into daraja.login_fails(device, at) select 'robot-' || g, now() from generate_series(1, 300) g;
  r := public.daraja_login('663300', 'tel-amina');
  assert r->>'scope' = 'all', 'filet de sécurité global contre une attaque automatisée';
end $$;

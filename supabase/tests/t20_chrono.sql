-- Chrono réglable : direction seulement, bornes respectées, appliqué aux questions
do $$ declare ok boolean := false; begin
  begin perform public.daraja_admin_set_timer('t_mgr', 'time', 10); exception when others then ok := true; end;
  assert ok, 'un manager ne peut pas changer le chrono';
  assert (public.daraja_admin_set_timer('t_sup', 'time', 10)->>'ok')::boolean, 'la direction change le chrono';
  assert daraja.q_limit('qcm') = 10, 'le chrono QCM est appliqué';
  assert (public.daraja_admin_set_timer('t_sup', 'time_long', 20)->>'ok')::boolean, 'la direction change le chrono long';
  assert daraja.q_limit('order') = 20, 'chrono long appliqué';
  assert (public.daraja_admin_set_timer('t_sup', 'time', 2)->>'error') = 'range', 'pas en dessous de 4 s';
  assert (public.daraja_admin_set_timer('t_sup', 'time', 30)->>'error') = 'range', 'pas au-dessus de 20 s';
  assert (public.daraja_admin_set_timer('t_sup', 'answer', 50)->>'error') = 'range', 'seuls les chronos sont réglables ici';
  assert (public.daraja_me('t_sup')->'rules'->>'time')::int = 10, 'les règles envoyées à l''appli suivent';
  perform public.daraja_admin_set_timer('t_sup', 'time', 6); perform public.daraja_admin_set_timer('t_sup', 'time_long', 15);
end $$;

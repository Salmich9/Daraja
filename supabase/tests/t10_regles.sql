-- Règles du jeu : une seule source, lue par le moteur et envoyée à l'écran avec le profil.
do $$ declare v json; begin
  v := public.daraja_me('t_am')->'rules';
  -- le chrono est réglé par la direction : on compare à la table, pas à une valeur figée
  assert (v->>'duel_win')::int = daraja.rv('duel_win') and (v->>'time')::int = daraja.rv('time') and (v->>'malus_rouge')::int = daraja.rv('malus_rouge'), 'valeurs servies à l''écran';
  assert daraja.q_limit('qcm') = daraja.rv('time') and daraja.q_limit('order') = daraja.rv('time_long'), 'le chrono lit les règles';
  update daraja.rule_values set val = 11 where key = 'time';
  assert daraja.q_limit('qcm') = 11, 'changer la règle change le moteur';
  assert (public.daraja_me('t_am')->'rules'->>'time')::int = 11, 'et l''écran';
  assert pg_temp.raises($q$set local role anon; select * from daraja.rule_values$q$) is not null, 'pas de lecture directe';
  reset role;
end $$;

-- Règles du jeu : une seule source, lue par le moteur et envoyée à l'écran avec le profil.
do $$ declare v json; begin
  v := public.daraja_me('t_am')->'rules';
  assert (v->>'duel_win')::int = 20 and (v->>'time')::int = 6 and (v->>'malus_rouge')::int = 300, 'valeurs servies à l''écran';
  assert daraja.q_limit('qcm') = 6 and daraja.q_limit('order') = 15, 'le chrono lit les règles';
  update daraja.rule_values set val = 8 where key = 'time';
  assert daraja.q_limit('qcm') = 8, 'changer la règle change le moteur';
  assert (public.daraja_me('t_am')->'rules'->>'time')::int = 8, 'et l''écran';
  assert pg_temp.raises($q$set local role anon; select * from daraja.rule_values$q$) is not null, 'pas de lecture directe';
  reset role;
end $$;

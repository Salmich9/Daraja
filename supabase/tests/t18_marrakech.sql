-- Catalogue Légendes et palmarès du F&B
do $$ begin
  assert (select count(*) from daraja.questions where cat = 'legendes' and active) >= 40, 'le catalogue Légendes est chargé';
  assert not exists (select 1 from daraja.questions where cat = 'legendes' and (answer_idx < 0 or answer_idx >= jsonb_array_length(options))), 'bonnes réponses valides';
  assert daraja.cat_label('legendes') = 'Légendes et palmarès du F&B' and daraja.is_enabled('baro', 'bar', 'cat:legendes'), 'thème nommé et activé';
end $$;

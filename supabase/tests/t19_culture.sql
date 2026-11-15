-- Catalogues de culture générale : escapades, vins et terroirs, artisanat, agenda
do $$ declare c text; begin
  foreach c in array array['escapades','terroirs','artisanat','agenda'] loop
    assert (select count(*) from daraja.questions where cat = c and active) >= 20, 'catalogue chargé : ' || c;
    assert daraja.cat_label(c) <> c, 'thème nommé : ' || c;
    assert daraja.is_enabled('baro', 'cuisine', 'cat:' || c), 'activé par défaut : ' || c;
  end loop;
  assert not exists (select 1 from daraja.questions where cat in ('escapades','terroirs','artisanat','agenda')
    and (answer_idx < 0 or answer_idx >= jsonb_array_length(options))), 'bonnes réponses valides';
end $$;

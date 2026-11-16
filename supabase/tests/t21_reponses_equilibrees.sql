-- Réponses équilibrées : la bonne réponse ne doit pas se deviner à sa longueur.
-- Règle : jamais plus de 1,25 fois la plus longue des mauvaises ; et sur l'ensemble, la bonne n'est la plus longue que rarement.
do $$ declare bad text; pct numeric; begin
  select string_agg(left(question, 60), ' | ') into bad from (
    select q.question, length(q.options->>q.answer_idx) g,
      (select max(length(o)) from jsonb_array_elements_text(q.options) with ordinality t(o, n) where n - 1 <> q.answer_idx) mx
    from daraja.questions q where q.active and q.kind in ('qcm', 'scene')) x
  where g > 1.25 * mx;
  assert bad is null, 'bonne réponse trop longue : ' || coalesce(bad, '');
  select avg((length(q.options->>q.answer_idx) >= (select max(length(o)) from jsonb_array_elements_text(q.options) o))::int) into pct
    from daraja.questions q where q.active and q.kind in ('qcm', 'scene');
  assert pct <= 0.40, 'trop souvent la plus longue : ' || round(pct * 100) || ' %';
end $$;

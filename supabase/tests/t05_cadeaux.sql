-- Cadeaux : solde suffisant, conditions et stock respectés.
do $$ declare rid uuid; r jsonb; begin
  r := public.daraja_admin_reward_save('t_sup', '{"name":"T cadeau","cost":100,"tier":"plaisir","stock":1,"conditions":{"min_days":20}}')::jsonb;
  rid := (r->>'id')::uuid;
  r := public.daraja_redeem('t_ka', rid)::jsonb;
  assert not (r->>'ok')::boolean, 'sans points, pas de cadeau';
  insert into daraja.point_events(staff_id, kind, amount, note) values ('00000000-0000-0000-0000-0000000000b2','bonus',500,'test');
  r := public.daraja_redeem('t_ka', rid)::jsonb;
  assert r->>'error' = 'conditions', 'une condition non remplie doit bloquer le cadeau';
  perform public.daraja_admin_reward_save('t_sup', jsonb_build_object('id', rid, 'name','T cadeau','cost',100,'stock',1,'conditions','{}'::jsonb));
  r := public.daraja_redeem('t_ka', rid)::jsonb;
  assert (r->>'ok')::boolean, 'conditions remplies et points suffisants : le cadeau passe';
  assert daraja.balance('00000000-0000-0000-0000-0000000000b2') = 400, 'le prix doit être retiré du solde';
  r := public.daraja_redeem('t_ka', rid)::jsonb;
  assert not (r->>'ok')::boolean, 'stock épuisé : plus de cadeau';
end $$;

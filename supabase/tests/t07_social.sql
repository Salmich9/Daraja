-- Vote, employé du mois, anniversaires, avatars uniques.
do $$ begin
  assert public.daraja_vote('t_am','00000000-0000-0000-0000-0000000000b1')::jsonb->>'error' = 'candidate', 'on ne vote pas pour soi';
  assert public.daraja_vote('t_am','00000000-0000-0000-0000-0000000000b3')::jsonb->>'error' = 'candidate', 'on ne vote pas pour un autre lieu';
  assert (public.daraja_vote('t_am','00000000-0000-0000-0000-0000000000b2')::jsonb->>'ok')::boolean, 'vote valide';
  insert into daraja.votes(month, voter, candidate, venue, at) values
    (to_char(daraja.today() - interval '1 month','YYYY-MM'),'00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','baro', now() - interval '20 days');
  perform public.daraja_eotm('t_am', null); perform public.daraja_eotm('t_ka', null);
  assert (select count(*) from daraja.point_events where note like 'Employé du mois%' and staff_id = '00000000-0000-0000-0000-0000000000b2') = 1, 'l''employé du mois reçoit +100 une seule fois';
  assert (public.daraja_admin_set_birthday('t_mgr','00000000-0000-0000-0000-0000000000b1','02-30')::jsonb->>'ok')::boolean = false, 'le 30 février doit être refusé';
  perform public.daraja_admin_set_birthday('t_mgr','00000000-0000-0000-0000-0000000000b1', to_char(daraja.today(),'MM-DD'));
  perform public.daraja_birthdays('t_ka', null); perform public.daraja_birthdays('t_am', null);
  assert (select count(*) from daraja.point_events where note like 'Anniversaire%' and staff_id = '00000000-0000-0000-0000-0000000000b1') = 1, 'anniversaire : +50 une seule fois';
  assert (public.daraja_set_profile('t_am', null, 'bottts:Ztest99')::jsonb->>'ok')::boolean, 'choix d''un avatar libre';
  assert public.daraja_set_profile('t_ka', null, 'bottts:Ztest99')::jsonb->>'error' = 'taken', 'un avatar pris n''est plus disponible';
end $$;

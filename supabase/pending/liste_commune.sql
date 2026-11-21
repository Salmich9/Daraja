-- Admin › Équipe pour la direction : avis, ventes et cadeaux à traiter des deux établissements dans une seule liste,
-- avec l'établissement sur chaque ligne (l'alerte « À valider » compte les deux : tout ce qu'elle compte est ici).
-- Un manager ne voit toujours que son établissement. L'équipe affichée reste celle de l'établissement choisi.
CREATE OR REPLACE FUNCTION public.daraja_admin(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'extensions', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token); v := daraja.can_admin(s, p_venue);
  return json_build_object(
    'reviews', (select coalesce(json_agg(json_build_object('id', e.id, 'name', o.name, 'note', e.note, 'kind', e.kind, 'amount', e.amount,
        'venue', o.venue, 'venue_name', (select name from daraja.venues where id = o.venue)) order by e.created_at), '[]'::json)
      from daraja.point_events e join daraja.staff o on o.id = e.staff_id
      where (o.venue = v or (s.role = 'super' and o.venue is not null)) and e.kind in ('avis', 'vente') and e.status = 'pending'),
    'gifts', (select coalesce(json_agg(json_build_object('id', e.id, 'name', o.name, 'note', e.note,
        'venue', o.venue, 'venue_name', (select name from daraja.venues where id = o.venue)) order by e.created_at), '[]'::json)
      from daraja.point_events e join daraja.staff o on o.id = e.staff_id
      where (o.venue = v or (s.role = 'super' and o.venue is not null)) and e.kind = 'cadeau' and not e.delivered),
    'staff', (select coalesce(json_agg(json_build_object('id', o.id, 'name', o.name, 'alias', o.alias, 'avatar', o.avatar, 'role', o.role,
        'post', o.post, 'post_label', p.label, 'family', daraja.family(o), 'phone', o.phone, 'birthday', o.birthday, 'points', daraja.balance(o.id),
        'mission_done', exists(select 1 from daraja.mission_done m where m.staff_id = o.id and m.week = daraja.week_start())) order by o.name), '[]'::json)
      from daraja.staff o left join daraja.posts p on p.id = o.post where o.venue = v and o.active and o.role <> 'super'));
end $function$;

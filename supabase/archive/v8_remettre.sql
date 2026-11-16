-- Remettre une fiche retirée par erreur : managers (leur établissement) et direction.
CREATE OR REPLACE FUNCTION public.daraja_fiches(p_token text, p_venue text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  v := case when s.role = 'super' then coalesce(p_venue, 'baro') else s.venue end;
  return json_build_object('venue', v, 'can_edit', s.role in ('admin', 'super'),
    'items', (select coalesce(json_agg(json_build_object('id', f.id, 'section', f.section, 'title', f.title, 'story', f.story,
        'cocktail', f.cocktail, 'wine', f.wine, 'why', f.why, 'pitch', f.pitch, 'sort', f.sort)
        order by case f.section when 'entree' then 1 when 'plat' then 2 when 'dessert' then 3 else 4 end, f.sort, f.title), '[]'::json)
      from daraja.fiches f where f.venue = v and f.active),
    -- fiches retirées : visibles des managers et de la direction seulement, pour pouvoir les remettre
    'retired', case when s.role in ('admin', 'super') then (select coalesce(json_agg(json_build_object('id', f.id, 'title', f.title, 'section', f.section, 'at', f.updated_at)
        order by f.updated_at desc), '[]'::json) from daraja.fiches f where f.venue = v and not f.active) else '[]'::json end);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_fiche_restore(p_token text, p_fiche uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; v text;
begin
  s := daraja.who(p_token);
  select venue into v from daraja.fiches where id = p_fiche and not active;
  if v is null then return json_build_object('ok', false); end if;
  perform daraja.can_admin(s, v);
  update daraja.fiches set active = true, updated_by = s.id, updated_at = now() where id = p_fiche;
  perform daraja.fiche_sync(f.id) from daraja.fiches f where f.venue = v;
  return json_build_object('ok', true);
end $function$;
revoke execute on function public.daraja_fiche_restore(text, uuid) from public, authenticated;
grant execute on function public.daraja_fiche_restore(text, uuid) to anon;

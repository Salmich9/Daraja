-- Paramètres direction : charte de conduite modifiable (intitulé, ligne, malus par règle, ajout, retrait)
-- et cadeaux supprimables (supprimé pour de bon s'il n'a jamais été pris, sinon rangé dans « Supprimés »).
alter table daraja.conduct_rules add column if not exists malus integer;
alter table daraja.conduct_rules drop constraint if exists conduct_rules_malus_check;
alter table daraja.conduct_rules add constraint conduct_rules_malus_check CHECK (malus is null or malus between 0 and 5000);
alter table daraja.rewards add column if not exists archived boolean not null default false;

CREATE OR REPLACE FUNCTION daraja.conduct_compute(p_staff uuid, p_rule integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare r daraja.conduct_rules; occ int; eff text; sanc text; esc text; n_grise int; n_rouge int; ladder text[]; lad text; malus int;
begin
  select * into r from daraja.conduct_rules where id = p_rule;
  if r.id is null then raise exception 'rule'; end if;
  ladder := array['Avertissement écrit','Blâme','Deuxième blâme ou mise à pied (8 jours max)','Troisième blâme ou mutation','Licenciement'];

  select count(*) + 1 into occ from daraja.conduct_records c
   where c.staff_id = p_staff and c.rule_id = p_rule
     and c.occurred_at > now() - case r.line when 'blanche' then interval '30 days' when 'grise' then interval '60 days' else interval '365 days' end;

  if r.grave then
    eff := 'rouge'; sanc := 'Faute grave (licenciement)';
  elsif r.line = 'blanche' then
    if occ >= 4 then eff := 'rouge'; sanc := daraja.strip_line(r.recid2); esc := occ || 'e blanche identique en 30 jours';
    elsif occ = 3 then eff := 'grise'; sanc := daraja.strip_line(r.recid1); esc := '3e blanche identique en 30 jours';
    else eff := 'blanche'; sanc := r.base_sanction; end if;
  elsif r.line = 'grise' then
    if occ >= 3 then eff := 'rouge'; sanc := daraja.strip_line(r.recid2); esc := occ || 'e fois en 60 jours';
    elsif occ = 2 then eff := 'rouge'; sanc := daraja.strip_line(r.recid1); esc := '2e fois en 60 jours';
    else eff := 'grise'; sanc := r.base_sanction; end if;
  else
    eff := 'rouge';
    if occ >= 3 then sanc := daraja.strip_line(r.recid2); esc := occ || 'e fois en 12 mois';
    elsif occ = 2 then sanc := daraja.strip_line(r.recid1); esc := '2e fois en 12 mois';
    else sanc := r.base_sanction; end if;
    if sanc ilike 'Sans objet%' then sanc := 'Licenciement'; end if;
  end if;

  if eff = 'grise' then
    select count(*) into n_grise from daraja.conduct_records c
     where c.staff_id = p_staff and c.line = 'grise' and c.occurred_at > now() - interval '60 days';
    if n_grise >= 1 then
      eff := 'rouge'; sanc := 'Avertissement écrit';
      esc := coalesce(esc || ' · ', '') || '2e grise en 60 jours';
    end if;
  end if;

  if eff = 'rouge' and not r.grave then
    select count(*) into n_rouge from daraja.conduct_records c
     where c.staff_id = p_staff and c.line = 'rouge' and c.occurred_at > now() - interval '365 days';
    lad := ladder[least(n_rouge + 1, 5)];
    if daraja.sanction_rank(lad) > daraja.sanction_rank(sanc) then
      sanc := lad;
      esc := coalesce(esc || ' · ', '') || (n_rouge + 1) || 'e rouge en 12 mois';
    end if;
  end if;

  malus := case when r.grave then daraja.rv('malus_grave') when eff = 'rouge' then daraja.rv('malus_rouge') when eff = 'grise' then daraja.rv('malus_grise') else daraja.rv('malus_blanche') end;
  -- malus propre à la règle (réglé par la direction) : il s'applique à sa ligne ; en cas d'aggravation, jamais moins que celui de la nouvelle ligne
  if r.malus is not null then
    malus := case when r.grave or eff = r.line then r.malus else greatest(r.malus, malus) end;
  end if;
  return json_build_object('rule_id', r.id, 'base_line', r.line, 'line', eff, 'occurrence', occ, 'sanction', sanc,
    'escalation', esc, 'malus', malus, 'grave', r.grave, 'behavior', r.behavior, 'domain', r.domain,
    'direction', (r.direction_only or eff = 'rouge'));
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_admin_charter(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  return json_build_object(
    'defaults', json_build_object('blanche', daraja.rv('malus_blanche'), 'grise', daraja.rv('malus_grise'), 'rouge', daraja.rv('malus_rouge'), 'grave', daraja.rv('malus_grave')),
    'rules', (select coalesce(json_agg(json_build_object('id', r.id, 'line', r.line, 'domain', r.domain, 'behavior', r.behavior,
        'base_sanction', r.base_sanction, 'recid1', r.recid1, 'recid2', r.recid2, 'malus', r.malus, 'grave', r.grave,
        'direction_only', r.direction_only, 'active', r.active, 'sort', r.sort,
        'used', (select count(*) from daraja.conduct_records c where c.rule_id = r.id))
      order by case r.line when 'blanche' then 1 when 'grise' then 2 else 3 end, r.sort, r.id), '[]'::json) from daraja.conduct_rules r));
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_admin_rule_save(p_token text, p jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff; rid int; ln text := p->>'line'; beh text := left(trim(coalesce(p->>'behavior', '')), 200);
  dom text := left(trim(coalesce(p->>'domain', '')), 60); m int := nullif(p->>'malus', '')::int;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  if ln not in ('blanche', 'grise', 'rouge') then return json_build_object('ok', false, 'error', 'line'); end if;
  if length(beh) < 3 then return json_build_object('ok', false, 'error', 'behavior'); end if;
  if dom = '' then dom := 'Général'; end if;
  if m is not null and m not between 0 and 5000 then return json_build_object('ok', false, 'error', 'malus'); end if;
  rid := nullif(p->>'id', '')::int;
  if rid is null then
    insert into daraja.conduct_rules(sort, line, domain, behavior, base_sanction, recid1, recid2, malus, grave, direction_only, active)
      values ((select coalesce(max(sort), 0) + 10 from daraja.conduct_rules), ln, dom, beh,
        coalesce(nullif(trim(p->>'base_sanction'), ''), case ln when 'blanche' then 'Rappel à l''ordre' when 'grise' then 'Avertissement oral' else 'Avertissement écrit' end),
        nullif(trim(p->>'recid1'), ''), nullif(trim(p->>'recid2'), ''), m,
        coalesce((p->>'grave')::boolean, false), coalesce((p->>'direction_only')::boolean, false), true)
      returning id into rid;
  else
    update daraja.conduct_rules set line = ln, domain = dom, behavior = beh,
      base_sanction = coalesce(nullif(trim(p->>'base_sanction'), ''), base_sanction),
      recid1 = nullif(trim(p->>'recid1'), ''), recid2 = nullif(trim(p->>'recid2'), ''), malus = m,
      grave = coalesce((p->>'grave')::boolean, grave), direction_only = coalesce((p->>'direction_only')::boolean, direction_only)
      where id = rid;
    if not found then return json_build_object('ok', false, 'error', 'rule'); end if;
  end if;
  return json_build_object('ok', true, 'id', rid);
end $function$;

-- Retirer une règle : supprimée si jamais utilisée, sinon rangée (l'historique du registre reste intact).
CREATE OR REPLACE FUNCTION public.daraja_admin_rule_delete(p_token text, p_rule integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  if exists (select 1 from daraja.conduct_records where rule_id = p_rule) then
    update daraja.conduct_rules set active = false where id = p_rule;
    return json_build_object('ok', true, 'archived', true);
  end if;
  delete from daraja.conduct_rules where id = p_rule;
  return json_build_object('ok', true, 'archived', false);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_admin_rule_restore(p_token text, p_rule integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  update daraja.conduct_rules set active = true where id = p_rule;
  return json_build_object('ok', found);
end $function$;

-- Malus par défaut d'une ligne (utilisé par les règles sans malus propre).
CREATE OR REPLACE FUNCTION public.daraja_admin_line_malus(p_token text, p_line text, p_val integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  if p_line not in ('blanche', 'grise', 'rouge', 'grave') or p_val not between 0 and 5000 then return json_build_object('ok', false); end if;
  insert into daraja.rule_values(key, val) values ('malus_' || p_line, p_val) on conflict (key) do update set val = excluded.val;
  return json_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_admin_rewards(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  return (select coalesce(json_agg(json_build_object('id', id, 'venue', venue, 'name', name, 'icon', icon, 'cost', cost,
      'tier', tier, 'active', active, 'archived', archived, 'library', library, 'stock', stock, 'conditions', conditions,
      'claimed', (select count(*) from daraja.point_events e where e.reward_id = r.id))
      order by active desc, cost), '[]'::json) from daraja.rewards r);
end $function$;

-- Supprimer un cadeau : pour de bon s'il n'a jamais été pris, sinon rangé (les cadeaux déjà gagnés restent dans l'historique).
CREATE OR REPLACE FUNCTION public.daraja_admin_reward_delete(p_token text, p_reward uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  if exists (select 1 from daraja.point_events where reward_id = p_reward) then
    update daraja.rewards set active = false, archived = true where id = p_reward;
    return json_build_object('ok', true, 'archived', true);
  end if;
  delete from daraja.rewards where id = p_reward;
  return json_build_object('ok', true, 'archived', false);
end $function$;

CREATE OR REPLACE FUNCTION public.daraja_admin_reward_restore(p_token text, p_reward uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare s daraja.staff;
begin
  s := daraja.who(p_token);
  if s.role <> 'super' then raise exception 'forbidden'; end if;
  update daraja.rewards set archived = false where id = p_reward;
  return json_build_object('ok', found);
end $function$;

revoke execute on function public.daraja_admin_charter(text), public.daraja_admin_rule_save(text, jsonb), public.daraja_admin_rule_delete(text, integer),
  public.daraja_admin_rule_restore(text, integer), public.daraja_admin_line_malus(text, text, integer),
  public.daraja_admin_reward_delete(text, uuid), public.daraja_admin_reward_restore(text, uuid) from public, authenticated;
grant execute on function public.daraja_admin_charter(text), public.daraja_admin_rule_save(text, jsonb), public.daraja_admin_rule_delete(text, integer),
  public.daraja_admin_rule_restore(text, integer), public.daraja_admin_line_malus(text, text, integer),
  public.daraja_admin_reward_delete(text, uuid), public.daraja_admin_reward_restore(text, uuid) to anon;

-- La charte affichée à l'équipe montre le malus propre à chaque règle.
CREATE OR REPLACE FUNCTION public.daraja_rulebook(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
begin
  perform daraja.who(p_token);
  return (select coalesce(json_agg(json_build_object('line', line, 'domain', domain, 'behavior', behavior, 'sanction', base_sanction,
      'recid1', recid1, 'recid2', recid2, 'grave', grave,
      'malus', coalesce(malus, case when grave then daraja.rv('malus_grave') when line = 'rouge' then daraja.rv('malus_rouge') when line = 'grise' then daraja.rv('malus_grise') else daraja.rv('malus_blanche') end)) order by sort), '[]'::json)
    from daraja.conduct_rules where active);
end $function$;

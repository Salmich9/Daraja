-- Alertes « À valider » : ne compter que ce qu'un écran affiche. Les demandes d'un compte sans établissement
-- (direction) n'apparaissent dans aucune liste d'Admin : elles ne déclenchent plus d'alerte.
-- (Le bouton « Un client m'a cité dans un avis » est aussi masqué pour la direction.)
CREATE OR REPLACE FUNCTION daraja.push_candidates(p_now timestamp with time zone)
 RETURNS TABLE(staff_id uuid, family text, ref text, tag text, title text, body text, url text, prio integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'daraja', 'public'
AS $function$
declare cfg jsonb := daraja.push_cfg(); d date := (p_now at time zone 'Africa/Casablanca')::date;
  h int := extract(hour from p_now at time zone 'Africa/Casablanca'); m date := date_trunc('month', d)::date;
begin
  return query
  with subs as (select ps.staff_id sid, min(ps.created_at) since from daraja.push_subscriptions ps group by ps.staff_id),
  ppl as (select st.*, subs.since from daraja.staff st join subs on subs.sid = st.id where st.active
          and (cfg->>'mode' = 'all' or (cfg->>'mode' = 'direction' and st.role = 'super'))),
  played as (select q.staff_id from daraja.quiz_sessions q where q.day = d and cardinality(q.answered) >= cardinality(q.question_ids)),
  serie as (select p.id from ppl p where p.role = 'staff' and p.streak >= 2 and p.last_quiz_day = d - 1
            and h >= (cfg->>'serie_hour')::int and p.id not in (select played.staff_id from played))
  select p.id, 'serie', 'serie:' || d, 'quiz', 'Ta série : ' || p.streak || ' jours 🔥', 'Un défi ce soir et elle continue.', '/?go=quiz', 1
    from ppl p where p.id in (select serie.id from serie)
  union all
  select p.id, 'quiz', 'quiz:' || d, 'quiz', 'Ton défi du jour t''attend', '5 questions, 2 minutes. À toi de jouer !', '/?go=quiz', 2
    from ppl p where p.role = 'staff' and h >= coalesce((cfg->>'quiz_hour')::int, 12) and p.id not in (select played.staff_id from played) and p.id not in (select serie.id from serie)
  union all
  select du.opponent, 'defi', 'duel:' || du.id, 'duel-' || du.id, 'Nouveau défi ⚔️', daraja.push_alias(du.challenger) || ' te lance un duel.', '/?go=duels', 1
    from daraja.duels du join ppl p on p.id = du.opponent and p.venue = du.venue
    where du.status = 'pending' and du.created_at > greatest(p.since, p_now - interval '24 hours')
  union all
  select p.id, 'defi', 'rank:' || m || ':' || daraja.push_month_rank(p.id), 'rang', 'On t''a dépassé 📈',
         'Tu es ' || daraja.push_month_rank(p.id) || 'e ce mois-ci. Reprends ta place !', '/?go=board', 2
    from ppl p join daraja.push_rank r on r.staff_id = p.id and r.month = m
    where p.role = 'staff' and daraja.push_month_rank(p.id) > r.rank
  union all
  select e.staff_id, 'cadeaux', 'pe:' || e.id,
    case when e.kind = 'malus' then 'message' else 'points' end,
    case when e.kind = 'cadeau' then 'Ton cadeau est prêt 🎁' when e.kind = 'avis' then 'Ton avis est validé ⭐' when e.kind = 'vente' then 'Ta vente est validée 🎯'
         when e.kind = 'malus' then 'Un message t''attend' else 'Bonus du mois 🎉' end,
    case when e.kind = 'cadeau' then 'Passe le récupérer auprès de ton manager.' when e.kind in ('avis', 'vente') then 'Bravo ! Tes points sont crédités.'
         when e.kind = 'malus' then 'Ton manager t''a laissé un message.' else 'Un mois exemplaire, bravo !' end,
    case when e.kind = 'malus' then '/?go=profile' else '/?go=shop' end, 2
    from daraja.point_events e join ppl p on p.id = e.staff_id
    where e.created_at > greatest(p.since, p_now - interval '7 days') and (
      (e.kind = 'cadeau' and e.delivered) or (e.kind in ('avis', 'vente') and e.status = 'ok') or e.kind = 'malus'
      or (e.kind = 'bonus' and e.note like 'Mois exemplaire %'))
  union all
  select p.id, 'alertes', 'alertes:' || d, 'alertes', 'À valider 📋', n || ' demande' || case when n > 1 then 's attendent' else ' attend' end || ' ta validation.', '/?go=admin', 2
    from ppl p cross join lateral (
      select (select count(*) from daraja.point_events e join daraja.staff o on o.id = e.staff_id
               where o.venue is not null and (p.role = 'super' or o.venue = p.venue)
                 and ((e.kind in ('avis', 'vente') and e.status = 'pending') or (e.kind = 'cadeau' and not e.delivered)))
           + case when p.role = 'super' then (select count(*) from daraja.conduct_records where needs_direction) else 0 end n) x
    where p.role in ('admin', 'super') and x.n > 0;
end $function$;

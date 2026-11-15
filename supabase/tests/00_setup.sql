-- Jeu de test commun : un super admin, un manager Baromètre, un manager Zama, trois équipiers.
-- Chaque test l'appelle, puis tout est annulé (rollback) : rien ne reste en base.
insert into daraja.venues(id, name) values ('baro','Baromètre'), ('zz','ZamaZama') on conflict do nothing;
insert into daraja.staff(id, venue, name, pin_hash, pin_len, role, post) values
 ('00000000-0000-0000-0000-0000000000a1', null,  'T Super', extensions.crypt('482019', extensions.gen_salt('bf')), 6, 'super', null),
 ('00000000-0000-0000-0000-0000000000a2', 'baro','T Mgr',   extensions.crypt('911204', extensions.gen_salt('bf')), 6, 'admin', null),
 ('00000000-0000-0000-0000-0000000000a3', 'zz',  'T MgrZ',  extensions.crypt('730551', extensions.gen_salt('bf')), 6, 'admin', null),
 ('00000000-0000-0000-0000-0000000000b1', 'baro','T Amina', extensions.crypt('4321',   extensions.gen_salt('bf')), 4, 'staff', 'serveur'),
 ('00000000-0000-0000-0000-0000000000b2', 'baro','T Karim', extensions.crypt('663300', extensions.gen_salt('bf')), 6, 'staff', 'bartender'),
 ('00000000-0000-0000-0000-0000000000b3', 'zz',  'T Zina',  extensions.crypt('551177', extensions.gen_salt('bf')), 6, 'staff', 'hotesse');
insert into daraja.sessions(token, staff_id) values
 ('t_sup','00000000-0000-0000-0000-0000000000a1'), ('t_mgr','00000000-0000-0000-0000-0000000000a2'),
 ('t_mgrz','00000000-0000-0000-0000-0000000000a3'), ('t_am','00000000-0000-0000-0000-0000000000b1'),
 ('t_ka','00000000-0000-0000-0000-0000000000b2'), ('t_zi','00000000-0000-0000-0000-0000000000b3');
create or replace function pg_temp.raises(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;

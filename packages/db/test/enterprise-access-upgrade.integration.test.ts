/** Exact fresh/upgrade/catalogue proof for CI. No predecessor routine, table shape, row or privilege may change. */
import { afterAll, expect, it } from 'vitest';
import { createScimHarness, fixture, person, canonicalRows, type ScimHarness } from './scim-fixtures.js';
import { migrate } from '../src/migrate.js';
import { predecessorCatalogue } from './contractor-entitlement-fixtures.js';
let h:ScimHarness|undefined;
afterAll(async()=>{await h?.close();});
it('0950/0951 preserve populated identity state, installed routines and old ACLs; new capabilities start empty and default OFF',async()=>{
 h=await createScimHarness('ent10-rest-upgrade-','0950_emergency_dual_owner.sql');
 const f=await fixture(h);await person(f,'finance');
 const tables=['identity.session','identity.sso_subject','identity.sso_emergency_window','identity.sso_required_event','app.membership','app.role_grant'];
 const before=await Promise.all(tables.map(t=>canonicalRows(h!,t))),catalogue=await predecessorCatalogue(h.admin);
 await migrate(h.admin);await migrate(h.admin);
 expect(await Promise.all(tables.map(t=>canonicalRows(h!,t)))).toEqual(before);
 const after=await predecessorCatalogue(h.admin);
 for(const key of ['relations','routines','policies'] as const)for(const row of catalogue[key])expect(after[key]).toContainEqual(row);
 for(const table of ['emergency_request','emergency_approval','emergency_session','emergency_action','scim2_binding','scim2_resource','scim2_receipt']) {
  expect(await canonicalRows(h,'identity.'+table)).toEqual([]);
  expect((await h.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",['identity.'+table])).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration'});
  expect((await h.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT,INSERT,UPDATE,DELETE') allowed",['identity.'+table])).rows[0].allowed).toBe(false);
 }
 expect((await h.admin.query("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_scim'")).rows[0]).toEqual({rolcanlogin:false,rolsuper:false,rolbypassrls:false});
},120000);

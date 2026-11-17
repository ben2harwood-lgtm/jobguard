# ENT-10e six gate/view read replacements

Source-inspected: each routine starts from 0129 text and differs solely in the one read below. Signatures, declarations, all other statements, owner and ACL are preserved. Aggregated reads coalesce a missing/null result to required; the view fills its existing typed row. The separate emergency-use replacement is specified in migration 0143 and the contract.

## identity.sso_session_memberships

Before:
```sql
SELECT e.required INTO needed FROM identity.sso_required_event e WHERE e.tenant_id=member.tenant_id ORDER BY e.revision DESC LIMIT 1;
```
After:
```sql
SELECT coalesce(bool_or(e.required),true) INTO needed FROM identity.sso_required_state(member.tenant_id) e;
```

## identity.sso_code_signin_allowed

Before:
```sql
SELECT e.required,e.connection_id INTO needed,c FROM identity.sso_required_event e WHERE e.tenant_id=member.tenant_id ORDER BY e.revision DESC LIMIT 1;
```
After:
```sql
SELECT coalesce(bool_or(e.required),true),(array_agg(e.connection_id))[1] INTO needed,c FROM identity.sso_required_state(member.tenant_id) e;
```

## identity.sso_invitation_accept_allowed

Before:
```sql
SELECT e.required,e.connection_id INTO needed,c FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
```
After:
```sql
SELECT coalesce(bool_or(e.required),true),(array_agg(e.connection_id))[1] INTO needed,c FROM identity.sso_required_state(t) e;
```

## identity.sso_invite_member

Before:
```sql
SELECT e.required,e.connection_id INTO needed,c FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
```
After:
```sql
SELECT coalesce(bool_or(e.required),true),(array_agg(e.connection_id))[1] INTO needed,c FROM identity.sso_required_state(t) e;
```

## identity.sso_required_refusal_target

Before:
```sql
SELECT e.connection_id INTO c FROM identity.sso_required_event e WHERE e.tenant_id=t AND
    e.revision=(SELECT max(x.revision) FROM identity.sso_required_event x WHERE x.tenant_id=t) AND e.required;
```
After:
```sql
SELECT e.connection_id INTO c FROM identity.sso_required_state(t) e WHERE e.required IS NOT FALSE;
```

## identity.sso_required_view

Before:
```sql
SELECT * INTO event FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
```
After:
```sql
SELECT t,(array_agg(e.event_id))[1],coalesce(max(e.revision),0),coalesce(bool_or(e.required),true),
  (array_agg(e.connection_id))[1],NULL::uuid,(array_agg(e.actor_kind))[1],NULL::text,NULL::timestamptz
  INTO event FROM identity.sso_required_state(t) e;
```


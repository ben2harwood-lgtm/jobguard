BEGIN;
-- All runtime access uses dark_ais, which checks the company actor and connection owner.
REVOKE SELECT ON app.ais_connection FROM jobguard_runtime;
REVOKE SELECT ON app.ais_lifecycle FROM jobguard_runtime;
REVOKE SELECT ON app.ais_observation FROM jobguard_runtime;
REVOKE SELECT ON app.ais_page FROM jobguard_runtime;
COMMIT;

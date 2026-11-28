BEGIN;

-- Keep the database's independent artifact check aligned with the shared TS
-- serializer. Existing TAB/CR/apostrophe protection is preserved; spaces before
-- formula starters are now protected too. No stored artifacts are rewritten.
CREATE OR REPLACE FUNCTION app.cb_csv_cell(v text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT '"'||replace(CASE
  WHEN left(v,1)=ANY(ARRAY['=','+','-','@',chr(39),chr(9),chr(13)])
    OR ltrim(v,' '||chr(9)||chr(13)) ~ '^[=+@-]'
  THEN chr(39)||v ELSE v END,'"','""')||'"'
$$;

COMMIT;

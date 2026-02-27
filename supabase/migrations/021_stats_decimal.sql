-- Stats et stabilité en décimal (ex. 7,98) pour prendre en compte les petits changements.

-- countries (contraintes CHECK conservées, compatibles avec numeric)
ALTER TABLE public.countries
  ALTER COLUMN militarism TYPE numeric(4, 2) USING militarism::numeric(4, 2),
  ALTER COLUMN industry TYPE numeric(4, 2) USING industry::numeric(4, 2),
  ALTER COLUMN science TYPE numeric(4, 2) USING science::numeric(4, 2),
  ALTER COLUMN stability TYPE numeric(4, 2) USING stability::numeric(4, 2);

-- country_history
ALTER TABLE public.country_history
  ALTER COLUMN militarism TYPE numeric(4, 2) USING militarism::numeric(4, 2),
  ALTER COLUMN industry TYPE numeric(4, 2) USING industry::numeric(4, 2),
  ALTER COLUMN science TYPE numeric(4, 2) USING science::numeric(4, 2),
  ALTER COLUMN stability TYPE numeric(4, 2) USING stability::numeric(4, 2);

-- country_update_logs
ALTER TABLE public.country_update_logs
  ALTER COLUMN militarism_before TYPE numeric(4, 2) USING militarism_before::numeric(4, 2),
  ALTER COLUMN industry_before TYPE numeric(4, 2) USING industry_before::numeric(4, 2),
  ALTER COLUMN science_before TYPE numeric(4, 2) USING science_before::numeric(4, 2),
  ALTER COLUMN stability_before TYPE numeric(4, 2) USING stability_before::numeric(4, 2),
  ALTER COLUMN militarism_after TYPE numeric(4, 2) USING militarism_after::numeric(4, 2),
  ALTER COLUMN industry_after TYPE numeric(4, 2) USING industry_after::numeric(4, 2),
  ALTER COLUMN science_after TYPE numeric(4, 2) USING science_after::numeric(4, 2),
  ALTER COLUMN stability_after TYPE numeric(4, 2) USING stability_after::numeric(4, 2);

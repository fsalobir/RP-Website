-- Mettre tous les pays au centre exact du triangle idéologique (33,33 / 33,33 / 33,34).

UPDATE public.countries
SET
  ideology_monarchism = 33.3333,
  ideology_republicanism = 33.3333,
  ideology_cultism = 33.3334,
  ideology_drift_monarchism = 0,
  ideology_drift_republicanism = 0,
  ideology_drift_cultism = 0,
  ideology_breakdown = '{}'::jsonb;

-- Serveur Discord de test : lecture des huit salons RP régionaux et publication
-- dans les quatre salons internationaux. #general reste le dernier recours.

UPDATE public.discord_rp_channels
SET
  guild_id = '1478736127497207831',
  ingest_enabled = true,
  publish_enabled = channel_kind = 'international',
  webhook_secret_name = CASE channel_id
    WHEN '1478862041367187486' THEN 'DISCORD_WEBHOOK_FON_AFRICA_INTL'
    WHEN '1478862103459926210' THEN 'DISCORD_WEBHOOK_FON_EUROPE_INTL'
    WHEN '1478862526946213919' THEN 'DISCORD_WEBHOOK_FON_AMERICA_INTL'
    WHEN '1478862593094324396' THEN 'DISCORD_WEBHOOK_FON_ASIA_INTL'
    ELSE NULL
  END,
  sync_error = NULL
WHERE channel_id IN (
  '1478736877136642163',
  '1478862041367187486',
  '1478862073520984204',
  '1478862103459926210',
  '1478862495492866108',
  '1478862526946213919',
  '1478862569321267352',
  '1478862593094324396'
);

INSERT INTO public.discord_rp_channels (
  label,
  guild_id,
  channel_id,
  ingest_enabled,
  publish_enabled,
  route_scope,
  channel_kind,
  source_authority,
  priority,
  webhook_secret_name
)
SELECT
  'Général — secours',
  '1478736127497207831',
  '1478736128466096254',
  false,
  true,
  'default',
  'international',
  'official',
  100,
  'DISCORD_WEBHOOK_FON_DEFAULT'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.discord_rp_channels
  WHERE channel_id = '1478736128466096254'
);

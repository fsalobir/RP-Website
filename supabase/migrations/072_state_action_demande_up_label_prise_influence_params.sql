-- Renommer "Demande d'Up" en "Demande d'up nombre/tech"
UPDATE public.state_action_types
SET label_fr = 'Demande d''up nombre/tech'
WHERE key = 'demande_up';

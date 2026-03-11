-- Nettoyage fixture de parité process due (Option A)
-- Supprime uniquement les events insérés avec payload.test_tag = 'process_due_parity'

DELETE FROM public.ai_event_requests
WHERE coalesce(payload->>'test_tag', '') = 'process_due_parity';

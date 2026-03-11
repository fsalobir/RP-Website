# Fixtures Process Due (Option A)

Scripts SQL:

- Setup: `scripts/sql/process_due_fixture_setup.sql`
- Cleanup: `scripts/sql/process_due_fixture_cleanup.sql`

## Usage recommandé (staging)

1. Exécuter setup SQL (insère des `ai_event_requests` taggés `process_due_parity`).
2. Lancer le check rapide:

```bash
npm run test:process-due-parity
```

3. Exécuter cleanup SQL.

## Sécurité

- Ne pas exécuter sur production sans fenêtre de maintenance.
- Les fixtures sont marquées via `payload.test_tag = process_due_parity` pour permettre un nettoyage ciblé.

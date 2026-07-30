# Déploiement du pipeline RP Magnum

Projet Supabase cible : **`ssnqervwthlqvbewhtrd`**.

## Ordre de lancement

1. Couper l’ancien worker puis arrêter ses deux planifications, avant toute sauvegarde :

   ```bash
   npx supabase secrets set PROCESS_DUE_EDGE_ENABLED=false
   npx supabase db query --linked --file supabase/migrations/159_suspend_legacy_rp_pipeline.sql
   ```

2. Attendre **10 minutes complètes**. C’est la barrière qui laisse finir tout ancien
   traitement déjà démarré avant la coupure. La migration 160 refusera de démarrer
   si ce délai n’est pas écoulé.

3. Sauvegarder l’ancien stock désormais figé :

   ```bash
   npm run backup:rp-pipeline
   ```

4. Garder le nouveau worker coupé et configurer ses secrets serveur :

   ```bash
   npx supabase secrets set RP_PIPELINE_EDGE_ENABLED=false
   npx supabase secrets set RP_PIPELINE_EDGE_SECRET="<valeur exacte de process_due_edge_secret>"
   npx supabase secrets set INFERMATIC_API_KEY="..."
   npx supabase secrets set DISCORD_BOT_TOKEN="..."
   ```

   La migration copie cette même valeur historique dans Vault et s’arrête si elle
   est absente : le secret Edge et le secret cron ne peuvent donc pas diverger.
   `SUPABASE_URL` et la clé serveur sont fournies automatiquement à la fonction Edge.
   Chaque webhook Discord utilise un secret dédié, par exemple
   `DISCORD_WEBHOOK_DEFAULT`; seule sa référence est enregistrée en base.

5. Appliquer les migrations puis déployer le worker :

   ```bash
   npx supabase db push
   npx supabase functions deploy rp-pipeline --no-verify-jwt
   npx supabase functions list --project-ref ssnqervwthlqvbewhtrd
   npx supabase functions delete process-ai-events-due --project-ref ssnqervwthlqvbewhtrd
   ```

   La dernière commande retire définitivement l’ancien processeur distant après
   vérification de son nom dans la liste.

6. Configurer les salons publics et les routes dans **Admin → Moteur RP → Routage Discord**.

7. Activer le worker, lancer une synchronisation manuelle et valider une publication
   sur le serveur de test :

   ```bash
   npx supabase secrets set RP_PIPELINE_EDGE_ENABLED=true
   ```

8. Quand ce test est validé, ouvrir **Réglages des actions** puis cliquer sur
   **Activer le moteur**. Les deux interrupteurs (worker Edge et génération en base)
   sont volontairement séparés pour éviter un lancement accidentel.

## Contrôles

```sql
select jobname, schedule
from cron.job
where jobname in ('daily-country-update', 'ai-events-generation', 'rp-pipeline-worker', 'rp-discord-sync-planner')
order by jobname;
```

Attendus :

- worker : chaque minute ;
- collecte Discord : `06:00` et `18:00`, fuseau Europe/Paris ;
- génération : cadence définie par les règles MJ.

Les tâches en `warning` ou `review` restent visibles dans l’administration et ne
sont jamais abandonnées silencieusement.

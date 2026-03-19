# Parity Matrix: route actuelle vs Edge Function

> ⚠️ **Branche `fantasy` – Document d’héritage**
> 
> Cette matrice de parité compare l’ancienne route HTTP `/api/cron/process-ai-events` et la Edge Function `process-ai-events-due` du simulateur de nations.  
> Sur `fantasy`, conserver ces **invariants techniques** (anti double-traitement, batch tolérant aux erreurs, Discord non bloquant…) mais les appliquer au nouveau moteur d’événements du RPG.

But: garantir la parité fonctionnelle entre:

- route actuelle `GET /api/cron/process-ai-events`
- future function `process-ai-events-due`

## Sélection des lignes à traiter

- Statut: `status = accepted`
- Non appliqué: `consequences_applied_at IS NULL`
- Dû: `scheduled_trigger_at IS NULL OR <= now()`
- Retry lock: `processing_started_at IS NULL OR < now() - 10min`
- Batch size: `limit(50)`

## Réservation anti-concurrence

- Update de `processing_started_at` par ligne avant traitement.
- Si la réservation échoue, la ligne est ignorée.

## Règles de dés

- `needsRolls` si pas de `dice_results`, ou si `impact_roll` requis mais absent.
- Roll succès:
  - si total < 50 -> event devient `refused`, `resolved_at` renseigné.
- Roll impact:
  - seulement pour `ACTION_KEYS_REQUIRING_IMPACT_ROLL`.
- Mise à jour `dice_results` persistée avant application des conséquences.

## Application des conséquences

- Appel logique `applyStateActionConsequences` équivalente:
  - relations bilatérales
  - influence / contrôle
  - effets immédiats / durables
  - message Discord
- En cas d'erreur de conséquence: l'event est compté en `failed`.

## Marquage final

- Si succès: `consequences_applied_at = now()`.
- Si erreur DB au marquage: `failed++`.

## Invariants à conserver

1. Aucun double traitement d'un même event.
2. Pas d'échec global du batch pour une erreur unitaire.
3. Discord non bloquant (erreur Discord ne rollback pas la conséquence métier).
4. Comportement identique sur les actions clés:
   - `insulte_diplomatique`
   - `ouverture_diplomatique`
   - `prise_influence`
   - `escarmouche_militaire`
   - `conflit_arme`
   - `guerre_ouverte`
   - `espionnage`
   - `demande_up`

# Assistants IA

## Mise en service

1. Appliquer la migration `178_ai_assistants.sql` dans l’environnement choisi.
2. Ajouter les variables serveur décrites dans `.env.example`.
3. Ouvrir **Administration → Assistants IA**.
4. Générer un jeton de relais, puis exécuter la commande affichée sur le PC Windows qui contient le dépôt.
5. Vérifier que le relais est « En ligne ».

Le relais n’ouvre aucun port entrant. Il interroge le site par HTTPS, copie uniquement les fichiers suivis par Git en excluant les secrets connus, puis lance Codex en mode éphémère, structuré et lecture seule. Le bac à sable Windows **élevé** est obligatoire.

Le jeton est conservé dans `%LOCALAPPDATA%\FatesOfNations\ai-worker\config.json`. Le dossier est limité au compte Windows courant. Régénérez le jeton depuis le site pour révoquer l’ancien.

Le relais réutilise la connexion ChatGPT déjà enregistrée par `codex login`. Il suit le [mode non interactif de Codex](https://learn.chatgpt.com/docs/non-interactive-mode) et exige le [bac à sable Windows élevé](https://learn.chatgpt.com/docs/windows/windows-sandbox).

## Comportement initial

- Assistant admin : disponible dès que le relais est en ligne.
- Secrétaire joueur : désactivé jusqu’à activation manuelle.
- Plafond commun OpenAI : 20 $ par défaut.
- Le fallback OpenAI admin demande une confirmation à chaque utilisation.

## Limites volontaires

La création d’un compte joueur avec mot de passe, ainsi que l’envoi d’images ou de drapeaux, restent dans leurs écrans dédiés. Un secret ou un fichier binaire ne doit jamais entrer dans une demande au modèle. Toutes les autres opérations de jeu exposées à l’assistant passent par le registre fermé et les validations du site.

Les tarifs de départ sont ceux de [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) et [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol). Le site conserve 10 % de marge sur le coût calculé.

Les migrations de cette branche ne doivent pas être appliquées en production avant la validation et le lancement de la fonctionnalité.

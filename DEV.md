# Développement local

## Lenteur du serveur de dev

Le serveur `next dev` (Turbopack) peut devenir très lent après quelques minutes (requêtes de 30–40 s). C’est un comportement connu lié à la mémoire et au cache de compilation.

### Options pour continuer à travailler

1. **Tester en mode production** (recommandé pour vérifier le site)
   ```bash
   npm run test:prod
   ```
   Lance un build puis le serveur de prod sur http://localhost:3000. Les temps de réponse restent stables.

2. **Dev avec redémarrage automatique**
   ```bash
   npm run dev:watch
   ```
   Lance `next dev` et le redémarre toutes les 3 minutes pour limiter la dégradation. Tu perds la connexion quelques secondes à chaque redémarrage.

3. **Redémarrage manuel**
   Arrêter le serveur (Ctrl+C) et relancer `npm run dev` quand les temps deviennent trop longs. Le cache Turbopack dans `.next` est conservé, la recompilation reste plus rapide qu’au premier lancement.

4. **Plus de mémoire Node** (si la machine en a)
   ```bash
   npm run dev:fast
   ```

### Windows : antivirus

Si tu es sous Windows, ajouter le dossier du projet aux exclusions de Windows Defender (ou de l’antivirus) peut améliorer les temps de compilation (fichiers moins scannés à chaque accès).

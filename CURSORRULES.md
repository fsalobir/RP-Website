# OBJECTIFS GLOBAUX
- Focus absolu : Performance maximale, détection de bugs invisibles, et couverture de tests.
- Ne jamais modifier une fonctionnalité sans s'assurer que ses tests passent ou en créant les tests manquants.
- Supprimer systématiquement le code mort ou commenté inutilement.
- Si une modification affecte plusieurs fichiers, l'analyser avant d'agir.

# RÈGLES DE REFACTORING
- Appliquer le principe de responsabilité unique (Single Responsibility Principle).
- Remplacer les boucles lourdes par des méthodes optimisées.
- Traiter proprement toutes les erreurs (pas de `catch` vide).

# TESTS ET VALIDATION
- Toujours écrire les tests unitaires/intégration avant ou pendant le refactoring d'un fichier.
- Exécuter la suite de tests pour valider que le comportement de la feature reste intact.
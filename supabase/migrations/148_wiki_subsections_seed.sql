-- Sous-sections wiki : pages enfants (parent_id) — généré par scripts/generate-wiki-subsections-sql.mjs

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'vue-ensemble-navigation', 'Navigation utile', 0, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Navigation utile"}]},{"type":"paragraph","content":[{"type":"text","text":"Vous incarnez un pays dans un monde qui avance par passages réguliers (ticks). Votre objectif est de lire la situation, définir des priorités et prendre des décisions qui améliorent la position de votre nation."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Accueil"},{"type":"text","text":" : vue rapide des pays et de leurs tendances."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Mon Pays / Pays"},{"type":"text","text":" : coeur du gameplay, avec onglets de pilotage et d''analyse."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Carte"},{"type":"text","text":" : lecture géopolitique régionale."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Classement"},{"type":"text","text":" : comparaison de puissance."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Idéologie"},{"type":"text","text":" : orientation politique des pays."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Wiki"},{"type":"text","text":" : guide détaillé, composant par composant."}]}]}]}]}'::jsonb, 'Navigation utile Navigation utile vue ensemble accueil pays carte classement idéologie wiki'
FROM public.wiki_pages p WHERE p.slug = 'vue-ensemble'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'accueil-colonnes', 'Table des nations', 0, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Table des nations : comment la lire vite"}]},{"type":"paragraph","content":[{"type":"text","text":"L''accueil sert à comparer le monde en quelques secondes et à choisir où concentrer votre attention."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Pays / Régime"},{"type":"text","text":" : identité politique du pays ; cliquez sur le nom pour ouvrir sa fiche complète."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Sphère"},{"type":"text","text":" : montre les pays sous influence/contrôle de la nation affichée. Utile pour repérer les blocs géopolitiques."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Influence"},{"type":"text","text":" : poids diplomatique global."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"PIB"},{"type":"text","text":" : puissance économique."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Population"},{"type":"text","text":" : taille démographique."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Stabilité"},{"type":"text","text":" : solidité interne du régime."}]}]}]}]}'::jsonb, 'Table des nations table nations colonnes pays régime sphère influence PIB population stabilité'
FROM public.wiki_pages p WHERE p.slug = 'accueil'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'accueil-variations', 'Variations (vert / rouge)', 1, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Variations (vert / rouge)"}]},{"type":"paragraph","content":[{"type":"text","text":"Les indicateurs avec flèches montrent la tendance depuis le dernier relevé. Vert = progression, rouge = dégradation."}]}]}'::jsonb, 'Variations (vert / rouge) variations vert rouge flèches tendance dernier relevé'
FROM public.wiki_pages p WHERE p.slug = 'accueil'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'accueil-tri-recherche', 'Tri et recherche', 2, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Tri et recherche"}]},{"type":"paragraph","content":[{"type":"text","text":"Triez par colonne pour trouver les leaders et les retardataires. Utilisez la recherche pour isoler un pays/régime précis."}]}]}'::jsonb, 'Tri et recherche tri recherche colonne leaders retardataires pays régime'
FROM public.wiki_pages p WHERE p.slug = 'accueil'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'fiche-pays-onglets', 'Vue d''ensemble de la fiche', 0, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Vue d''ensemble de la fiche"}]},{"type":"paragraph","content":[{"type":"text","text":"La fiche pays est l''écran principal de décision. Les onglets affichés peuvent varier selon que vous consultez un autre pays ou votre pays."}]}]}'::jsonb, 'Vue d''ensemble de la fiche fiche pays onglets écran décision'
FROM public.wiki_pages p WHERE p.slug = 'fiche-pays'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'fiche-pays-rapport-cabinet', 'Rapport du Cabinet', 1, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Rapport du Cabinet"}]},{"type":"paragraph","content":[{"type":"text","text":"Le rapport résume votre situation politique, économique et militaire sur la période en cours."}]}]}'::jsonb, 'Rapport du Cabinet rapport cabinet situation politique économique militaire'
FROM public.wiki_pages p WHERE p.slug = 'fiche-pays'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'fiche-pays-generalites', 'Généralités', 2, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Généralités"}]},{"type":"paragraph","content":[{"type":"text","text":"Population et PIB décrivent la taille du pays. Les quatre stats (militarisme, industrie, science, stabilité) déterminent une grande partie de ses performances."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Militarisme"},{"type":"text","text":" : capacité de pression militaire."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Industrie"},{"type":"text","text":" : base productive et soutenabilité."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Science"},{"type":"text","text":" : vitesse de progression technologique."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Stabilité"},{"type":"text","text":" : cohésion interne et résilience."}]}]}]}]}'::jsonb, 'Généralités généralités population PIB militarisme industrie science stabilité'
FROM public.wiki_pages p WHERE p.slug = 'fiche-pays'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'fiche-pays-militaire', 'Militaire', 3, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Militaire"}]},{"type":"paragraph","content":[{"type":"text","text":"Présente les capacités par branche (terre, air, mer, stratégique) et les unités associées."}]}]}'::jsonb, 'Militaire militaire branche terre air mer stratégique unités'
FROM public.wiki_pages p WHERE p.slug = 'fiche-pays'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'fiche-pays-avantages', 'Avantages', 4, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Avantages"}]},{"type":"paragraph","content":[{"type":"text","text":"Les avantages (perks) sont des bonus conditionnés par vos statistiques."}]}]}'::jsonb, 'Avantages avantages perks bonus statistiques'
FROM public.wiki_pages p WHERE p.slug = 'fiche-pays'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'fiche-pays-budget', 'Budget', 5, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Budget"}]},{"type":"paragraph","content":[{"type":"text","text":"Le budget d''état est une fraction du PIB que vous répartissez entre ministères."}]}]}'::jsonb, 'Budget budget état PIB ministères'
FROM public.wiki_pages p WHERE p.slug = 'fiche-pays'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'fiche-pays-lois', 'Lois', 6, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Lois"}]},{"type":"paragraph","content":[{"type":"text","text":"Chaque loi possède un score actuel et une cible. Le pays évolue progressivement vers le niveau visé."}]}]}'::jsonb, 'Lois lois score cible palier'
FROM public.wiki_pages p WHERE p.slug = 'fiche-pays'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'fiche-pays-actions-etat', 'Actions d''État', 7, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Actions d''État"}]},{"type":"paragraph","content":[{"type":"text","text":"Les actions sont regroupées par catégories (interne, diplomatie positive/agressive, opérations secrètes)."}]}]}'::jsonb, 'Actions d''État actions état diplomatie opérations secrètes'
FROM public.wiki_pages p WHERE p.slug = 'fiche-pays'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'carte-modes', 'Modes de la carte', 0, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Modes de la carte"}]},{"type":"paragraph","content":[{"type":"text","text":"La carte propose deux lectures complémentaires : relations régionales et sphères d''influence."}]},{"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"Mode Relations"}]},{"type":"paragraph","content":[{"type":"text","text":"Couleurs de rouge (hostile) à vert (amical)."}]},{"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"Mode Sphères"}]},{"type":"paragraph","content":[{"type":"text","text":"Chaque couleur correspond à un pôle dominant ; zones grises = non prises, zones contestées = partage d''influence."}]}]}'::jsonb, 'Modes de la carte carte modes relations sphères influence régions'
FROM public.wiki_pages p WHERE p.slug = 'carte'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'carte-lecture', 'Comment l''exploiter', 1, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Comment l''exploiter en jeu"}]},{"type":"paragraph","content":[{"type":"text","text":"Utilisez la carte pour repérer où les tensions montent, où votre influence recule, et quelles régions peuvent devenir des priorités."}]}]}'::jsonb, 'Comment l''exploiter carte exploiter tensions influence régions priorités'
FROM public.wiki_pages p WHERE p.slug = 'carte'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'classement-metrics', 'Métriques de classement', 0, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Métriques de classement"}]},{"type":"paragraph","content":[{"type":"text","text":"Le classement compare les pays par influence, puissance militaire et indicateurs économiques."}]},{"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"Onglet Classement"}]},{"type":"paragraph","content":[{"type":"text","text":"Focus sur l''influence."}]},{"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"Onglet Militaire"}]},{"type":"paragraph","content":[{"type":"text","text":"Compare militarisme et hard power par branche."}]},{"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"Onglet Économique"}]},{"type":"paragraph","content":[{"type":"text","text":"Compare population et PIB."}]}]}'::jsonb, 'Métriques de classement classement influence militaire économique onglets'
FROM public.wiki_pages p WHERE p.slug = 'classement'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'classement-evolution', 'Évolution de rang', 1, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Évolution de rang"}]},{"type":"paragraph","content":[{"type":"text","text":"Les flèches indiquent progression ou régression dans le classement."}]}]}'::jsonb, 'Évolution de rang évolution rang flèches progression régression'
FROM public.wiki_pages p WHERE p.slug = 'classement'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'ideologie-lecture-triangle', 'Lecture du triangle', 0, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Lecture du triangle"}]},{"type":"paragraph","content":[{"type":"text","text":"Chaque pays est positionné sur un triangle idéologique. Plus il est proche d''un sommet, plus cette orientation domine."}]}]}'::jsonb, 'Lecture du triangle idéologie triangle sommet orientation'
FROM public.wiki_pages p WHERE p.slug = 'ideologie'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'ideologie-impact', 'Pourquoi c''est utile', 1, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Pourquoi c''est utile"}]},{"type":"paragraph","content":[{"type":"text","text":"Cette vue aide à anticiper les rapprochements, les frictions et les changements de posture politique."}]}]}'::jsonb, 'Pourquoi c''est utile idéologie rapprochements frictions posture politique'
FROM public.wiki_pages p WHERE p.slug = 'ideologie'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, 'regles-lecture-joueur', 'Que lire en tant que joueur', 0, '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Que lire en tant que joueur"}]},{"type":"paragraph","content":[{"type":"text","text":"La page "},{"type":"text","marks":[{"type":"link","attrs":{"href":"/regles","target":"_blank","rel":"noopener noreferrer nofollow","class":null,"title":null}}],"text":"Règles"},{"type":"text","text":" permet de comprendre le cadre global de la simulation : ce qui accélère ou freine l''évolution d''un pays."}]},{"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"Utilité gameplay"}]},{"type":"paragraph","content":[{"type":"text","text":"Consultez-la pour mieux interpréter vos résultats (budget, lois, évolution des stats) et adapter vos choix."}]}]}'::jsonb, 'Que lire en tant que joueur règles joueur simulation budget lois stats'
FROM public.wiki_pages p WHERE p.slug = 'regles'
ON CONFLICT (slug) DO NOTHING;

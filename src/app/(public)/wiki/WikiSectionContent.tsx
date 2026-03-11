"use client";

import React from "react";
import Link from "next/link";
import type { WikiSectionId } from "@/lib/wiki/sections";
import { getSectionById } from "@/lib/wiki/sections";

const contentClass = "text-[var(--foreground)] leading-relaxed";
const pClass = "mb-4 last:mb-0";
const listClass = "mb-4 list-disc pl-6 space-y-1";
const h3Class = "mt-6 mb-2 text-base font-semibold text-[var(--foreground)]";
const h4Class = "mt-4 mb-1 text-sm font-semibold text-[var(--foreground)]";
const linkClass = "text-[var(--accent)] hover:underline";

const markClass = "bg-amber-400/90 text-gray-900 rounded px-1 font-medium";

function highlightTerms(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((part, i) =>
    terms.some((t) => part.toLowerCase() === t.toLowerCase())
      ? React.createElement("mark", { key: i, className: markClass }, part)
      : part
  );
}

function HighlightMatches({
  children,
  terms,
}: {
  children: React.ReactNode;
  terms: string[];
}) {
  if (!terms.length) return <>{children}</>;
  return (
    <>
      {React.Children.map(children, (child) => {
        if (typeof child === "string") return highlightTerms(child, terms);
        if (React.isValidElement(child)) {
          const isFrag = child.type === React.Fragment;
          const fragSym = typeof Symbol !== "undefined" && "for" in Symbol ? Symbol.for("react.fragment") : null;
          const isFragBySym = fragSym != null && child.type === fragSym;
          if (isFrag || isFragBySym)
            return <HighlightMatches terms={terms}>{child.props.children}</HighlightMatches>;
          if (child.props.children != null)
            return React.cloneElement(child, {}, (
              <HighlightMatches terms={terms}>{child.props.children}</HighlightMatches>
            ) as React.ReactNode);
        }
        return child;
      })}
    </>
  );
}

export function WikiSectionContent({
  sectionId,
  searchQuery = "",
}: {
  sectionId: WikiSectionId;
  searchQuery?: string;
}) {
  const meta = getSectionById(sectionId);
  const terms = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return q.split(/\s+/).filter(Boolean);
  }, [searchQuery]);

  if (!meta) return null;

  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-[var(--foreground)] md:text-2xl">
        {meta.title}
      </h2>
      <div className={contentClass} style={{ maxWidth: "65ch" }}>
        <HighlightMatches terms={terms}>
          {getSectionBodyContent(sectionId)}
        </HighlightMatches>
      </div>
    </>
  );
}

function getSectionBodyContent(sectionId: WikiSectionId): React.ReactNode {
  switch (sectionId) {
    case "vue-ensemble":
      return (
        <>
          <p className={pClass}>
            Vous incarnez un pays dans un monde qui avance par passages réguliers
            (ticks). Votre objectif est de lire la situation, définir des priorités
            et prendre des décisions qui améliorent la position de votre nation.
          </p>
          <h3 className={h3Class} id="vue-ensemble-navigation">Navigation utile</h3>
          <ul className={listClass}>
            <li>
              <strong>Accueil</strong> : vue rapide des pays et de leurs tendances.
            </li>
            <li>
              <strong>Mon Pays / Pays</strong> : cœur du gameplay, avec onglets de
              pilotage et d’analyse.
            </li>
            <li>
              <strong>Carte</strong> : lecture géopolitique régionale.
            </li>
            <li>
              <strong>Classement</strong> : comparaison de puissance.
            </li>
            <li>
              <strong>Idéologie</strong> : orientation politique des pays.
            </li>
            <li>
              <strong>Wiki</strong> : guide détaillé, composant par composant.
            </li>
          </ul>
        </>
      );
    case "accueil":
      return (
        <>
          <h3 className={h3Class} id="accueil-colonnes">Table des nations : comment la lire vite</h3>
          <p className={pClass}>
            L’accueil sert à comparer le monde en quelques secondes et à choisir
            où concentrer votre attention.
          </p>
          <ul className={listClass}>
            <li>
              <strong>Pays / Régime</strong> : identité politique du pays ; cliquez
              sur le nom pour ouvrir sa fiche complète.
            </li>
            <li>
              <strong>Sphère</strong> : montre les pays sous influence/contrôle de
              la nation affichée. Utile pour repérer les blocs géopolitiques.
            </li>
            <li>
              <strong>Influence</strong> : poids diplomatique global. Plus il est
              élevé, plus le pays pèse dans les rapports de force.
            </li>
            <li>
              <strong>PIB</strong> : puissance économique (affichée en milliards).
              Un PIB élevé permet plus de marge sur le budget d’état.
            </li>
            <li>
              <strong>Population</strong> : taille démographique, utile pour lire
              la profondeur stratégique d’un pays.
            </li>
            <li>
              <strong>Stabilité</strong> : solidité interne du régime. Une faible
              stabilité est un signal d’alerte.
            </li>
          </ul>
          <h3 className={h3Class} id="accueil-variations">Variations (vert / rouge)</h3>
          <p className={pClass}>
            Les indicateurs avec flèches montrent la tendance depuis le dernier
            relevé. Vert = progression, rouge = dégradation. Servez-vous-en pour
            détecter rapidement une opportunité ou une crise.
          </p>
          <h3 className={h3Class} id="accueil-tri-recherche">Tri et recherche</h3>
          <p className={pClass}>
            Triez par colonne pour trouver les leaders et les retardataires.
            Utilisez la recherche pour isoler un pays/régime précis.
          </p>
        </>
      );
    case "fiche-pays":
      return (
        <>
          <h3 className={h3Class} id="fiche-pays-onglets">Vue d’ensemble de la fiche</h3>
          <p className={pClass}>
            La fiche pays est l’écran principal de décision. Les onglets affichés
            peuvent varier selon que vous consultez un autre pays ou votre pays.
          </p>
          <h3 className={h3Class} id="fiche-pays-rapport-cabinet">Rapport du Cabinet (mon pays)</h3>
          <p className={pClass}>
            Le rapport résume votre situation politique/économique/militaire sur la
            période en cours. Il affiche notamment les tendances de PIB, population,
            influence et stats clés.
          </p>
          <h4 className={h4Class}>Comment l’utiliser</h4>
          <ul className={listClass}>
            <li>Identifier ce qui se dégrade (flèches vers le bas).</li>
            <li>Prioriser ensuite Budget, Lois et Actions d’État.</li>
            <li>Comparer le message global du cabinet avec vos objectifs.</li>
          </ul>

          <h3 className={h3Class} id="fiche-pays-generalites">Généralités</h3>
          <h4 className={h4Class} id="fiche-pays-generalites-stats">Stats et macros</h4>
          <p className={pClass}>
            Population et PIB décrivent la taille du pays. Les quatre stats
            (militarisme, industrie, science, stabilité) déterminent une grande
            partie de ses performances.
          </p>
          <ul className={listClass}>
            <li><strong>Militarisme</strong> : capacité de pression militaire.</li>
            <li><strong>Industrie</strong> : base productive et soutenabilité.</li>
            <li><strong>Science</strong> : vitesse de progression technologique.</li>
            <li><strong>Stabilité</strong> : cohésion interne et résilience.</li>
          </ul>
          <p className={pClass}>
            En pratique, vous influez dessus via le budget, les lois, et les effets
            en cours appliqués à votre pays.
          </p>
          <h4 className={h4Class} id="fiche-pays-generalites-voisins-relations">Voisins et relations bilatérales</h4>
          <p className={pClass}>
            Les voisins donnent le contexte régional immédiat. Les relations
            bilatérales indiquent le degré d’amitié/hostilité entre pays et
            influencent fortement la dynamique diplomatique.
          </p>
          <h4 className={h4Class} id="fiche-pays-generalites-effets-actifs">Effets actifs</h4>
          <p className={pClass}>
            Les effets actifs sont des bonus/malus temporaires ou permanents qui
            modifient vos indicateurs (stats, budget, idéologie, militaire, etc.).
            Chaque effet affiche son impact et sa durée restante.
          </p>
          <p className={pClass}>
            Côté joueur, retenez surtout : « qu’est-ce que ça change maintenant ? »
            et « combien de temps cela dure ? ».
          </p>
          <h4 className={h4Class} id="fiche-pays-generalites-ideologie">Idéologie</h4>
          <p className={pClass}>
            Vous voyez la tendance dominante, l’effet des voisins et les effets
            idéologiques actifs. Cette lecture vous aide à anticiper l’évolution
            politique du pays.
          </p>

          <h3 className={h3Class} id="fiche-pays-militaire">Militaire</h3>
          <p className={pClass}>
            Cet onglet présente les capacités par branche (terre, air, mer,
            stratégique) et les unités associées.
          </p>
          <ul className={listClass}>
            <li>Niveaux et effectifs des unités disponibles.</li>
            <li>Limites par branche (capacité maximale exploitable).</li>
            <li>Niveau d’information visible selon le renseignement.</li>
          </ul>
          <p className={pClass}>
            Utilisez cet onglet pour savoir où renforcer votre posture et où vous
            êtes en retard.
          </p>

          <h3 className={h3Class} id="fiche-pays-avantages">Avantages</h3>
          <p className={pClass}>
            Les avantages (perks) sont des bonus conditionnés par vos statistiques.
            L’onglet montre ce qui est déjà débloqué et, sinon, les seuils à
            atteindre.
          </p>
          <p className={pClass}>
            C’est un bon tableau de bord de progression : vous voyez clairement
            quelle stat monter pour débloquer le prochain palier utile.
          </p>

          <h3 className={h3Class} id="fiche-pays-budget">Budget (mon pays)</h3>
          <h4 className={h4Class} id="fiche-pays-budget-ministeres">Répartition par ministères</h4>
          <p className={pClass}>
            Le budget d’état est une fraction du PIB que vous répartissez entre
            ministères. Cette répartition oriente directement vos priorités.
          </p>
          <ul className={listClass}>
            <li>Plus un ministère est financé, plus son axe est soutenu.</li>
            <li>Un sous-financement durable peut pénaliser l’évolution.</li>
            <li>Le plafond d’allocation indique la marge disponible.</li>
          </ul>
          <h4 className={h4Class} id="fiche-pays-budget-prochain-tick">Attendu au prochain tick</h4>
          <p className={pClass}>
            Le bloc de prévision vous aide à estimer l’impact de votre budget actuel
            avant le prochain passage du monde.
          </p>

          <h3 className={h3Class} id="fiche-pays-lois">Lois</h3>
          <p className={pClass}>
            Chaque loi possède un score actuel et une cible. Le pays évolue
            progressivement vers le niveau visé, avec des effets propres à chaque
            palier.
          </p>
          <p className={pClass}>
            Pour le joueur, l’idée clé est simple : choisir les lois qui servent
            votre stratégie du moment (accélérer une priorité, stabiliser une
            faiblesse, préparer un conflit, etc.).
          </p>

          <h3 className={h3Class} id="fiche-pays-actions-etat">Actions d’État (mon pays)</h3>
          <h4 className={h4Class} id="fiche-pays-actions-etat-types">Types d’actions</h4>
          <p className={pClass}>
            Les actions sont regroupées par catégories (interne, diplomatie positive
            ou agressive, opérations secrètes). Chaque action a un coût et des
            conditions (cible, relation minimale, validation, etc.).
          </p>
          <h4 className={h4Class}>Demandes, statuts et historique</h4>
          <p className={pClass}>
            Vous suivez les demandes envoyées/reçues, leur statut, et les retours
            de résolution. C’est votre journal opérationnel pour piloter la
            diplomatie et les opérations.
          </p>
        </>
      );
    case "carte":
      return (
        <>
          <h3 className={h3Class} id="carte-modes">Modes de la carte</h3>
          <p className={pClass}>
            La carte propose deux lectures complémentaires : relations régionales et
            sphères d’influence.
          </p>
          <h4 className={h4Class}>Mode Relations</h4>
          <p className={pClass}>
            Couleurs de rouge (hostile) à vert (amical). En cliquant une région,
            vous affichez ses relations avec les autres.
          </p>
          <h4 className={h4Class}>Mode Sphères</h4>
          <p className={pClass}>
            Chaque couleur correspond à un pôle dominant. Les zones grises sont
            non prises, les zones contestées affichent un partage d’influence.
          </p>
          <h3 className={h3Class} id="carte-lecture">Comment l’exploiter en jeu</h3>
          <p className={pClass}>
            Utilisez la carte pour repérer où les tensions montent, où votre
            influence recule, et quelles régions peuvent devenir des priorités
            diplomatiques ou stratégiques.
          </p>
        </>
      );
    case "classement":
      return (
        <>
          <h3 className={h3Class} id="classement-metrics">Métriques de classement</h3>
          <p className={pClass}>
            Le classement compare les pays par influence, puissance militaire et
            indicateurs économiques.
          </p>
          <h4 className={h4Class}>Onglet Classement</h4>
          <p className={pClass}>
            Focus sur l’influence, avec les grandes puissances en tête et le reste
            des nations en tableau.
          </p>
          <h4 className={h4Class}>Onglet Militaire</h4>
          <p className={pClass}>
            Compare militarisme et hard power par branche (terre, air, mer,
            stratégique) pour identifier les écarts de capacités.
          </p>
          <h4 className={h4Class}>Onglet Économique</h4>
          <p className={pClass}>
            Compare population et PIB pour situer les puissances économiques.
          </p>
          <h3 className={h3Class} id="classement-evolution">Évolution de rang</h3>
          <p className={pClass}>
            Les flèches indiquent la progression ou la régression d’un pays dans le
            classement. C’est un excellent indicateur de dynamique.
          </p>
        </>
      );
    case "ideologie":
      return (
        <>
          <h3 className={h3Class} id="ideologie-lecture-triangle">Lecture du triangle</h3>
          <p className={pClass}>
            Chaque pays est positionné sur un triangle idéologique. Plus il est
            proche d’un sommet, plus cette orientation domine.
          </p>
          <h4 className={h4Class}>Filtres et sélection</h4>
          <p className={pClass}>
            Vous pouvez filtrer l’affichage, sélectionner un pays et ouvrir sa
            fiche pour relier lecture idéologique et décisions concrètes.
          </p>
          <h3 className={h3Class} id="ideologie-impact">Pourquoi c’est utile</h3>
          <p className={pClass}>
            Cette vue aide à anticiper les rapprochements, les frictions et les
            changements de posture politique à moyen terme.
          </p>
        </>
      );
    case "regles":
      return (
        <>
          <h3 className={h3Class} id="regles-lecture-joueur">Que lire en tant que joueur</h3>
          <p className={pClass}>
            La page <Link href="/regles" className={linkClass}>Règles</Link> vous
            permet de comprendre le cadre global de la simulation : ce qui accélère
            ou freine l’évolution d’un pays.
          </p>
          <h4 className={h4Class}>Utilité gameplay</h4>
          <p className={pClass}>
            Consultez-la pour mieux interpréter vos résultats (budget, lois,
            évolution des stats) et adapter vos choix au cycle du monde.
          </p>
        </>
      );
    default:
      return null;
  }
}

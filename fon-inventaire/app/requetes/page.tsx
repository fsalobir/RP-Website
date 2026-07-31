"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Complexity = "faible" | "moyenne" | "elevee";
type RequestStatus = "a-etudier" | "clarifier" | "couvert";

type PlayerRequest = {
  id: string;
  title: string;
  quote: string;
  context?: string;
  summary: string;
  interpretation: string;
  verifiedFact: string;
  nextSteps: string[];
  complexity: Complexity;
  complexityReason: string;
  status: RequestStatus;
};

type Theme = {
  id: string;
  short: string;
  title: string;
  requests: PlayerRequest[];
};

const complexityLabels: Record<Complexity, string> = {
  faible: "Faible",
  moyenne: "Moyenne",
  elevee: "Élevée",
};

const statusLabels: Record<RequestStatus, string> = {
  "a-etudier": "À étudier",
  clarifier: "À clarifier",
  couvert: "Déjà couvert",
};

const statusStyles: Record<RequestStatus, "disponible" | "conditionnel" | "partiel"> = {
  "a-etudier": "partiel",
  clarifier: "conditionnel",
  couvert: "disponible",
};

const themes: Theme[] = [
  {
    id: "ideologie",
    short: "Idéologie",
    title: "Idéologie & influence",
    requests: [
      {
        id: "REQ-001",
        title: "Pondérer la dérive idéologique par l’influence",
        quote:
          "On prend en compte le fait qu’une grande puissance influence pas au même degré que la petite ville indépendante voisine ?",
        summary:
          "Un pays très influent doit tirer plus fortement ses voisins vers son idéologie qu’une petite puissance.",
        interpretation:
          "La force de la dérive idéologique provoquée par un voisin doit dépendre de son niveau d’influence, en plus de la relation et du contrôle exercé.",
        verifiedFact:
          "Le moteur applique déjà ce principe : l’influence du pays voisin augmente son poids dans le calcul, avec un coefficient réglable.",
        nextSteps: [
          "Vérifier que le coefficient actuel produit un écart assez visible en jeu.",
          "Tester le même voisinage avec une grande puissance puis une micro-puissance.",
          "Ajuster le réglage plutôt que créer une nouvelle logique si l’effet paraît trop faible.",
        ],
        complexity: "faible",
        complexityReason:
          "La logique existe déjà. Le travail restant est surtout un test d’équilibrage et, si nécessaire, un réglage.",
        status: "couvert",
      },
    ],
  },
  {
    id: "economie",
    short: "Économie",
    title: "Économie & croissance",
    requests: [
      {
        id: "REQ-003",
        title: "Comparer médiane et loi normale pour la référence mondiale",
        quote:
          "Et ça ne tire pas vers le bas les survivants ? Peut-être qu’on devrait utiliser les médianes. On ne suit pas nécessairement une loi normale. Mais on pourrait.",
        context:
          "Après quatre mois de simulation, la croissance composée a fortement séparé les pays bien gérés de ceux qui ont spiralé vers le bas faute d’allocation budgétaire.",
        summary:
          "Étudier deux façons d’éviter que les pays effondrés déforment la référence économique mondiale.",
        interpretation:
          "Deux pistes restent ouvertes : remplacer la moyenne par une médiane, moins sensible aux extrêmes, ou utiliser une loi normale comme modèle de distribution. Cette seconde option doit encore être définie précisément avant de pouvoir être comparée.",
        verifiedFact:
          "Le calcul actuel utilise une moyenne pour la population, le PIB et les principales statistiques mondiales. Il n’utilise ni médiane ni modèle fondé sur une loi normale.",
        nextSteps: [
          "Mesurer la distribution actuelle pour vérifier à quel point les pays extrêmes déforment la moyenne.",
          "Tester une version fondée sur la médiane.",
          "Définir ce que la piste « loi normale » doit modifier : la référence, la pondération des extrêmes ou la distribution elle-même.",
          "Rejouer plusieurs mois avec chaque méthode et comparer leur effet sur les pays survivants.",
        ],
        complexity: "moyenne",
        complexityReason:
          "L’étude comparative reste raisonnable. La piste médiane est simple, mais la loi normale pourrait devenir complexe si elle doit remodeler les valeurs des pays.",
        status: "a-etudier",
      },
    ],
  },
  {
    id: "renseignement",
    short: "Intel",
    title: "Renseignement & concurrence",
    requests: [
      {
        id: "REQ-002",
        title: "Ajouter un panneau Intel de comparaison entre pays",
        quote:
          "Concernant le cabinet, je remarque qu’on peut comparer par rapport aux moyennes mondiales. Il pourrait être intéressant, si ce n’est pas déjà le cas, de pouvoir comparer en fonction d’un pays ou groupe de pays. Dans les relations de concurrence, ça aiderait. Et on pourrait influencer ces comparatifs à l’aide des stats d’espionnage.",
        context:
          "La précision ajoutée confirme un panneau joueur « Intel », inspiré de Stellaris : choisir un pays rival, comparer les valeurs actuelles ou prévues du prochain tour et ne voir que ce que le niveau de renseignement permet d’estimer.",
        summary:
          "Choisir un pays rival et comparer ses indicateurs aux nôtres, avec une précision dépendante du renseignement disponible.",
        interpretation:
          "Un nouveau panneau joueur permettrait de sélectionner un pays cible puis d’afficher un face-à-face sur les indicateurs connus. Les données étrangères seraient inconnues, estimées ou exactes selon le niveau d’espionnage. Une prévision du prochain tour pourrait apparaître aux niveaux de renseignement les plus élevés.",
        verifiedFact:
          "Le Cabinet compare aujourd’hui le pays à la moyenne mondiale. Le système de renseignement entre deux pays existe déjà, mais il protège surtout les informations militaires et n’alimente pas encore un panneau comparatif.",
        nextSteps: [
          "Créer un panneau joueur « Intel » avec un sélecteur de pays cible.",
          "Comparer d’abord les valeurs actuelles : PIB, population, industrie, science, stabilité et capacités militaires.",
          "Réutiliser les niveaux de renseignement pour afficher une donnée inconnue, une fourchette estimée ou une valeur exacte.",
          "Réserver la prévision du prochain tour à un niveau de renseignement élevé, car elle révèle davantage de choix internes.",
        ],
        complexity: "elevee",
        complexityReason:
          "Il faut construire un nouveau panneau, calculer les données de la cible et surtout éviter de révéler des informations que le joueur ne devrait pas connaître.",
        status: "a-etudier",
      },
    ],
  },
];

function matchesQuery(request: PlayerRequest, theme: Theme, query: string) {
  const normalized = query.trim().toLocaleLowerCase("fr");
  if (!normalized) return true;

  return [
    request.id,
    request.title,
    request.quote,
    request.summary,
    request.interpretation,
    theme.title,
    complexityLabels[request.complexity],
    statusLabels[request.status],
  ]
    .join(" ")
    .toLocaleLowerCase("fr")
    .includes(normalized);
}

function RequestCard({
  request,
  forceOpen,
}: {
  request: PlayerRequest;
  forceOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(forceOpen);
  const panelId = `${request.id.toLowerCase()}-details`;

  return (
    <article
      className="capability request-card"
      data-open={isOpen}
    >
      <div className="request-header">
        <div className="capability-main">
          <div className="capability-title-line">
            <h3>{request.title}</h3>
            <span
              className="status"
              data-status={statusStyles[request.status]}
            >
              {statusLabels[request.status]}
            </span>
          </div>
        </div>
        <div className="audiences request-meta" aria-label="Estimation">
          <span
            data-enabled="true"
            data-tone={request.complexity === "elevee" ? "amber" : "green"}
          >
            Complexité {complexityLabels[request.complexity]}
          </span>
          <span data-enabled="true">{request.id}</span>
        </div>
        <button
          className="request-toggle"
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>{isOpen ? "Fermer" : "Détails"}</span>
          <span className="request-toggle-icon" aria-hidden="true" />
        </button>
      </div>

      <div
        className="request-panel"
        id={panelId}
        aria-hidden={!isOpen}
      >
        <div className="request-panel-inner">
          <div className="capability-details request-details">
            <div className="request-explanation">
              <div>
                <h4>Demande originale</h4>
                <blockquote>« {request.quote} »</blockquote>
                {request.context && (
                  <p className="request-context">{request.context}</p>
                )}
              </div>
              <div>
                <h4>Interprétation retenue</h4>
                <p>{request.interpretation}</p>
              </div>
            </div>

            <p className="request-fact">
              <strong>Fait vérifié :</strong> {request.verifiedFact}
            </p>

            <h4>Suite recommandée</h4>
            <ul>
              {request.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>

            <p className="capability-note">
              <strong>Pourquoi {complexityLabels[request.complexity]} :</strong>{" "}
              {request.complexityReason}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function PlayerRequestsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RequestStatus | "tous">("tous");
  const [shareMessage, setShareMessage] = useState("");

  const filteredThemes = useMemo(
    () =>
      themes
        .map((theme) => ({
          ...theme,
          requests: theme.requests.filter(
            (request) =>
              matchesQuery(request, theme, query) &&
              (status === "tous" || request.status === status),
          ),
        }))
        .filter((theme) => theme.requests.length > 0),
    [query, status],
  );

  const requestCount = filteredThemes.reduce(
    (total, theme) => total + theme.requests.length,
    0,
  );

  async function shareSite() {
    const shareData = {
      title: "Fates of Nations — Requêtes joueurs",
      text: "Consulter le registre des améliorations proposées par les joueurs.",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareMessage("Lien partagé.");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareMessage("Lien copié.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage("Copiez l’adresse depuis votre navigateur.");
    }
  }

  return (
    <main className="requests-page">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Registre des requêtes joueurs">
          <span className="brand-mark" aria-hidden="true">
            FN
          </span>
          <span>
            <strong>Fates of Nations</strong>
            <small>Registre des requêtes</small>
          </span>
        </Link>
        <button className="share-button" type="button" onClick={shareSite}>
          <span aria-hidden="true">↗</span>
          <span aria-live="polite">{shareMessage || "Partager"}</span>
        </button>
      </header>

      <div className="page-shell" id="haut">
        <aside className="rail" aria-label="Navigation des thèmes">
          <div className="rail-filter">
            <label htmlFor="request-status">État</label>
            <select
              id="request-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as RequestStatus | "tous")
              }
            >
              <option value="tous">Tous les états</option>
              {(Object.keys(statusLabels) as RequestStatus[]).map(
                (requestStatus) => (
                  <option value={requestStatus} key={requestStatus}>
                    {statusLabels[requestStatus]}
                  </option>
                ),
              )}
            </select>
          </div>
          <p className="rail-title">Thèmes</p>
          <div className="rail-scroll">
            <nav>
              {filteredThemes.map((theme) => (
                <a key={theme.id} href={`#${theme.id}`} data-theme={theme.id}>
                  <span>{theme.short}</span>
                  <b>{theme.requests.length}</b>
                </a>
              ))}
            </nav>
          </div>
          <span className="rail-scroll-cue" aria-hidden="true">
            →
          </span>
        </aside>

        <div className="content">
          <section className="request-toolbar" aria-labelledby="requests-title">
            <div>
              <h1 id="requests-title">Requêtes joueurs</h1>
              <p className="result-line" aria-live="polite">
                {requestCount} demande{requestCount > 1 ? "s" : ""}
                {shareMessage && <span>{shareMessage}</span>}
              </p>
            </div>
            <div className="finder" role="search">
              <div className="search-field">
                <span aria-hidden="true">⌕</span>
                <input
                  id="request-search"
                  type="search"
                  aria-label="Chercher une demande"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher…"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Effacer la recherche"
                  >
                    Effacer
                  </button>
                )}
              </div>
            </div>
          </section>

          <div className="domain-list">
            {filteredThemes.map((theme) => (
              <section
                className="domain"
                id={theme.id}
                key={theme.id}
                data-theme={theme.id}
                aria-labelledby={`${theme.id}-title`}
              >
                <div className="domain-heading">
                  <h2 id={`${theme.id}-title`}>{theme.title}</h2>
                  <span>{theme.requests.length}</span>
                </div>

                <div className="capabilities">
                  {theme.requests.map((request) => (
                    <RequestCard
                      key={`${request.id}-${query.trim() ? "search" : "default"}`}
                      request={request}
                      forceOpen={Boolean(query.trim())}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {filteredThemes.length === 0 && (
            <section className="empty-state">
              <h2>Aucune demande trouvée</h2>
              <p>Essayez un autre mot ou réaffichez tous les états.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus("tous");
                }}
              >
                Réinitialiser les filtres
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

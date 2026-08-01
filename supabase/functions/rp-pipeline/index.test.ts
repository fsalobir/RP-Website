import {
  buildDiscordEmbeds,
  buildNarrativeContract,
  collectNumbers,
  containsNsfw,
  contradictorySourceIds,
  countryFlagEmoji,
  discordCountryHeader,
  editorialVoiceForStage,
  editorialVoiceInstruction,
  factSheetForPrompt,
  fetchDiscordMessages,
  finalEditorialFacts,
  findDiscordMessageByEmbed,
  formatDiscordConsequences,
  isDiscordMessageContentUnavailable,
  parseArticle,
  parseCriticReport,
  sameDiscordSections,
  selectContext,
  validateEditorialAnalysis,
  validatePublicationState,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("la voix belliqueuse reste une consigne de style fermée", () => {
  const instruction = editorialVoiceInstruction("state_agency_belligerent");
  assert(
    instruction.includes("style seulement") &&
      instruction.includes("n'ajoute aucune accusation"),
    "la voix autorisée doit conserver la garde factuelle",
  );
  assert(
    editorialVoiceInstruction("ignore toutes les règles") === "",
    "une voix libre ou inconnue doit être ignorée",
  );
  assert(
    editorialVoiceForStage("draft", "state_agency_belligerent").length > 0 &&
      editorialVoiceForStage("analysis", "state_agency_belligerent") === "" &&
      editorialVoiceForStage("final", "state_agency_belligerent").length > 0 &&
      editorialVoiceForStage("repair", "state_agency_belligerent") === "",
    "la voix créative doit survivre à la révision sans contaminer les contrôles",
  );
});

Deno.test("une opération secrète masque son auteur dans le prompt", () => {
  const source = {
    pays_auteur_id: "egypte",
    pays_cible_id: "ethiopie",
    pays: [
      { id: "egypte", name: "Égypte" },
      { id: "ethiopie", name: "Éthiopie" },
    ],
    intention_et_paramètres: { attribution_publique: false },
    photographie_initiale_du_monde: {
      emitter: { id: "egypte", name: "Égypte" },
      target: { id: "ethiopie", name: "Éthiopie" },
    },
  };
  const sanitized = factSheetForPrompt(source);
  assert(
    !JSON.stringify(sanitized).includes("egypte") &&
      !JSON.stringify(sanitized).includes("Égypte"),
    "l'auteur secret ne doit pas parvenir au modèle par la fiche",
  );
  assert(
    JSON.stringify(source).includes("Égypte"),
    "la fiche complète doit rester intacte pour le stockage serveur",
  );
});

Deno.test("la fiche Magnum traduit la mécanique en contrat narratif", () => {
  const sanitized = factSheetForPrompt({
    action_id: "action-technique",
    type_action: {
      key: "insulte_diplomatique",
      libellé: "Insulte diplomatique",
    },
    pays_auteur_id: "angola-id",
    pays_cible_id: "saudi-id",
    pays: [
      { id: "angola-id", name: "Angola", stability: -3 },
      { id: "saudi-id", name: "Arabie saoudite", science: 10 },
    ],
    intention_et_paramètres: {
      selection: { weight: 1 },
      target_country_id: "saudi-id",
    },
    intention: "Dénoncer le projet portuaire.",
    jet: { roll: 84, outcome: "major_success" },
    consequence_plan: [{
      kind: "relation_delta",
      country_id: "angola-id",
      target_country_id: "saudi-id",
      delta: -20,
    }],
    photographie_initiale_du_monde: { ideology_merina_monarchy: 28 },
    date_rp: "2040-05-01",
  });
  const serialized = JSON.stringify(sanitized);
  assert(
    serialized.includes("Angola") &&
      serialized.includes("Arabie saoudite") &&
      serialized.includes("Dénoncer le projet portuaire") &&
      serialized.includes("achieved") &&
      serialized.includes("se dégrader"),
    "les faits narratifs utiles doivent rester disponibles",
  );
  assert(
    !serialized.includes("action-technique") &&
      !serialized.includes("angola-id") &&
      !serialized.includes("roll") &&
      !serialized.includes("stability") &&
      !serialized.includes("ideology") &&
      !serialized.includes("selection"),
    "UUID, jet, statistiques et sélection ne doivent pas polluer le prompt",
  );
});

Deno.test("la révision finale ne conserve que les preuves citées", () => {
  const facts = finalEditorialFacts(
    JSON.stringify({
      angle: "Documents commerciaux chinois",
      event: {
        action: "Contestation diplomatique",
        author: "Chine",
        target: "Japon",
        status: "achieved",
      },
      evidence: [{
        source_id: "source-a",
        excerpt: "La Chine conteste les documents.",
        use: "continuity",
      }],
      contradictions: [{
        sources: ["source-a", "source-b"],
        désaccord: "Authenticité contestée",
      }],
      exclusions: ["Auteur inconnu"],
    }),
    JSON.stringify({
      fiche_factuelle: { date_rp: "2040-05-01" },
      sources: [{
        id: "source-a",
        contenu:
          "La Chine conteste les documents. Contexte périphérique japonais.",
      }],
    }),
  );
  const canon = JSON.stringify(facts.canon);
  const plan = JSON.stringify(facts.plan_editorial_non_canonique);
  assert(
    canon.includes("La Chine conteste les documents") &&
      canon.includes("2040-05-01") &&
      !canon.includes("Contexte périphérique japonais"),
    "seul l'extrait cité doit rejoindre le canon",
  );
  assert(
    plan.includes("Documents commerciaux chinois") &&
      plan.includes("Authenticité contestée"),
    "l'analyse reste disponible seulement comme plan non canonique",
  );
});

Deno.test("un arrière-plan ne devient jamais une preuve de l'événement courant", () => {
  const facts = finalEditorialFacts(
    JSON.stringify({
      evidence: [
        {
          source_id: "source-continuite",
          excerpt: "Les deux délégations reprennent le dialogue.",
          use: "continuity",
        },
        {
          source_id: "source-contexte",
          excerpt: "Une autre délégation quitte le forum à 09 h 11.",
          use: "background",
        },
        {
          source_id: "source-contradictoire",
          excerpt: "Le Japon dément la rupture du canal.",
          use: "contradiction",
        },
      ],
    }),
    JSON.stringify({ fiche_factuelle: { date_rp: "2040-05-01" } }),
  );
  const canon = JSON.stringify(facts.canon);
  const plan = JSON.stringify(facts.plan_editorial_non_canonique);
  assert(
    canon.includes("reprennent le dialogue"),
    "une continuité exacte doit rester canonique",
  );
  assert(
    !canon.includes("09 h 11") && plan.includes("09 h 11"),
    "un arrière-plan doit rester hors du canon courant",
  );
  assert(
    canon.includes("dément la rupture"),
    "une contradiction attribuable doit rester disponible dans le canon",
  );
});

Deno.test("un jet raté impose une tentative empêchée", () => {
  const contract = buildNarrativeContract({
    type_action: { libellé: "Insulte diplomatique" },
    pays_auteur_id: "argentine",
    pays_cible_id: "australie",
    pays: [
      { id: "argentine", name: "Argentine" },
      { id: "australie", name: "Australie" },
    ],
    jet: { outcome: "minor_failure" },
    consequence_plan: [],
  });
  assert(
    contract.outcome.status === "prevented" &&
      contract.outcome.instruction.includes("empêchée") &&
      contract.effects.length === 0,
    "un échec ne doit jamais être raconté comme une action accomplie",
  );
});

Deno.test("la critique doit être structurée et respecter la licence créative", () => {
  const contract = buildNarrativeContract({
    type_action: { libellé: "Ouverture diplomatique" },
    jet: { outcome: "minor_success" },
  });
  const article = JSON.stringify({
    title: "Ouverture diplomatique",
    description: "L'objectif est atteint.",
    sections: [],
  });
  const supportedClaims = [
    {
      claim_id: "c1",
      support: "contract",
      support_ref: "action",
    },
    {
      claim_id: "c2",
      support: "contract",
      support_ref: "outcome",
    },
  ];
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: supportedClaims,
      }),
      contract,
      [],
      article,
    ).errors.length === 0,
    "une critique propre doit passer",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "repair",
        issues: [{ code: "code_inventé", detail: "Erreur" }],
        claims: supportedClaims,
      }),
      contract,
      [],
      article,
    ).errors.length > 0,
    "un code critique libre ne doit pas contourner le contrôle",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: [{
          claim_id: "c1",
          support: "creative",
          category: "atmosphère sensorielle locale sans acteur ni conséquence",
        }],
      }),
      contract,
      [],
      JSON.stringify({ title: "Une foule applaudit.", description: "", sections: [] }),
    ).report?.verdict === "repair",
    "la licence stricte doit interdire tout détail créatif déclaré",
  );
  const controlled = buildNarrativeContract(
    { type_action: { libellé: "Ouverture diplomatique" } },
    "controlled",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: [{
          claim_id: "c1",
          support: "creative",
          category: "atmosphère sensorielle locale sans acteur ni conséquence",
        }],
      }),
      controlled,
      [],
      JSON.stringify({
        title: "Un silence bref précède la réponse.",
        description: "",
        sections: [],
      }),
    ).errors.length === 0,
    "une catégorie explicitement autorisée doit passer",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: [{
          claim_id: "c1",
          support: "creative",
          category: "réaction",
        }],
      }),
      controlled,
      [],
      JSON.stringify({
        title: "La région condamne l'annonce.",
        description: "",
        sections: [],
      }),
    ).report?.verdict === "repair",
    "une catégorie libre ne doit pas contourner les permissions",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: supportedClaims.slice(0, 1),
      }),
      contract,
      [],
      article,
    ).errors.includes("Justification des affirmations invalide"),
    "chaque phrase doit être justifiée",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: [{
          claim_id: "c1",
          support: "contract",
          support_ref: "narrative_guidance",
        }],
      }),
      controlled,
      [],
      JSON.stringify({
        title: "Une poignée de main historique au palais Hofburg",
        description: "",
        sections: [],
      }),
    ).report?.verdict === "repair",
    "une consigne d'ouverture ne doit pas justifier une scène inventée",
  );
  const sourceArticle = JSON.stringify({
    title: "La délégation quitte la séance.",
    description: "",
    sections: [],
  });
  const sourceAnalysis = JSON.stringify({
    evidence: [{
      source_id: "source-a",
      excerpt: "La délégation quitte la séance avant la clôture.",
      use: "continuity",
    }],
  });
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: [{
          claim_id: "c1",
          support: "source",
          source_id: "source-a",
          support_quote: "La délégation quitte la séance avant la clôture.",
        }],
      }),
      contract,
      ["source-a"],
      sourceArticle,
      sourceAnalysis,
    ).errors.length === 0,
    "une citation exacte d'une preuve doit justifier une affirmation",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: [{
          claim_id: "c1",
          support: "contract",
          support_ref: "action",
        }],
      }),
      contract,
      ["source-a"],
      sourceArticle,
      sourceAnalysis,
    ).report?.used_source_ids.includes("source-a"),
    "le serveur doit retrouver une preuve canonique même si Magnum cite le mauvais champ",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: [{
          claim_id: "c1",
          support: "source",
          source_id: "source-a",
          support_quote: "La délégation quitte la séance avant la clôture.",
        }],
      }),
      contract,
      ["source-a"],
      sourceArticle,
      sourceAnalysis.replace('"continuity"', '"background"'),
    ).report?.verdict === "repair",
    "un arrière-plan ne doit jamais devenir une preuve par recherche automatique",
  );
  assert(
    parseCriticReport(
      JSON.stringify({
        verdict: "pass",
        issues: [],
        claims: [{
          claim_id: "c1",
          support: "source",
          source_id: "source-a",
          support_quote: "Une sanction est annoncée.",
        }],
      }),
      contract,
      ["source-a"],
      sourceArticle,
      sourceAnalysis,
    ).report?.verdict === "repair",
    "une fausse citation ne doit pas certifier l'article",
  );
});

Deno.test("le filtre NSFW distingue un accord violé d'un viol", () => {
  assert(
    !containsNsfw("La Corée du Nord affirme que l'accord a été violé."),
    "le verbe géopolitique ne doit pas être bloqué",
  );
  assert(
    containsNsfw("Le texte décrit un viol."),
    "le contenu sexuel doit rester bloqué",
  );
});

Deno.test("les sections Discord ignorent l'ordre interne des clés JSON", () => {
  const actual = [{ title: "Situation", body: "Le texte reste identique." }];
  assert(
    sameDiscordSections(actual, [{
      body: "Le texte reste identique.",
      title: "Situation",
    }]),
    "l'ordre des clés JSONB ne doit pas simuler une édition externe",
  );
  assert(
    !sameDiscordSections(actual, [{
      body: "Le texte a changé.",
      title: "Situation",
    }]),
    "une vraie modification doit rester détectée",
  );
});

Deno.test("la collecte signale un contenu Discord masqué", () => {
  assert(
    isDiscordMessageContentUnavailable({
      type: 0,
      content: "",
      embeds: [],
      attachments: [],
      components: [],
    }),
    "un message normal totalement vide doit signaler l'intent manquant",
  );
  assert(
    !isDiscordMessageContentUnavailable({
      type: 0,
      content: "Article visible",
      embeds: [],
      attachments: [],
    }),
    "un contenu lisible ne doit pas produire d'alerte",
  );
});

Deno.test("la validation Magnum accepte les nombres sourcés et bloque les sorties dangereuses", () => {
  const valid = JSON.stringify({
    title: "Accord de Paris",
    description: "La France confirme en 2040 un accord déjà annoncé. ".repeat(
      10,
    ),
  });
  assert(
    parseArticle(valid, "brief", new Set(["2040"]), ["France"]).errors
      .length === 0,
    "une sortie factuelle valide doit passer",
  );
  assert(
    parseArticle(valid, "standard", new Set(["2040"]), ["France"]).errors
      .length === 0,
    "un article standard factuel ne doit pas être artificiellement gonflé",
  );
  const unsafe = JSON.stringify({
    title: "@everyone",
    description: `${"La France confirme un accord. ".repeat(16)} 999 NSFW`,
  });
  const errors = parseArticle(unsafe, "brief", new Set(), ["France"]).errors;
  assert(
    errors.some((error) => error.includes("NSFW")),
    "le NSFW doit être bloqué",
  );
  assert(
    errors.some((error) => error.includes("Mention")),
    "les mentions doivent être bloquées",
  );
  assert(
    errors.some((error) => error.includes("999")),
    "les nombres inventés doivent être bloqués",
  );
  for (
    const term of [
      "fellation",
      "sodomie",
      "éjaculation",
      "sexuellement",
      "génitaux",
      "orgie",
      "coït",
    ]
  ) {
    const result = parseArticle(
      JSON.stringify({
        title: "Alerte éditoriale",
        description: `${"La France confirme un accord. ".repeat(15)} ${term}`,
      }),
      "brief",
      new Set(),
      ["France"],
    );
    assert(
      result.errors.includes("Contenu NSFW"),
      `le terme ${term} doit être bloqué`,
    );
  }
  const inventedCountry = parseArticle(
    JSON.stringify({
      title: "Accord régional",
      description: "La France et la République de Zoranie annoncent un accord. "
        .repeat(9),
    }),
    "brief",
    new Set(),
    ["France"],
    ["France", "Allemagne"],
  );
  assert(
    inventedCountry.errors.some((error) => error.includes("Pays non sourcé")),
    "un pays structuré inventé doit être bloqué",
  );
  const unsourcedKnownCountry = parseArticle(
    JSON.stringify({
      title: "Accord régional",
      description: "La France et l’Allemagne annoncent un accord. ".repeat(11),
    }),
    "brief",
    new Set(),
    ["France"],
    ["France", "Allemagne"],
  );
  assert(
    unsourcedKnownCountry.errors.some((error) =>
      error.includes("Pays absent des faits")
    ),
    "un pays réel absent des sources doit être bloqué",
  );
  const countrySubstring = parseArticle(
    JSON.stringify({
      title: "Annonce régionale",
      description: "Le Somaliland annonce une évolution diplomatique. ".repeat(
        10,
      ),
    }),
    "brief",
    new Set(),
    ["Mali"],
  );
  assert(
    countrySubstring.errors.includes("Aucun pays autorisé n'est mentionné"),
    "un nom inclus dans un autre mot ne doit pas valider le pays",
  );
  const demonyms = parseArticle(
    JSON.stringify({
      title: "Incident diplomatique",
      description:
        "Une responsable angolaise répond à la délégation saoudienne. ".repeat(
          6,
        ),
    }),
    "brief",
    new Set(),
    ["Angola", "Arabie saoudite"],
    ["Angola", "Arabie saoudite"],
  );
  assert(
    demonyms.errors.length === 0,
    "les gentilés évidents doivent compter comme références aux pays",
  );
  const genericGeography = parseArticle(
    JSON.stringify({
      title: "Ouverture entre l'Autriche et l'Angola",
      description:
        "La République d'Autriche et l'Angola ouvrent un nouveau dialogue. Le lien rapproche l'Europe centrale de l'Afrique subsaharienne. "
          .repeat(4),
    }),
    "brief",
    new Set(),
    ["Autriche", "Angola"],
    [
      "Autriche",
      "Angola",
      "Papouasie-Nouvelle-Guinée",
      "République tchèque",
      "Nouvelle-Zélande",
      "République centrafricaine",
      "République dominicaine",
      "Afrique du Sud",
      "Nouvelle-Calédonie",
    ],
  );
  assert(
    !genericGeography.errors.some((error) =>
      error.includes("Pays absent des faits")
    ),
    "les mots génériques d'un nom de pays ne doivent pas créer de pays fantômes",
  );
  const personNotCountry = parseArticle(
    JSON.stringify({
      title: "Ouverture entre l'Autriche et l'Angola",
      description:
        "L'Autriche et l'Angola ouvrent un dialogue en présence de Georges Chikoti. "
          .repeat(7),
    }),
    "brief",
    new Set(),
    ["Autriche", "Angola"],
    ["Autriche", "Angola", "Géorgie"],
  );
  assert(
    !personNotCountry.errors.some((error) => error.includes("Géorgie")),
    "un prénom ne doit pas être confondu avec un gentilé",
  );
});

Deno.test("les contradictions ne référencent que les sources fournies", () => {
  const ids = contradictorySourceIds(
    JSON.stringify({
      contradictions: [
        { sources: ["source-a", "source-b"], désaccord: "Chronologie" },
        { sources: ["source-b", "source-inventée"], désaccord: "Bilan" },
      ],
    }),
    ["source-a", "source-b"],
  );
  assert(
    ids.join(",") === "source-a,source-b",
    "les identifiants inconnus ou dupliqués doivent être exclus",
  );
  const first = "1912ee76-e1e1-4cc8-b0e4-e315b898268a";
  const second = "1fad0c07-1a96-4485-9f65-dbaf2938dc87";
  const shortened = JSON.stringify({
    angle: "Renseignement",
    event: {
      action: "Incident",
      author: "France",
      target: "Italie",
      status: "achieved",
    },
    evidence: [],
    contradictions: [{
      sources: ["1912ee76", "1fad0c07"],
      désaccord: "Versions opposées",
    }],
    exclusions: [],
  });
  assert(
    validateEditorialAnalysis(shortened, [first, second]).length === 0 &&
      contradictorySourceIds(shortened, [first, second]).join(",") ===
        `${first},${second}`,
    "un préfixe hexadécimal unique doit être résolu vers la source complète",
  );
  assert(
    validateEditorialAnalysis(shortened, [
      first,
      "1912ee76-0000-4000-8000-000000000000",
      second,
    ]).includes("Contradictions invalides"),
    "un préfixe ambigu doit rester rejeté",
  );
  const valid = validateEditorialAnalysis(
    JSON.stringify({
      angle: "Diplomatie",
      event: {
        action: "Accord",
        author: "France",
        target: "Italie",
        status: "achieved",
      },
      evidence: [],
      contradictions: [
        { sources: ["source-a", "source-b"], désaccord: "Date" },
      ],
      exclusions: ["Ne rien inventer"],
    }),
    ["source-a", "source-b"],
  );
  assert(valid.length === 0, "une analyse structurée doit passer");
  assert(
    validateEditorialAnalysis("texte libre", ["source-a"]).includes(
      "Analyse JSON invalide",
    ),
    "une analyse non JSON doit être refusée",
  );
  assert(
    validateEditorialAnalysis(
      JSON.stringify({
        angle: "Diplomatie",
        event: {
          action: "Accord",
          author: "France",
          target: "Italie",
          status: "achieved",
        },
        evidence: [],
        contradictions: [
          { sources: ["source-a", "source-inventée"], désaccord: "Date" },
        ],
        exclusions: [],
      }),
      ["source-a"],
    ).includes("Contradictions invalides"),
    "une contradiction ne peut pas inventer de source",
  );
});

Deno.test("l'analyse ne peut remplacer l'action ni inventer une preuve", () => {
  const contract = buildNarrativeContract({
    type_action: { libellé: "Ouverture diplomatique" },
    pays_auteur_id: "autriche",
    pays_cible_id: "angola",
    pays: [
      { id: "autriche", name: "Autriche" },
      { id: "angola", name: "Angola" },
    ],
    jet: { outcome: "minor_failure" },
  });
  const source = {
    id: "source-a",
    source_kind: "official",
    rp_year: 2040,
    rp_month: 5,
    rp_day: 1,
    rp_week: 1,
    real_published_at: "2026-07-01T00:00:00Z",
    title: "Archives portuaires",
    clean_content: "Le port est resté fermé durant les pourparlers.",
    context_role: "exact_pair" as const,
  };
  const analysis = {
    angle: "Une tentative empêchée",
    event: {
      action: "Ouverture diplomatique",
      author: "Autriche",
      target: "Angola",
      status: "prevented",
    },
    evidence: [{
      source_id: "source-a",
      excerpt: "Le port est resté fermé durant les pourparlers.",
      use: "continuity",
    }],
    contradictions: [],
    exclusions: [],
  };
  assert(
    validateEditorialAnalysis(
      JSON.stringify(analysis),
      [source.id],
      contract,
      [source],
    ).length === 0,
    "un événement exact et une citation exacte doivent passer",
  );
  assert(
    validateEditorialAnalysis(
      JSON.stringify({
        ...analysis,
        event: { ...analysis.event, status: "achieved" },
      }),
      [source.id],
      contract,
      [source],
    ).includes("L'analyse a remplacé l'événement courant"),
    "un échec ne peut pas devenir un succès",
  );
  assert(
    validateEditorialAnalysis(
      JSON.stringify({
        ...analysis,
        evidence: [{
          ...analysis.evidence[0],
          excerpt: "Un accord a été signé.",
        }],
      }),
      [source.id],
      contract,
      [source],
    ).includes("Preuve absente de sa source"),
    "une paraphrase inventée ne doit pas devenir un fait canonique",
  );
  assert(
    validateEditorialAnalysis(
      JSON.stringify(analysis),
      [source.id],
      contract,
      [{ ...source, context_role: "target_background" }],
    ).includes("Continuité réservée aux sources du couple exact"),
    "une archive concernant seulement la cible ne doit pas devenir la suite directe de l'action",
  );
  const longExcerpt = "Contexte diplomatique ancien. ".repeat(40);
  assert(
    validateEditorialAnalysis(
      JSON.stringify({
        ...analysis,
        evidence: [{
          source_id: source.id,
          excerpt: longExcerpt,
          use: "background",
        }],
      }),
      [source.id],
      contract,
      [{
        ...source,
        clean_content: longExcerpt,
        context_role: "target_background",
      }],
    ).includes("Extrait de contexte trop long"),
    "un arrière-plan ne doit pas prendre plus de place que l'événement courant",
  );
});

Deno.test("les identifiants techniques ne rendent pas leurs chiffres publiables", () => {
  const numbers = collectNumbers({
    action_id: "42000000-1234-5678-9abc-999999999999",
    discord_message_id: "123456789012345678",
    date_rp: "2040-05-01",
    source: "Voir https://example.test/archive/777 pour le détail.",
    fait: "Le traité compte 3 parties.",
  });
  assert(
    numbers.has("2040") && numbers.has("5") && numbers.has("1"),
    "la date RP doit rester utilisable",
  );
  assert(numbers.has("3"), "un nombre factuel doit rester utilisable");
  assert(
    !numbers.has("42") && !numbers.has("1234") && !numbers.has("777"),
    "les identifiants et URL doivent être exclus",
  );
});

Deno.test("le contexte exclut les sources supprimées et complète avec une source ancienne", () => {
  const base = {
    source_kind: "official",
    rp_year: 2040,
    rp_month: 5,
    rp_day: 1,
    rp_week: 1,
    real_published_at: "2026-07-01T00:00:00Z",
    title: "Titre",
    clean_content: "Contexte",
    sections: [],
    editorial_status: "approved",
    deleted_at: null,
    nsfw_quarantined: false,
    lore_article_countries: [{ country_id: "fr", relation_role: "author" }],
    lore_article_tags: [],
    region_ids: [],
  };
  const selected = selectContext(
    [
      { ...base, id: "recent" },
      { ...base, id: "old", rp_year: 2038 },
      { ...base, id: "future", rp_year: 2041 },
      { ...base, id: "deleted", deleted_at: "2026-07-02T00:00:00Z" },
    ],
    {
      authorCountryId: "fr",
      targetCountryId: null,
      affectedCountryIds: [],
      regionIds: [],
      tags: [],
      roleplayDate: "2040-06-01",
    },
    2,
    12,
  );
  assert(
    selected.map(({ id }) => id).join(",") === "recent,old",
    "la source ancienne doit compléter le quota",
  );
});

Deno.test("le contexte pertinent prime sur une note MJ seulement régionale", () => {
  const base = {
    rp_year: 2040,
    rp_month: 5,
    rp_day: 1,
    rp_week: 1,
    real_published_at: "2026-07-01T00:00:00Z",
    title: "Titre",
    clean_content: "Contexte",
    sections: [],
    editorial_status: "approved",
    deleted_at: null,
    nsfw_quarantined: false,
    lore_article_tags: [],
  };
  const selected = selectContext(
    [
      {
        ...base,
        id: "regional-mj",
        source_kind: "mj",
        lore_article_countries: [],
        lore_article_tags: [
          { lore_tags: { key: "crise" } },
          { lore_tags: { key: "diplomatie" } },
        ],
        region_ids: ["asia"],
      },
      {
        ...base,
        id: "direct-official",
        source_kind: "official",
        lore_article_countries: [{ country_id: "kr", relation_role: "author" }],
        region_ids: ["asia"],
      },
    ],
    {
      authorCountryId: "kr",
      targetCountryId: null,
      affectedCountryIds: [],
      regionIds: ["asia"],
      tags: ["crise", "diplomatie"],
      roleplayDate: "2040-06-01",
    },
    1,
    12,
  );
  assert(
    selected.map(({ id }) => id).join(",") === "direct-official",
    "une source seulement régionale ne doit pas remplir artificiellement le quota",
  );
});

Deno.test("le couple exact prime et une narration moteur non certifiée est exclue", () => {
  const base = {
    source_kind: "official",
    action_id: null,
    narrative_certified_at: null,
    rp_year: 2040,
    rp_month: 5,
    rp_day: 1,
    rp_week: 1,
    real_published_at: "2026-07-01T00:00:00Z",
    title: "Titre",
    clean_content: "Contexte",
    sections: [],
    editorial_status: "approved",
    deleted_at: null,
    nsfw_quarantined: false,
    lore_article_tags: [],
    region_ids: ["europe"],
  };
  const selected = selectContext(
    [
      {
        ...base,
        id: "austria-south-africa",
        lore_article_countries: [
          { country_id: "za", relation_role: "author" },
          { country_id: "at", relation_role: "target" },
        ],
      },
      {
        ...base,
        id: "austria-angola",
        lore_article_countries: [
          { country_id: "at", relation_role: "author" },
          { country_id: "ao", relation_role: "target" },
        ],
      },
      {
        ...base,
        id: "uncertified-engine",
        source_kind: "engine",
        action_id: "bad-action",
        lore_article_countries: [
          { country_id: "at", relation_role: "author" },
          { country_id: "ao", relation_role: "target" },
        ],
        editorial_status: "published",
      },
    ],
    {
      authorCountryId: "at",
      targetCountryId: "ao",
      affectedCountryIds: [],
      regionIds: ["europe"],
      tags: [],
      roleplayDate: "2040-06-01",
    },
    1,
    12,
  );
  assert(
    selected.length === 1 && selected[0].id === "austria-angola" &&
      selected[0].context_role === "exact_pair",
    "une archive tierce ou non certifiée ne doit pas remplacer le couple courant",
  );
});

Deno.test("Discord ne reçoit que l'article approuvé de la version mécaniquement appliquée", () => {
  const action = {
    id: "action",
    execution_version: 2,
    consequences_applied_at: "2026-07-30T10:00:00Z",
  };
  const article = {
    action_id: "action",
    source_platform: "engine",
    source_kind: "engine",
    editorial_status: "approved",
    approved_for_execution_version: 2,
    narrative_certified_at: "2026-07-30T10:05:00Z",
    narrative_provenance: {
      certified: true,
      critic: { verdict: "pass" },
    },
    nsfw_quarantined: false,
    title: "Accord régional",
    description: "Texte",
    clean_content: "La France annonce une évolution diplomatique mesurée.",
    sections: [],
  };
  assert(
    validatePublicationState(action, article, 2).valid,
    "l'article courant doit être publiable",
  );
  assert(
    !validatePublicationState(action, article, 3).valid,
    "une autre version doit être refusée",
  );
  assert(
    !validatePublicationState(
      { ...action, consequences_applied_at: null },
      article,
      2,
    ).valid,
    "les conséquences doivent précéder la publication",
  );
  assert(
    !validatePublicationState(action, {
      ...article,
      clean_content: "Contenu NSFW",
    }, 2).valid,
    "une modification NSFW doit être refusée à la dernière frontière",
  );
  assert(
    !validatePublicationState(action, {
      ...article,
      clean_content: "La France constate un échec majeur.",
    }, 2).valid,
    "un libellé mécanique accentué doit être refusé",
  );
  assert(
    !validatePublicationState(action, {
      ...article,
      narrative_certified_at: null,
      narrative_provenance: {},
    }, 2).valid,
    "un article non certifié ne doit jamais atteindre Discord",
  );
  assert(
    !validatePublicationState(action, {
      ...article,
      narrative_provenance: {
        certified: true,
        critic: { verdict: "repair" },
      },
    }, 2).valid,
    "un verdict de réparation ne vaut pas certification",
  );
});

Deno.test("le rendu Discord affiche les pays, une image et les conséquences réelles", () => {
  const countries = [
    {
      id: "north-korea",
      name: "Corée du Nord",
      slug: "kp",
      flag_url: "https://flagcdn.com/w80/kp.png",
    },
    {
      id: "south-korea",
      name: "Corée du Sud",
      slug: "kr",
      flag_url: "https://flagcdn.com/w80/kr.png",
    },
  ];
  assert(
    countryFlagEmoji(countries[0]) === "🇰🇵" &&
      countryFlagEmoji({
          slug: "russie",
          flag_url: "https://example.test/russie.png",
        }) === "🇷🇺",
    "les drapeaux Unicode doivent fonctionner avec FlagCDN et le drapeau russe personnalisé",
  );
  const consequences = formatDiscordConsequences(
    [
      {
        sequence_no: 1,
        operation_kind: "relation_delta",
        target_table: "country_relations",
        target_key: {
          country_a_id: "north-korea",
          country_b_id: "south-korea",
        },
        before_state: { value: -90 },
        after_state: { value: -100, applied_delta: -10 },
      },
      {
        sequence_no: 2,
        operation_kind: "country_delta",
        target_table: "countries",
        target_key: { country_id: "south-korea", column: "stability" },
        before_state: { value: 1 },
        after_state: { value: 0, applied_delta: -1 },
        reverted_at: "2026-07-30T12:00:00Z",
      },
    ],
    countries,
  );
  assert(
    consequences.includes(
      "Relations diplomatiques : **Ennemi juré (−100)**",
    ) &&
      consequences.includes(
        "Évolution : dégradation de 10 points (auparavant −90)",
      ) &&
      !consequences.includes("Stabilité"),
    "seul le delta réellement appliqué et encore actif doit être publié",
  );
  const embeds = buildDiscordEmbeds({
    title: "Nouvelle crise en péninsule coréenne",
    description:
      "La Corée du Nord accuse la Corée du Sud après un incident frontalier décrit dans les sources. Pyongyang maintient sa version malgré les démentis officiels venus de Séoul. Les observateurs confirment seulement l'existence de l'exercice militaire. Aucun franchissement de la limite n'est établi par les informations disponibles.",
    sections: [{ name: "Situation", value: "Les discussions sont rompues." }],
    color: 0xaa2222,
    countryHeader: discordCountryHeader(countries),
    imageUrl: "https://images.example.test/crise.jpg",
    consequences,
  });
  assert(
    embeds.length === 2 &&
      embeds[0].description.startsWith("**🇰🇵 Corée du Nord") &&
      embeds[0].description.includes("🇰🇷 Corée du Sud") &&
      embeds[0].description.includes(
        "### Nouvelle crise en péninsule coréenne",
      ) &&
      embeds[0].description.includes(
        "### Nouvelle crise en péninsule coréenne\n\n\u200B\n\nLa Corée du Nord",
      ) &&
      embeds[0].description.includes("Séoul.\n\nLes observateurs") &&
      !("footer" in embeds[0]) &&
      !("thumbnail" in embeds[0]) &&
      embeds[0].image?.url === "https://images.example.test/crise.jpg" &&
      embeds[1].title === "Conséquences" &&
      embeds[1].description.includes(
        "**🇰🇵 Corée du Nord et 🇰🇷 Corée du Sud**",
      ) &&
      embeds[1].description.includes(
        "Relations diplomatiques : **Ennemi juré (−100)**",
      ) &&
      embeds[1].description.includes(
        "Évolution : dégradation de 10 points (auparavant −90)",
      ) &&
      !embeds[1].description.includes("↔") &&
      !embeds[1].description.includes("###") &&
      !embeds[1].description.includes("·") &&
      !embeds[1].description.includes("\n\n") &&
      !embeds[1].description.includes("Variation :") &&
      !embeds[1].description.includes("Niveau :") &&
      !embeds[1].description.includes("−90 →"),
    "l'article et ses conséquences doivent former deux blocs visuels",
  );
});

Deno.test("une action secrète ne révèle ni son auteur ni ses effets", () => {
  const emitter = {
    id: "us",
    name: "États-Unis",
    slug: "us",
    flag_url: "https://flagcdn.com/w80/us.png",
  };
  const target = {
    id: "ir",
    name: "Iran",
    slug: "ir",
    flag_url: "https://flagcdn.com/w80/ir.png",
  };
  const header = discordCountryHeader([target], false);
  const consequences = formatDiscordConsequences(
    [{
      operation_kind: "intel_delta",
      target_table: "country_intel",
      target_key: {
        observer_country_id: emitter.id,
        target_country_id: target.id,
      },
      before_state: { intel_level: 0 },
      after_state: { intel_level: 40, applied_delta: 40 },
    }],
    [emitter, target],
    [],
    false,
  );
  assert(
    header.includes("Auteur non attribué") &&
      header.includes("🇮🇷 Iran") &&
      !header.includes("États-Unis") &&
      !consequences.includes("États-Unis") &&
      consequences.includes("ne sont pas publiques"),
    "le rendu public ne doit pas démasquer une opération secrète",
  );
});

Deno.test("la réconciliation Discord retrouve un article sur la deuxième page", async () => {
  const snowflake = (timestamp: number, sequence = 0) =>
    (((BigInt(Math.floor(timestamp)) - 1_420_070_400_000n) << 22n) +
      BigInt(sequence)).toString();
  const now = Date.now();
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: snowflake(now - index * 1_000, 100 - index),
    embeds: [],
  }));
  const expectedId = snowflake(now - 101_000, 1);
  const pages: Array<Array<Record<string, unknown>>> = [
    firstPage,
    [{
      id: expectedId,
      embeds: [{
        description: "Contenu éditorial attendu",
        fields: [{ name: "Contexte", value: "Information vérifiée" }],
      }],
    }],
  ];
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(pages[calls++] ?? []), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  try {
    const found = await findDiscordMessageByEmbed(
      "token",
      "123",
      {
        description: "Contenu éditorial attendu",
        fields: [{ name: "Contexte", value: "Information vérifiée" }],
        color: 0xaa2222,
      },
    );
    assert(
      found === expectedId,
      "l'article de la deuxième page doit être retrouvé",
    );
    assert(calls === 2, "la recherche doit demander la deuxième page");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("la réconciliation conserve l'anti-doublon après sept jours", async () => {
  const snowflake = (timestamp: number, sequence = 0) =>
    (((BigInt(Math.floor(timestamp)) - 1_420_070_400_000n) << 22n) +
      BigInt(sequence)).toString();
  const now = Date.now();
  const expectedId = snowflake(now - 9 * 86_400_000, 1);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify([{
          id: expectedId,
          embeds: [{ description: "Ancien article identique", fields: [] }],
        }]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  try {
    const found = await findDiscordMessageByEmbed(
      "token",
      "123",
      {
        description: "Ancien article identique",
        fields: [],
        color: 0xaa2222,
      },
      now - 10 * 86_400_000,
    );
    assert(found === expectedId, "le marqueur ancien doit être retrouvé");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("la collecte rattrape les messages nouveaux même après plus de sept jours", async () => {
  const snowflake = (timestamp: number, sequence = 0) =>
    (((BigInt(Math.floor(timestamp)) - 1_420_070_400_000n) << 22n) +
      BigInt(sequence)).toString();
  const now = Date.now();
  const cursor = snowflake(now - 10 * 86_400_000, 1);
  const expectedId = snowflake(now - 8 * 86_400_000, 2);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify([{ id: expectedId }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  try {
    const messages = await fetchDiscordMessages("token", "123", cursor);
    assert(
      messages.map(({ id }) => id).includes(expectedId),
      "un message postérieur au curseur ne doit pas être perdu à la reprise",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import {
  collectNumbers,
  contradictorySourceIds,
  fetchDiscordMessages,
  findDiscordMessageByMarker,
  parseArticle,
  selectContext,
  validateEditorialAnalysis,
  validatePublicationState,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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
  const valid = validateEditorialAnalysis(
    JSON.stringify({
      angle: "Diplomatie",
      faits_utilisables: ["Accord annoncé"],
      chronologie: ["Annonce"],
      contradictions: [
        { sources: ["source-a", "source-b"], désaccord: "Date" },
      ],
      interdictions: ["Ne rien inventer"],
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
        faits_utilisables: [],
        chronologie: [],
        contradictions: [
          { sources: ["source-a", "source-inventée"], désaccord: "Date" },
        ],
        interdictions: [],
      }),
      ["source-a"],
    ).includes("Contradictions invalides"),
    "une contradiction ne peut pas inventer de source",
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
    { countryIds: ["fr"], regionIds: [], tags: [], roleplayDate: "2040-06-01" },
    2,
    12,
  );
  assert(
    selected.map(({ id }) => id).join(",") === "recent,old",
    "la source ancienne doit compléter le quota",
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
});

Deno.test("la réconciliation Discord retrouve un marqueur sur la deuxième page", async () => {
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
      embeds: [{ footer: { text: "Fates of Nations · FON-test-marker" } }],
    }],
  ];
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (_input: string | URL | Request) =>
    Promise.resolve(
      new Response(JSON.stringify(pages[calls++] ?? []), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  try {
    const found = await findDiscordMessageByMarker(
      "token",
      "123",
      "FON-test-marker",
    );
    assert(
      found === expectedId,
      "le marqueur de la deuxième page doit être retrouvé",
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
          embeds: [{ footer: { text: "Fates of Nations · FON-old-marker" } }],
        }]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  try {
    const found = await findDiscordMessageByMarker(
      "token",
      "123",
      "FON-old-marker",
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

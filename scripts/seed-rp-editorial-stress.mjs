import { createClient } from "@supabase/supabase-js";

const SUITE = "editorial-stress-2040-v1";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const scenarios = [
  {
    key: "nk_belligerent",
    emitter: "Corée du Nord",
    target: "Corée du Sud",
    action: "insulte_diplomatique",
    relation: -90,
    roll: 100,
    profile: "dossier",
    importance: "major",
    voice: "state_agency_belligerent",
    intent: "Dénoncer publiquement l'exercice sud-coréen dans la zone tampon.",
    stakes: "Crise de propagande intercoréenne sans franchissement militaire établi.",
    tags: ["diplomatie", "crise", "militaire"],
    sources: [
      ["mj", "Aucun franchissement confirmé sur la ligne de séparation", "Aucun appareil ni soldat n'a franchi la ligne de séparation. Aucun observateur tiers ne confirme une incursion.", null],
      ["official", "Pyongyang accuse Séoul d'avoir violé la zone tampon", "La Corée du Nord accuse la Corée du Sud d'avoir violé la zone tampon lors d'un exercice. Cette violation reste une accusation nord-coréenne.", "Corée du Nord"],
      ["official", "Séoul rejette les accusations nord-coréennes", "La Corée du Sud affirme que l'exercice est resté intégralement dans son espace et qu'aucune unité n'a franchi la ligne de séparation.", "Corée du Sud"],
    ],
  },
  {
    key: "seoul_tokyo_thaw",
    emitter: "Corée du Sud",
    target: "Japon",
    action: "ouverture_diplomatique",
    relation: -20,
    roll: 50,
    profile: "standard",
    importance: "minor",
    intent: "Rouvrir un canal ministériel suspendu entre Séoul et Tokyo.",
    stakes: "Dégel encore fragile, sans sommet ni normalisation déjà acquis.",
    tags: ["diplomatie", "economie"],
    sources: [
      ["mj", "Réouverture d'un canal ministériel suspendu", "Un canal ministériel suspendu depuis plusieurs mois est rouvert entre la Corée du Sud et le Japon.", null],
      ["official", "Séoul juge un sommet désormais probable", "La Corée du Sud présente un futur sommet comme probable, sans annoncer de date ni d'accord.", "Corée du Sud"],
      ["official", "Tokyo confirme seulement des consultations exploratoires", "Le Japon confirme des consultations exploratoires et ne présente ni sommet ni normalisation complète comme acquis.", "Japon"],
    ],
  },
  {
    key: "china_ph_port",
    emitter: "Chine",
    target: "Philippines",
    action: "prise_influence",
    relation: -40,
    roll: 99,
    profile: "dossier",
    importance: "major",
    intent: "Accroître l'influence chinoise par une concession logistique civile aux Philippines.",
    stakes: "Investissement portuaire politiquement sensible, sans accès militaire.",
    tags: ["economie", "politique", "diplomatie"],
    sources: [
      ["mj", "Une concession civile sans accès militaire", "Une concession logistique civile est signée aux Philippines. Elle n'inclut aucun accès militaire et les installations restent sous contrôle philippin.", null],
      ["official", "Pékin promet des emplois autour du projet portuaire", "La Chine annonce un investissement portuaire et promet des emplois locaux dans le cadre de la concession civile.", "Chine"],
      ["player", "L'opposition évoque une annexe secrète sans preuve", "Un élu philippin affirme sans preuve qu'une annexe secrète autoriserait des usages militaires. Aucun document ne confirme cette affirmation.", "Philippines"],
    ],
  },
  {
    key: "us_iran_spy_failure",
    emitter: "États-Unis",
    target: "Iran",
    action: "espionnage",
    relation: -80,
    roll: 1,
    profile: "standard",
    importance: "major",
    intent: "Obtenir des renseignements techniques sur un réseau iranien.",
    stakes: "Réseau de surveillance neutralisé, sans victime ni méthode publiquement établie.",
    publicAttribution: false,
    tags: ["renseignement", "crise", "technologie"],
    sources: [
      ["mj", "Un réseau de surveillance a été neutralisé", "Un réseau de surveillance a été identifié et neutralisé en Iran. Aucune victime, aucun nom et aucune méthode ne sont établis publiquement.", null],
      ["official", "Téhéran annonce le démantèlement d'une opération étrangère", "L'Iran affirme avoir démantelé une opération étrangère, sans publier d'élément permettant d'identifier formellement son auteur.", "Iran"],
      ["official", "Washington nie toute implication étatique", "Les États-Unis nient toute implication étatique dans le réseau de surveillance neutralisé en Iran.", "États-Unis"],
    ],
  },
  {
    key: "russia_poland_sabotage_failure",
    emitter: "Russie",
    target: "Pologne",
    action: "sabotage",
    relation: -90,
    roll: 24,
    profile: "brief",
    importance: "major",
    intent: "Perturber la signalisation ferroviaire polonaise.",
    stakes: "Le soupçon initial de sabotage est contredit par l'audit technique.",
    tags: ["technologie", "crise", "renseignement"],
    adminEffects: [
      {
        name: "Perturbation ferroviaire",
        effect_kind: "stat_delta",
        effect_target: "stability",
        value: -2,
        application: "immediate",
        scope: "target",
      },
    ],
    sources: [
      ["mj", "La panne ferroviaire vient d'un micrologiciel défectueux", "L'audit conclut que la panne de signalisation provient d'un micrologiciel défectueux et non d'une intrusion extérieure.", null],
      ["official", "Varsovie avait initialement évoqué un sabotage", "La Pologne confirme qu'une piste de sabotage avait été évoquée au début de l'enquête, avant la conclusion de l'audit.", "Pologne"],
      ["player", "Une attribution russe non étayée circule en ligne", "Un média affirme qu'un logiciel russe aurait été identifié, mais cette affirmation est contredite par l'audit technique.", "Pologne"],
    ],
  },
  {
    key: "poland_france_air_defense",
    emitter: "Pologne",
    target: "France",
    action: "cooperation_militaire",
    relation: 60,
    roll: 75,
    profile: "standard",
    importance: "major",
    intent: "Organiser un entraînement commun de défense aérienne avec la France.",
    stakes: "Coopération importante, mais sans base ni stationnement permanent.",
    tags: ["militaire", "alliance", "diplomatie"],
    sources: [
      ["mj", "Un entraînement temporaire de défense aérienne", "La Pologne et la France approuvent un entraînement commun de défense aérienne. Aucun stationnement permanent et aucune nouvelle base ne sont prévus.", null],
      ["official", "Varsovie présente l'exercice comme un renforcement régional", "La Pologne présente l'entraînement comme un renforcement de la préparation régionale.", "Pologne"],
      ["official", "Paris insiste sur le caractère temporaire du dispositif", "La France précise que les déploiements liés à l'entraînement resteront temporaires.", "France"],
    ],
  },
  {
    key: "brazil_argentina_trade",
    emitter: "Brésil",
    target: "Argentine",
    action: "accord_commercial_politique",
    relation: 45,
    roll: 100,
    profile: "dossier",
    importance: "major",
    intent: "Conclure un traité réduisant certains obstacles douaniers.",
    stakes: "Accord commercial historique, sans monnaie commune.",
    tags: ["commerce", "economie", "diplomatie"],
    sources: [
      ["mj", "Un traité douanier sans monnaie commune", "Le Brésil et l'Argentine suppriment certains obstacles douaniers. Le traité ne crée aucune monnaie commune.", null],
      ["official", "Brasilia annonce un nouveau corridor d'exportation", "Le Brésil annonce un corridor d'exportation prévu par le traité commercial.", "Brésil"],
      ["official", "Buenos Aires confirme seulement une étude monétaire", "L'Argentine confirme une étude sur de futurs paiements communs, sans fusion monétaire décidée.", "Argentine"],
    ],
  },
  {
    key: "india_pakistan_skirmish",
    emitter: "Inde",
    target: "Pakistan",
    action: "escarmouche_militaire",
    relation: -35,
    roll: 25,
    profile: "standard",
    importance: "major",
    intent: "Repousser une patrouille pakistanaise près de la limite contestée.",
    stakes: "Bref échange sans vainqueur, victime confirmée ni changement territorial.",
    tags: ["militaire", "conflit", "crise"],
    sources: [
      ["mj", "Deux patrouilles se séparent sans changement territorial", "Deux patrouilles se sont séparées après un bref échange. Aucun changement territorial et aucune victime ne sont confirmés.", null],
      ["official", "New Delhi accuse la patrouille pakistanaise", "L'Inde accuse la patrouille pakistanaise d'avoir franchi la limite contestée.", "Inde"],
      ["official", "Islamabad formule l'accusation inverse", "Le Pakistan accuse la patrouille indienne d'avoir franchi la même limite. L'origine du franchissement ne peut pas être établie.", "Pakistan"],
    ],
  },
  {
    key: "venezuela_guyana_clash",
    emitter: "Venezuela",
    target: "Guyana",
    action: "conflit_arme",
    relation: -65,
    roll: 74,
    profile: "dossier",
    importance: "major",
    intent: "Occuper un poste frontalier guyanais.",
    stakes: "Occupation de quelques heures suivie d'une évacuation sous médiation.",
    tags: ["militaire", "conflit", "crise"],
    sources: [
      ["mj", "Un poste occupé puis évacué sous médiation", "Un poste frontalier a été occupé pendant quelques heures puis évacué sous médiation. La frontière ne connaît aucune modification durable.", null],
      ["official", "Caracas revendique une percée opérationnelle", "Le Venezuela présente l'occupation temporaire comme une percée opérationnelle durable.", "Venezuela"],
      ["official", "Georgetown nie toute perte durable de territoire", "Le Guyana confirme l'évacuation du poste et nie toute perte durable de territoire.", "Guyana"],
    ],
  },
  {
    key: "ethiopia_egypt_war_abort",
    emitter: "Éthiopie",
    target: "Égypte",
    action: "guerre_ouverte",
    relation: -85,
    roll: 2,
    profile: "dossier",
    importance: "major",
    intent: "Ordonner une mobilisation contre l'Égypte.",
    stakes: "L'ordre est retiré avant toute opération transfrontalière.",
    tags: ["militaire", "conflit", "crise"],
    sources: [
      ["mj", "La mobilisation est retirée avant toute opération", "L'ordre de mobilisation éthiopien est retiré avant toute opération transfrontalière. Aucune guerre ouverte ne commence.", null],
      ["official", "Addis-Abeba décrit une posture défensive", "L'Éthiopie présente la mobilisation retirée comme une posture strictement défensive.", "Éthiopie"],
      ["official", "Le Caire prétend avoir repoussé une offensive", "L'Égypte affirme avoir repoussé une offensive, tandis qu'aucun combat transfrontalier n'est confirmé.", "Égypte"],
    ],
  },
  {
    key: "japan_fortification_delay",
    emitter: "Japon",
    target: null,
    contextCountries: ["Chine"],
    action: "effort_fortifications",
    relationPair: ["Japon", "Chine", -55],
    roll: 49,
    profile: "brief",
    importance: "minor",
    intent: "Renforcer des installations défensives insulaires.",
    stakes: "Études préliminaires engagées, mais chantier retardé.",
    tags: ["militaire", "technologie"],
    sources: [
      ["mj", "Le chantier japonais reste au stade des études", "Seules des études préliminaires ont commencé. Le chantier défensif est retardé et aucune installation nouvelle n'est opérationnelle.", null],
      ["official", "Tokyo maintient le calendrier général du programme", "Le Japon affirme que le programme général reste au calendrier, sans déclarer ce chantier particulier achevé.", "Japon"],
      ["player", "Un média chinois annonce des installations déjà actives", "Un média chinois affirme que les installations sont déjà opérationnelles, contrairement à l'état du chantier.", "Chine"],
    ],
  },
  {
    key: "indonesia_reconstruction",
    emitter: "Indonésie",
    target: null,
    action: "investissements",
    roll: 86,
    profile: "dossier",
    importance: "major",
    intent: "Financer la reconstruction des accès après une catastrophe.",
    stakes: "Réouverture partielle de l'aéroport, mais trois districts restent isolés.",
    tags: ["economie", "humanitaire", "societe"],
    adminEffects: [
      {
        name: "Relance des infrastructures",
        effect_kind: "stat_delta",
        effect_target: "industry",
        value: 1,
        application: "immediate",
        scope: "emitter",
      },
    ],
    sources: [
      ["mj", "L'aéroport rouvre à capacité limitée", "L'aéroport rouvre à capacité limitée après la catastrophe. Trois districts restent isolés.", null],
      ["official", "Le gouvernement clôt la phase d'urgence", "L'Indonésie annonce la fin de la phase d'urgence, sans déclarer un retour complet à la normale.", "Indonésie"],
      ["official", "Des difficultés d'accès persistent dans trois districts", "Une organisation humanitaire signale que trois districts restent difficiles d'accès malgré la réouverture partielle.", null],
    ],
  },
  {
    key: "canada_arctic_network",
    emitter: "Canada",
    target: null,
    action: "demande_up",
    roll: 63,
    profile: "brief",
    importance: "minor",
    intent: "Tester un réseau de communication sur deux sites pilotes arctiques.",
    stakes: "Jalon technique réel, mais aucune couverture nationale.",
    tags: ["technologie", "societe"],
    sources: [
      ["mj", "Deux sites pilotes arctiques communiquent", "Le prototype de communication fonctionne sur deux sites pilotes. Il ne couvre pas l'ensemble de l'Arctique canadien.", null],
      ["official", "Ottawa confirme un jalon technique", "Le Canada confirme le franchissement d'un jalon technique sur les deux sites pilotes.", "Canada"],
      ["player", "Un titre exagère la couverture du réseau", "Un média affirme que tout l'Arctique est désormais couvert, contrairement à la portée limitée du prototype.", "Canada"],
    ],
  },
  {
    key: "israel_saudi_alliance_fail",
    emitter: "Israël",
    target: "Arabie saoudite",
    action: "alliance",
    relation: 15,
    roll: 49,
    profile: "dossier",
    importance: "major",
    intent: "Transformer des consultations régionales en alliance.",
    stakes: "Pourparlers suspendus et aucun traité signé.",
    tags: ["alliance", "diplomatie", "politique"],
    sources: [
      ["mj", "Des pourparlers suspendus sans traité signé", "Israël et l'Arabie saoudite ont tenu des pourparlers, mais aucun traité n'est signé et les discussions sont suspendues.", null],
      ["official", "Israël évoque une avancée stratégique imprécise", "Israël évoque une avancée stratégique sans préciser sa nature ni annoncer d'alliance.", "Israël"],
      ["official", "Riyad confirme seulement des consultations régionales", "L'Arabie saoudite confirme uniquement des consultations régionales.", "Arabie saoudite"],
    ],
  },
  {
    key: "philippines_china_spy_success",
    emitter: "Philippines",
    target: "Chine",
    action: "espionnage",
    roll: 88,
    profile: "standard",
    importance: "major",
    intent: "Obtenir des plans logistiques commerciaux chinois.",
    stakes: "Documents authentiques mais strictement commerciaux, auteur de l'extraction non établi publiquement.",
    publicAttribution: false,
    tags: ["renseignement", "commerce", "technologie"],
    sources: [
      ["mj", "Des plans commerciaux authentiques ont été obtenus", "Des plans logistiques commerciaux authentiques ont été obtenus. Ils ne contiennent aucune donnée militaire stratégique et l'auteur de l'extraction n'est pas public.", null],
      ["official", "Manille refuse de commenter le renseignement", "Les Philippines refusent de commenter toute opération de renseignement.", "Philippines"],
      ["official", "Pékin conteste l'authenticité des documents", "La Chine affirme que les documents sont fabriqués, tandis qu'un audit indépendant juge leurs métadonnées cohérentes.", "Chine"],
    ],
  },
  {
    key: "egypt_ethiopia_sabotage_success",
    emitter: "Égypte",
    target: "Éthiopie",
    action: "sabotage",
    roll: 92,
    profile: "standard",
    importance: "major",
    intent: "Interrompre une station de pompage éthiopienne.",
    stakes: "Interruption de six heures, commande extérieure confirmée, auteur non attribué publiquement.",
    publicAttribution: false,
    tags: ["crise", "technologie", "renseignement"],
    adminEffects: [
      {
        name: "Interruption de la station de pompage",
        effect_kind: "stat_delta",
        effect_target: "stability",
        value: -1,
        application: "immediate",
        scope: "target",
      },
    ],
    sources: [
      ["mj", "Une commande extérieure interrompt la station six heures", "Une station de pompage éthiopienne est interrompue pendant six heures. L'audit confirme une commande extérieure délibérée, sans attribution publique.", null],
      ["official", "Addis-Abeba dénonce une intervention étrangère", "L'Éthiopie dénonce une intervention étrangère sans nommer de pays.", "Éthiopie"],
      ["official", "Le Caire nie toute implication", "L'Égypte nie toute implication dans l'interruption de la station.", "Égypte"],
    ],
  },
  {
    key: "angola_saudi_black_plaque",
    emitter: "Angola",
    target: "Arabie saoudite",
    action: "insulte_diplomatique",
    roll: 84,
    profile: "brief",
    importance: "minor",
    voice: "state_agency_belligerent",
    intent: "Au Forum des routes énergétiques de Luanda, une vice-ministre angolaise décrit l'offre saoudienne comme un « collier d'or » destiné à acheter le respect africain.",
    stakes: "L'audio confirme le propos dénigrant et le départ anticipé de la délégation saoudienne, mais réfute un refus de poignée de main, un retrait de drapeau, une expulsion ou l'annulation du projet Corredor Azul.",
    tags: ["insulte_diplomatique", "diplomatie", "crise", "commerce"],
    sources: [
      ["mj", "Ce qui s'est réellement passé au Forum de Luanda", "Au Forum des routes énergétiques de Luanda, la délégation saoudienne arrive avec 47 minutes de retard. Sa plaque en laiton est remplacée par une carte noire temporaire après le verrouillage du plan de table. Une vice-ministre angolaise décrit les négociateurs saoudiens comme des « héritiers du désert » qui tentent d'acheter le respect africain avec un « collier d'or ». La délégation quitte la séance 18 minutes avant sa clôture. Il n'y a ni expulsion, ni refus de poignée de main, ni drapeau retiré.", null],
      ["official", "Luanda invoque un incident purement protocolaire", "L'Angola affirme que la carte noire était une solution technique imposée par l'arrivée tardive. Il décrit le propos de la vice-ministre comme privé et sorti de son contexte, tout en confirmant le départ anticipé de la délégation saoudienne.", "Angola"],
      ["official", "Riyad exige des excuses publiques", "L'Arabie saoudite présente la plaque noire et le propos angolais comme une humiliation délibérée. Riyad demande des excuses avant la prochaine rencontre politique, sans annoncer de rupture diplomatique, de sanction ni d'annulation économique.", "Arabie saoudite"],
      ["player", "Un délégué saoudien aurait méprisé le port de Lobito", "Un média angolais affirme qu'un délégué saoudien aurait qualifié Lobito de « port secondaire » avant la séance. Aucun enregistrement ne confirme cette phrase.", "Angola"],
      ["player", "Une poignée de main refusée et un drapeau retiré", "Un média saoudien affirme que la vice-ministre aurait refusé une poignée de main et fait retirer le drapeau saoudien. Cette version est contredite par les images vérifiées.", "Arabie saoudite"],
      ["official", "Le Corredor Azul reste en négociation", "Le terminal d'ammoniac vert de Lobito, estimé à 2,4 milliards, reste en négociation. Une réunion technique demeure prévue le 12 mai. Aucun financement n'est retiré et aucun partenaire n'annonce l'annulation du projet.", null],
      ["mj", "Les images et l'audio recadrent l'incident", "Les images montrent une poignée de main à 09 h 11, aucun déplacement de drapeau et le remplacement de la plaque après l'arrivée tardive. L'audio confirme le propos dénigrant, mais aucune menace. Le départ anticipé est confirmé.", null],
    ],
  },
];

function relationKey(a, b) {
  return [a, b].sort().join("|");
}

function requireRow(map, key, kind) {
  const row = map.get(key);
  if (!row) throw new Error(`${kind} introuvable : ${key}`);
  return row;
}

const { data: countries, error: countryError } = await supabase
  .from("countries")
  .select("id,name,continent_id");
const { data: actionTypes, error: typeError } = await supabase
  .from("state_action_types")
  .select("id,key,label_fr");
const { data: continents, error: continentError } = await supabase
  .from("continents")
  .select("id,slug");
const { data: tags, error: tagError } = await supabase
  .from("lore_tags")
  .select("id,key");
if (countryError || typeError || continentError || tagError) {
  throw countryError ?? typeError ?? continentError ?? tagError;
}

const countryByName = new Map(countries.map((row) => [row.name, row]));
const typeByKey = new Map(actionTypes.map((row) => [row.key, row]));
const continentBySlug = new Map(continents.map((row) => [row.slug, row.id]));
const tagByKey = new Map(tags.map((row) => [row.key, row.id]));
const continentAssignments = {
  "Corée du Nord": "asie",
  Philippines: "asie",
  Éthiopie: "afrique",
  Guyana: "amerique",
  Venezuela: "amerique",
};
let continentFixes = 0;
for (const [name, slug] of Object.entries(continentAssignments)) {
  const country = requireRow(countryByName, name, "Pays");
  if (country.continent_id) continue;
  const { error } = await supabase
    .from("countries")
    .update({ continent_id: requireRow(continentBySlug, slug, "Continent") })
    .eq("id", country.id)
    .is("continent_id", null);
  if (error) throw error;
  country.continent_id = continentBySlug.get(slug);
  continentFixes += 1;
}

const relationTargets = new Map();
for (const scenario of scenarios) {
  if (scenario.target && Number.isFinite(scenario.relation)) {
    relationTargets.set(
      relationKey(scenario.emitter, scenario.target),
      [scenario.emitter, scenario.target, scenario.relation],
    );
  }
  if (scenario.relationPair) {
    relationTargets.set(
      relationKey(scenario.relationPair[0], scenario.relationPair[1]),
      scenario.relationPair,
    );
  }
}
const relationChanges = [];
const { count: existingSuiteActions, error: suiteCountError } = await supabase
  .from("ai_event_requests")
  .select("*", { count: "exact", head: true })
  .like("mj_notes", `${SUITE}:%`);
if (suiteCountError) throw suiteCountError;
for (const [nameA, nameB, value] of existingSuiteActions
  ? []
  : relationTargets.values()) {
  const a = requireRow(countryByName, nameA, "Pays");
  const b = requireRow(countryByName, nameB, "Pays");
  const [countryAId, countryBId] = [a.id, b.id].sort();
  const { data: before, error: beforeError } = await supabase
    .from("country_relations")
    .select("value")
    .eq("country_a_id", countryAId)
    .eq("country_b_id", countryBId)
    .maybeSingle();
  if (beforeError) throw beforeError;
  const { error } = await supabase.from("country_relations").upsert(
    {
      country_a_id: countryAId,
      country_b_id: countryBId,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "country_a_id,country_b_id" },
  );
  if (error) throw error;
  relationChanges.push({ countries: [nameA, nameB], before: before?.value ?? 0, after: value });
}

let contextsCreated = 0;
const contextIdsByScenario = new Map();
for (const [scenarioIndex, scenario] of scenarios.entries()) {
  const linkedNames = [
    scenario.emitter,
    scenario.target,
    ...(scenario.contextCountries ?? []),
  ].filter(Boolean);
  const articleIds = [];
  for (const [sourceIndex, [sourceKind, title, content, authorName]] of scenario.sources.entries()) {
    const contentHash = `${SUITE}:${scenario.key}:source:${sourceIndex + 1}`;
    const { data: existing, error: existingError } = await supabase
      .from("lore_articles")
      .select("id")
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (existingError) throw existingError;
    let articleId = existing?.id;
    if (!articleId) {
      const day = 3 + ((scenarioIndex * 3 + sourceIndex) % 25);
      const output = { title, description: content, sections: [] };
      const { data: article, error } = await supabase
        .from("lore_articles")
        .insert({
          source_kind: sourceKind,
          source_platform: "manual",
          title,
          description: content,
          raw_content: content,
          clean_content: content,
          current_output: output,
          current_version: 1,
          content_hash: contentHash,
          rp_year: 2040,
          rp_month: 4,
          rp_day: day,
          rp_week: Math.ceil(day / 7),
          real_published_at: new Date(Date.now() - (40 - day) * 86_400_000).toISOString(),
          editorial_status: "approved",
          classification_status: "classified",
          classification_locked: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      articleId = article.id;
      contextsCreated += 1;
      const author = authorName ? requireRow(countryByName, authorName, "Pays auteur") : null;
      const countryLinks = [...new Set(linkedNames)].map((name) => {
        const country = requireRow(countryByName, name, "Pays lié");
        return {
          lore_article_id: articleId,
          country_id: country.id,
          relation_role: author?.id === country.id ? "author" : "mentioned",
        };
      });
      const { error: countryLinkError } = await supabase
        .from("lore_article_countries")
        .insert(countryLinks);
      if (countryLinkError) throw countryLinkError;
      const tagKeys = [...new Set([scenario.action, ...scenario.tags])];
      const tagLinks = tagKeys.map((key) => ({
        lore_article_id: articleId,
        tag_id: requireRow(tagByKey, key, "Tag"),
      }));
      const { error: tagLinkError } = await supabase
        .from("lore_article_tags")
        .insert(tagLinks);
      if (tagLinkError) throw tagLinkError;
    }
    articleIds.push(articleId);
  }
  contextIdsByScenario.set(scenario.key, articleIds);
}

let actionsCreated = 0;
const actionIds = [];
for (const scenario of scenarios) {
  const note = `${SUITE}:${scenario.key}`;
  const { data: existing, error: existingError } = await supabase
    .from("ai_event_requests")
    .select("id")
    .eq("mj_notes", note)
    .maybeSingle();
  if (existingError) throw existingError;
  let actionId = existing?.id;
  if (!actionId) {
    const emitter = requireRow(countryByName, scenario.emitter, "Pays");
    const target = scenario.target
      ? requireRow(countryByName, scenario.target, "Pays cible")
      : null;
    const actionType = requireRow(typeByKey, scenario.action, "Type d'action");
    const payload = {
      intent: scenario.intent,
      stakes: scenario.stakes,
      ...(target ? { target_country_id: target.id } : {}),
      ...(scenario.voice ? { editorial_voice: scenario.voice } : {}),
      ...(scenario.publicAttribution === false ? { attribution_publique: false } : {}),
    };
    const { data: action, error } = await supabase
      .from("ai_event_requests")
      .insert({
        country_id: emitter.id,
        target_country_id: target?.id ?? null,
        action_type_id: actionType.id,
        status: "accepted",
        decision_status: "approved",
        source: "manual",
        importance: scenario.importance,
        d100_roll: scenario.roll,
        intent: scenario.intent,
        stakes: scenario.stakes,
        payload,
        admin_effect_added: scenario.adminEffects ?? [],
        mj_notes: note,
        scheduled_trigger_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    actionId = action.id;
    actionsCreated += 1;
  }
  const { error: profileError } = await supabase
    .from("ai_event_requests")
    .update({ article_profile: scenario.profile })
    .eq("id", actionId)
    .is("consequences_applied_at", null);
  if (profileError) throw profileError;
  actionIds.push({
    key: scenario.key,
    id: actionId,
    profile: scenario.profile,
    roll: scenario.roll,
    contextIds: contextIdsByScenario.get(scenario.key),
  });
}

const { error: releaseError } = await supabase
  .from("rp_pipeline_jobs")
  .update({ next_attempt_at: new Date().toISOString() })
  .in("action_id", actionIds.map(({ id }) => id))
  .eq("job_type", "generate_article")
  .in("status", ["pending", "retry"]);
if (releaseError) throw releaseError;

console.log(JSON.stringify({
  suite: SUITE,
  scenarios: scenarios.length,
  contextsCreated,
  actionsCreated,
  continentFixes,
  relationChanges,
  actionIds,
}, null, 2));

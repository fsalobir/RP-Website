import { createClient } from "@supabase/supabase-js";
import {
  collectFactualNumbers,
  countriesMentionedInFacts,
  parseAndValidateMagnumOutput,
} from "../src/lib/rpPipeline.ts";

const SUITE = "editorial-stress-2040-v1";
const LIMITS = {
  brief: [250, 650],
  standard: [900, 1_800],
  dossier: [2_000, 3_500],
};

const outputs = {
  nk_belligerent: {
    title: "Pyongyang fustige Séoul au sujet de la zone tampon",
    description: "La Corée du Nord accuse avec virulence la Corée du Sud d’avoir franchi la zone tampon au cours d’un exercice militaire. Pyongyang présente l’épisode comme une provocation délibérée et charge directement Séoul. La version sud-coréenne contredit cette accusation : l’exercice se serait déroulé intégralement dans l’espace contrôlé par la Corée du Sud.",
    sections: [
      {
        title: "Pyongyang martèle son accusation",
        body: "La Corée du Nord affirme que l’exercice sud-coréen aurait enfreint la zone tampon. Dans une communication particulièrement agressive, Pyongyang décrit cette violation présumée comme une nouvelle démonstration d’hostilité et désigne les autorités sud-coréennes comme seules responsables de la tension. Cette charge reste toutefois la version du gouvernement nord-coréen : aucun élément indépendant ne vient établir le franchissement allégué. La dénonciation porte exclusivement sur le comportement attribué à Séoul pendant l’exercice.",
      },
      {
        title: "Séoul rejette entièrement cette version",
        body: "La Corée du Sud affirme que l’exercice a été conduit sans sortir de son propre espace. Séoul nie donc qu’une unité ait pénétré dans la zone évoquée par Pyongyang. Cette réponse ne reconnaît ni incident frontalier ni erreur de trajectoire. Elle oppose à l’accusation nord-coréenne une version simple : les forces engagées seraient restées du côté sud-coréen pendant toute la durée des opérations. Les deux gouvernements livrent ainsi des récits directement incompatibles.",
      },
      {
        title: "Aucun franchissement établi",
        body: "Les faits disponibles ne font état d’aucun appareil ni d’aucun soldat ayant franchi la limite. Aucun pays tiers et aucune source indépendante ne confirment l’accusation formulée par Pyongyang. Il n’existe donc aucun élément permettant de présenter la violation comme un fait établi. L’exercice sud-coréen a bien eu lieu, mais le point central de la dénonciation nord-coréenne demeure contesté et non corroboré.",
      },
      {
        title: "Une bataille de récits",
        body: "Pyongyang donne à l’affaire une portée politique maximale et emploie un ton accusateur pour désigner Séoul comme provocateur. La Corée du Sud répond par une négation factuelle du franchissement. Entre ces deux positions, le seul constat commun est l’existence de l’exercice. La violation de la zone tampon n’est reconnue que par la Corée du Nord, tandis que les informations disponibles indiquent qu’aucune unité sud-coréenne n’a effectivement franchi la limite.",
      },
    ],
  },
  seoul_tokyo_thaw: {
    title: "Séoul et Tokyo rouvrent leur canal ministériel",
    description: "La Corée du Sud et le Japon ont rétabli un canal de discussion ministériel suspendu depuis plusieurs mois. Cette reprise marque un retour au dialogue direct, mais elle ne constitue ni un accord politique ni une normalisation des relations. Les deux gouvernements s’accordent sur la tenue de consultations, tout en décrivant différemment leur possible prolongement.",
    sections: [
      {
        title: "Des consultations encore exploratoires",
        body: "Le Japon confirme la tenue de consultations préliminaires. Aucun sommet bilatéral n’est annoncé et aucun calendrier commun n’a été arrêté. Les discussions restent limitées à la reprise des échanges entre les deux gouvernements. Tokyo ne présente donc ni une rencontre au sommet ni une normalisation complète comme acquises.",
      },
      {
        title: "Séoul évoque une rencontre possible",
        body: "La Corée du Sud considère désormais probable l’organisation d’un sommet. Cette appréciation n’est accompagnée d’aucune date ni d’aucun accord préparatoire. Elle ne vaut donc pas confirmation officielle d’une rencontre. Séoul décrit une possibilité politique ouverte par le rétablissement du canal ministériel, sans annoncer d’engagement conclu avec Tokyo.",
      },
      {
        title: "Un dégel qui reste à confirmer",
        body: "La réouverture du canal met fin à plusieurs mois de suspension et permet de nouveau des échanges directs. Les positions concordent sur ce fait, mais pas encore sur la portée de la reprise. Le Japon parle de consultations exploratoires, tandis que la Corée du Sud juge un sommet probable. Aucun accord nouveau ne vient encore rapprocher ces deux lectures.",
      },
    ],
  },
  china_ph_port: {
    title: "Une concession portuaire chinoise divise les Philippines",
    description: "Une concession logistique civile a été signée aux Philippines dans le cadre d’un investissement portuaire annoncé par la Chine. Les installations demeurent sous contrôle philippin et l’accord ne prévoit aucun accès militaire. Pékin met en avant les emplois locaux attendus, tandis qu’un élu philippin affirme, sans apporter de preuve, que le dispositif dissimulerait une annexe militaire.",
    sections: [
      {
        title: "Une concession à vocation civile",
        body: "L’accord porte sur une activité logistique civile. Il organise une concession liée aux installations portuaires, sans transférer leur contrôle aux autorités chinoises. Les infrastructures restent placées sous contrôle philippin. Aucun accès militaire n’est prévu dans les dispositions connues. La présence chinoise annoncée relève donc de l’investissement et de l’exploitation logistique civile, et non d’un déploiement armé ou d’une prise de contrôle stratégique du port.",
      },
      {
        title: "Pékin promet des emplois locaux",
        body: "La Chine présente l’opération comme un investissement portuaire destiné à soutenir l’activité économique. Pékin affirme que le projet doit créer des emplois locaux. Aucun nombre d’emplois, calendrier détaillé ou montant supplémentaire ne permet toutefois d’élargir cette annonce au-delà de cette promesse générale. Le cadre établi reste celui d’une concession civile mise en œuvre dans des installations qui demeurent sous autorité philippine.",
      },
      {
        title: "Une annexe militaire alléguée sans preuve",
        body: "Un élu philippin soutient que l’accord comprendrait une annexe ouvrant la voie à un usage militaire. Cette affirmation n’est accompagnée d’aucun document et aucun texte disponible ne la confirme. Elle doit donc être présentée comme une allégation politique, et non comme une clause établie de l’accord. Les éléments vérifiables indiquent au contraire qu’aucun accès militaire n’a été accordé et que les installations restent contrôlées par les Philippines.",
      },
      {
        title: "Deux lectures opposées",
        body: "Le débat oppose la présentation économique défendue par Pékin à la suspicion exprimée par l’élu philippin. La première repose sur une concession civile, un investissement portuaire et une promesse d’emplois. La seconde évoque une dimension militaire qui n’apparaît dans aucun document disponible. En l’état, seule la nature civile du dispositif est établie. La controverse ne modifie ni le contrôle philippin des installations ni l’absence d’accès militaire prévu.",
      },
    ],
  },
  us_iran_spy_failure: {
    title: "Un réseau de surveillance neutralisé en Iran",
    description: "Les autorités iraniennes annoncent avoir identifié puis neutralisé un réseau de surveillance opérant sur leur territoire. Aucun nom, aucune méthode et aucune victime ne sont rendus publics. L’auteur de l’opération demeure officiellement inconnu et les informations diffusées ne permettent aucune attribution certaine.",
    sections: [
      {
        title: "Une origine étrangère alléguée",
        body: "L’Iran présente le dispositif comme une opération étrangère, sans attribuer formellement sa conduite à un État ou à une organisation. Les informations disponibles ne permettent pas d’établir publiquement son origine. Cette qualification appartient donc à la communication iranienne et ne désigne aucun commanditaire vérifié.",
      },
      {
        title: "Washington nie toute implication",
        body: "Les États-Unis contestent avoir participé à cette opération. Cette déclaration ne permet ni de confirmer cette implication ni d’identifier un autre responsable. Aucun élément public ne vient départager les versions actuellement avancées. L’identité de l’auteur doit ainsi rester indéterminée malgré les soupçons exprimés par Téhéran.",
      },
      {
        title: "Peu de détails rendus publics",
        body: "La neutralisation du réseau est le seul résultat établi. Les autorités iraniennes ne précisent ni la durée de son activité ni les informations qu’il aurait pu recueillir. Aucune conséquence humaine n’est signalée. Les noms, les procédés employés et l’origine exacte du dispositif restent absents du dossier public.",
      },
    ],
  },
  russia_poland_sabotage_failure: {
    title: "La piste du sabotage écartée après une panne en Pologne",
    description: "L’audit consacré à une panne du système de signalisation conclut à un micrologiciel défectueux et ne relève aucune intrusion. Les autorités polonaises avaient envisagé l’hypothèse d’un sabotage au début de l’incident, sans la confirmer. Un média avait attribué le logiciel en cause à la Russie, mais cette affirmation est contredite par les conclusions techniques disponibles. Aucun acte hostile n’est donc établi. La panne reste attribuée à une défaillance du système et aucun élément public ne permet de désigner un responsable extérieur.",
    sections: [],
  },
  poland_france_air_defense: {
    title: "Paris et Varsovie approuvent un entraînement aérien commun",
    description: "La France et la Pologne ont approuvé un entraînement conjoint consacré à la défense aérienne. L’accord porte sur la préparation opérationnelle et ne prévoit ni création de base française en Pologne ni stationnement permanent de forces. Sa portée reste limitée à un exercice encadré par les deux gouvernements.",
    sections: [
      {
        title: "Une préparation régionale renforcée",
        body: "La Pologne présente cet entraînement comme un moyen d’améliorer la préparation régionale. Varsovie ne l’associe toutefois à aucune installation militaire permanente ni à un transfert durable de forces françaises. Cette présentation décrit l’objectif annoncé de l’exercice, sans lui attribuer de dispositif supplémentaire.",
      },
      {
        title: "Des déploiements temporaires",
        body: "La France précise que les déploiements liés à l’exercice seront temporaires. Leur présence sera limitée aux besoins de l’entraînement approuvé par les deux gouvernements. Paris exclut ainsi que cet accord puisse être présenté comme la création d’une base ou comme un stationnement permanent en Pologne.",
      },
      {
        title: "Une coopération strictement encadrée",
        body: "L’accord confirme une coopération militaire franco-polonaise dans le domaine aérien. Sa portée demeure celle d’un exercice commun de défense aérienne. Aucun stationnement permanent et aucune nouvelle base ne sont annoncés. Les éléments disponibles ne permettent pas d’étendre l’accord au-delà de cet entraînement temporaire.",
      },
    ],
  },
  brazil_argentina_trade: {
    title: "Brésil et Argentine réduisent certains obstacles douaniers",
    description: "Le Brésil et l’Argentine ont décidé de supprimer certains obstacles douaniers afin de faciliter leurs échanges. Le dispositif ne crée aucune monnaie commune. Brasilia annonce également un corridor d’exportation prévu par le traité, tandis que Buenos Aires confirme l’étude de mécanismes de paiements communs sans envisager de fusion monétaire.",
    sections: [
      {
        title: "Un allègement ciblé des échanges",
        body: "L’accord conclu entre les deux pays porte sur la suppression de certains obstacles douaniers. Il ne signifie pas la disparition de l’ensemble des contrôles ou règles applicables au commerce bilatéral. La mesure vise un périmètre limité, même si son détail n’est pas davantage précisé. Le changement établi concerne donc la facilitation de certains échanges entre le Brésil et l’Argentine, sans création d’une union douanière intégrale ni extension automatique à d’autres domaines.",
      },
      {
        title: "Un corridor d’exportation annoncé",
        body: "Le Brésil présente un corridor d’exportation comme une composante du traité commercial. Ce corridor est annoncé, mais aucun élément ne permet de le décrire comme déjà opérationnel. Son tracé, son calendrier et ses capacités ne sont pas établis dans les informations disponibles. Il constitue ainsi une orientation avancée par Brasilia, distincte de la suppression des obstacles douaniers décidée entre les deux pays.",
      },
      {
        title: "Des paiements communs à l’étude",
        body: "L’Argentine confirme qu’une étude porte sur des mécanismes de paiements communs. Cette réflexion concerne les modalités de règlement des échanges et ne crée pas de nouvelle devise. Elle n’implique ni abandon des monnaies nationales ni fusion des politiques monétaires. Buenos Aires distingue explicitement cette étude technique de toute monnaie commune. Présenter le projet comme une union monétaire dépasserait donc le contenu réel de l’accord.",
      },
      {
        title: "Un rapprochement sans monnaie commune",
        body: "Les annonces brésilienne et argentine se complètent sans avoir la même portée. La réduction de certains obstacles douaniers constitue la mesure commerciale arrêtée. Le corridor d’exportation est annoncé par le Brésil, tandis que les paiements communs demeurent à l’étude du côté argentin. Aucun de ces éléments ne prévoit une fusion monétaire. Le rapprochement reste centré sur la circulation des marchandises et les moyens de faciliter leur règlement.",
      },
    ],
  },
  india_pakistan_skirmish: {
    title: "Bref échange entre patrouilles indienne et pakistanaise",
    description: "Deux patrouilles indienne et pakistanaise se sont séparées après un bref échange dans une zone contestée. Aucun changement territorial et aucune victime ne sont confirmés. L’origine exacte de l’incident reste indéterminée, chaque gouvernement accusant la patrouille adverse d’avoir franchi la limite disputée.",
    sections: [
      {
        title: "Des accusations opposées",
        body: "L’Inde affirme que la patrouille pakistanaise a franchi la limite contestée. Le Pakistan soutient au contraire que le mouvement initial venait du côté indien. Aucun élément public ne permet de trancher entre ces deux versions. L’origine du premier mouvement demeure donc inconnue et aucune accusation ne peut être présentée comme un fait établi.",
      },
      {
        title: "Un incident resté limité",
        body: "Les deux patrouilles ont interrompu leur contact et se sont éloignées. Les informations disponibles ne font état ni d’une occupation durable ni d’une modification de la situation territoriale. L’échange n’a pas conduit à la prise d’une position et la ligne contestée demeure inchangée après la séparation des unités.",
      },
      {
        title: "Aucun bilan humain confirmé",
        body: "Aucune perte humaine n’est confirmée par les éléments disponibles. Les récits officiels s’opposent sur le franchissement allégué, mais concordent avec une fin rapide du contact. En l’absence de constat indépendant, ni la responsabilité initiale ni l’existence d’un avantage territorial ne peuvent être établies.",
      },
    ],
  },
  venezuela_guyana_clash: {
    title: "Un poste frontalier occupé puis évacué entre Venezuela et Guyana",
    description: "Un poste frontalier a été occupé pendant quelques heures avant d’être évacué sous médiation. L’épisode n’a entraîné aucun changement durable de la frontière. Le Venezuela présente pourtant l’opération comme une percée appelée à durer, tandis que le Guyana confirme l’évacuation du poste et nie toute perte territoriale permanente.",
    sections: [
      {
        title: "Une occupation limitée dans le temps",
        body: "Le poste frontalier a été occupé pendant quelques heures. Cette présence a ensuite pris fin avec l’évacuation du site sous médiation. Aucun élément ne permet de prolonger l’occupation au-delà de cet épisode ni de décrire une implantation permanente. Les faits disponibles établissent donc une prise temporaire suivie d’un retrait. Ils ne font état ni d’un déplacement durable de la ligne frontalière ni d’un maintien des forces sur le poste concerné.",
      },
      {
        title: "Caracas revendique une percée durable",
        body: "Le Venezuela présente l’épisode comme une percée durable. Cette lecture donne à l’occupation temporaire une portée territoriale que la situation constatée ne confirme pas. Le poste ayant été évacué après quelques heures, aucune présence permanente ne soutient cette présentation. La revendication vénézuélienne doit ainsi être distinguée du déroulement matériel de l’incident : elle constitue le récit politique de Caracas, et non la preuve d’une modification effective de la frontière.",
      },
      {
        title: "Georgetown confirme le retrait",
        body: "Le Guyana confirme que le poste a été évacué. Il nie avoir subi une perte territoriale durable et considère que la frontière n’a pas été modifiée par l’incident. Cette position correspond au constat d’un retrait intervenu sous médiation. Elle s’oppose directement à la présentation vénézuélienne d’une percée appelée à durer. Le différend de communication persiste, mais le site n’est pas resté occupé à l’issue de l’épisode.",
      },
      {
        title: "Aucun changement durable de frontière",
        body: "La divergence tient à la portée attribuée à l’incident. Caracas insiste sur l’idée d’une avancée durable, alors que Georgetown souligne l’évacuation et l’absence de perte permanente. Les faits disponibles tranchent uniquement sur la situation matérielle : l’occupation a duré quelques heures, une médiation a précédé le retrait et la frontière n’a connu aucun changement durable. Toute présentation d’un gain territorial permanent contredit donc l’issue constatée de l’épisode.",
      },
    ],
  },
  ethiopia_egypt_war_abort: {
    title: "La mobilisation éthiopienne retirée avant toute opération",
    description: "L’ordre de mobilisation annoncé par l’Éthiopie a été retiré avant le lancement de toute opération transfrontalière. Aucun combat au-delà de la frontière n’est confirmé et la situation ne constitue pas une guerre ouverte. Addis-Abeba présente la mobilisation comme une posture défensive finalement interrompue. Le Caire affirme pour sa part avoir repoussé une offensive, mais cette version n’est étayée par aucun affrontement transfrontalier confirmé. Les gouvernements décrivent donc différemment une séquence arrêtée avant le déclenchement d’hostilités ouvertes.",
    sections: [
      {
        title: "Un ordre retiré avant son exécution",
        body: "L’élément établi est le retrait de l’ordre de mobilisation éthiopien avant toute opération au-delà de la frontière. Aucun mouvement offensif transfrontalier ni engagement entre forces éthiopiennes et égyptiennes n’est confirmé. La mesure n’a donc pas débouché sur une campagne militaire. L’Éthiopie décrit cette mobilisation comme une disposition défensive et ne reconnaît pas avoir engagé une offensive. Son retrait marque l’arrêt de la séquence militaire avant qu’elle ne se transforme en confrontation ouverte.",
      },
      {
        title: "Deux récits gouvernementaux incompatibles",
        body: "L’Égypte affirme avoir repoussé une offensive éthiopienne. Cette présentation attribue au retrait de la mobilisation la valeur d’un recul imposé. L’Éthiopie soutient au contraire qu’aucune offensive n’a été lancée et que ses préparatifs relevaient d’une posture défensive. Ces récits ne peuvent pas être confondus avec des faits confirmés : aucune bataille transfrontalière, aucune incursion et aucune opération éthiopienne sur le territoire adverse ne sont établies.",
      },
      {
        title: "Aucune guerre ouverte",
        body: "La séquence demeure limitée à un ordre de mobilisation retiré, accompagné de déclarations officielles divergentes. Elle n’autorise pas à annoncer une guerre, une invasion, une victoire militaire ou une défaite éthiopienne. L’affirmation égyptienne d’une offensive repoussée reste une position gouvernementale, tandis que la qualification défensive avancée par l’Éthiopie reste sa propre présentation. Le seul constat commun possible est l’absence d’opération transfrontalière confirmée après le retrait de l’ordre.",
      },
      {
        title: "Une crise stoppée avant les combats",
        body: "Les informations disponibles décrivent des préparatifs interrompus et une confrontation de discours, non une campagne engagée. Addis-Abeba insiste sur le caractère défensif de sa posture ; Le Caire revendique avoir empêché une offensive qui n’est corroborée par aucun combat frontalier. Le retrait de l’ordre reste le fait déterminant. Il clôt la mobilisation avant tout passage de la frontière et interdit de présenter cet épisode comme le commencement d’une guerre ouverte entre l’Éthiopie et l’Égypte.",
      },
    ],
  },
  japan_fortification_delay: {
    title: "Retard confirmé pour les installations défensives japonaises",
    description: "Le projet japonais reste au stade des études préliminaires et le chantier annoncé accuse un retard. Aucune installation n’est actuellement opérationnelle. Le Japon maintient son calendrier général, sans affirmer que les travaux sont achevés ni que le dispositif est actif. Un média chinois présente pourtant les installations comme déjà en service. Cette affirmation est directement contredite par l’état constaté du chantier. Le projet demeure donc préparatoire et sa mise en fonctionnement n’est pas acquise.",
    sections: [],
  },
  indonesia_reconstruction: {
    title: "L’Indonésie clôt l’urgence, trois districts restent isolés",
    description: "L’Indonésie a annoncé la fin de la phase d’urgence engagée après la catastrophe, sans déclarer un retour complet à la normale. L’aéroport concerné a rouvert, mais fonctionne encore à capacité limitée. Trois districts restent isolés et leur accès demeure difficile. Une organisation humanitaire confirme que ces difficultés persistent dans les trois districts. La clôture administrative de l’urgence marque donc un changement de phase, mais ne signifie ni la restauration complète des transports ni la disparition des obstacles rencontrés sur le terrain.",
    sections: [
      {
        title: "Une réouverture encore partielle",
        body: "L’aéroport a repris ses activités à capacité limitée. Cette réouverture rétablit une partie des opérations, sans correspondre à un fonctionnement normal ou complet. Aucun élément ne permet d’annoncer que toutes les capacités ont été restaurées. La reprise doit donc être présentée comme partielle : l’infrastructure est de nouveau ouverte, mais elle continue de fonctionner sous contrainte au moment où les autorités mettent fin à la phase d’urgence.",
      },
      {
        title: "Trois districts toujours isolés",
        body: "La situation reste particulièrement difficile dans trois districts qui demeurent isolés. Une organisation humanitaire confirme que l’accès à ces zones reste compliqué. La fin de la phase d’urgence n’a donc pas supprimé les obstacles qui affectent encore ces territoires. Aucun accès pleinement rétabli ne peut être annoncé pour ces districts, et leur isolement demeure l’une des principales limites au constat d’une normalisation générale.",
      },
      {
        title: "Fin de l’urgence, pas de retour complet à la normale",
        body: "La décision indonésienne clôt une phase de gestion de la catastrophe, mais les autorités n’ont pas déclaré que la situation était entièrement normalisée. La capacité limitée de l’aéroport et l’isolement persistant de trois districts empêchent d’assimiler cette décision à une reconstruction achevée. Les faits disponibles décrivent une transition : l’urgence administrative prend fin, tandis que des difficultés concrètes d’accès et de fonctionnement subsistent.",
      },
      {
        title: "Une transition encore incomplète",
        body: "La réouverture partielle de l’aéroport et la clôture de la phase d’urgence constituent les évolutions annoncées par l’Indonésie. Elles coexistent avec des accès encore difficiles et l’isolement de trois districts confirmé par une organisation humanitaire. La situation ne peut donc être décrite comme un retour général à la normale. Les opérations reprennent sous contrainte pendant que plusieurs territoires restent hors d’accès.",
      },
    ],
  },
  canada_arctic_network: {
    title: "Le Canada teste son réseau arctique sur deux sites",
    description: "Le Canada confirme le fonctionnement d’un prototype de réseau sur deux sites arctiques. Cette étape constitue un jalon technique, mais elle ne fournit pas une couverture complète de l’Arctique. Un média présente le dispositif comme déjà opérationnel sur l’ensemble de la région. Cette interprétation dépasse les résultats annoncés : seuls deux sites participent actuellement au prototype. Le franchissement de ce jalon ne vaut donc ni déploiement général ni couverture territoriale totale.",
    sections: [],
  },
  israel_saudi_alliance_fail: {
    title: "Les discussions israélo-saoudiennes suspendues sans alliance",
    description: "Israël et l’Arabie saoudite ont tenu des pourparlers, mais ceux-ci n’ont produit aucun traité et sont désormais suspendus. Israël présente ces échanges comme une avancée stratégique, sans en préciser la substance et sans annoncer d’alliance. L’Arabie saoudite confirme uniquement la tenue de consultations régionales. Aucun engagement commun, aucun accord formel et aucune alliance bilatérale ne peuvent donc être déduits des informations disponibles.",
    sections: [
      {
        title: "Des pourparlers sans traité",
        body: "Les deux pays ont participé à des discussions, mais aucun traité n’a été conclu. Les échanges sont suspendus et aucun texte commun n’a été annoncé. La tenue de pourparlers constitue le seul rapprochement clairement établi. Elle ne suffit pas à caractériser une alliance, puisqu’aucun engagement formel, aucune obligation réciproque et aucun accord bilatéral n’ont été rendus publics.",
      },
      {
        title: "Une portée décrite différemment",
        body: "Israël évoque une avancée stratégique, mais ne précise ni son contenu ni ses effets. Cette formule ne s’accompagne d’aucune annonce d’alliance. L’Arabie saoudite adopte une présentation plus limitée et confirme seulement des consultations régionales. Les deux communications reconnaissent donc l’existence de discussions, tout en leur attribuant une portée différente. Aucune des informations établies ne permet de transformer ces échanges en accord.",
      },
      {
        title: "Le dossier reste sans engagement formel",
        body: "La situation exacte se résume à des pourparlers tenus, puis suspendus, sans traité. Il serait inexact d’annoncer une alliance israélo-saoudienne, un partenariat formel ou un engagement commun. La qualification d’avancée stratégique appartient à la communication israélienne et ne décrit pas un mécanisme précis. La position saoudienne reste limitée à la confirmation de consultations régionales, sans validation d’un rapprochement institutionnel.",
      },
      {
        title: "Des échanges sans résultat institutionnel",
        body: "La suspension des discussions laisse les relations au stade des consultations. Israël ne peut s’appuyer sur aucun traité pour donner une forme institutionnelle à l’avancée qu’il évoque. L’Arabie saoudite ne reconnaît pour sa part qu’un dialogue régional. Les deux versions établissent la tenue de pourparlers, mais aucune ne permet d’annoncer une alliance ou un engagement bilatéral formalisé entre les deux pays.",
      },
    ],
  },
  philippines_china_spy_success: {
    title: "Des plans commerciaux chinois authentifiés",
    description: "Des plans chinois ont été obtenus puis soumis à vérification. Leur contenu concerne exclusivement des activités logistiques commerciales et ne comprend aucune donnée militaire stratégique. L’identité de l’auteur de l’extraction n’est pas publique. Les Philippines refusent de commenter l’obtention des documents, tandis que la Chine conteste leur authenticité.",
    sections: [
      {
        title: "Des métadonnées jugées cohérentes",
        body: "L’examen indépendant des métadonnées conclut à leur cohérence avec des documents authentiques. Cette vérification porte sur l’origine technique des fichiers et ne transforme pas leur contenu commercial en renseignement militaire. Les plans décrivent de la logistique commerciale chinoise et aucun élément disponible ne leur attribue une portée stratégique militaire.",
      },
      {
        title: "Des versions contradictoires",
        body: "La Chine affirme que les documents ont été fabriqués. Cette position est contredite par l’audit des métadonnées, qui n’a pas relevé d’incohérence remettant en cause leur authenticité. Le désaccord porte donc sur l’authenticité des fichiers, tandis que leur contenu connu reste strictement commercial et dépourvu de données militaires stratégiques.",
      },
      {
        title: "Manille ne commente pas",
        body: "Les Philippines refusent de commenter l’obtention des documents. Aucun élément public ne permet d’identifier l’auteur de leur extraction ni la méthode employée. Seuls leur caractère commercial et la cohérence technique de leurs métadonnées sont établis. L’origine de l’extraction doit rester inconnue dans toute présentation publique du dossier.",
      },
    ],
  },
  egypt_ethiopia_sabotage_success: {
    title: "Une station éthiopienne interrompue pendant six heures",
    description: "Une station de pompage éthiopienne a été interrompue durant six heures par une commande extérieure délibérée. Le fonctionnement a depuis repris, mais l’auteur de l’intervention n’est pas identifié publiquement. L’Éthiopie dénonce un acte étranger sans nommer de pays, tandis que l’Égypte nie toute implication.",
    sections: [
      {
        title: "Une intervention extérieure établie",
        body: "Les éléments disponibles distinguent l’incident d’une panne ordinaire : l’arrêt résulte d’une commande extérieure volontaire. Ils ne permettent toutefois pas d’en attribuer l’origine à un pays déterminé. La durée de l’interruption est établie, mais l’identité du commanditaire et la méthode précise restent absentes des informations publiques.",
      },
      {
        title: "Addis-Abeba dénonce un acte étranger",
        body: "L’Éthiopie qualifie l’incident d’intervention étrangère, sans désigner officiellement un État responsable. Cette déclaration confirme la lecture éthiopienne de la commande extérieure, mais pas l’identité de son auteur. Aucun élément publié ne transforme cette accusation générale en attribution à un gouvernement déterminé.",
      },
      {
        title: "Le Caire nie toute implication",
        body: "L’Égypte rejette toute participation à l’interruption. Aucun élément public ne permet de confirmer cette implication ni de désigner un autre responsable. L’attribution de l’acte reste donc ouverte. La reprise du fonctionnement de la station ne change pas ce constat : l’auteur de la commande extérieure demeure publiquement inconnu.",
      },
    ],
  },
  angola_saudi_black_plaque: {
    title: "« Collier d’or », carte noire : le Forum de Luanda tourne à l’affront",
    description: "Arrivée avec 47 minutes de retard au Forum de Luanda, la délégation de l’Arabie saoudite a trouvé sa plaque en laiton remplacée par une carte noire. Une vice-ministre de l’Angola a fustigé le « collier d’or » avec lequel les « héritiers du désert » voudraient acheter le respect africain. Dix-huit minutes avant la clôture, les Saoudiens ont quitté la salle. Les images démentent pourtant le refus de poignée de main et le drapeau retiré. Riyad réclame des excuses ; le Corredor Azul reste en négociation.",
    sections: [],
  },
};

function articleLength(output) {
  return [output.description, ...output.sections.map(({ body }) => body)].join("\n").length;
}

const requestedKey = process.argv.find((arg) => arg.startsWith("--key="))?.slice(6);
if (requestedKey && !outputs[requestedKey]) throw new Error(`Article inconnu : ${requestedKey}`);
const selectedOutputs = requestedKey ? { [requestedKey]: outputs[requestedKey] } : outputs;
const localErrors = [];
for (const [key, output] of Object.entries(selectedOutputs)) {
  const length = articleLength(output);
  if (!output.title.trim() || !output.description.trim()) localErrors.push(`${key}: contenu vide`);
  if (output.title.length > 256 || output.description.length > 4_096) {
    localErrors.push(`${key}: champ Discord trop long`);
  }
  if (output.sections.some(({ title, body }) => !title.trim() || !body.trim() || title.length > 256 || body.length > 1_024)) {
    localErrors.push(`${key}: section invalide`);
  }
  if (/@everyone|@here|<@!?&?\d+>|<#\d+>|```/i.test(JSON.stringify(output))) {
    localErrors.push(`${key}: mention ou bloc Discord interdit`);
  }
  output._length = length;
}
if (Object.keys(outputs).length !== 17) localErrors.push("La suite doit contenir 17 articles.");
if (process.argv.includes("--check")) {
  console.log(JSON.stringify(Object.fromEntries(
    Object.entries(selectedOutputs).map(([key, output]) => [key, output._length]),
  ), null, 2));
  if (localErrors.length) throw new Error(localErrors.join("\n"));
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Secrets Supabase manquants.");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: countries, error: countryError } = await supabase
  .from("countries")
  .select("id,name")
  .order("id");
const { data: actions, error: actionError } = await supabase
  .from("ai_event_requests")
  .select("id,mj_notes,article_profile,context_fact_sheet,execution_version,pending_execution_version,consequences_applied_at,updated_at")
  .like("mj_notes", `${SUITE}:%`);
if (countryError || actionError) throw countryError ?? actionError;

const actionsByKey = new Map(actions.map((action) => [action.mj_notes.slice(SUITE.length + 1), action]));
const reviewed = [];
for (const [key, output] of Object.entries(selectedOutputs)) {
  const action = actionsByKey.get(key);
  if (!action) throw new Error(`${key}: action introuvable`);
  const limits = LIMITS[action.article_profile] ?? LIMITS.standard;
  if (output._length < limits[0] || output._length > limits[1]) {
    localErrors.push(`${key}: ${output._length} caractères hors profil ${action.article_profile}`);
    continue;
  }
  delete output._length;

  const { data: articles, error: articleError } = await supabase
    .from("lore_articles")
    .select("id,action_id,source_ids,current_version")
    .eq("action_id", action.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (articleError || !articles?.[0]) throw articleError ?? new Error(`${key}: article introuvable`);
  const article = articles[0];
  const sourceIds = Array.isArray(article.source_ids) ? article.source_ids : [];
  const { data: sources, error: sourceError } = sourceIds.length
    ? await supabase
        .from("lore_articles")
        .select("id,title,clean_content,sections,current_version")
        .in("id", sourceIds)
    : { data: [], error: null };
  if (sourceError) throw sourceError;
  const facts = { fiche_factuelle: action.context_fact_sheet, sources };
  const validation = parseAndValidateMagnumOutput(JSON.stringify(output), {
    profile: action.article_profile,
    allowedCountries: countriesMentionedInFacts(facts, countries.map(({ name }) => name)),
    knownCountries: countries.map(({ name }) => name),
    allowedNumbers: [...collectFactualNumbers(facts)],
  });
  if (validation.errors.length) {
    throw new Error(`${key}: ${validation.errors.join(" ")}`);
  }

  const actionExecutionVersion = action.pending_execution_version ??
    (action.consequences_applied_at ? Math.max(action.execution_version, 1) : action.execution_version + 1);
  const { error } = await supabase.rpc("review_lore_article", {
    p_article_id: article.id,
    p_title: output.title,
    p_description: output.description,
    p_sections: output.sections,
    p_expected_state: {
      article_version: article.current_version,
      action_execution_version: actionExecutionVersion,
      action_updated_at: action.updated_at,
      source_versions: sources
        .map(({ id, current_version }) => ({ id, current_version }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      countries: countries.map(({ id, name }) => ({ id, name })),
    },
  });
  if (error) throw new Error(`${key}: ${error.message}`);
  reviewed.push({ key, articleId: article.id, length: articleLength(output) });
}
if (localErrors.length) throw new Error(localErrors.join("\n"));

console.log(JSON.stringify({ suite: SUITE, reviewed }, null, 2));

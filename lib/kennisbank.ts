export interface KennisbankFeature {
  title: string;
  description: string;
}

export interface KennisbankStep {
  title: string;
  description: string;
}

export interface KennisbankTip {
  type: "tip" | "warning" | "note";
  text: string;
}

export interface KennisbankTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface KennisbankChecklistItem {
  label: string;
  note?: string;
}

export interface KennisbankChecklistGroup {
  type: "include" | "conditional" | "exclude";
  title: string;
  description?: string;
  items: KennisbankChecklistItem[];
}

export interface KennisbankChecklist {
  caption?: string;
  intro?: string;
  groups: KennisbankChecklistGroup[];
}

export interface KennisbankEmbed {
  /** Section heading, e.g. "Dataprocessen". Also used as anchor id. */
  caption?: string;
  /** Optional short intro shown above the embed. */
  intro?: string;
  /** Provider — determines how the URL is rendered. */
  type: "figma";
  /**
   * The Figma URL to embed. Paste a normal Figma share/file link OR a
   * ready-made embed URL (embed.figma.com / figma.com/embed). Plain share
   * links are wrapped automatically.
   */
  url: string;
  /** Optional aspect-ratio height in px (default 480). */
  height?: number;
  /** Optional direct link shown under the embed as a fallback. */
  openUrl?: string;
}

export type KennisbankFlowBadgeTone =
  | "sso-on"
  | "sso-off"
  | "visible"
  | "hidden"
  | "neutral";

export interface KennisbankFlowBadge {
  label: string;
  tone?: KennisbankFlowBadgeTone;
}

export interface KennisbankFlowStage {
  /** Stage title, e.g. "Landing page". */
  title: string;
  /** Whether the end user actually sees this page — drives the eye icon. */
  visibleToUser: boolean;
  /** Short label for the visibility state, e.g. "Zichtbaar" / "Niet zichtbaar". */
  visibilityLabel: string;
  /** Optional badges (e.g. SSO State) rendered on the stage card. */
  badges?: KennisbankFlowBadge[];
  description: string;
}

export interface KennisbankFlow {
  /** Section heading; also used as anchor id. */
  caption?: string;
  intro?: string;
  stages: KennisbankFlowStage[];
}

export type KennisbankCategory =
  | "Adverteren & Display"
  | "E-mail & Data"
  | "Design & Content"
  | "Automatisering & Projectmanagement";

export interface KennisbankTool {
  slug: string;
  name: string;
  category: KennisbankCategory;
  description: string;
  logo?: string;
  accessUrl?: string;
  accessNote?: string;
  accessLinks?: { label: string; url: string }[];
  docsUrl?: string;
  features: KennisbankFeature[];
  steps?: KennisbankStep[];
  /** Kop boven de stappen, bijvoorbeeld "Doelgroepen delen met Meta". Standaard "Aan de slag". */
  stepsCaption?: string;
  tips?: KennisbankTip[];
  tables?: KennisbankTable[];
  checklists?: KennisbankChecklist[];
  embeds?: KennisbankEmbed[];
  flows?: KennisbankFlow[];
  comingSoon?: boolean;
}

export const kennisbankCategories: KennisbankCategory[] = [
  "Adverteren & Display",
  "E-mail & Data",
  "Design & Content",
  "Automatisering & Projectmanagement",
];

export const kennisbankTools: KennisbankTool[] = [
  {
    slug: "dataprocessen",
    name: "Dataprocessen",
    category: "E-mail & Data",
    description:
      "Overzicht van onze dataprocessen en het NBA-model (Next Best Action), rechtstreeks vanuit Figma.",
    embeds: [
      {
        caption: "Dataprocessen & NBA-model",
        intro:
          "Interactief overzicht vanuit Figma. Scroll en zoom binnen het board; klik op de knop eronder om het in Figma te openen.",
        type: "figma",
        url: "https://embed.figma.com/board/fMYZA3o9oPPpbccEbGuVyx/Data-Processen-PSV?node-id=0-1&embed-host=share",
        openUrl: "https://www.figma.com/board/fMYZA3o9oPPpbccEbGuVyx/Data-Processen-PSV?node-id=0-1",
        height: 640,
      },
    ],
    features: [],
  },
  {
    slug: "delen-van-persoonsgegevens",
    name: "Delen van persoonsgegevens",
    category: "E-mail & Data",
    description:
      "Zo zet je een wachtwoord uit NordPass op een Excel-bestand met persoonsgegevens, zoals mailadressen, en deel je het bestand en het wachtwoord veilig.",
    features: [],
    steps: [
      {
        title: "Voorbereiden — haal weg wat niet nodig is",
        description:
          "Verwijder uit het Excel-bestand de kolommen en rijen die de ontvanger niet nodig heeft. Deel alleen de persoonsgegevens die nodig zijn.",
      },
      {
        title: "Excel — open het bestand in de app op je laptop",
        description:
          "Open het Excel-bestand in de Excel-app op je laptop, niet in Excel in de browser. In de browser kun je geen wachtwoord op een bestand zetten.",
      },
      {
        title: "Excel — kies Versleutelen met wachtwoord",
        description:
          "Ga naar Bestand > Info > Werkmap beveiligen > Versleutelen met wachtwoord. In een Engelstalige Excel is dat File > Info > Protect Workbook > Encrypt with Password. Op een Mac kies je File > Passwords en gebruik je het veld Password to open. Laat dit venster openstaan.",
      },
      {
        title: "NordPass — open het volledige scherm",
        description: "Open NordPass via de browserextensie en klik rechtsonder op Full Screen.",
      },
      {
        title: "NordPass — maak een nieuw item",
        description: "Ga linksboven naar Vault en klik rechtsboven op Create item.",
      },
      {
        title: "NordPass — kies Password en gebruik de bestandsnaam als titel",
        description:
          "Kies Password en vul bij Title de bestandsnaam van het Excel-bestand in. Zo vind je het wachtwoord later makkelijk terug.",
      },
      {
        title: "NordPass — maak het wachtwoord aan en sla het op",
        description: "Klik op Generate password > Fill password en daarna op Save.",
      },
      {
        title: "NordPass — kopieer het wachtwoord",
        description: "Kopieer het wachtwoord in de sidebar rechts.",
      },
      {
        title: "Excel — plak het wachtwoord en sla het bestand op",
        description:
          "Plak het wachtwoord in het venster in Excel. Excel vraagt het wachtwoord twee keer: plak het nog een keer om het te bevestigen. Sla het Excel-bestand daarna op.",
      },
      {
        title: "Delen — deel het beveiligde bestand",
        description:
          "Deel het beveiligde Excel-bestand, bijvoorbeeld via een Asana-taak. Zet bij die Asana-taak de datum waarop het bestand weg moet als einddatum. Wie de taak aanmaakt, ruimt op die datum op.",
      },
      {
        title: "Delen — deel het wachtwoord via NordPass",
        description:
          "Klik in NordPass bij het wachtwoord op de drie puntjes > Share. Vul het mailadres van de ontvanger in, kies Can view, stel een einddatum in en klik op Share. De ontvanger moet de share in NordPass eerst accepteren. Heeft de ontvanger geen NordPass van PSV, bijvoorbeeld bij een externe partij? Geef het wachtwoord dan telefonisch door, niet per sms of mail.",
      },
      {
        title: "Opruimen — verwijder alle kopieën van het bestand",
        description:
          "Zijn de gegevens verwerkt, niet meer nodig of is de einddatum van de Asana-taak bereikt? Verwijder dan het Excel-bestand overal: de bijlage in de Asana-taak (elke bijlage apart), en je eigen kopieën in Downloads, op je laptop en in OneDrive of SharePoint. Vraag de ontvanger om de eigen kopie ook te verwijderen.",
      },
      {
        title: "Opruimen — verwijder het wachtwoord in NordPass",
        description:
          "Klik in NordPass bij het wachtwoord op de drie puntjes en zet het in de prullenbak (Trash). Leeg daarna de prullenbak.",
      },
    ],
    tips: [
      {
        type: "warning",
        text: "Deel liever geen Excel-bestanden met persoonsgegevens. Moet het toch, omdat systemen nog niet aan elkaar gekoppeld zijn? Zet er dan altijd een wachtwoord op. Met alle hacks en datalekken kan PSV het zich niet veroorloven om slordig om te gaan met de gegevens van fans en zakelijke relaties.",
      },
      {
        type: "warning",
        text: "Zet het wachtwoord nooit in dezelfde Asana-taak, opmerking of mail als het Excel-bestand. Wie het bestand in handen krijgt, heeft dan ook het wachtwoord. Deel het wachtwoord via NordPass, of telefonisch als de ontvanger geen NordPass van PSV heeft.",
      },
      {
        type: "warning",
        text: "Zet het wachtwoord op het Excel-bestand voordat je het bestand in OneDrive, SharePoint of Teams zet. Anders blijven oude versies zonder wachtwoord in de versiegeschiedenis staan. Staat het bestand er al zonder wachtwoord? Verwijder dan die oude versies uit de versiegeschiedenis.",
      },
      {
        type: "warning",
        text: "Kies in het menu Werkmap beveiligen echt Versleutelen met wachtwoord. De andere opties in dat menu, zoals een blad beveiligen, zetten geen wachtwoord op het openen van het bestand. Op een Mac geldt hetzelfde voor Review > Protect Workbook: gebruik File > Passwords.",
      },
      {
        type: "tip",
        text: "Werk je met een .csv-bestand, bijvoorbeeld een export? Sla het eerst op als Excel-werkmap (.xlsx). Op een .csv-bestand kun je geen wachtwoord zetten.",
      },
      {
        type: "note",
        text: "Persoonsgegevens zijn alle gegevens die iets zeggen over een persoon die je kunt herkennen, zoals naam, mailadres, telefoonnummer, adres, geboortedatum en klant- of CRM-nummer. Een bestand met alleen een kolom mailadressen bevat dus ook persoonsgegevens.",
      },
      {
        type: "note",
        text: "Bewaar het wachtwoord altijd in NordPass. Excel kan een vergeten wachtwoord niet herstellen, en zonder wachtwoord gaat het Excel-bestand niet meer open.",
      },
      {
        type: "note",
        text: "Een Excel-bestand met een wachtwoord kun je niet tegelijk met anderen bewerken.",
      },
      {
        type: "note",
        text: "Vragen over deze werkwijze? Neem contact op met het Digital Marketing-team.",
      },
    ],
  },
  {
    slug: "asana",
    name: "Asana",
    category: "Automatisering & Projectmanagement",
    logo: "/images/kennisbank/asana.svg",
    description: "Plan campagnes, wijs taken toe en houd de voortgang bij — alles op één plek.",
    docsUrl: "https://help.asana.com",
    comingSoon: true,
    features: [],
  },
  {
    slug: "azerion",
    name: "Azerion",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/azerion.png",
    description: "Bereik PSV-fans met branded games en display-advertenties via het Azerion-netwerk.",
    accessUrl: "https://psv.azerionsports.com/",
    features: [],
    tables: [
      {
        caption: "Afbeeldingsspecificaties",
        headers: ["Onderdeel", "Afmetingen"],
        rows: [
          ["Afbeelding", "980 x 1080 px"],
        ],
      },
      {
        caption: "Tekstspecificaties push notificatie",
        headers: ["Onderdeel", "Specificatie"],
        rows: [
          ["Titel", "40-60 tekens"],
          ["Message", "100-150 tekens zichtbaar"],
        ],
      },
      {
        caption: "Taxonomie pop-ups",
        headers: ["Onderdeel", "Formaat / Voorbeeld"],
        rows: [
          ["Formaat", "[DATUM] [EXPLOITATIE] - [ONDERWERP] - [DMID]"],
          ["Voorbeeld", "2026.05.06 PSV Kaartverkoop - Wachtlijst SCC - DMID26-11224"],
        ],
      },
    ],
    tips: [
      {
        type: "note",
        text: "Pop-ups kunnen gekoppeld worden aan een externe URL of aan een tab binnen de app. Push notificaties linken aan een tab binnen de app.",
      },
      {
        type: "note",
        text: "De doelgroepen voor push notificaties zijn dezelfde als in Maileon en worden vanuit TwoCircles doorgezet.",
      },
    ],
  },
  {
    slug: "blueconic",
    name: "BlueConic",
    category: "E-mail & Data",
    logo: "/images/kennisbank/blueconic.jpeg",
    description: "Verzamel first-party data, bouw doelgroepsegmenten en activeer ze in je campagnes.",
    accessNote:
      "Toegang tot BlueConic vraag je aan bij het Digital Marketing-team. Iedereen met toegang tot BlueConic kan de connecties gebruiken, ook de connectie met Meta.",
    docsUrl: "https://support.blueconic.com",
    features: [],
    stepsCaption: "Doelgroepen delen met Meta",
    steps: [
      {
        title: "BlueConic — open Connections",
        description:
          "Ga in BlueConic naar Connections. Daar staan alle connecties van BlueConic, ook de connectie met Meta: Ads - Facebook - PSV.",
      },
      {
        title: "BlueConic — voeg de connectie met Meta toe als die er nog niet is",
        description:
          "Staat de connectie met het juiste Meta Ads-account er nog niet bij? Klik dan bij Connections op Add connection en koppel het Meta Ads-account waarin je wilt adverteren: PSV (1062594023819316) of PSV FANstore (1038583669553685). Staat de connectie Ads - Facebook - PSV er al, dan sla je deze stap over.",
      },
      {
        title: "BlueConic — open de connectie Ads - Facebook - PSV",
        description: "Klik bij Connections op de connectie Ads - Facebook - PSV.",
      },
      {
        title: "BlueConic — kies het audience goal Create Facebook Custom Audiences",
        description:
          "Selecteer in de connectie Ads - Facebook - PSV het juiste audience goal. Create Facebook Custom Audiences is het goal om lijsten in bulk van BlueConic naar Meta door te zetten, op basis van een identifier zoals het e-mailadres.",
      },
      {
        title: "BlueConic — koppel de identifiers van BlueConic en Meta",
        description:
          "Koppel bij Link identifiers between BlueConic and Meta (Facebook and Instagram) een identifier uit BlueConic aan dezelfde identifier in Meta. Zo koppelt Meta de profielen van Facebook en Instagram aan de profielen in BlueConic. Kies bij voorkeur een unieke identifier: e-mailadres, telefoonnummer of de advanced Meta (Facebook and Instagram) ID. Koppelen op een combinatie van profielgegevens, zoals woonplaats, leeftijd en naam, kan ook. Gebruik alleen identifiers die met de juiste toestemming (consent) zijn verkregen.",
      },
      {
        title: "BlueConic — koppel het segment aan een Custom Audience in Meta",
        description:
          "Kies bij Map BlueConic segments to Meta (Facebook and Instagram) Custom Audiences een segment uit BlueConic, en daarnaast de Custom Audience in Meta waar dat segment naartoe moet. De profielen uit het segment komen dan samen in die Custom Audience, zodat je er in Meta op kunt adverteren.",
      },
      {
        title: "BlueConic — maak een nieuwe Custom Audience aan als die nog niet bestaat",
        description:
          "Bestaat de Custom Audience in Meta nog niet? Typ dan in de dropdown van de mapping de naam van de nieuwe doelgroep en klik op Create [naam doelgroep]. Geef de Custom Audience een naam volgens de naamgeving van Meta Ads. De nieuwe Custom Audience verschijnt pas in Meta nadat de connectie voor het eerst heeft gedraaid.",
      },
      {
        title: "BlueConic — stel in hoe vaak de connectie draait",
        description:
          "De connectie draait standaard elke nacht om 3.00 uur. Wil je een andere frequentie? Klik in de sectie Set up and run op het tandwiel en pas de frequentie aan.",
      },
      {
        title: "BlueConic — draai de connectie direct met Run now",
        description:
          "Wil je niet wachten tot de connectie 's nachts draait? Klik in de sectie Set up and run op Run now. De connectie draait dan meteen.",
      },
      {
        title: "Meta — controleer de Custom Audience",
        description:
          "Na de eerste run staat een nieuwe Custom Audience in het Meta Ads-account als custom audience die door BlueConic is aangemaakt. Staat de Custom Audience er nog niet? Controleer dan in BlueConic of de connectie Ads - Facebook - PSV al heeft gedraaid.",
      },
    ],
    tips: [
      {
        type: "warning",
        text: "Gebruik in de connectie met Meta alleen identifiers, zoals e-mailadres en telefoonnummer, die met de juiste toestemming (consent) zijn verkregen. Met een Custom Audience deel je persoonsgegevens van fans met Meta.",
      },
      {
        type: "note",
        text: "Meta herkent niet elk profiel uit BlueConic. Alleen profielen met een identifier die Meta kan koppelen, komen in de Custom Audience. Een Custom Audience in Meta is daarom meestal kleiner dan het segment in BlueConic.",
      },
      {
        type: "note",
        text: "Een nieuwe Custom Audience verschijnt pas in Meta nadat de connectie voor het eerst heeft gedraaid. Standaard is dat de eerstvolgende nacht om 3.00 uur. Met Run now in de sectie Set up and run gaat het meteen.",
      },
      {
        type: "note",
        text: "Gaat een profiel uit een segment in BlueConic, dan haalt BlueConic dat profiel bij de volgende run ook uit de gekoppelde Custom Audience in Meta. Standaard gebeurt dat elke nacht om 3.00 uur.",
      },
      {
        type: "note",
        text: "Vragen over deze werkwijze? Neem contact op met het Digital Marketing-team.",
      },
    ],
    tables: [
      {
        caption: "Meta Ads-accounts",
        headers: ["Account", "ID"],
        rows: [
          ["PSV", "1062594023819316"],
          ["PSV FANstore", "1038583669553685"],
        ],
      },
    ],
  },
  {
    slug: "custom-landingspaginas",
    name: "Custom landingspagina's",
    category: "Design & Content",
    logo: "/images/kennisbank/custom-landingspaginas.svg",
    description: "Bouw gerichte landingspagina's voor campagnes, acties en evenementen van PSV.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "figma",
    name: "Figma",
    category: "Design & Content",
    logo: "/images/kennisbank/figma.svg",
    description: "Ontwerp campagnevisuals, UI-mockups en prototypes in de PSV-huisstijl.",
    docsUrl: "https://help.figma.com/hc/en-us",
    comingSoon: true,
    features: [],
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/google.svg",
    description: "Adverteer in zoekresultaten, op YouTube en via het Google Display Netwerk.",
    docsUrl: "https://support.google.com/google-ads",
    comingSoon: true,
    features: [],
  },
  {
    slug: "jw-player",
    name: "JW Player",
    category: "Design & Content",
    logo: "/images/kennisbank/jwplayer.png",
    description: "Host en publiceer PSV-videocontent en genereer embedcodes voor gebruik op de website.",
    docsUrl: "https://docs.jwplayer.com/platform/docs",
    comingSoon: true,
    features: [],
  },
  {
    slug: "linkedin-ads",
    name: "LinkedIn Ads",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/linkedin.svg",
    description: "Bereik zakelijke doelgroepen op LinkedIn met gesponsorde content en lead gen forms.",
    docsUrl: "https://www.linkedin.com/help/lms",
    comingSoon: true,
    features: [],
  },
  {
    slug: "maileon",
    name: "Maileon",
    category: "E-mail & Data",
    logo: "/images/kennisbank/maileon.png",
    description: "Verstuur nieuwsbrieven, campagnemails en geautomatiseerde e-mails naar PSV-doelgroepen.",
    docsUrl: "https://support.maileon.com",
    accessLinks: [
      { label: "PSV", url: "https://psv-news-mailer.maileon.com/eagle_kp_webapp/start/dashboards/dashboard.msa" },
      { label: "PSV Business", url: "https://psvbusiness-sendserver.maileon.com/eagle_kp_webapp/start/dashboards/dashboard.msa?fromlogin=true" },
      { label: "PSV Campaigns", url: "https://campains-psv.maileon.com/eagle_kp_webapp/start/dashboards/dashboard.msa?fromlogin=true" },
      { label: "PSV Operational", url: "https://psv-sso-news-mailer.maileon.com/eagle_kp_webapp/start/dashboards/dashboard.msa?fromlogin=true" },
    ],
    features: [],
    tables: [
      {
        caption: "Accountstructuur",
        headers: ["Account", "Omschrijving"],
        rows: [
          [
            "PSV",
            "Database-account. Nachtelijke verwerking via koppeling met TwoCircles.",
          ],
          [
            "PSV Business",
            "Gekoppeld met het CRM van PSV Business. Contactfilters maak je op basis van velden die ook in het CRM terugkomen.",
          ],
          [
            "PSV Campaigns",
            "Account voor campagnes van PSV, directe communicatie. Hoeft niet te wachten op de nachtelijke verwerking.",
          ],
          [
            "PSV Operational",
            "Leeg account waar je lijsten handmatig invoert, zoals personeel of PSV Business-leden.",
          ],
        ],
      },
      {
        caption: "Taxonomie van mailings",
        headers: ["Onderdeel", "Voorbeeld"],
        rows: [
          [
            "Formaat",
            "[DATUM YYYY.MM.DD] [EXPLOITATIE] [ONDERWERP/CAMPAGNE] [VARIANT] [DMID]",
          ],
          [
            "Voorbeeld",
            "2026.05.03 PSV Vrouwen - Kampioenschap - Mail personeel - DMID26-11566",
          ],
        ],
      },
      {
        caption: "Afbeeldingsspecificaties",
        headers: ["Onderdeel", "Afmetingen"],
        rows: [
          ["Header", "1250 x 802 px"],
          ["Banmail", "1250 x 458 px"],
        ],
      },
      {
        caption: "Beschikbare templates",
        headers: ["Template"],
        rows: [
          ["TEMPLATE PSV 1 - Pre-match"],
          ["TEMPLATE PSV Tours"],
          ["TEMPLATE FC PSV O16"],
          ["TEMPLATE FC PSV O12"],
          ["TEMPLATE PSV Soccer School"],
          ["TEMPLATE PSV FANstore"],
        ],
      },
    ],
    tips: [
      {
        type: "note",
        text: "In het PSV-account zet je doelgroepen door vanuit TwoCircles. Lees meer hierover in de TwoCircles-kennisbank.",
      },
    ],
  },
  {
    slug: "meta-ads",
    name: "Meta Ads",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/meta.svg",
    description: "Adverteer op Facebook en Instagram en bereik PSV-fans met gerichte campagnes.",
    docsUrl: "https://www.facebook.com/business/help",
    comingSoon: true,
    features: [],
  },
  {
    slug: "n8n",
    name: "n8n",
    category: "Automatisering & Projectmanagement",
    logo: "/images/kennisbank/n8n.svg",
    description: "Koppel tools aan elkaar en automatiseer terugkerende processen zonder code.",
    docsUrl: "https://docs.n8n.io",
    comingSoon: true,
    features: [],
  },
  {
    slug: "playable",
    name: "Playable",
    category: "Design & Content",
    logo: "/images/kennisbank/playable.jpeg",
    description: "Maak interactieve landingspagina's en mini-games voor PSV-campagnes.",
    accessUrl: "https://app.playable.com/campaigns",
    docsUrl: "https://help.playable.com/en/",
    features: [],
    steps: [
      {
        title: "Backend — koppel Sports Alliance",
        description:
          "Ga naar Integrations > Add Integration > Sports Alliance. Login host: login.psv.nl · Tenant ID: OJJWeJFCCUmgUagZ6nre_w · Key en Secret neem je over uit een bestaande campagne.",
      },
      {
        title: "Frontend — richt de drie pagina's in",
        description:
          "Elke campagne heeft een Landing-, Registration- en Confirmation page nodig, elk met de juiste SSO State-conditie. Zie de flow hieronder voor de instellingen per pagina.",
      },
      {
        title: "Testen",
        description:
          "Vul via de Live URL een test in: klik op de CTA, log optioneel in, en controleer via Activity > Registrations of alle data goed binnenkomt.",
      },
    ],
    flows: [
      {
        caption: "De SSO-flow: drie pagina's",
        intro:
          "De volgorde die de gebruiker doorloopt. De SSO State-conditie (Advanced > Visibility Condition > Sports Alliance) bepaalt welke pagina wanneer verschijnt.",
        stages: [
          {
            title: "Landing page",
            visibleToUser: true,
            visibilityLabel: "Zichtbaar",
            badges: [{ label: "SSO State: Not using SSO", tone: "sso-off" }],
            description:
              "CTA-button met Selection action 'Login using Sports Alliance'. Al ingelogd? De klik gaat direct door naar de Confirmation page. Nog niet ingelogd? De gebruiker ziet het login.psv.nl-scherm.",
          },
          {
            title: "Registration page",
            visibleToUser: false,
            visibilityLabel: "Niet zichtbaar",
            badges: [{ label: "SSO State: Using SSO", tone: "sso-on" }],
            description:
              "Registratieformulier dat automatisch gevuld wordt vanuit het Mijn PSV-account. Voeg 'ssoid' hidden toe en map het als 'ID' (verplicht). Overige velden: zie de veldentabel hieronder.",
          },
          {
            title: "Confirmation page",
            visibleToUser: true,
            visibilityLabel: "Zichtbaar bij succes",
            badges: [{ label: "SSO State: Using SSO", tone: "sso-on" }],
            description:
              "De bedankpagina die de gebruiker ziet na een geslaagde login en registratie.",
          },
        ],
      },
    ],
    tips: [
      {
        type: "note",
        text: "Elke campagne heeft altijd een Landing page, een Registration page én een Confirmation page nodig.",
      },
      {
        type: "warning",
        text: "Het veld 'ssoid' is verplicht voor een geslaagde SSO-login: zet het als hidden veld in de Registration page en map het bij 'Map Sports Alliance field' als 'ID'.",
      },
    ],
    tables: [
      {
        caption: "Mijn PSV-login — Formuliervelden (Sports Alliance)",
        headers: ["Veld", "Instelling"],
        rows: [
          [
            "ssoid",
            "Verplicht — hidden veld, map als 'ID'. Zonder dit slaagt de SSO-login niet.",
          ],
          [
            "E-mail, Username, Type, Forename, Middle names, Surname, Gender, Age Range, Date of birth, Has phone, Profile state, Has address, Club",
            "Al beschikbaar in de huidige integratie.",
          ],
        ],
      },
      {
        caption: "Templates",
        headers: ["Template", "ID"],
        rows: [
          ["TEMPLATE PSV 1", "#189777"],
          ["TEMPLATE PHOXY CLUB | 2025 - 2026", "191848"],
          ["TEMPLATE FC PSV O12 | 2025-2026", "191851"],
          ["TEMPLATE FC PSV O16 | 2025-2026", "191853"],
          ["TEMPLATE PSV PARTNERSHIPS | 2025-2026", "192598"],
          ["TEMPLATE UEFA CHAMPIONS LEAGUE | 2025-2026", "192971"],
          ["TEMPLATE PSV FANCLUB | 2025 - 2026", "192974"],
          ["TEMPLATE JONG PSV - PSV VROUWEN | 2025 - 2026", "211939"],
          ["TEMPLATE - Video detail", "225293"],
        ],
      },
      {
        caption: "Afbeeldingsspecificaties",
        headers: ["Onderdeel", "Afmetingen"],
        rows: [
          ["Header mobile", "700 x 290 px"],
          ["Header desktop", "335 x 300 px"],
        ],
      },
      {
        caption: "Taxonomie van landingspagina's",
        headers: ["Onderdeel", "Formaat"],
        rows: [
          ["Naamgeving", "[EXPLOITATIE] - [CAMPAGNE] - [SEIZOEN] - [DMID]"],
        ],
      },
    ],
  },
  {
    slug: "tiktok-ads",
    name: "TikTok Ads",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/tiktok.svg",
    description: "Bereik een jong publiek op TikTok met video-advertenties en Spark Ads.",
    docsUrl: "https://ads.tiktok.com/help/",
    comingSoon: true,
    features: [],
  },
  {
    slug: "twocircles",
    name: "TwoCircles",
    category: "E-mail & Data",
    logo: "/images/kennisbank/twocircles.svg",
    description: "Data- en ticketingplatform voor het beheren van fan- en klantdata van PSV.",
    docsUrl: "https://help.koresoftware.com/hc/en-us",
    features: [],
    checklists: [
      {
        caption: "Audience Builder – Seizoenkaarten 26/27",
        intro:
          "Bij een selectie van seizoenkaarthouders werk je in de Audience Builder onder SeizoenClubCards. Er zijn altijd 8 waardes (6 kernwaarden + 2 toegangswaarden); daarnaast zijn er opties die je juist moet uitsluiten.",
        groups: [
          {
            type: "include",
            title: "Altijd meenemen",
            description: "De 6 kernwaarden van een seizoenkaart 26/27.",
            items: [
              { label: "Certificaat 26/27" },
              { label: "Certificaat All-in 26/27" },
              { label: "Dagkaarten 26/27" },
              { label: "Dagkaarten All-in 26/27" },
              { label: "Seizoen Club Card 26/27" },
              { label: "Seizoen Club Card All-in 26/27" },
            ],
          },
          {
            type: "conditional",
            title: "Afhankelijk van de briefing",
            description:
              "Gratis kaarten voor sponsors en personeel. Wel, niet of anders aanschrijven hangt af van de mailing — leg dit altijd expliciet vast in de briefing.",
            items: [
              { label: "Toegang SCC 26/27" },
              { label: "Toegang SCC dagkaarten 26/27" },
            ],
          },
          {
            type: "exclude",
            title: "Altijd uitsluiten",
            description:
              "Deze opties horen niet bij Seizoenkaarten 26/27 en sluit je altijd uit bij een selectie van seizoenkaarthouders.",
            items: [
              { label: "Certificaten" },
              { label: "Mystery SCC" },
              { label: "SCC wijziging 26/27" },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "typeform",
    name: "Typeform",
    category: "Design & Content",
    logo: "/images/kennisbank/typeform.png",
    description: "Maak formulieren, enquêtes en quizzen voor fan-onderzoek en registraties.",
    accessUrl: "https://admin.typeform.com/",
    docsUrl: "https://help.typeform.com/hc/en-us",
    features: [],
    tables: [
      {
        caption: "Accountstructuur",
        headers: ["Werkruimte"],
        rows: [
          ["Archief nieuwe account"],
          ["Archief oude account"],
          ["Dataverrijking PSV (Webhook)"],
          ["PSV 1"],
          ["PSV Academy"],
          ["PSV Brand & Design"],
          ["PSV Business"],
          ["PSV Business - Diners"],
          ["PSV Business - Evenementen"],
          ["PSV Business - Vitality"],
          ["PSV Digital Marketing"],
          ["PSV Digital Marketing - CES"],
          ["PSV Enquete"],
          ["PSV Esports"],
          ["PSV FANclub"],
          ["PSV FANclub - FC PSV"],
          ["PSV FANclub - Phoxy Club"],
          ["PSV FANdesk"],
          ["PSV FANentertainment"],
          ["PSV FANstore"],
          ["PSV Foundation"],
          ["PSV Kaartverkoop"],
          ["PSV Marketing & Media"],
          ["PSV Media"],
          ["PSV Museum & Tours"],
          ["PSV New Business"],
          ["PSV Organisatie"],
          ["PSV Partnerships"],
          ["PSV Perszaken"],
          ["PSV Philips Stadion"],
          ["PSV Soccer Schools"],
          ["PSV Together"],
          ["PSV Vrouwen"],
        ],
      },
      {
        caption: "Taxonomie van formulieren",
        headers: ["Onderdeel", "Formaat"],
        rows: [
          ["Naamgeving", "[EXPLOITATIE] - [ONDERWERP] - [OPTIONEEL SEIZOEN] - [DMID]"],
        ],
      },
    ],
  },
  {
    slug: "xperience-central",
    name: "Xperience Central",
    category: "Design & Content",
    logo: "/images/kennisbank/xperience-central.png",
    description: "Beheer en publiceer content op PSV-kanalen via dit CMS-platform.",
    docsUrl: "https://wiki.gxsoftware.com",
    comingSoon: true,
    features: [],
  },
];

export function getToolBySlug(slug: string): KennisbankTool | undefined {
  return kennisbankTools.find((t) => t.slug === slug);
}

const CHECKLIST_LABELS: Record<KennisbankChecklistGroup["type"], string> = {
  include: "ALTIJD MEENEMEN",
  conditional: "AFHANKELIJK VAN DE BRIEFING",
  exclude: "ALTIJD UITSLUITEN",
};

/** Dezelfde labels als op de documentatiepagina, zodat de assistent een regel van een tip onderscheidt. */
const TIP_LABELS: Record<KennisbankTip["type"], string> = {
  warning: "Let op",
  note: "Opmerking",
  tip: "Tip",
};

/**
 * Serialiseert de volledige kennisbank naar platte tekst voor gebruik als
 * context in de system prompt van de kennisbank-assistent (context-stuffing).
 *
 * Elk onderdeel krijgt een bronlabel (`[bron: slug#sectie]`) met dezelfde
 * ankers als `getToolSections`, zodat de assistent kan aangeven waar een
 * antwoord vandaan komt en de chat daar rechtstreeks naartoe kan linken.
 */
export function buildKennisbankContext(): string {
  return kennisbankTools
    .map((tool) => {
      const lines: string[] = [];
      const bron = (id?: string) => `[bron: ${tool.slug}${id ? `#${id}` : ""}]`;
      lines.push(`## ${tool.name} (categorie: ${tool.category}) ${bron()}`);
      lines.push(tool.description);
      if (tool.comingSoon)
        lines.push("Status: documentatie nog niet beschikbaar (binnenkort).");
      if (tool.accessUrl || tool.accessNote || tool.accessLinks?.length || tool.docsUrl) {
        lines.push(`Toegang ${bron("toegang")}`);
        if (tool.accessUrl) lines.push(`Inloggen: ${tool.accessUrl}`);
        tool.accessLinks?.forEach((l) => lines.push(`Inloggen (${l.label}): ${l.url}`));
        if (tool.accessNote) lines.push(`Toegang: ${tool.accessNote}`);
        if (tool.docsUrl) lines.push(`Officiële documentatie: ${tool.docsUrl}`);
      }
      if (tool.features.length > 0) {
        lines.push(`Mogelijkheden ${bron("mogelijkheden")}`);
        tool.features.forEach((f) => lines.push(`- ${f.title}: ${f.description}`));
      }
      if (tool.steps?.length) {
        lines.push(`${tool.stepsCaption ?? "Aan de slag"} ${bron("aan-de-slag")}`);
        tool.steps.forEach((s, i) => lines.push(`Stap ${i + 1}, ${s.title}: ${s.description}`));
      }
      tool.checklists?.forEach((c) => {
        lines.push(`Checklist: ${c.caption ?? ""} ${c.caption ? bron(slugify(c.caption)) : bron()}`);
        if (c.intro) lines.push(c.intro);
        c.groups.forEach((g) => {
          lines.push(
            `${CHECKLIST_LABELS[g.type]}: ${g.title}${g.description ? `. ${g.description}` : ""}`
          );
          g.items.forEach((it) =>
            lines.push(`  - ${it.label}${it.note ? ` (${it.note})` : ""}`)
          );
        });
      });
      tool.tables?.forEach((t) => {
        lines.push(`Tabel: ${t.caption ?? ""} ${t.caption ? bron(slugify(t.caption)) : bron()}`);
        lines.push(t.headers.join(" | "));
        t.rows.forEach((r) => lines.push(r.join(" | ")));
      });
      tool.flows?.forEach((f) => {
        lines.push(`Flow: ${f.caption ?? ""} ${f.caption ? bron(slugify(f.caption)) : bron()}`);
        if (f.intro) lines.push(f.intro);
        f.stages.forEach((s, i) => {
          const badges = s.badges?.map((b) => b.label).join(", ");
          lines.push(
            `Stap ${i + 1}, ${s.title} (${s.visibilityLabel}${badges ? `; ${badges}` : ""}): ${s.description}`
          );
        });
      });
      tool.embeds?.forEach((e) => {
        lines.push(
          `Ingesloten (${e.type}): ${e.caption ?? ""} ${e.caption ? bron(slugify(e.caption)) : bron()}`
        );
        if (e.intro) lines.push(e.intro);
        lines.push(`Link: ${e.openUrl ?? e.url}`);
      });
      if (tool.tips?.length) {
        lines.push(`Tips ${bron("tips")}`);
        tool.tips.forEach((tip) => lines.push(`- ${TIP_LABELS[tip.type]}: ${tip.text}`));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Zet een bronlabel uit een antwoord (`slug` of `slug#sectie`) om naar een
 * link en een leesbaar label. Geeft null terug voor een onbekende tool; een
 * onbekende sectie valt terug op de pagina van de tool.
 */
export function resolveBron(ref: string): { href: string; label: string } | null {
  const [slug, sectie] = ref.trim().split("#");
  const tool = slug ? getToolBySlug(slug) : undefined;
  if (!tool) return null;
  const href = `/dashboard/kennisbank/${tool.slug}`;
  const section = sectie ? getToolSections(tool).find((s) => s.id === sectie) : undefined;
  return section
    ? { href: `${href}#${section.id}`, label: `${tool.name} · ${section.label}` }
    : { href, label: tool.name };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Zet een Figma-link om naar een insluitbare embed-URL. Accepteert zowel gewone
 * share-/file-links (figma.com/design|file|board|proto/...) als kant-en-klare
 * embed-URL's (embed.figma.com of figma.com/embed) — die worden ongewijzigd
 * teruggegeven. Voorwaarde blijft dat de linkrechten in Figma bekijken toestaan.
 */
export function figmaEmbedUrl(url: string): string {
  if (url.includes("embed.figma.com") || url.includes("figma.com/embed")) {
    return url;
  }
  return `https://www.figma.com/embed?embed_host=psv-tools&url=${encodeURIComponent(url)}`;
}

export interface KennisbankSection {
  label: string;
  id: string;
}

export function getToolSections(tool: KennisbankTool): KennisbankSection[] {
  const sections: KennisbankSection[] = [];
  if (tool.accessUrl || tool.accessNote || tool.accessLinks?.length || tool.docsUrl)
    sections.push({ label: "Toegang", id: "toegang" });
  if (tool.features.length > 0)
    sections.push({ label: "Mogelijkheden", id: "mogelijkheden" });
  if (tool.steps && tool.steps.length > 0)
    sections.push({ label: tool.stepsCaption ?? "Aan de slag", id: "aan-de-slag" });
  tool.flows?.forEach((f) => {
    if (f.caption) sections.push({ label: f.caption, id: slugify(f.caption) });
  });
  tool.embeds?.forEach((e) => {
    if (e.caption) sections.push({ label: e.caption, id: slugify(e.caption) });
  });
  tool.checklists?.forEach((c) => {
    if (c.caption) sections.push({ label: c.caption, id: slugify(c.caption) });
  });
  tool.tables?.forEach((t) => {
    if (t.caption) sections.push({ label: t.caption, id: slugify(t.caption) });
  });
  if (tool.tips && tool.tips.length > 0)
    sections.push({ label: "Tips", id: "tips" });
  return sections;
}

export const toolsByCategory: Record<KennisbankCategory, KennisbankTool[]> =
  Object.fromEntries(
    kennisbankCategories.map((cat) => [
      cat,
      kennisbankTools.filter((t) => t.category === cat),
    ])
  ) as Record<KennisbankCategory, KennisbankTool[]>;

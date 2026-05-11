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

export interface KennisbankTool {
  slug: string;
  name: string;
  description: string;
  accessUrl?: string;
  accessNote?: string;
  features: KennisbankFeature[];
  steps?: KennisbankStep[];
  tips?: KennisbankTip[];
  tables?: KennisbankTable[];
  comingSoon?: boolean;
}

export const kennisbankTools: KennisbankTool[] = [
  {
    slug: "asana",
    name: "Asana",
    description:
      "Projectmanagementtool voor het plannen, toewijzen en bijhouden van taken en campagnes.",
    accessUrl: "https://app.asana.com",
    accessNote:
      "Log in met je PSV Microsoft-account via SSO. Toegang aanvragen via je manager of IT.",
    features: [
      {
        title: "Projecten beheren",
        description:
          "Maak projecten aan voor campagnes, evenementen of langlopende initiatieven.",
      },
      {
        title: "Taken toewijzen",
        description:
          "Wijs taken toe aan collega's met een deadline en prioriteit.",
      },
      {
        title: "Voortgang bijhouden",
        description:
          "Bekijk de status van projecten via lijsten, boards of tijdlijnen.",
      },
      {
        title: "Samenwerken",
        description:
          "Reageer op taken, voeg bestanden toe en communiceer in de context van het werk.",
      },
    ],
    steps: [
      {
        title: "Team zoeken",
        description:
          "Zoek het juiste PSV-team op in de linkerzijbalk of via Search.",
      },
      {
        title: "Project openen of aanmaken",
        description:
          "Open een bestaand project of maak een nieuw project aan via + New project.",
      },
      {
        title: "Taak aanmaken",
        description:
          "Klik op + Add task en vul een taaknaam in. Voeg een omschrijving, eigenaar en deadline toe.",
      },
      {
        title: "Taak toewijzen",
        description:
          "Wijs de taak toe aan de juiste collega via het Assignee-veld.",
      },
      {
        title: "Voortgang bijhouden",
        description:
          "Gebruik de Board- of Timeline-weergave om de status van het project te volgen.",
      },
    ],
    tables: [
      {
        caption: "Weergaven",
        headers: ["Weergave", "Gebruik"],
        rows: [
          ["List", "Overzicht van alle taken op rij — ideaal voor taakoverzichten"],
          ["Board", "Kanban-bord — ideaal voor het bijhouden van statussen"],
          ["Timeline", "Gantt-chart — ideaal voor planning en deadlines"],
          ["Calendar", "Kalenderweergave van taken op datum"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Gebruik Custom Fields om extra informatie toe te voegen aan taken, zoals campagnebudget, status of platform.",
      },
      {
        type: "tip",
        text: "Stel Due dates in op alle taken — ook interne taken. Dit voorkomt dat werk blijft liggen zonder eigenaar of deadline.",
      },
      {
        type: "warning",
        text: "Archiveer voltooide projecten zodat de workspace overzichtelijk blijft. Verwijder geen projecten zonder overleg — historische data kan nog waardevol zijn.",
      },
    ],
  },
  {
    slug: "azerion",
    name: "Azerion",
    description:
      "Gaming- en advertentieplatform voor branded content en display advertising.",
    accessNote:
      "Azerion werkt via een accountmanager. Vraag toegang aan via de PSV marketing manager.",
    features: [
      {
        title: "Branded games",
        description:
          "Maak interactieve spelletjes met PSV-branding voor gebruik in campagnes en acties.",
      },
      {
        title: "Display advertising",
        description:
          "Zet display-banners in op het Azerion-netwerk van publisher-sites.",
      },
      {
        title: "Rich media",
        description:
          "Gebruik animaties en interactieve bannerformaten voor meer engagement.",
      },
      {
        title: "Doelgroeptargeting",
        description:
          "Bereik relevante doelgroepen op basis van interesses en gedrag.",
      },
    ],
    steps: [
      {
        title: "Briefing aanleveren",
        description:
          "Stel een campagnebriefing op met doelstelling, doelgroep, budget en looptijd.",
      },
      {
        title: "Contact met accountmanager",
        description:
          "Deel de briefing met je Azerion-accountmanager voor een voorstel.",
      },
      {
        title: "Assets aanleveren",
        description:
          "Lever de benodigde afbeeldingen, logo's en teksten aan in de juiste formaten.",
      },
      {
        title: "Campagne live",
        description:
          "Na goedkeuring zet Azerion de campagne live en ontvang je toegang tot de rapportage.",
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Combineer Azerion-campagnes met Meta Ads of Google Ads voor maximaal bereik over verschillende kanalen.",
      },
      {
        type: "warning",
        text: "Lever assets altijd op tijd aan. Azerion heeft doorgaans een productietijd van 3–5 werkdagen nodig voor rich media formaten.",
      },
    ],
  },
  {
    slug: "blueconic",
    name: "BlueConic",
    description:
      "Customer Data Platform (CDP) voor het verzamelen en activeren van first-party data.",
    accessUrl: "https://app.blueconic.com",
    accessNote:
      "Log in met je PSV-account. Geen toegang? Vraag dit aan via het marketingteam.",
    features: [
      {
        title: "Profielen opbouwen",
        description:
          "Verzamel gedragsdata van websitebezoekers en bouw gedetailleerde klantprofielen op.",
      },
      {
        title: "Segmentatie",
        description:
          "Maak doelgroepsegmenten op basis van gedrag, interesses en demografische gegevens.",
      },
      {
        title: "Personalisatie",
        description:
          "Toon gepersonaliseerde content en aanbiedingen op basis van het profiel van de bezoeker.",
      },
      {
        title: "Activatie",
        description:
          "Exporteer segmenten naar advertentieplatforms zoals Meta, Google en LinkedIn.",
      },
    ],
    steps: [
      {
        title: "Inloggen",
        description: "Log in op app.blueconic.com met je PSV-account.",
      },
      {
        title: "Segmenten verkennen",
        description:
          "Bekijk bestaande segmenten onder Segments om te zien welke doelgroepen al beschikbaar zijn.",
      },
      {
        title: "Nieuw segment aanmaken",
        description:
          "Klik op New Segment en stel je criteria in op basis van eigenschappen of gedrag.",
      },
      {
        title: "Segment activeren",
        description:
          "Koppel het segment via een Connection aan een advertentieplatform of e-mailsysteem.",
      },
    ],
    tables: [
      {
        caption: "Kernbegrippen",
        headers: ["Begriff", "Uitleg"],
        rows: [
          ["Profiel", "Één uniek klantprofiel met alle bekende data over een bezoeker"],
          ["Segment", "Een groep profielen die voldoen aan bepaalde criteria"],
          ["Listener", "Een regel die data verzamelt op basis van gedrag"],
          ["Connection", "Koppeling met een extern systeem (bijv. Meta of Maileon)"],
          ["Dialogue", "Gepersonaliseerde content of pop-up voor een segment"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Gebruik BlueConic-segmenten als custom audiences in Meta Ads of Google Ads voor nauwkeurigere targeting met first-party data.",
      },
      {
        type: "warning",
        text: "Verwijder geen bestaande listeners of connections zonder overleg — dit kan data-verzameling voor andere campagnes onderbreken.",
      },
    ],
  },
  {
    slug: "custom-landingspaginas",
    name: "Custom landingspagina's",
    description:
      "Zelf gebouwde landingspagina's voor campagnes, acties en evenementen.",
    features: [
      {
        title: "HTML / CSS / JS",
        description:
          "Basis voor alle custom pagina's. Hosted op de PSV-infrastructuur.",
      },
      {
        title: "Typeform",
        description:
          "Voor het integreren van formulieren en registraties op de landingspagina.",
      },
      {
        title: "Google Tag Manager",
        description:
          "Voor het toevoegen van tracking-pixels en conversiedoelen.",
      },
      {
        title: "Figma",
        description:
          "Het ontwerp van de landingspagina wordt altijd eerst in Figma uitgewerkt.",
      },
    ],
    steps: [
      {
        title: "Briefing",
        description:
          "Stel een briefing op met het doel, de doelgroep, de gewenste URL en de deadline.",
      },
      {
        title: "Ontwerp in Figma",
        description:
          "De developer of designer maakt een ontwerp in Figma ter goedkeuring.",
      },
      {
        title: "Development",
        description:
          "Na goedkeuring van het ontwerp wordt de pagina gebouwd en getest.",
      },
      {
        title: "Tracking instellen",
        description:
          "Voeg via Google Tag Manager de benodigde tracking in (GA4, Meta Pixel, etc.).",
      },
      {
        title: "Live zetten",
        description:
          "De pagina wordt gepubliceerd op de juiste URL en getest in de browser.",
      },
      {
        title: "Rapportage",
        description:
          "Monitor de prestaties via Google Analytics 4 en de relevante advertentieplatforms.",
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Houd de pagina gefocust op één doel (één CTA). Minder afleiding = hogere conversie.",
      },
      {
        type: "tip",
        text: "Test de pagina altijd op mobiel — het merendeel van het PSV-publiek bezoekt de site via smartphone.",
      },
      {
        type: "warning",
        text: "Vergeet niet om UTM-parameters toe te voegen aan alle advertentielinks die naar de landingspagina verwijzen, zodat je de herkomst van traffic kunt meten.",
      },
    ],
  },
  {
    slug: "figma",
    name: "Figma",
    description:
      "Design- en prototypingtool voor het maken van visuele ontwerpen en mockups.",
    accessUrl: "https://figma.com",
    accessNote:
      "Log in met je PSV-e-mailadres. Nieuw? Vraag je manager om je toe te voegen aan de juiste Figma-teams.",
    features: [
      {
        title: "UI-ontwerpen",
        description:
          "Ontwerp interfaces voor landingspagina's, e-mails en apps.",
      },
      {
        title: "Campagnevisuals",
        description:
          "Maak advertentieformaten voor Meta, LinkedIn, Google Display en meer.",
      },
      {
        title: "Prototypen",
        description:
          "Bouw klikbare prototypes om flows en gebruikerservaringen te testen.",
      },
      {
        title: "Samenwerken",
        description:
          "Geef feedback en werk real-time samen met collega's in hetzelfde bestand.",
      },
    ],
    steps: [
      {
        title: "Selecteer het element",
        description:
          "Klik op het onderdeel of frame dat je wilt exporteren.",
      },
      {
        title: "Open Export-instellingen",
        description: "Klik rechtsonder in het paneel op + bij Export.",
      },
      {
        title: "Kies formaat",
        description:
          "Kies het juiste formaat: PNG (social media), SVG (web/icons) of PDF (print).",
      },
      {
        title: "Exporteren",
        description: "Klik op Export om het bestand te downloaden.",
      },
    ],
    tables: [
      {
        caption: "Handige sneltoetsen",
        headers: ["Actie", "Mac", "Windows"],
        rows: [
          ["Frame maken", "F", "F"],
          ["Tekst", "T", "T"],
          ["Rechthoek", "R", "R"],
          ["Groeperen", "Cmd+G", "Ctrl+G"],
          ["Exporteren", "Cmd+Shift+E", "Ctrl+Shift+E"],
          ["Preview", "Cmd+P", "Ctrl+P"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Gebruik altijd de gedeelde PSV Design Library voor assets. Zo blijft de huisstijl consistent en hoef je niets te zoeken.",
      },
    ],
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    description:
      "Betaald zoekadverteren en display campagnes via het Google-netwerk.",
    accessUrl: "https://ads.google.com",
    accessNote:
      "Log in met je PSV Google-account. PSV beheert meerdere accounts in één MCC-omgeving — controleer altijd of je in het juiste account werkt.",
    features: [
      {
        title: "Search",
        description:
          "Advertenties in zoekresultaten van Google op basis van zoekwoorden.",
      },
      {
        title: "Display",
        description:
          "Banneradvertenties op websites en apps in het Google Display Netwerk.",
      },
      {
        title: "YouTube",
        description:
          "Video-advertenties vóór, tijdens of na YouTube-video's.",
      },
      {
        title: "Performance Max",
        description:
          "AI-gestuurde campagnes die automatisch alle Google-kanalen benutten.",
      },
    ],
    steps: [
      {
        title: "Kies het juiste account",
        description:
          "Selecteer het juiste PSV-account in de MCC-omgeving op basis van je campagnedoel.",
      },
      {
        title: "Campagne aanmaken",
        description:
          "Klik op + Nieuwe campagne en kies het juiste campagnetype en doel.",
      },
      {
        title: "Targeting instellen",
        description:
          "Stel locatie, taal, doelgroepen en zoekwoorden in.",
      },
      {
        title: "Advertenties schrijven",
        description:
          "Schrijf pakkende advertentieteksten met een duidelijke call-to-action.",
      },
      {
        title: "Budget en biedstrategie",
        description:
          "Stel een dagbudget in en kies een biedstrategie (bijv. Doel-CPA of Maximaliseer conversies).",
      },
      {
        title: "Conversies instellen",
        description:
          "Verifieer dat conversietracking actief is via Google Tag Manager voordat je live gaat.",
      },
    ],
    tables: [
      {
        caption: "Belangrijke KPI's",
        headers: ["KPI", "Omschrijving"],
        rows: [
          ["CTR", "Click-through rate — verhouding clicks / vertoningen"],
          ["CPC", "Cost per click — gemiddelde kosten per klik"],
          ["ROAS", "Return on ad spend — omzet per bestede euro"],
          ["CPA", "Cost per acquisition — kosten per conversie"],
          ["Impression share", "Percentage vertoningen t.o.v. totaal mogelijke vertoningen"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Gebruik negative keywords om irrelevante zoekopdrachten uit te sluiten en je budget efficiënter in te zetten.",
      },
      {
        type: "tip",
        text: "Performance Max-campagnes presteren beter met veel assets (afbeeldingen, video's, teksten). Lever altijd de maximale hoeveelheid assets aan.",
      },
      {
        type: "warning",
        text: "Schakel nooit campagnes of advertentiegroepen van collega's uit zonder overleg — dit kan lopende campagnes verstoren.",
      },
    ],
  },
  {
    slug: "jw-player",
    name: "JW Player",
    description:
      "Videospeler en streamingplatform voor het hosten en publiceren van videocontent.",
    accessUrl: "https://dashboard.jwplayer.com",
    accessNote:
      "Log in met je PSV-account. Geen toegang? Vraag dit aan via het content- of IT-team.",
    features: [
      {
        title: "Video's uploaden",
        description:
          "Upload videocontent en beheer je bibliotheek via het dashboard.",
      },
      {
        title: "Embedcodes genereren",
        description:
          "Genereer een embedcode om video's in te voegen op websites en landingspagina's.",
      },
      {
        title: "Playlists maken",
        description:
          "Groepeer video's in playlists voor automatisch afspelen of contentoverzichten.",
      },
      {
        title: "Analytics",
        description:
          "Bekijk weergavestatistieken, kijktijd en engagement per video.",
      },
    ],
    steps: [
      {
        title: "Inloggen",
        description:
          "Ga naar het JW Player-dashboard en log in met je PSV-account.",
      },
      {
        title: "Video uploaden",
        description:
          "Klik op Upload en selecteer je videobestand. Ondersteunde formaten: MP4, MOV, MKV.",
      },
      {
        title: "Metadata invullen",
        description:
          "Voeg een titel, beschrijving en eventueel tags toe voor vindbaarheid.",
      },
      {
        title: "Thumbnail instellen",
        description:
          "Kies een automatisch gegenereerde thumbnail of upload een eigen afbeelding.",
      },
      {
        title: "Embedcode kopiëren",
        description:
          "Na verwerking vind je de embedcode onder Share. Kopieer deze voor gebruik op de website.",
      },
    ],
    tables: [
      {
        caption: "Aanbevolen videospecificaties",
        headers: ["Instelling", "Aanbevolen waarde"],
        rows: [
          ["Formaat", "MP4 (H.264)"],
          ["Resolutie", "Minimaal 1080p (1920×1080)"],
          ["Bestandsgrootte", "Max. 25 GB"],
          ["Framerate", "25 of 30 fps"],
          ["Audio", "AAC, stereo"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Upload video's altijd in de hoogst beschikbare kwaliteit. JW Player comprimeert en converteert automatisch naar meerdere kwaliteitsopties.",
      },
      {
        type: "warning",
        text: "Verwijder geen video's zonder te controleren of ze ergens zijn ingebed. Verwijderde video's zorgen voor een lege speler op de pagina.",
      },
    ],
  },
  {
    slug: "linkedin-ads",
    name: "LinkedIn Ads",
    description:
      "B2B-adverteren op LinkedIn voor het bereiken van zakelijke doelgroepen.",
    accessUrl: "https://www.linkedin.com/campaignmanager",
    accessNote:
      "Selecteer het PSV-advertentieaccount. Toegang aanvragen via de marketingmanager.",
    features: [
      {
        title: "Sponsored Content",
        description:
          "Advertenties in de LinkedIn-feed — afbeeldingen, video's of carousels.",
      },
      {
        title: "Message Ads",
        description:
          "Directe berichten naar de LinkedIn-inbox van je doelgroep.",
      },
      {
        title: "Lead Gen Forms",
        description:
          "Formulieren die direct binnen LinkedIn worden ingevuld, zonder doorlink.",
      },
      {
        title: "Text Ads",
        description: "Kleine tekstadvertenties in de zijbalk van LinkedIn.",
      },
    ],
    steps: [
      {
        title: "Campaign Group aanmaken",
        description:
          "Maak een nieuwe Campaign Group aan met een heldere naam en budget.",
      },
      {
        title: "Campagne aanmaken",
        description:
          "Kies het campagnedoel (Awareness, Consideration of Conversions) en het advertentietype.",
      },
      {
        title: "Doelgroep instellen",
        description:
          "Stel je targeting in op basis van functie, bedrijf, locatie of upload een contactlijst.",
      },
      {
        title: "Advertenties aanmaken",
        description:
          "Upload afbeeldingen of video's en schrijf een pakkende introductietekst en headline.",
      },
      {
        title: "Budget en planning",
        description:
          "Stel een dagbudget of totaalbudget in en bepaal de looptijd.",
      },
    ],
    tables: [
      {
        caption: "Doelgroeptargeting",
        headers: ["Targetingoptie", "Voorbeeldgebruik"],
        rows: [
          ["Functietitel", "CFO's, Marketing Managers, Directeuren"],
          ["Bedrijfsgrootte", "Middelgrote en grote bedrijven"],
          ["Branche", "Financiële dienstverlening, Sport, Retail"],
          ["Bedrijfsnaam", "Retargeting van specifieke relaties"],
          ["Lookalike audiences", "Vergelijkbare profielen op basis van bestaande relaties"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "LinkedIn-advertenties presteren beter met een professionele, zakelijke toon. Vermijd te informele campagnes die beter passen bij Meta of TikTok.",
      },
      {
        type: "tip",
        text: "Gebruik Lead Gen Forms voor het genereren van B2B-leads — de invuldrempel is lager dan een externe landingspagina.",
      },
      {
        type: "warning",
        text: "LinkedIn heeft hogere CPCs dan andere platforms. Zorg voor een scherpe doelgroepafbakening om je budget efficiënt in te zetten.",
      },
    ],
  },
  {
    slug: "maileon",
    name: "Maileon",
    description:
      "E-mailmarketingplatform voor nieuwsbrieven, transactionele e-mails en geautomatiseerde campagnes.",
    accessUrl: "https://app.maileon.com",
    accessNote:
      "Log in met je PSV-account. Toegang aanvragen via het marketingteam.",
    features: [
      {
        title: "E-mailcampagnes",
        description:
          "Verstuur nieuwsbrieven en actiemailings naar je volledige lijst of een segment.",
      },
      {
        title: "Automatisering",
        description:
          "Stel geautomatiseerde e-mailflows in op basis van gedrag of triggers.",
      },
      {
        title: "Personalisatie",
        description:
          "Personaliseer e-mails op naam, gedrag of voorkeuren van de ontvanger.",
      },
      {
        title: "Rapportage",
        description:
          "Analyseer opens, clicks, bounces en uitschrijvingen per campagne.",
      },
    ],
    steps: [
      {
        title: "Campagne aanmaken",
        description:
          "Ga naar Mailings en klik op Nieuwe mailing. Geef de campagne een duidelijke interne naam.",
      },
      {
        title: "Template kiezen",
        description:
          "Kies een bestaand PSV-template of maak een nieuwe op basis van de huisstijl.",
      },
      {
        title: "Content invullen",
        description:
          "Vul de onderwerpregel, preheader, content en CTA in.",
      },
      {
        title: "Ontvangers selecteren",
        description: "Kies de juiste mailinglijst en/of segment(en).",
      },
      {
        title: "Testmail sturen",
        description:
          "Stuur een testmail naar jezelf en minimaal één collega ter controle.",
      },
      {
        title: "Versturen of inplannen",
        description:
          "Verstuur direct of plan in op het gewenste tijdstip.",
      },
    ],
    tables: [
      {
        caption: "Mailinglijsten",
        headers: ["Lijst", "Doelgroep"],
        rows: [
          ["PSV Nieuwsbrief", "Algemene fans en geïnteresseerden"],
          ["Seathouders", "Alle seathouders gesorteerd op type abonnement"],
          ["Shop-klanten", "Contacten die iets hebben besteld in de PSV Shop"],
          ["Business Club", "Zakelijke relaties en Business Club-leden"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "De beste verzendtijden zijn dinsdag t/m donderdag tussen 10:00 en 12:00. Test dit regelmatig voor jouw specifieke doelgroep.",
      },
      {
        type: "tip",
        text: "Houd de onderwerpregel kort en prikkelend — maximaal 50 tekens voor optimale weergave op mobiel.",
      },
      {
        type: "warning",
        text: "Stuur nooit naar de volledige database zonder goedkeuring. Gebruik altijd segmenten en pas frequentiecapping toe.",
      },
    ],
  },
  {
    slug: "meta-ads",
    name: "Meta Ads",
    description:
      "Adverteren op Facebook en Instagram via Meta's advertentieplatform.",
    accessUrl: "https://business.facebook.com",
    accessNote:
      "Alle PSV-advertenties worden beheerd vanuit de Meta Business Manager. Maak geen advertenties aan via een persoonlijk Facebook-account.",
    features: [
      {
        title: "Awareness",
        description:
          "Maximaliseer bereik en merkbekendheid bij een brede doelgroep.",
      },
      {
        title: "Traffic",
        description:
          "Stuur bezoekers naar een website, landingspagina of app.",
      },
      {
        title: "Engagement",
        description:
          "Vergroot interactie met je posts, pagina of evenement.",
      },
      {
        title: "Conversions",
        description:
          "Stuur aan op aankopen, registraties of andere meetbare acties.",
      },
    ],
    steps: [
      {
        title: "Campagnedoel kiezen",
        description:
          "Ga naar Ads Manager en klik op + Maken. Kies het campagnedoel dat past bij je doelstelling.",
      },
      {
        title: "Doelgroep instellen",
        description:
          "Stel targeting in op advertentieset-niveau: locatie, leeftijd, interesses of custom audiences.",
      },
      {
        title: "Plaatsingen",
        description:
          "Kies automatische plaatsingen (aanbevolen) of selecteer handmatig Feed, Stories, Reels, etc.",
      },
      {
        title: "Budget en planning",
        description:
          "Stel een dagbudget of totaalbudget in en bepaal de looptijd van de campagne.",
      },
      {
        title: "Advertentie aanmaken",
        description:
          "Upload je visual of video, schrijf de advertentietekst en stel de CTA in.",
      },
      {
        title: "Controleren en publiceren",
        description:
          "Controleer de preview op alle plaatsingen en klik op Publiceren.",
      },
    ],
    tables: [
      {
        caption: "Advertentieformaten en specificaties",
        headers: ["Formaat", "Resolutie", "Verhouding"],
        rows: [
          ["Feed (vierkant)", "1080×1080 px", "1:1"],
          ["Feed (liggend)", "1200×628 px", "1.91:1"],
          ["Stories / Reels", "1080×1920 px", "9:16"],
          ["Carousel", "1080×1080 px per slide", "1:1"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Gebruik BlueConic-segmenten als Custom Audience voor nauwkeurige first-party data targeting.",
      },
      {
        type: "tip",
        text: "Gebruik Advantage+ Creative voor automatische variaties van je advertentie — Meta test welke variant het beste presteert.",
      },
      {
        type: "warning",
        text: "Controleer altijd de Meta Pixel via de Pixel Helper browser-extensie voordat je een conversiecampagne live zet.",
      },
    ],
  },
  {
    slug: "n8n",
    name: "n8n",
    description:
      "Workflow-automatiseringstool voor het koppelen van apps en automatiseren van processen.",
    accessNote:
      "n8n draait op de PSV-infrastructuur. Vraag de inloggegevens op via het marketingteam of de IT-afdeling.",
    features: [
      {
        title: "Workflows automatiseren",
        description:
          "Automatiseer terugkerende taken tussen verschillende tools en platforms.",
      },
      {
        title: "API-koppelingen",
        description:
          "Verbind platforms via API's — van Maileon tot BlueConic tot Google Sheets.",
      },
      {
        title: "Data transformeren",
        description:
          "Transformeer en verrijk data tussen systemen zonder handmatig werk.",
      },
      {
        title: "Triggers instellen",
        description:
          "Start workflows op basis van events, tijdschema's of webhooks.",
      },
    ],
    steps: [
      {
        title: "Nieuwe workflow",
        description:
          "Klik op + New workflow in het n8n-dashboard.",
      },
      {
        title: "Trigger kiezen",
        description:
          "Voeg een trigger-node toe, bijv. een Webhook, Schedule Trigger of platform-trigger.",
      },
      {
        title: "Stappen toevoegen",
        description:
          "Voeg nodes toe voor elke stap: ophalen van data, transformeren, versturen of opslaan.",
      },
      {
        title: "Credentials instellen",
        description:
          "Koppel de juiste credentials aan elke node die een externe service aanspreekt.",
      },
      {
        title: "Testen",
        description:
          "Test de workflow met Test workflow en controleer de output van elke node.",
      },
      {
        title: "Activeren",
        description:
          "Zet de workflow op Active om hem automatisch te laten draaien.",
      },
    ],
    tables: [
      {
        caption: "Kernbegrippen",
        headers: ["Begriff", "Uitleg"],
        rows: [
          ["Workflow", "Een reeks verbonden stappen (nodes) die automatisch worden uitgevoerd"],
          ["Node", "Een individuele stap in een workflow (bijv. 'Stuur e-mail' of 'Haal data op')"],
          ["Trigger", "De eerste node die de workflow start (bijv. een webhook of tijdschema)"],
          ["Webhook", "Een URL waarnaar externe systemen data kunnen sturen om een workflow te starten"],
          ["Credential", "Opgeslagen inloggegevens voor een externe service"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Gebruik de Error Trigger node om foutmeldingen per e-mail te ontvangen als een workflow mislukt.",
      },
      {
        type: "warning",
        text: "Sla credentials altijd op via het centrale credential-systeem van n8n. Verwerk nooit API-sleutels direct in workflow-nodes.",
      },
      {
        type: "warning",
        text: "Wijzigingen in productie-workflows kunnen directe impact hebben op live processen. Test nieuwe workflows altijd eerst.",
      },
    ],
  },
  {
    slug: "playable",
    name: "Playable",
    description:
      "Platform voor het maken van interactieve en speelbare advertenties.",
    accessNote:
      "Log in op het Playable-platform via de inloggegevens van het marketingteam.",
    features: [
      {
        title: "Playable ads",
        description:
          "Maak speelbare mini-games die inzetbaar zijn als advertentie op Meta, Google en meer.",
      },
      {
        title: "Interactieve content",
        description:
          "Bouw quizzen, polls en interactieve ervaringen voor website of social media.",
      },
      {
        title: "No-code editor",
        description:
          "Pas templates aan met de drag-and-drop editor, zonder programmeerkennis.",
      },
      {
        title: "Multi-platform export",
        description:
          "Exporteer naar HTML5 of publiceer direct naar Meta en Google.",
      },
    ],
    steps: [
      {
        title: "Template kiezen",
        description:
          "Kies een template die past bij je campagnedoel: game, quiz, poll of interactieve banner.",
      },
      {
        title: "Aanpassen",
        description:
          "Pas de template aan met PSV-kleuren, logo, afbeeldingen en teksten via de no-code editor.",
      },
      {
        title: "Testen",
        description:
          "Speel de ervaring zelf door en test op mobiel én desktop voordat je publiceert.",
      },
      {
        title: "Exporteren of publiceren",
        description:
          "Exporteer als HTML5-bestand of publiceer direct naar het gewenste advertentieplatform.",
      },
      {
        title: "Meten",
        description:
          "Bekijk engagement, voltooiingspercentages en klikken in het Playable-dashboard.",
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Houd de gameplay simpel en kort — maximaal 15-30 seconden. Te complexe games leiden tot afhaken.",
      },
      {
        type: "tip",
        text: "Eindig altijd met een duidelijke CTA na het spelen: 'Koop tickets', 'Schrijf je in' of 'Bezoek de shop'.",
      },
      {
        type: "warning",
        text: "Controleer de laadtijd op mobiel. Zware assets verhogen de laadtijd en verlagen de voltooiingsratio.",
      },
    ],
  },
  {
    slug: "tiktok-ads",
    name: "TikTok Ads",
    description:
      "Adverteren op TikTok voor het bereiken van een jong en betrokken publiek.",
    accessUrl: "https://ads.tiktok.com",
    accessNote:
      "Log in met het PSV TikTok Business-account. Toegang aanvragen via de marketingmanager.",
    features: [
      {
        title: "In-Feed Ads",
        description:
          "Video-advertenties die verschijnen tussen organische content in de For You-feed.",
      },
      {
        title: "TopView",
        description:
          "Premium plaatsing: de eerste advertentie die gebruikers zien bij het openen van de app.",
      },
      {
        title: "Spark Ads",
        description:
          "Boost bestaande organische PSV-posts als betaalde advertentie.",
      },
      {
        title: "Collection Ads",
        description:
          "Combineer video met een productcatalogus voor directe aankopen.",
      },
    ],
    steps: [
      {
        title: "Campagne aanmaken",
        description:
          "Ga naar Campaign en klik op Create. Kies het campagnedoel (Awareness, Traffic of Conversion).",
      },
      {
        title: "Ad Group instellen",
        description:
          "Stel de doelgroep, plaatsingen, budget en looptijd in op Ad Group-niveau.",
      },
      {
        title: "Video uploaden",
        description:
          "Upload een verticale video of gebruik de TikTok Creative Studio voor aanpassingen.",
      },
      {
        title: "Advertentietekst en CTA",
        description:
          "Voeg een korte beschrijving toe en kies de juiste CTA-button.",
      },
      {
        title: "Reviewen en publiceren",
        description:
          "TikTok reviewt advertenties doorgaans binnen 24 uur. Plan vooraf in.",
      },
    ],
    tables: [
      {
        caption: "Videospecificaties",
        headers: ["Instelling", "Aanbevolen waarde"],
        rows: [
          ["Verhouding", "9:16 (verticaal)"],
          ["Resolutie", "1080×1920 px"],
          ["Duur", "15-60 seconden (optimaal: 15-30 sec)"],
          ["Formaat", "MP4 of MOV"],
          ["Bestandsgrootte", "Max. 500 MB"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Gebruik Spark Ads om goed presterende organische TikTok-posts van PSV te boosten — dit voelt authentiek en presteert vaak beter dan puur betaalde content.",
      },
      {
        type: "tip",
        text: "De eerste 3 seconden zijn cruciaal. Begin met een sterke visuele haak om scroll-gedrag te stoppen.",
      },
      {
        type: "warning",
        text: "TikTok heeft strenge advertentierichtlijnen. Controleer altijd of de content voldoet aan het beleid voordat je publiceert.",
      },
    ],
  },
  {
    slug: "typeform",
    name: "Typeform",
    description:
      "Tool voor het maken van formulieren, enquêtes, quizzen en registraties.",
    accessUrl: "https://www.typeform.com",
    accessNote:
      "Log in met je PSV-werkaccount. Geen toegang? Vraag dit aan via het marketingteam.",
    features: [
      {
        title: "Enquêtes",
        description:
          "Stel fan-onderzoeken en tevredenheidsmetingen op.",
      },
      {
        title: "Registratieformulieren",
        description:
          "Verzamel registraties voor evenementen, acties en wedstrijden.",
      },
      {
        title: "Lead generation",
        description:
          "Genereer leads via formulieren op landingspagina's of embedded in websites.",
      },
      {
        title: "Quizzen",
        description:
          "Maak interactieve PSV-quizzen voor fan-engagement.",
      },
    ],
    steps: [
      {
        title: "Nieuw formulier",
        description:
          "Klik op + Create typeform en kies of je start met een template of een blanco formulier.",
      },
      {
        title: "Vragen toevoegen",
        description:
          "Voeg vragen toe via het +-icoon. Kies het juiste vraagtype: Multiple Choice, Short Text, Email, etc.",
      },
      {
        title: "Logica instellen",
        description:
          "Gebruik Logic Jumps om respondenten op basis van hun antwoorden door verschillende paden te leiden.",
      },
      {
        title: "Huisstijl aanpassen",
        description:
          "Pas kleuren, lettertype en achtergrond aan in Design zodat het formulier bij PSV past.",
      },
      {
        title: "Integraties koppelen",
        description:
          "Koppel het formulier via de Integrations tab aan Maileon, Google Sheets of n8n.",
      },
      {
        title: "Publiceren en delen",
        description:
          "Kopieer de link, gebruik de embedcode of deel via een QR-code.",
      },
    ],
    tables: [
      {
        caption: "Vraagtypen",
        headers: ["Type", "Gebruik"],
        rows: [
          ["Multiple Choice", "Meerkeuzevraag met vaste antwoordopties"],
          ["Short Text", "Korte open vraag (naam, stad, etc.)"],
          ["Long Text", "Lange open vraag voor feedback of opmerkingen"],
          ["Email", "E-mailadres opvragen (gevalideerd)"],
          ["Rating", "Beoordeling op schaal (1-5 of 1-10)"],
          ["File Upload", "Bestandsupload door respondent"],
        ],
      },
    ],
    tips: [
      {
        type: "tip",
        text: "Houd formulieren kort — maximaal 5-7 vragen. Elke extra vraag verlaagt de voltooiingsratio.",
      },
      {
        type: "tip",
        text: "Gebruik de Welcome Screen en Thank You Screen om het formulier te contextualiseren en de gebruiker te bedanken.",
      },
      {
        type: "warning",
        text: "Verwerk nooit gevoelige persoonsgegevens (BSN, betalingsgegevens) via Typeform. Gebruik hiervoor beveiligde systemen.",
      },
    ],
  },
  {
    slug: "xperience-central",
    name: "Xperience Central",
    description:
      "CMS-platform voor het beheren en publiceren van content op PSV-kanalen.",
    comingSoon: true,
    features: [],
  },
];

export function getToolBySlug(slug: string): KennisbankTool | undefined {
  return kennisbankTools.find((t) => t.slug === slug);
}

# Delen van persoonsgegevens

Brondocument voor de kennisbankpagina **Delen van persoonsgegevens**
(`lib/kennisbank.ts`, slug `delen-van-persoonsgegevens`). De kennisbank-chat
beantwoordt vragen met Haiku 5.5 op lage effort en gebruikt alleen wat in de
kennisbank staat. Wat hier als **open** staat, kan de chat dus niet beantwoorden.
De chat zegt dan dat het ontbreekt en verzint niets.

Pas de pagina aan in `lib/kennisbank.ts`. Werk daarna dit document bij en stel
de testvragen opnieuw in de kennisbank-chat.

## Wat er met de originele tekst is gebeurd

- **Stap 9 (Delen) was een kopie van stap 8.** Het delen is nu uitgeschreven in
  twee stappen: het bestand via Asana en het wachtwoord via NordPass.
- **Weggelaten:** tijdgebonden zinnen ("sinds kort", "vanaf nu") en "in minder
  dan een minuut klaar". Die verouderen of helpen de chat niet bij een antwoord.
- **Elke stap noemt de app** (Excel of NordPass) en het bestand bij naam, zonder
  "hem" of "dit". De chat leest een stap soms los van de rest.
- **Toegevoegd:** de punten hieronder. Ze stonden niet in de originele tekst en
  zijn op deze pagina vastgelegd als werkwijze.

| Onderwerp | Wat er op de pagina staat | Waarom |
|---|---|---|
| Wachtwoord aan de ontvanger geven | Stap 11: via NordPass > drie puntjes > **Share**, met *Can view* en een einddatum. De ontvanger accepteert de share. | Zonder deze stap gaan collega's zelf iets bedenken, vaak het wachtwoord in dezelfde taak. |
| Ontvanger buiten PSV of zonder NordPass | Stap 11: geef het wachtwoord telefonisch door, niet per sms of mail. | In NordPass Business staat delen buiten de organisatie standaard uit. De AP noemt bellen als apart kanaal; een sms is niet versleuteld (NCSC). |
| Wachtwoord nooit bij het bestand | Waarschuwing: nooit in dezelfde Asana-taak, opmerking of mail. | Wie het bestand heeft, heeft anders ook het wachtwoord. De AP adviseert een apart kanaal. |
| Alleen delen wat nodig is | Stap 1: haal overbodige kolommen en rijen weg. | Dataminimalisatie (AVG). |
| Verwijderdatum en eigenaar | Stap 10: de einddatum van de Asana-taak is de verwijderdatum; wie de taak aanmaakt, ruimt op. | De AVG vraagt om een vaste bewaartermijn. "Als het niet meer nodig is" had geen datum en geen eigenaar. |
| Opruimen | Stap 12 en 13: Asana-bijlage (elke bijlage apart), eigen kopieën in Downloads, op de laptop en in OneDrive of SharePoint, de ontvanger vragen de kopie te verwijderen, en het item in NordPass naar de prullenbak en die legen. | Kopieën blijven anders bestaan, ook in prullenbakken. |
| Oude versies zonder wachtwoord | Waarschuwing: zet het wachtwoord erop vóór het uploaden, of verwijder de oude versies. | Anders staan er versies zonder wachtwoord in de versiegeschiedenis van OneDrive, SharePoint of Teams. |
| Mac | Stap 3 en een waarschuwing: **File > Passwords**, veld **Password to open**. Niet Review > Protect Workbook. | Review > Protect Workbook beschermt alleen de structuur en versleutelt het bestand niet. |
| Wat persoonsgegevens zijn | Opmerking met voorbeelden: naam, mailadres, telefoonnummer, adres, geboortedatum, klant- of CRM-nummer. | Zo kan de chat ook vragen als "telt alleen een lijst mailadressen ook?" beantwoorden. |
| Samen in het bestand werken | Opmerking: een bestand met wachtwoord kun je niet tegelijk met anderen bewerken. | Voorkomt verwarring als co-authoring niet werkt. |
| Aanspreekpunt | Opmerking: vragen naar het Digital Marketing-team, net als bij de andere kennisbankpagina's. | De chat moet ergens naar kunnen verwijzen. |

## Open punt

| Open punt | Waarom het telt | Voorstel |
|---|---|---|
| **Wat als het misgaat?** Bijvoorbeeld een verkeerde ontvanger of een gelekt wachtwoord. | Dan is er een datalek. Een melding bij de AP moet binnen 72 uur. | Meld het direct bij [naam of mailadres privacy officer/FG]. Vraag de ontvanger het bestand te verwijderen en dat te bevestigen. |

## Nog te controleren in de app

Dit zijn geen open punten, maar namen die niet op de bronpagina zelf te
controleren waren.

- **Knopnamen in NordPass.** De pagina gebruikt *Create item* en *Fill password*,
  zoals in de originele tekst. De helppagina's van NordPass noemen de knop *Add
  item*, en *Fill password* kwam daar niet voor. Klik de stappen één keer door
  en neem de namen exact over.
- **Share in NordPass.** Volgens de helppagina's van NordPass: drie puntjes >
  *Share*, rechten *Can view*, *Can edit* of *Can share*, en een einddatum. De
  exacte naam van het veld voor de einddatum is niet bevestigd.
- **Mac.** *File > Passwords* en *Password to open* komen uit Engelstalige
  handleidingen. De Nederlandse namen op de Mac zijn niet getest. Een oude
  Microsoft-pagina noemt ook een maximum van 15 tekens voor wachtwoorden op de
  Mac. Test of een wachtwoord uit NordPass op een Mac werkt.
- **Volgorde (optioneel).** In de huidige volgorde moet het venster in Excel
  openblijven terwijl je in NordPass werkt. Maak je eerst het wachtwoord aan in
  NordPass (stap 4 t/m 8) en open je daarna Excel, dan hoeft dat niet.

## Testvragen voor de kennisbank-chat

Volgens Anthropic moet je een tekst testen met het kleinste model dat hem
gebruikt. Stel deze vragen in de kennisbank-chat na elke aanpassing van de
pagina. "Staat er niet" betekent dat de chat eerlijk moet zeggen dat de
kennisbank dit nog niet beschrijft.

| Vraag | Verwacht antwoord |
|---|---|
| Hoe zet ik een wachtwoord op een Excel-bestand? | Stap 2 t/m 9 op volgorde, met Bestand > Info > Werkmap beveiligen > Versleutelen met wachtwoord. |
| Mijn Excel is Engelstalig, waar vind ik het? | File > Info > Protect Workbook > Encrypt with Password. |
| Ik werk op een Mac. | File > Passwords, veld Password to open. Niet Review > Protect Workbook. |
| Kan dit ook in Excel online? | Nee, gebruik de Excel-app op je laptop. |
| Ik heb een csv-export met mailadressen, hoe deel ik die? | Eerst overbodige kolommen weghalen en opslaan als .xlsx, dan de stappen. |
| Mag ik het wachtwoord in de Asana-taak zetten? | Nee. Deel het via NordPass, of telefonisch als de ontvanger geen NordPass van PSV heeft. |
| Hoe geef ik het wachtwoord aan mijn collega? | NordPass > drie puntjes > Share, Can view, einddatum. De collega accepteert de share. |
| Het bureau dat de mailing maakt heeft geen NordPass. | Telefonisch doorgeven, niet per sms of mail. |
| Wanneer moet ik het bestand verwijderen? | Als de gegevens verwerkt of niet meer nodig zijn, en uiterlijk op de einddatum van de Asana-taak. |
| Wat moet ik allemaal opruimen? | Stap 12 en 13: Asana-bijlage, eigen kopieën, de ontvanger vragen te verwijderen, NordPass-item naar de prullenbak en die legen. |
| Telt een lijst met alleen mailadressen ook? | Ja, een mailadres is een persoonsgegeven. |
| Ik ben het wachtwoord kwijt. | Excel kan het niet herstellen. Het staat in NordPass onder de bestandsnaam. |
| Ik heb het bestand naar de verkeerde persoon gestuurd. | Staat er niet (open punt). |

## Gebruikte richtlijnen

Hoe de pagina is geschreven, en waar dat vandaan komt:

- **Eén handeling per stap, de app vooraan, knopnamen exact zoals in de app, `>` voor
  menupaden.** Uit de stijlgidsen van Microsoft en Google voor stappenplannen:
  [Microsoft](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions),
  [Google](https://developers.google.com/style/procedures).
- **Elk stuk tekst begrijpelijk als het los wordt gelezen.** Noem het onderwerp
  bij naam en vermijd "dit" of "zie hierboven"
  ([write-service-docs](https://github.com/Avi-Rana-1718/skills/blob/HEAD/write-service-docs/SKILL.md),
  [Anthropic: contextual retrieval](https://www.anthropic.com/news/contextual-retrieval)).
- **Een verbod met het waarom erbij en met wat je wél doet.** Uit Anthropic's
  [skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  en [prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).
- **Geen tijdgebonden zinnen, één vaste term per begrip.** Bijvoorbeeld altijd
  "wachtwoord", nooit ook "code" of "sleutel". Bron: Anthropic best practices.
- **Gaten markeren in plaats van stappen verzinnen.** Uit
  [sop-writer](https://github.com/aiskilloftheweek/claude-ai-skill-of-the-week/blob/HEAD/skills/008-sop-writer/SKILL.md)
  en [process-doc](https://github.com/anthropics/knowledge-work-plugins/blob/main/operations/skills/process-doc/SKILL.md):
  "de uitzonderingen zijn het waardevolste deel".
- **Testen met een lezer zonder voorkennis.** Uit
  [doc-coauthoring](https://github.com/anthropics/skills/blob/main/skills/doc-coauthoring/SKILL.md),
  zie de testvragen hierboven.
- **Taalniveau B1.** Korte zinnen, gebiedende wijs en "je". Uit de
  [Taalunie-checklist duidelijke taal](https://taalunie.org/feeds/download/checklist-duidelijke-taal-6908c.pdf/checklist-duidelijke-taal-6908c/original)
  en de [schrijfwijzer van AFAS](https://github.com/AFASResearch/content-ontwerp-ontrafelaar/blob/HEAD/.github/skills/schrijfwijzer/SKILL.md).
- **Opbouw van een how-to-artikel.** Uit
  [kb-article](https://github.com/anthropics/knowledge-work-plugins/blob/main/customer-support/skills/kb-article/SKILL.md):
  doel, stappen, controle, veelvoorkomende problemen.

Zoekwoorden of synonymen ("Excel versleutelen", "AVG") staan niet op de pagina.
De chat krijgt de hele kennisbank in één keer mee, dus er is geen zoekstap die ze
nodig heeft.

## Bronnen bij de feiten

De sites van Microsoft, NordPass en de AP waren vanuit deze omgeving niet te
openen. Deze feiten zijn daarom gecontroleerd via zoekresultaten en niet op de
pagina zelf. Knopnamen check je het best in de app.

- Excel, wachtwoord op een bestand, en Microsoft kan een vergeten wachtwoord niet herstellen:
  [Protect an Excel file](https://support.microsoft.com/en-gb/office/protect-an-excel-file-7359d4ae-7213-4ac2-b058-f75e9311b599)
- Versleutelen kan niet in Excel voor het web:
  [Protect a file with a password](https://support.microsoft.com/en-gb/office/protect-a-file-with-a-password-9cfa52c9-737d-4f9c-bbad-80bc52c67b8c)
- Wachtwoord weer verwijderen:
  [Remove password protection](https://support.microsoft.com/en-au/office/remove-password-protection-on-a-file-04f75487-4942-429e-8eeb-4c23064a0d2f)
- Mac, File > Passwords en Password to open:
  [Tufts IT](https://it.tufts.edu/guides/password-protecting-and-encrypting-files/password-protecting-and-encrypting-ms-excel-files),
  [UW-Madison](https://kb.wisc.edu/helpdesk/17333).
  Dat Protect Workbook geen versleuteling is:
  [Office-Watch](https://office-watch.com/2025/protect-or-encrypt-your-excel-workbooks/).
  De grens van 15 tekens:
  [Require a password to open or modify a workbook](https://support.microsoft.com/en-us/excel/require-a-password-to-open-or-modify-a-workbook)
- NordPass, item toevoegen:
  [How to add items](https://support.nordpass.com/hc/en-us/articles/40612713367569-How-to-add-items-to-NordPass-browser-extension)
- NordPass, item delen en rechten:
  [Sharing items](https://support.nordpass.com/hc/en-us/articles/40494272272401-How-to-share-NordPass-items-on-NordPass-browser-extension),
  [Access levels](https://support.nordpass.com/hc/en-us/articles/360017660077-Managing-access-levels-in-NordPass)
- NordPass, delen buiten de organisatie:
  [Guest Sharing](https://support.nordpass.com/hc/en-us/articles/12515427831953-How-to-enable-Guest-Sharing)
- Asana, verwijderde taken 30 dagen terug te halen:
  [Recover deleted tasks](https://help.asana.com/s/article/recover-deleted-tasks-projects-and-more)
- AP, beveiliging en een apart kanaal voor het wachtwoord:
  [Beveiliging van persoonsgegevens](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/beveiliging/beveiliging-van-persoonsgegevens)
- AP, datalekken en de termijn van 72 uur:
  [Meldplicht datalekken](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/beveiliging/meldplicht-datalekken)
- AP, bewaartermijn:
  [Bewaren van persoonsgegevens](https://autoriteitpersoonsgegevens.nl/nl/over-privacy/persoonsgegevens/bewaren-van-persoonsgegevens)

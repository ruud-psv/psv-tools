# Delen van persoonsgegevens

Brondocument voor de kennisbankpagina **Delen van persoonsgegevens**
(`lib/kennisbank.ts`, slug `delen-van-persoonsgegevens`). De kennisbank-chat
beantwoordt vragen met Haiku 5.5 op lage effort en gebruikt alleen wat in de
kennisbank staat. Wat hier als **open** staat, kan de chat dus niet beantwoorden.
De chat zegt dan dat het ontbreekt en verzint niets.

Vul een open punt in door de tekst in `lib/kennisbank.ts` aan te passen. De
voorstellen hieronder zijn klaar om over te nemen, maar het zijn **beslissingen
voor PSV**: neem ze pas over als ze kloppen met hoe we het willen.

## Wat er met de originele tekst is gebeurd

- **Stap 9 (Delen) was een kopie van stap 8.** De pagina zegt nu alleen wat de
  tekst wél zegt: deel het bestand, bijvoorbeeld via een Asana-taak. Hoe de
  ontvanger het wachtwoord krijgt, is open punt 1.
- **Toegevoegd, controleer of je dit wilt:**
  - De waarschuwing "zet het wachtwoord nooit in dezelfde Asana-taak, opmerking
    of mail als het bestand". Dit volgt uit het doel van de procedure, en de
    Autoriteit Persoonsgegevens adviseert het ook.
  - Het Engelse menupad voor wie Excel in het Engels gebruikt.
  - Drie tips: .csv eerst opslaan als .xlsx, Excel kan een vergeten wachtwoord
    niet herstellen, en kies echt *Versleutelen met wachtwoord* en niet een
    andere optie in hetzelfde menu.
- **Weggelaten:** tijdgebonden zinnen ("sinds kort", "vanaf nu") en "in minder
  dan een minuut klaar". Die verouderen of helpen de chat niet bij een antwoord.
- **Elke stap noemt de app** (Excel of NordPass) en het bestand bij naam, zonder
  "hem" of "dit". De chat leest een stap soms los van de rest.

## Open punten

Gesorteerd op belang. De eerste drie zijn nodig voordat de procedure echt
sluitend is.

| # | Open punt | Waarom het telt | Voorstel |
|---|---|---|---|
| 1 | **Hoe krijgt de ontvanger het wachtwoord?** | Zonder deze stap kan de ontvanger het bestand niet openen. Collega's gaan dan zelf iets bedenken, vaak het wachtwoord in dezelfde taak. | Collega's: deel het item in NordPass via de drie puntjes > **Share**, met het recht *Can view* en een einddatum. De ontvanger moet de share eerst accepteren. |
| 2 | **Ontvanger buiten PSV of zonder NordPass** | In NordPass Business staat delen buiten de organisatie standaard uit, en dat is een instelling van de beheerder. | Kies één route, bijvoorbeeld het wachtwoord telefonisch doorgeven. De AP noemt bellen als apart kanaal. Een sms is niet versleuteld (NCSC). |
| 3 | **Wat als het misgaat?** Bijvoorbeeld een verkeerde ontvanger of een gelekt wachtwoord. | Dan is er een datalek. Een melding bij de AP moet binnen 72 uur. | Meld het direct bij [naam of mailadres privacy officer/FG]. Vraag de ontvanger het bestand te verwijderen en dat te bevestigen. |
| 4 | **Alleen delen wat nodig is** | Dataminimalisatie (AVG). Vaak zitten er meer kolommen in een export dan de ontvanger nodig heeft. | Stap toevoegen vóór stap 1: verwijder kolommen en rijen die de ontvanger niet nodig heeft. |
| 5 | **Opruimen is breder dan "het bestand"** | Kopieën blijven bestaan in Downloads, mail, Asana-bijlagen, de prullenbak van OneDrive (ongeveer 93 dagen), de Asana-prullenbak (30 dagen) en de prullenbak van NordPass. De ontvanger heeft ook een kopie. | Een opruimlijst: Asana-bijlage verwijderen (per bijlage), lokale kopieën verwijderen, de ontvanger vragen zijn of haar kopie te verwijderen, en de share in NordPass intrekken. Zet het item daarna in de prullenbak van NordPass en leeg die. |
| 6 | **Wanneer is "niet meer nodig"?** | De AVG vraagt om een vaste bewaartermijn. "Als het niet meer nodig is" heeft geen datum en geen eigenaar. | Gebruik de einddatum van de Asana-taak als verwijderdatum. De maker van de taak ruimt op. |
| 7 | **Oude versies zonder wachtwoord** | Stond het bestand al op OneDrive, SharePoint of Teams vóór het wachtwoord erop kwam? Dan staan in de versiegeschiedenis versies zonder wachtwoord. | Zet het wachtwoord erop voordat je het bestand uploadt. Is dat niet gelukt, verwijder dan de oude versies. |
| 8 | **Mac** | Op een Mac zit de optie op een andere plek. Ook noemt een oude Microsoft-pagina een maximum van 15 tekens op de Mac, terwijl NordPass langere wachtwoorden maakt. | Test het op een Mac en voeg het Mac-pad toe. |
| 9 | **Samen in het bestand werken** | Een bestand met wachtwoord kun je niet tegelijk met anderen bewerken. | Vraag IT of gevoeligheidslabels (Microsoft Purview) beschikbaar zijn voor bestanden waar meerdere mensen in werken. |
| 10 | **Knopnamen in NordPass controleren** | Volgens de NordPass-helppagina's heet de knop *Add item* en niet *Create item*. *Fill password* kwam in geen enkele bron voor. Die pagina's waren alleen via zoekresultaten te zien. | Klik de stappen één keer door in NordPass en neem de knopnamen exact over. |
| 11 | **Welke gegevens en bestanden vallen eronder?** | De tekst noemt "mailadressen en andere gevoelige data" en alleen Excel. | Noem voorbeelden (naam, mailadres, telefoonnummer, CRM-nummer, adres) en zeg of dit ook geldt voor .csv, Word en pdf. |
| 12 | **Aanspreekpunt** | De chat moet ergens naar kunnen verwijzen bij twijfel. | Naam of team dat vragen over deze procedure beantwoordt. |

Optioneel, over de volgorde: in de huidige volgorde moet het venster in Excel
openblijven terwijl je in NordPass werkt. Maak je eerst het wachtwoord aan in
NordPass (stap 3 t/m 7) en open je daarna Excel, dan hoeft dat niet.

## Testvragen voor de kennisbank-chat

Volgens Anthropic moet je een tekst testen met het kleinste model dat hem
gebruikt. Stel deze vragen in de kennisbank-chat na elke aanpassing van de
pagina. "Staat er niet" betekent dat de chat eerlijk moet zeggen dat de
kennisbank dit nog niet beschrijft.

| Vraag | Verwacht antwoord |
|---|---|
| Hoe zet ik een wachtwoord op een Excel-bestand? | Stap 1 t/m 8 op volgorde, met Bestand > Info > Werkmap beveiligen > Versleutelen met wachtwoord. |
| Mijn Excel is Engelstalig, waar vind ik het? | File > Info > Protect Workbook > Encrypt with Password. |
| Kan dit ook in Excel online? | Nee, gebruik de Excel-app op je laptop. |
| Ik heb een csv-export met mailadressen, hoe deel ik die? | Eerst opslaan als .xlsx, dan de stappen. |
| Mag ik het wachtwoord in de Asana-taak zetten? | Nee, nooit in dezelfde taak, opmerking of mail als het bestand. |
| Hoe geef ik het wachtwoord aan mijn collega? | Staat er niet (open punt 1). |
| Ik heb het bestand naar de verkeerde persoon gestuurd. | Staat er niet (open punt 3). |
| Ik ben het wachtwoord kwijt. | Excel kan het niet herstellen. Het staat in NordPass onder de bestandsnaam. |
| Wanneer moet ik het bestand verwijderen? | Als de gegevens verwerkt zijn of niet meer nodig zijn: het bestand en het wachtwoord in NordPass. |

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
  Daarom is het "wat je wél doet" bij open punt 1 nog niet ingevuld.
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
- Mac-pad en de grens van 15 tekens:
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

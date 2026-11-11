/**
 * Een verzonnen API-beschrijving in de vorm van Playable's `openapi.yaml`, voor
 * de tests. De echte staat op https://api.playable.com/openapi.yaml. De namen
 * van de rechten en de paden komen uit de eerste echte test (campagne 244347):
 * de lijst heet `/sections`, één sectie `/section/{section}`, en kopiëren is
 * `/campaign/copy/{campaign}`. De velden in de schema's zijn een aanname.
 */
export const SAMPLE_SPEC_YAML = `openapi: 3.0.0
info:
  title: Playable
  description: |
    Documentatie: https://example.com
    paths:
      /niet-echt: dit is tekst
servers:
  - url: https://api.playable.com
    description: Production
  - url: https://api.dev.playable.com
    description: QA
paths:
  /oauth/token:
    post:
      summary: Authentication
      description: Vraag een token aan voor campaigns.list, campaigns.modify of campaigns.copy.
  /v1/campaigns:
    get:
      summary: List campaigns
      security:
        - oauth:
            - campaigns.list
  '/v1/campaign/{campaign}':
    get:
      summary: "View a campaign"
      security:
        - oauth: [campaigns.view]
    post:
      summary: Update Campaign
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CampaignUpdate'
      security:
        - oauth:
            - campaigns.modify
  /v1/campaign/copy/{campaign}:
    post:
      operationId: copyCampaign
      security:
        - oauth:
            - campaigns.copy
  /v1/campaign/{campaign}/sections:
    get:
      summary: List sections
      parameters:
        - name: campaign
          in: path
      security:
        - oauth:
            - campaigns.sections.list
  /v1/campaign/{campaign}/section/{section}:
    get:
      summary: View a section
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Section'
      security:
        - oauth:
            - campaigns.sections.view
  /v1/campaign/{campaign}/section/{section}/form-fields:
    get:
      summary: List form fields
      security:
        - oauth:
            - campaigns.sections.form-fields.list
  /v1/campaign/{campaign}/prizes:
    get:
      summary: List prizes
      security:
        - oauth:
            - campaigns.prizes.list
  /v1/campaign/{campaign}/prize/{prize}:
    get:
      summary: View a prize
      security:
        - oauth:
            - campaigns.prizes.view
  /v1/campaign/{campaign}/registrations:
    get:
      summary: List registrations
      security:
        - oauth:
            - campaigns.registrations.list
components:
  schemas:
    CampaignUpdate:
      type: object
      properties:
        name:
          type: string
        active_from:
          type: string
    Section:
      type: object
      properties:
        id:
          type: integer
        content:
          $ref: '#/components/schemas/SectionContent'
    SectionContent:
      type: object
      properties:
        html:
          type: string
  securitySchemes:
    oauth:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: /oauth/token
          scopes:
            campaigns.list: Grant right to list campaigns
            campaigns.view: Grant right to view campaign
            campaigns.modify: Grant right to modify campaign
            campaigns.copy: Grant right to copy campaign
            campaigns.sections.list: Grant right to list sections
            campaigns.sections.view: Grant right to view section
            campaigns.sections.form-fields.list: Grant right to list form fields
            campaigns.prizes.list: Grant right to list prizes
            campaigns.prizes.view: Grant right to view prize
            campaigns.registrations.list: 'Grant right to list registrations'
externalDocs:
  url: https://api.playable.com/docs
`;

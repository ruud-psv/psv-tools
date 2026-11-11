/**
 * Een verzonnen API-beschrijving in de vorm van Playable's `openapi.yaml`, voor
 * de tests. De echte staat op https://api.playable.com/openapi.yaml; de namen
 * van de rechten hieronder komen daaruit, de paden zijn een aanname.
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
    put:
      summary: Modify a campaign
      security:
        - oauth:
            - campaigns.modify
  /v1/campaign/{campaign}/copy:
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
  /v1/campaign/{campaign}/sections/{section}:
    get:
      summary: View a section
      security:
        - oauth:
            - campaigns.sections.view
  /v1/campaign/{campaign}/registrations:
    get:
      summary: List registrations
      security:
        - oauth:
            - campaigns.registrations.list
components:
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
            campaigns.registrations.list: 'Grant right to list registrations'
externalDocs:
  url: https://api.playable.com/docs
`;

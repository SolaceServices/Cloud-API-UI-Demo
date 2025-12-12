# Architecture Documentation

## Overview
The **Event Portal CI/CD Helper** is a web-based tool designed to bridge the gap between Solace Event Portal (Design) and Event Brokers (Runtime). It allows users to:
1.  **Pull** designs (Domains, Applications, Events, Schemas) from Solace Event Portal.
2.  **Manage** and version these resources locally.
3.  **Push** designs back to Solace Event Portal.
4.  **Deploy** application configurations to Solace Event Brokers via the Event Mesh.

## Technology Stack
-   **Frontend**: Next.js (React), Lucide React (Icons), CSS Modules/Global CSS.
-   **Backend**: Next.js API Routes (Node.js).
-   **Data Storage**: Local JSON file (`solace-config.json`).
-   **External APIs**: Solace Event Portal API (v2), Solace SEMP (via Event Mesh).

## Data Flow
1.  **Import (Pull)**:
    -   User selects domains in `ui/pages/import.js`.
    -   `api/design/pull.js` fetches data from Solace Cloud.
    -   Data is saved to `solace-config.json`.
2.  **Design & Edit**:
    -   User navigates via `ui/pages/designer.js` to `ui/pages/domain/[id].js`.
    -   Modifications are saved to `solace-config.json` via `api/config.js`.
3.  **Sync**:
    -   `api/sync.js` compares local `solace-config.json` with Solace Cloud state.
    -   Discrepancies are reported in the UI.
4.  **Push**:
    -   `api/design/push.js` reads `solace-config.json`.
    -   It creates/updates resources in Solace Cloud to match the local state.
5.  **Runtime Deployment**:
    -   `ui/pages/runtime.js` allows configuring client profiles and queues.
    -   `api/runtime/deploy.js` pushes these configurations to the Event Broker.

## Key Components

### Frontend Pages
-   **Dashboard (`/`)**: Overview of statistics and quick links.
-   **Import (`/import`)**: Interface to pull domains from Solace Cloud.
-   **Domain Selection (`/designer`)**: Grid view of all imported Application Domains.
-   **Domain Workspace (`/domain/[id]`)**: Main working area for a specific domain. Manages Applications, Events, and Schemas.
-   **Runtime Manager (`/runtime`)**: Interface for deploying applications to specific environments and meshes.

### Backend API Routes
-   **`/api/config`**: CRUD operations for the local `solace-config.json`.
-   **`/api/design/pull`**: Fetches resources from Solace Event Portal.
-   **`/api/design/push`**: Pushes local resources to Solace Event Portal.
-   **`/api/design/sync_check`**: Compares local and remote states.
-   **`/api/runtime/deploy`**: Configures queues and clients on the broker.

## Data Model (`solace-config.json`)
The local state is a flat JSON structure:
```json
{
  "applicationDomains": [ ... ],
  "events": [ ... ],
  "schemas": [ ... ],
  "applications": [ ... ]
}
```
Relationships are maintained via IDs (e.g., `domainId`, `schemaVersionId`).

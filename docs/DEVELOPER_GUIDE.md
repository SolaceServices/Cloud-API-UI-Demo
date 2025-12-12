# Developer Guide

## 1. Prerequisites
-   **Node.js**: v18 or higher.
-   **npm**: v9 or higher.
-   **Solace Cloud Account**: Required for API access.

## 2. Installation
1.  Clone the repository.
2.  Navigate to the `ui` directory:
    ```bash
    cd ui
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```

## 3. Running Locally
To start the development server:
```bash
npm run dev
```
The application will be available at `http://localhost:3000`.

## 4. Project Structure
The project follows a standard Next.js structure with some custom organization.

### `ui/pages`
-   **`api/`**: Backend logic (Node.js).
    -   `config.js`: Local state management.
    -   `design/`: Solace Event Portal integration (Pull, Push, Sync).
    -   `runtime/`: Solace Event Mesh integration (Deploy).
-   **`domain/`**: Dynamic routes for domain workspaces.
-   **`components/`**: Reusable UI components (`Layout`, `Modal`, etc.).
-   **`lib/`**: Shared utilities.
    -   `solace.js`: Helper wrapper for Solace API calls.
    -   `solace-endpoints.js`: Constant definitions for API endpoints.

### `ui/styles`
-   `globals.css`: Global styles, CSS variables (colors, fonts), and utility classes.

## 5. Key Concepts

### Local State (`solace-config.json`)
The application uses a local JSON file as its database. This allows for offline work and version control of the design state.
-   **Location**: `solace-config.json` (in the project root `ui/`).
-   **Structure**: Flat lists of `applicationDomains`, `applications`, `events`, and `schemas`.

### Solace Integration
-   **Design Time**: Uses the Event Portal 2.0 API.
-   **Runtime**: Uses the SEMP v2 API via the Event Mesh.

## 6. Adding New Features
1.  **Backend**: Add a new API route in `ui/pages/api/`.
2.  **Frontend**: Create a new page or component.
3.  **State**: If the feature requires persisting data, update `ui/pages/api/config.js` to handle the new fields.

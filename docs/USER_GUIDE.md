# User Guide

## 1. Initial Setup
Before using the application, you must configure your Solace Cloud credentials.

1.  Open the application in your browser (usually `http://localhost:3000`).
2.  Click the **Settings** icon (gear) in the top right corner.
3.  Enter your **Solace Cloud API Token**.
    -   *Note*: Ensure the token has permissions for Event Portal (Read/Write) and Event Mesh (Read/Write).
4.  Enter your **Organization ID**.
5.  Click **Save**.

## 2. Importing Designs (Pull)
To start working, you need to import existing designs from Solace Event Portal.

1.  Navigate to the **Import** page via the sidebar or home page.
2.  The table will list all available Application Domains from Solace Cloud.
3.  **Select** the domains you want to work on by checking the boxes.
    -   Use the search bar to filter by name.
4.  Click the **Pull Selected** button in the floating action bar.
5.  Wait for the process to complete. Your local workspace is now populated.

## 3. Designing Resources
Navigate to the **Designer** page to manage your resources.

### Domain Selection
-   The main Designer page shows a grid of your imported Application Domains.
-   Click on a **Domain Card** to enter its workspace.

### Domain Workspace
Inside a domain, you can manage:
-   **Applications**: The default view.
-   **Events**: Click the "Events" tab.
-   **Schemas**: Click the "Schemas" tab.

#### Creating/Editing
1.  Click the **+** button to create a new resource.
2.  Fill in the required fields (Name, Description, etc.).
3.  Click **Create**.
4.  To edit, click the row of an existing item. A details pane will open on the right.

#### Version Management
-   In the details pane, you can see the **Versions** list.
-   **Add Version**: Click "+ Add Version" to create a new draft.
-   **Edit Version**: Click "Edit" to modify details (e.g., Topic for Events, JSON content for Schemas).
-   **State**: Change the state (Draft, Released, Deprecated, Retired) using the dropdown.

#### Queue Configuration (Applications Only)
1.  Select an Application and go to the **Versions** section.
2.  Click the **Queues** button (Layers icon).
3.  In the modal, define:
    -   **Consumers**: Which events this application consumes.
    -   **Queue Settings**: Access Type, Max Spool Usage, etc.
    
### Troubleshooting: Orphaned Configurations
If you see a **Red Warning Banner** or "Imported Broker" listed in your configurations:

1.  **What it means**: This configuration exists in Solace Cloud but is not linked to any of your locally defined Event Brokers. This often happens if the configuration points to an old or deleted Service ID.
2.  **How to check**: The banner now displays the **Solace Config ID** (e.g., `ID: fbsabs3nui9`). Compare this with your actual Broker's Service ID.
3.  **How to fix**: 
    -   You cannot "promote" or use an orphan.
    -   **Create a New Configuration**: Click **Add Broker**, select your active broker, and re-enter the settings.
    -   **Remove**: Once the new config is ready, you can safely remove the orphan.

## 4. Pushing to Solace Cloud
Once you are satisfied with your local changes:

1.  In the Domain Workspace, click the **Push to Portal** button.
2.  The system will validate your design and upload changes to Solace Cloud.
3.  **Logs**: A console will appear showing the progress.
4.  **Confirmation**: If deletions are required, you will be asked to confirm.

## 5. Runtime Deployment
To deploy an application to an Event Broker:

1.  Navigate to the **Runtime Manager** page.
2.  **Select Environment**: Choose the target environment (e.g., Dev, Prod).
3.  **Select Mesh**: Choose the specific Event Mesh/Broker.
4.  **Deploy Application**:
    -   Find your application in the list.
    -   Click **Deploy**.
    -   Select the **Version** you want to deploy.
    -   Click **Confirm Deployment**.
5.  **Runtime Configuration**:
    -   Click the **Settings** icon next to an application.
    -   Configure **Client Username**, **Password**, and **Queue** parameters.
    -   Click **Push Configuration** to apply these settings to the broker.

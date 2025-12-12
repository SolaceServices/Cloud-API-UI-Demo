import fs from 'fs';
import path from 'path';
import { solaceApiCallAll } from '../../lib/solace';
import { ENDPOINTS } from '../../lib/solace-endpoints';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { token, orgId } = req.body;
    const configPath = path.join(process.cwd(), 'solace-config.json');

    try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);

        const report = {
            domains: [],
            schemas: [],
            events: [],
            apps: []
        };

        // 1. Fetch all resources from Cloud to compare (High Level)
        const [cloudDomains, cloudSchemas, cloudEvents, cloudApps] = await Promise.all([
            solaceApiCallAll(ENDPOINTS.APPLICATION_DOMAINS, token),
            solaceApiCallAll(ENDPOINTS.SCHEMAS, token),
            solaceApiCallAll(ENDPOINTS.EVENTS, token),
            solaceApiCallAll(ENDPOINTS.APPLICATIONS, token)
        ]);

        // Helper: Check Basic Status
        const checkStatus = (localItem, cloudList) => {
            const status = {
                id: localItem.id,
                name: localItem.name,
                solaceId: localItem.solaceId,
                status: 'synced', // Default to synced (Green)
                details: [],
                issues: [] // For deep inspection
            };

            const cloudItemById = localItem.solaceId ? cloudList.data.find(i => i.id === localItem.solaceId) : null;
            const cloudItemByName = cloudList.data.find(i => i.name === localItem.name);

            if (localItem.solaceId) {
                if (!cloudItemById) {
                    status.status = 'missing_cloud'; // ID Stale/Missing (Orange)
                    status.details.push(`ID ${localItem.solaceId} not found in Solace`);
                } else if (cloudItemById.name !== localItem.name) {
                    status.status = 'missing_cloud'; // Name Mismatch (Orange)
                    status.details.push(`Local name '${localItem.name}' != Cloud name '${cloudItemById.name}'`);
                } else {
                    status.remoteItem = cloudItemById; // Link for deep check
                }
            } else {
                if (cloudItemByName) {
                    status.status = 'not_pushed'; // Exists in Cloud but not linked (Red/Warning)
                    status.details.push(`Found in cloud (ID: ${cloudItemByName.id}) but not linked locally`);
                    status.suggestedId = cloudItemByName.id;
                } else {
                    status.status = 'not_pushed'; // New Local Item (Red)
                    status.details.push('Not deployed yet');
                }
            }
            return status;
        };

        // 2. Perform Checks
        report.domains = (config.applicationDomains || []).map(d => checkStatus(d, cloudDomains));
        report.schemas = (config.schemas || []).map(s => checkStatus(s, cloudSchemas));
        report.events = (config.events || []).map(e => checkStatus(e, cloudEvents));

        // 3. Deep Check for Applications
        const appChecks = (config.applications || []).map(async (localApp) => {
            const status = checkStatus(localApp, cloudApps);

            // Only perform deep check if the App itself is synced
            if (status.status === 'synced' && status.remoteItem) {
                try {
                    // Check Versions
                    const remoteVersions = await solaceApiCallAll(`${ENDPOINTS.APPLICATION_VERSIONS}?applicationId=${status.remoteItem.id}`, token);

                    for (const localVer of (localApp.versions || [])) {
                        const remoteVer = remoteVersions.data.find(v => v.version === localVer.version);

                        if (!remoteVer) {
                            status.status = 'out_of_sync'; // Downgrade status
                            status.issues.push(`Version ${localVer.version} is missing in Solace Cloud.`);
                        } else {
                            // Check Consumers (Queues)
                            const remoteConsumers = await solaceApiCallAll(`${ENDPOINTS.CONSUMERS}?applicationVersionId=${remoteVer.id}`, token);

                            for (const localConsumer of (localVer.consumers || [])) {
                                const remoteConsumer = remoteConsumers.data.find(c => c.name === localConsumer.name);
                                if (!remoteConsumer) {
                                    status.status = 'out_of_sync'; // Downgrade status
                                    status.issues.push(`v${localVer.version}: Consumer '${localConsumer.name}' is missing in Solace Cloud.`);
                                }
                            }
                        }
                    }
                } catch (err) {
                    status.status = 'out_of_sync';
                    status.issues.push(`Failed to verify deep sync: ${err.message}`);
                }
            }
            // Consolidate 'details' and 'issues' for UI
            if (status.issues.length > 0) {
                status.details = [...status.details, ...status.issues];
            }
            delete status.remoteItem; // Cleanup
            return status;
        });

        report.apps = await Promise.all(appChecks);

        res.status(200).json(report);

    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: error.message });
    }
}

import fs from 'fs';
import path from 'path';
import { solaceApiCall, solaceApiCallAll } from '../../lib/solace';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { token, orgId } = req.body;
    const configPath = path.join(process.cwd(), '..', 'solace-config.json');

    try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);

        const report = {
            domains: [],
            schemas: [],
            events: [],
            apps: []
        };

        // Fetch all resources from Cloud to compare
        const [cloudDomains, cloudSchemas, cloudEvents, cloudApps] = await Promise.all([
            solaceApiCallAll('/architecture/applicationDomains', token),
            solaceApiCallAll('/architecture/schemas', token),
            solaceApiCallAll('/architecture/events', token),
            solaceApiCallAll('/architecture/applications', token)
        ]);

        // Helper to check status
        const checkStatus = (localItem, cloudList) => {
            const status = {
                id: localItem.id,
                name: localItem.name,
                solaceId: localItem.solaceId,
                status: 'ok', // ok, missing_cloud, id_mismatch
                details: ''
            };

            const cloudItemById = localItem.solaceId ? cloudList.data.find(i => i.id === localItem.solaceId) : null;
            const cloudItemByName = cloudList.data.find(i => i.name === localItem.name);

            if (localItem.solaceId) {
                if (!cloudItemById) {
                    status.status = 'missing_cloud';
                    status.details = `ID ${localItem.solaceId} not found in Solace`;
                } else if (cloudItemById.name !== localItem.name) {
                    status.status = 'name_mismatch';
                    status.details = `Local name '${localItem.name}' != Cloud name '${cloudItemById.name}'`;
                }
            } else {
                if (cloudItemByName) {
                    status.status = 'id_mismatch';
                    status.details = `Found in cloud (ID: ${cloudItemByName.id}) but not linked locally`;
                    status.suggestedId = cloudItemByName.id;
                } else {
                    status.status = 'missing_cloud';
                    status.details = 'Not deployed yet';
                }
            }
            return status;
        };

        report.applicationDomains = (config.applicationDomains || []).map(d => checkStatus(d, cloudDomains));
        report.schemas = (config.schemas || []).map(s => checkStatus(s, cloudSchemas));
        report.events = (config.events || []).map(e => checkStatus(e, cloudEvents));
        report.apps = (config.applications || []).map(a => checkStatus(a, cloudApps));

        res.status(200).json(report);

    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: error.message });
    }
}

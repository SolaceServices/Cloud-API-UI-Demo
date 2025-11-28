import { solaceApiCallAll } from '../../../lib/solace';
import { ENDPOINTS } from '../../../lib/solace-endpoints';
import fs from 'fs';
import path from 'path';

// Handler for Sync Check
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // 1. Load Local Config
        const configPath = path.join(process.cwd(), '..', 'solace-config.json');
        const localConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        const report = {
            applications: [],
            discrepancies: []
        };

        // 2. Fetch Solace Data
        const solaceApps = await solaceApiCallAll(ENDPOINTS.APPLICATIONS, token);

        // 3. Compare Applications
        for (const localApp of localConfig.applications) {
            const remoteApp = solaceApps.data.find(a => a.name === localApp.name);

            const appReport = {
                name: localApp.name,
                status: 'unknown',
                details: []
            };

            if (!remoteApp) {
                appReport.status = 'missing_remote';
                appReport.details.push('Application does not exist in Solace Cloud.');
            } else {
                appReport.status = 'synced'; // Assume synced, degrade if issues found

                // Check Versions
                const remoteVersions = await solaceApiCallAll(`${ENDPOINTS.APPLICATION_VERSIONS}?applicationId=${remoteApp.id}`, token);

                for (const localVer of localApp.versions) {
                    const remoteVer = remoteVersions.data.find(v => v.version === localVer.version);

                    if (!remoteVer) {
                        appReport.status = 'out_of_sync';
                        appReport.details.push(`Version ${localVer.version} is missing in Solace Cloud.`);
                    } else {
                        // Check Consumers (Queues)
                        const remoteConsumers = await solaceApiCallAll(`${ENDPOINTS.CONSUMERS}?applicationVersionId=${remoteVer.id}`, token);

                        if (localVer.consumers) {
                            for (const localConsumer of localVer.consumers) {
                                const remoteConsumer = remoteConsumers.data.find(c => c.name === localConsumer.name);
                                if (!remoteConsumer) {
                                    appReport.status = 'out_of_sync';
                                    appReport.details.push(`v${localVer.version}: Consumer '${localConsumer.name}' is missing in Solace Cloud.`);
                                }
                            }
                        }
                    }
                }
            }
            report.applications.push(appReport);
        }

        res.status(200).json(report);

    } catch (error) {
        console.error('Sync check error:', error);
        res.status(500).json({ error: error.message });
    }
}

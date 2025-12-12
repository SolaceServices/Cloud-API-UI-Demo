import fs from 'fs';
import path from 'path';
import { solaceApiCallAll } from '../../lib/solace';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const configPath = path.join(process.cwd(), 'solace-config.json');

    try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        const statusReport = {};

        // Helper to check status
        const checkStatus = (localItem, cloudItems) => {
            if (!localItem.solaceId) return 'not_pushed';
            const cloudItem = cloudItems.find(i => i.id === localItem.solaceId);
            if (!cloudItem) return 'missing_cloud';
            // Simple check: if it exists in cloud, assume synced for now. 
            // deeper comparison (e.g. version count) could be added later.
            return 'synced';
        };

        // 1. Application Domains
        const domains = await solaceApiCallAll('/architecture/applicationDomains', token);
        statusReport.applicationDomains = config.applicationDomains.map(d => ({
            id: d.id,
            solaceId: d.solaceId,
            status: checkStatus(d, domains.data)
        }));

        // 2. Schemas
        const schemas = await solaceApiCallAll('/architecture/schemas', token);
        statusReport.schemas = config.schemas.map(s => ({
            id: s.id,
            solaceId: s.solaceId,
            status: checkStatus(s, schemas.data)
        }));

        // 3. Events
        const events = await solaceApiCallAll('/architecture/events', token);
        statusReport.events = config.events.map(e => ({
            id: e.id,
            solaceId: e.solaceId,
            status: checkStatus(e, events.data)
        }));

        // 4. Applications
        const apps = await solaceApiCallAll('/architecture/applications', token);
        statusReport.applications = config.applications.map(a => ({
            id: a.id,
            solaceId: a.solaceId,
            status: checkStatus(a, apps.data)
        }));

        res.status(200).json(statusReport);

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: error.message });
    }
}

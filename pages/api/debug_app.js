import { solaceApiCallAll, solaceApiCall } from '../../lib/solace';

export default async function handler(req, res) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        // 1. Find the application "Amadeus Order"
        const apps = await solaceApiCallAll('/architecture/applications?name=Amadeus Order', token);
        const app = apps.data.find(a => a.name === "Amadeus Order");

        if (!app) return res.status(404).json({ error: 'App not found' });

        // 2. Get its versions
        const versions = await solaceApiCallAll(`/architecture/applicationVersions?applicationId=${app.id}`, token);
        const latestVersion = versions.data.find(v => v.version === '1.0.0');

        if (!latestVersion) return res.status(404).json({ error: 'Version 1.0.0 not found. Available versions: ' + versions.data.map(v => v.version).join(', ') });

        // 3. Get full details of the version
        const versionDetails = await solaceApiCall('GET', `/architecture/applicationVersions/${latestVersion.id}`, null, token);

        // 4. Get consumers explicitly
        let consumers = [];
        try {
            const consumersRes = await solaceApiCallAll(`/architecture/consumers?applicationVersionId=${latestVersion.id}`, token);
            consumers = consumersRes.data;
        } catch (e) {
            consumers = { error: e.message };
        }

        res.status(200).json({
            app,
            version: versionDetails,
            consumers: consumers
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

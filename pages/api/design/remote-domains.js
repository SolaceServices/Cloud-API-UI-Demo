import { solaceApiCallAll } from '../../../lib/solace';
import { ENDPOINTS } from '../../../lib/solace-endpoints';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const domainsRes = await solaceApiCallAll(ENDPOINTS.APPLICATION_DOMAINS, token);
        // Sort by name for better UX
        const domains = domainsRes.data.sort((a, b) => a.name.localeCompare(b.name));
        res.status(200).json(domains);
    } catch (error) {
        console.error('Failed to fetch remote domains:', error);
        res.status(500).json({ error: error.message });
    }
}

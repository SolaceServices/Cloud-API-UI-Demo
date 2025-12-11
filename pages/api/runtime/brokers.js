import { solaceApiCallAll } from '../../../lib/solace';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const gateways = await solaceApiCallAll('/missionControl/eventBrokerServices', token);
        res.status(200).json(gateways.data || []);
    } catch (error) {
        console.error('Gateways fetch error:', error);
        res.status(500).json({ error: error.message });
    }
}

import { solaceApiCallAll } from '../../../lib/solace';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const envs = await solaceApiCallAll('/architecture/environments', token);
        res.status(200).json(envs.data);
    } catch (error) {
        console.error('Error fetching environments:', error);
        res.status(500).json({ error: error.message });
    }
}

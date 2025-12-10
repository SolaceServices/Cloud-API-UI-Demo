import { solaceApiCallAll } from '../../../lib/solace';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const meshes = await solaceApiCallAll('/architecture/eventMeshes', token);

        const data = meshes.data.map(mesh => ({
            ...mesh,
            brokers: [] // No longer fetching connected services
        }));

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching meshes:', error);
        res.status(500).json({ error: error.message });
    }
}

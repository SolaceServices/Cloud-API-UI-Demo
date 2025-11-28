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

        // Fetch actual running services from Mission Control
        let services = { data: [] };
        try {
            services = await solaceApiCallAll('/missionControl/eventBrokerServices', token);
            console.log('Fetched services:', services.data.length);
        } catch (e) {
            console.error('Failed to fetch services:', e.message);
        }

        const data = meshes.data.map(mesh => {
            // Find services that belong to this mesh
            // The relationship might be via eventMeshId or similar field in the service
            const meshServices = services.data.filter(s => s.eventMeshId === mesh.id);

            return {
                ...mesh,
                brokers: meshServices
            };
        });

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching meshes:', error);
        res.status(500).json({ error: error.message });
    }
}

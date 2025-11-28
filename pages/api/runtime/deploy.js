import { solaceApiCall, solaceApiCallAll } from '../../../lib/solace';
import { ENDPOINTS } from '../../../lib/solace-endpoints';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { token, environment, eventMeshId, applicationVersionId } = req.body;

    try {
        const logs = [];
        const log = (msg) => {
            console.log(msg);
            logs.push({ timestamp: new Date().toISOString(), message: msg });
        };

        log('Initiating Deployment...');

        // 1. Find Target Environment
        const envs = await solaceApiCallAll(ENDPOINTS.ENVIRONMENTS, token);
        const targetEnv = envs.data.find(e => e.name === environment);
        if (!targetEnv) throw new Error(`Environment '${environment}' not found`);

        // 2. Verify Event Mesh exists
        const meshes = await solaceApiCallAll(ENDPOINTS.EVENT_MESHES, token);
        const mesh = meshes.data.find(m => m.id === eventMeshId);
        if (!mesh) throw new Error(`Event Mesh not found`);

        log(`Target: mesh '${mesh.name}' in ${environment}`);

        // 3. Find Event Broker
        // We need the eventBrokerId for deployment
        let brokerId = null;
        let debugInfo = [];

        // Try to find modeled event brokers for this mesh
        try {
            log(`Fetching modeled event brokers...`);
            log(`Looking for broker with eventMeshId: ${eventMeshId}`);

            // Try the endpoint for modeled event brokers (checking both paths)
            let brokers = await solaceApiCallAll(ENDPOINTS.MODELED_EVENT_BROKERS, token).catch(() => ({ data: [] }));
            if (brokers.data.length === 0) {
                brokers = await solaceApiCallAll(ENDPOINTS.MODELED_EVENT_BROKERS_FALLBACK, token).catch(() => ({ data: [] }));
            }

            // Log all brokers to see structure
            log(`Found ${brokers.data.length} modeled brokers.`);

            // Detailed dump of all brokers for debugging
            brokers.data.forEach(b => {
                log(`- Broker: ${b.name}, ID: ${b.id}, MeshID: ${b.eventMeshId}, Type: ${b.brokerType}`);
            });

            // Find broker associated with this mesh
            const broker = brokers.data.find(b => b.eventMeshId === eventMeshId);

            if (broker) {
                brokerId = broker.id;
                log(`MATCH FOUND: Modeled broker '${broker.name}' (ID: ${broker.id}) matches Mesh ID ${eventMeshId}`);
            } else {
                log(`NO MATCH found in modeled brokers for Mesh ID ${eventMeshId}`);
            }
        } catch (e) {
            log(`Failed to fetch modeled brokers: ${e.message}`);
        }

        if (!brokerId) {
            // Fallback: Try services again just in case
            try {
                log(`Falling back to eventBrokerServices...`);
                const services = await solaceApiCallAll(ENDPOINTS.EVENT_BROKER_SERVICES, token);
                const service = services.data.find(s => s.eventMeshId === eventMeshId);
                if (service) {
                    brokerId = service.id;
                    log(`Found broker service: ${service.name} (${service.id})`);
                } else {
                    debugInfo.push(...services.data.map(s => `Service: ${s.name} (MeshID: ${s.eventMeshId})`));
                }
            } catch (err) {
                log(`Fallback failed: ${err.message}`);
            }
        }

        if (!brokerId) {
            throw new Error(`Could not find a valid Event Broker ID for mesh '${mesh.name}' (ID: ${eventMeshId}). Available brokers/services: ${debugInfo.join(', ')}`);
        }

        log(`Deploying App Version ID: ${applicationVersionId} to broker ID: ${brokerId}`);

        // 4. Deploy Application Version
        const deployment = await solaceApiCall('POST', ENDPOINTS.APPLICATION_DEPLOYMENTS, {
            applicationVersionId: applicationVersionId,
            eventBrokerId: brokerId,
            action: "deploy",
            description: "Deployed via SolCD Runtime Manager"
        }, token);

        log(`Deployment Response: ${JSON.stringify(deployment)}`);
        const jobId = deployment.data.changeRecordId || deployment.data.id;
        log(`Deployment Job ID: ${jobId}`);

        res.status(200).json({ success: true, logs, jobId: jobId });

    } catch (error) {
        console.error('Deployment error:', error);
        res.status(500).json({ error: error.message, logs: [] });
    }
}

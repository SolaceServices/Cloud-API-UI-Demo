import fs from 'fs';
import path from 'path';
import { solaceApiCall } from '../../lib/solace';
import { solaceApiCallAll } from '../../lib/solace';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { token, eventBrokerId, applicationVersionId } = req.body;

    // Legacy support or direct optional param just in case
    // const { eventMeshId } = req.body; 

    try {
        const logs = [];
        const log = (msg) => {
            console.log(msg);
            logs.push({ timestamp: new Date().toISOString(), message: msg });
        };

        log(`Starting Deployment...`);

        // If eventBrokerId is provided directly, use it. 
        // Otherwise, if only mesh ID provided (legacy), we'd need lookup, but we are enforcing Broker ID now.
        if (!eventBrokerId) {
            throw new Error('Missing eventBrokerId. Promotion requires a specific target Broker.');
        }

        log(`Deploying App Version ID: ${applicationVersionId} to Broker ID: ${eventBrokerId}...`);

        const deploymentPayload = {
            applicationVersionId: applicationVersionId,
            eventBrokerId: eventBrokerId,
            action: "deploy",
            description: "Deployed via SolCD Designer Promotions"
        };

        const deployment = await solaceApiCall('POST', '/architecture/runtimeManagement/applicationDeployments', deploymentPayload, token);

        log(`Deployment Request Submitted! Job ID: ${deployment.data.id}`);

        res.status(200).json({ success: true, logs });

    } catch (error) {
        console.error('Deployment error:', error);
        res.status(500).json({ success: false, error: error.message, logs: [] });
    }
}

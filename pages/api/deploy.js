import fs from 'fs';
import path from 'path';
import { solaceApiCall } from '../../lib/solace';
import { solaceApiCallAll } from '../../lib/solace';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { token, environment, eventMeshId, applicationVersionId } = req.body;
    const configPath = path.join(process.cwd(), '..', 'solace-config.json');

    try {
        const logs = [];
        const log = (msg) => {
            console.log(msg);
            logs.push({ timestamp: new Date().toISOString(), message: msg });
        };

        log(`Starting Deployment to ${environment}...`);

        // 1. Resolve Target Broker (Gateway) for the Mesh
        // We assume the user provided a valid eventMeshId for the environment
        const gateways = await solaceApiCallAll('/architecture/gateways', token);
        const targetGateway = gateways.data.find(g => g.eventMeshId === eventMeshId);

        if (!targetGateway) {
            throw new Error(`No Gateway (Broker) found for Event Mesh ID: ${eventMeshId}`);
        }
        log(`Resolved Target Gateway: ${targetGateway.name} (ID: ${targetGateway.id})`);

        // 2. Trigger Deployment
        // We deploy the specific applicationVersionId provided by the UI.
        // We do NOT re-sync or modify the object model. We assume Designer (push.js) has done its job.

        log(`Deploying App Version ID: ${applicationVersionId}...`);

        const deploymentPayload = {
            applicationVersionId: applicationVersionId,
            eventBrokerId: targetGateway.id,
            action: "deploy",
            description: "Deployed via SolCD Runtime Manager"
        };

        const deployment = await solaceApiCall('POST', '/architecture/runtimeManagement/applicationDeployments', deploymentPayload, token);

        log(`Deployment Request Submitted! Job ID: ${deployment.data.id}`);
        // Optionally we could poll for status, but async fire-and-forget is fine for this step.

        res.status(200).json({ success: true, logs });

    } catch (error) {
        console.error('Deployment error:', error);
        res.status(500).json({ success: false, error: error.message, logs: [] });
    }
}

import fs from 'fs';
import path from 'path';
import { solaceApiCall, solaceApiCallAll } from '../../lib/solace';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { token, orgId, environment } = req.body;
    const configPath = path.join(process.cwd(), '..', 'solace-config.json');

    try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        let configChanged = false;
        let errorCount = 0;

        const logs = [];
        const log = (msg) => {
            console.log(msg);
            logs.push({ timestamp: new Date().toISOString(), message: msg });
        };

        log('Starting deployment (Object Model v2)...');

        const updateConfig = () => {
            if (configChanged) {
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                log('Updated local configuration');
                configChanged = false;
            }
        };

        // --- 1. Application Domains ---
        for (const domain of config.applicationDomains) {
            if (domain.solaceId) continue;

            log(`Processing Application Domain: ${domain.name}`);
            const domains = await solaceApiCallAll('/architecture/applicationDomains', token);
            const existing = domains.data.find(d => d.name === domain.name);

            if (existing) {
                domain.solaceId = existing.id;
                log(`Linked existing Application Domain: ${domain.solaceId}`);
            } else {
                const created = await solaceApiCall('POST', '/architecture/applicationDomains', {
                    name: domain.name,
                    description: domain.description || '',
                    uniqueTopicAddressEnforcementEnabled: false,
                    topicDomainEnforcementEnabled: false
                }, token);
                domain.solaceId = created.data.id;
                log(`Created Application Domain: ${domain.solaceId}`);
            }
            configChanged = true;
        }
        updateConfig();

        // --- 2. Schemas ---
        for (const schema of config.schemas) {
            const domain = config.applicationDomains.find(d => d.id === schema.domainId);
            if (!domain?.solaceId) throw new Error(`Application Domain not found for schema ${schema.name}`);

            // 2a. Schema Object
            if (!schema.solaceId) {
                const schemas = await solaceApiCallAll('/architecture/schemas', token);
                const existing = schemas.data.find(s => s.name === schema.name && s.applicationDomainId === domain.solaceId);

                if (existing) {
                    schema.solaceId = existing.id;
                    log(`Linked existing Schema Object: ${schema.solaceId}`);
                } else {
                    const created = await solaceApiCall('POST', '/architecture/schemas', {
                        name: schema.name,
                        applicationDomainId: domain.solaceId,
                        shared: true,
                        schemaType: "jsonSchema",
                        contentType: "json"
                    }, token);
                    schema.solaceId = created.data.id;
                    log(`Created Schema Object: ${schema.solaceId}`);
                }
                configChanged = true;
            }

            // 2b. Schema Versions
            for (const version of schema.versions) {
                const payload = {
                    schemaId: schema.solaceId,
                    version: version.version,
                    content: JSON.stringify(version.content || {}),
                    stateId: version.stateId || "1" // Default to DRAFT (1)
                };

                if (version.solaceId) {
                    // Update existing version (mainly for state change)
                    // Note: Solace API might restrict updates based on current state.
                    try {
                        await solaceApiCall('PATCH', `/architecture/schemaVersions/${version.solaceId}`, {
                            stateId: payload.stateId,
                            content: payload.content
                        }, token);
                        log(`Updated Schema Version: ${schema.name} v${version.version}`);
                    } catch (e) {
                        log(`Warning updating schema version ${schema.name} v${version.version}: ${e.message}`);
                        errorCount++;
                    }
                } else {
                    // Create new version
                    try {
                        const created = await solaceApiCall('POST', '/architecture/schemaVersions', payload, token);
                        version.solaceId = created.data.id;
                        log(`Created Schema Version: ${schema.name} v${version.version} (State: ${payload.stateId})`);
                        configChanged = true;
                    } catch (e) {
                        log(`Error creating schema version ${schema.name} v${version.version}: ${e.message}`);
                        errorCount++;
                    }
                }
            }
        }
        updateConfig();

        // --- 3. Events ---
        for (const event of config.events) {
            const domain = config.applicationDomains.find(d => d.id === event.domainId);
            if (!domain?.solaceId) throw new Error(`Application Domain not found for event ${event.name}`);

            // 3a. Event Object
            if (!event.solaceId) {
                const events = await solaceApiCallAll('/architecture/events', token);
                const existing = events.data.find(e => e.name === event.name && e.applicationDomainId === domain.solaceId);

                if (existing) {
                    event.solaceId = existing.id;
                    log(`Linked existing Event Object: ${event.solaceId}`);
                } else {
                    const created = await solaceApiCall('POST', '/architecture/events', {
                        name: event.name,
                        applicationDomainId: domain.solaceId,
                        shared: true
                    }, token);
                    event.solaceId = created.data.id;
                    log(`Created Event Object: ${event.solaceId}`);
                }
                configChanged = true;
            }

            // 3b. Event Versions
            for (const version of event.versions) {
                // Find linked Schema Version ID
                let schemaVersionId = null;
                if (version.schemaVersionId) {
                    // Find the schema that contains this version
                    const linkedSchema = config.schemas.find(s => s.versions.some(v => v.id === version.schemaVersionId));
                    const linkedVersion = linkedSchema?.versions.find(v => v.id === version.schemaVersionId);
                    if (linkedVersion?.solaceId) {
                        schemaVersionId = linkedVersion.solaceId;
                    }
                }

                const addressLevels = (version.topic || 'test/topic').split('/').map(name => ({
                    addressLevelType: "literal",
                    name
                }));

                const payload = {
                    eventId: event.solaceId,
                    version: version.version,
                    schemaVersionId: schemaVersionId,
                    stateId: version.stateId || "1", // Default to DRAFT
                    deliveryDescriptor: {
                        brokerType: "solace",
                        address: {
                            addressType: "topic",
                            addressLevels
                        }
                    }
                };

                if (version.solaceId) {
                    // Update existing version
                    try {
                        await solaceApiCall('PATCH', `/architecture/eventVersions/${version.solaceId}`, {
                            stateId: payload.stateId,
                            schemaVersionId: payload.schemaVersionId,
                            deliveryDescriptor: payload.deliveryDescriptor
                        }, token);
                        log(`Updated Event Version: ${event.name} v${version.version}`);
                    } catch (e) {
                        log(`Warning updating event version ${event.name} v${version.version}: ${e.message}`);
                        errorCount++;
                    }
                } else {
                    // Create new version
                    try {
                        const created = await solaceApiCall('POST', '/architecture/eventVersions', payload, token);
                        version.solaceId = created.data.id;
                        log(`Created Event Version: ${event.name} v${version.version} (State: ${payload.stateId})`);
                        configChanged = true;
                    } catch (e) {
                        log(`Error creating event version ${event.name} v${version.version}: ${e.message}`);
                        errorCount++;
                    }
                }
            }
        }
        updateConfig();

        // --- 4. Applications ---
        for (const app of config.applications) {
            const domain = config.applicationDomains.find(d => d.id === app.domainId);
            if (!domain?.solaceId) throw new Error(`Application Domain not found for app ${app.name}`);

            // 4a. App Object
            if (!app.solaceId) {
                const apps = await solaceApiCallAll('/architecture/applications', token);
                const existing = apps.data.find(a => a.name === app.name && a.applicationDomainId === domain.solaceId);

                if (existing) {
                    app.solaceId = existing.id;
                    log(`Linked existing App Object: ${app.solaceId}`);
                } else {
                    const created = await solaceApiCall('POST', '/architecture/applications', {
                        name: app.name,
                        applicationDomainId: domain.solaceId,
                        applicationType: "standard",
                        brokerType: "solace"
                    }, token);
                    app.solaceId = created.data.id;
                    log(`Created App Object: ${app.solaceId}`);
                }
                configChanged = true;
            }

            // 4b. App Versions
            for (const version of app.versions) {
                // Resolve Event Version IDs
                const consumedEventVersionIds = [];
                if (version.consumedEventVersionIds) {
                    for (const localEventVerId of version.consumedEventVersionIds) {
                        const linkedEvent = config.events.find(e => e.versions.some(v => v.id === localEventVerId));
                        const linkedVersion = linkedEvent?.versions.find(v => v.id === localEventVerId);
                        if (linkedVersion?.solaceId) {
                            consumedEventVersionIds.push(linkedVersion.solaceId);
                        }
                    }
                }

                const payload = {
                    applicationId: app.solaceId,
                    version: version.version,
                    stateId: version.stateId || "1", // Default to DRAFT
                    declaredConsumedEventVersionIds: consumedEventVersionIds,
                    messagingSettings: {
                        brokerType: "solace",
                        guaranteedMessaging: {
                            queueName: `${app.name.toLowerCase().replace(/\s+/g, '-')}.queue`,
                            accessType: "exclusive",
                            maxMsgSpoolUsage: 1500,
                            permissions: "consume",
                            respectTtl: true
                        },
                        clientProfile: {
                            name: `${app.name.toLowerCase().replace(/\s+/g, '-')}-profile`,
                            allowGuaranteedMsgReceive: true,
                            allowGuaranteedMsgSend: true
                        }
                    }
                };

                if (version.solaceId) {
                    // Update existing version
                    try {
                        await solaceApiCall('PATCH', `/architecture/applicationVersions/${version.solaceId}`, {
                            stateId: payload.stateId,
                            declaredConsumedEventVersionIds: payload.declaredConsumedEventVersionIds,
                            messagingSettings: payload.messagingSettings
                        }, token);
                        log(`Updated App Version: ${app.name} v${version.version}`);
                    } catch (e) {
                        log(`Warning updating app version ${app.name} v${version.version}: ${e.message}`);
                        errorCount++;
                    }
                } else {
                    // Create new version
                    try {
                        const created = await solaceApiCall('POST', '/architecture/applicationVersions', payload, token);
                        version.solaceId = created.data.id;
                        log(`Created App Version: ${app.name} v${version.version} (State: ${payload.stateId})`);
                        configChanged = true;
                    } catch (e) {
                        log(`Error creating app version ${app.name} v${version.version}: ${e.message}`);
                        errorCount++;
                    }
                }
            }
        }
        updateConfig();

        // --- 5. Deployment (Config Push) ---
        // (Simplified for MVP: Deploy latest version of each app)
        if (config.applications.length > 0) {
            log('Initiating Config Push...');

            const envs = await solaceApiCallAll('/architecture/environments', token);
            const targetEnv = envs.data.find(e => e.name === environment);
            if (!targetEnv) throw new Error(`Environment '${environment}' not found`);

            const meshes = await solaceApiCallAll('/architecture/eventMeshes', token);
            const mesh = meshes.data.find(m => m.environmentId === targetEnv.id);
            if (!mesh) throw new Error(`No Event Mesh found for environment '${environment}'`);

            const brokers = await solaceApiCallAll('/architecture/gateways', token);
            const broker = brokers.data.find(b => b.eventMeshId === mesh.id);
            if (!broker) throw new Error(`No Event Broker (Gateway) found for environment '${environment}'`);

            for (const app of config.applications) {
                // Deploy the last version in the list (assuming it's the latest)
                const latestVersion = app.versions[app.versions.length - 1];
                if (!latestVersion?.solaceId) continue;

                log(`Deploying App: ${app.name} v${latestVersion.version} to ${environment}`);

                try {
                    const deployment = await solaceApiCall('POST', '/architecture/runtimeManagement/applicationDeployments', {
                        applicationVersionId: latestVersion.solaceId,
                        eventBrokerId: broker.id,
                        action: "deploy",
                        description: "Deployed via SolCD"
                    }, token);
                    log(`Deployment Job ID: ${deployment.data.id}`);
                } catch (e) {
                    log(`Deployment error: ${e.message}`);
                    errorCount++;
                }
            }
        }

        res.status(200).json({ success: errorCount === 0, logs, errorCount });

    } catch (error) {
        console.error('Deployment error:', error);
        res.status(500).json({ error: error.message, logs: [] });
    }
}

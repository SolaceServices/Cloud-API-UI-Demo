import fs from 'fs';
import path from 'path';
import { solaceApiCall, solaceApiCallAll } from '../../../lib/solace';
import { ENDPOINTS } from '../../../lib/solace-endpoints';


const LOG_FILE = path.join(process.cwd(), 'debug_log.txt');

function fileLog(message) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { token, orgId, confirmDeletions } = req.body;
    const configPath = path.join(process.cwd(), '..', 'solace-config.json');

    try {
        let config;
        const configContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
        try {
            config = JSON.parse(configContent);
        } catch (e) {
            console.warn('Config file is empty or invalid. Resetting to default.');
            config = {
                applicationDomains: [],
                schemas: [],
                events: [],
                applications: []
            };
        }
        let configChanged = false;
        let errorCount = 0;
        const pendingDeletions = [];

        const logs = [];
        const log = (msg) => {
            console.log(msg);
            logs.push({ timestamp: new Date().toISOString(), message: msg });
            fileLog(msg);
        };

        log('Starting Push to Portal (Design Phase)...');

        const updateConfig = () => {
            if (configChanged) {
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                log('Updated local configuration');
                configChanged = false;
            }
        };

        // --- 0. Fetch Context (Broker) ---
        // --- 0. Fetch Context (Broker) ---
        // We fetch all brokers here to look them up by name later per application.
        let brokers = { data: [] };
        try {
            brokers = await solaceApiCallAll(ENDPOINTS.MODELED_EVENT_BROKERS, token);
            if (!brokers.data || brokers.data.length === 0) {
                log('Warning: No Modeled Event Brokers found. Queue/Client configuration will fail.');
            }
        } catch (e) {
            log(`Warning: Failed to fetch brokers: ${e.message}`);
        }

        // --- 1. Application Domains ---
        const domains = await solaceApiCallAll(ENDPOINTS.APPLICATION_DOMAINS, token);
        for (const domain of config.applicationDomains) {
            if (domain.solaceId) {
                const exists = domains.data.find(d => d.id === domain.solaceId);
                if (!exists) {
                    log(`Warning: Stale Domain ID ${domain.solaceId} for ${domain.name}. Resetting...`);
                    domain.solaceId = null;
                }
            }
            if (domain.solaceId) continue;

            log(`Processing Application Domain: ${domain.name}`);
            // const domains = await solaceApiCallAll(ENDPOINTS.APPLICATION_DOMAINS, token); // Moved up

            const existing = domains.data.find(d => d.name === domain.name);

            if (existing) {
                domain.solaceId = existing.id;
                log(`Linked existing Application Domain: ${domain.solaceId}`);
            } else {
                const created = await solaceApiCall('POST', ENDPOINTS.APPLICATION_DOMAINS, {
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
            if (schema.solaceId) {
                const schemas = await solaceApiCallAll(ENDPOINTS.SCHEMAS, token);
                const exists = schemas.data.find(s => s.id === schema.solaceId);
                if (!exists) {
                    log(`Warning: Stale Schema ID ${schema.solaceId} for ${schema.name}. Resetting...`);
                    schema.solaceId = null;
                }
            }

            if (!schema.solaceId) {
                const schemas = await solaceApiCallAll(ENDPOINTS.SCHEMAS, token);
                const existing = schemas.data.find(s => s.name === schema.name && s.applicationDomainId === domain.solaceId);

                if (existing) {
                    schema.solaceId = existing.id;
                    log(`Linked existing Schema Object: ${schema.solaceId}`);
                } else {
                    const created = await solaceApiCall('POST', ENDPOINTS.SCHEMAS, {
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
                    // Update existing version
                    try {
                        await solaceApiCall('PATCH', `${ENDPOINTS.SCHEMA_VERSIONS}/${version.solaceId}`, {
                            stateId: payload.stateId,
                            content: payload.content
                        }, token);
                        log(`Updated Schema Version: ${schema.name} v${version.version}`);
                    } catch (e) {
                        if (e.message.includes('404')) {
                            log(`Warning: Stale Schema Version ID ${version.solaceId} for ${schema.name} v${version.version}. Resetting...`);
                            version.solaceId = null;
                            // Fall through to create logic
                        } else {
                            log(`Warning updating schema version ${schema.name} v${version.version}: ${e.message}`);
                            errorCount++;
                        }
                    }
                }

                if (!version.solaceId) {
                    // Try to find existing version by number (Reconciliation)
                    try {
                        const existingVersions = await solaceApiCallAll(`${ENDPOINTS.SCHEMA_VERSIONS}?schemaIds=${schema.solaceId}`, token);
                        const match = existingVersions.data.find(v => v.version === version.version);
                        if (match) {
                            version.solaceId = match.id;
                            log(`Reconciled: Linked existing Schema Version ${schema.name} v${version.version} (${match.id})`);
                            configChanged = true;

                            // Optional: Update the reconciled version to ensure content is synced
                            await solaceApiCall('PATCH', `${ENDPOINTS.SCHEMA_VERSIONS}/${version.solaceId}`, {
                                stateId: payload.stateId,
                                content: payload.content
                            }, token);
                        }
                    } catch (e) {
                        log(`Warning: Failed to check existing schema versions: ${e.message}`);
                    }
                }

                if (!version.solaceId) {
                    // Create new version
                    try {
                        const created = await solaceApiCall('POST', ENDPOINTS.SCHEMA_VERSIONS, payload, token);
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
            if (event.solaceId) {
                const events = await solaceApiCallAll(ENDPOINTS.EVENTS, token);
                const exists = events.data.find(e => e.id === event.solaceId);
                if (!exists) {
                    log(`Warning: Stale Event ID ${event.solaceId} for ${event.name}. Resetting...`);
                    event.solaceId = null;
                }
            }

            if (!event.solaceId) {
                const events = await solaceApiCallAll(ENDPOINTS.EVENTS, token);
                const existing = events.data.find(e => e.name === event.name && e.applicationDomainId === domain.solaceId);

                if (existing) {
                    event.solaceId = existing.id;
                    log(`Linked existing Event Object: ${event.solaceId}`);
                } else {
                    const created = await solaceApiCall('POST', ENDPOINTS.EVENTS, {
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
                        await solaceApiCall('PATCH', `${ENDPOINTS.EVENT_VERSIONS}/${version.solaceId}`, {
                            stateId: payload.stateId,
                            schemaVersionId: payload.schemaVersionId,
                            deliveryDescriptor: payload.deliveryDescriptor
                        }, token);
                        log(`Updated Event Version: ${event.name} v${version.version}`);
                    } catch (e) {
                        if (e.message.includes('404')) {
                            log(`Warning: Stale Event Version ID ${version.solaceId} for ${event.name} v${version.version}. Resetting...`);
                            version.solaceId = null;
                            // Fall through to create logic
                        } else {
                            log(`Warning updating event version ${event.name} v${version.version}: ${e.message}`);
                            errorCount++;
                        }
                    }
                }

                if (!version.solaceId) {
                    // Try to find existing version by number (Reconciliation)
                    try {
                        const existingVersions = await solaceApiCallAll(`${ENDPOINTS.EVENT_VERSIONS}?eventIds=${event.solaceId}`, token);
                        const match = existingVersions.data.find(v => v.version === version.version);
                        if (match) {
                            version.solaceId = match.id;
                            log(`Reconciled: Linked existing Event Version ${event.name} v${version.version} (${match.id})`);
                            configChanged = true;

                            // Optional: Update the reconciled version
                            await solaceApiCall('PATCH', `${ENDPOINTS.EVENT_VERSIONS}/${version.solaceId}`, {
                                stateId: payload.stateId,
                                schemaVersionId: payload.schemaVersionId,
                                deliveryDescriptor: payload.deliveryDescriptor
                            }, token);
                        }
                    } catch (e) {
                        log(`Warning: Failed to check existing event versions: ${e.message}`);
                    }
                }

                if (!version.solaceId) {
                    // Create new version
                    try {
                        const created = await solaceApiCall('POST', ENDPOINTS.EVENT_VERSIONS, payload, token);
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
            log(`Processing Application: ${app.name}`);

            // Resolve App Context (Broker)
            // Resolve App Context (Broker)
            let appContextId = null;
            if (app.brokerName) {
                const appBroker = brokers.data.find(b => b.name === app.brokerName);
                if (appBroker) {
                    appContextId = appBroker.id;
                    log(`Using App-Specific Broker Context: ${appBroker.name} (${appContextId})`);
                } else {
                    log(`Error: App configured broker '${app.brokerName}' not found.`);
                }
            } else {
                log(`Warning: No brokerName specified for app '${app.name}'. Configuration (Queues/Client Username) will be skipped.`);
            }

            const domain = config.applicationDomains.find(d => d.id === app.domainId);
            if (!domain?.solaceId) throw new Error(`Application Domain not found for app ${app.name}`);

            // 4a. App Object
            if (app.solaceId) {
                const apps = await solaceApiCallAll(ENDPOINTS.APPLICATIONS, token);
                const exists = apps.data.find(a => a.id === app.solaceId);
                if (!exists) {
                    log(`Warning: Stale App ID ${app.solaceId} for ${app.name}. Resetting...`);
                    app.solaceId = null;
                }
            }

            if (!app.solaceId) {
                const apps = await solaceApiCallAll(ENDPOINTS.APPLICATIONS, token);
                const existing = apps.data.find(a => a.name === app.name && a.applicationDomainId === domain.solaceId);

                if (existing) {
                    app.solaceId = existing.id;
                    log(`Linked existing App Object: ${app.solaceId}`);
                } else {
                    const created = await solaceApiCall('POST', ENDPOINTS.APPLICATIONS, {
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
                const producedEventVersionIds = [];

                // Consumed Events (Legacy + New)
                if (version.consumedEventVersionIds) {
                    for (const localEventVerId of version.consumedEventVersionIds) {
                        const linkedEvent = config.events.find(e => e.versions.some(v => v.id === localEventVerId));
                        const linkedVersion = linkedEvent?.versions.find(v => v.id === localEventVerId);
                        if (linkedVersion?.solaceId) {
                            consumedEventVersionIds.push(linkedVersion.solaceId);
                        }
                    }
                }

                // Produced Events
                if (version.producedEventVersionIds) {
                    for (const localEventVerId of version.producedEventVersionIds) {
                        const linkedEvent = config.events.find(e => e.versions.some(v => v.id === localEventVerId));
                        const linkedVersion = linkedEvent?.versions.find(v => v.id === localEventVerId);
                        if (linkedVersion?.solaceId) {
                            producedEventVersionIds.push(linkedVersion.solaceId);
                        }
                    }
                }

                // Construct Consumers Array from Config
                const consumers = [];
                if (version.consumers) {
                    for (const consumer of version.consumers) {
                        const subscriptions = [];
                        if (consumer.subscriptions) {
                            for (const sub of consumer.subscriptions) {
                                let attractedEventVersionId = null;
                                if (sub.attractedEventVersionId) {
                                    const linkedEvent = config.events.find(e => e.versions.some(v => v.id === sub.attractedEventVersionId));
                                    const linkedVersion = linkedEvent?.versions.find(v => v.id === sub.attractedEventVersionId);
                                    if (linkedVersion?.solaceId) attractedEventVersionId = linkedVersion.solaceId;
                                }
                                subscriptions.push({
                                    subscriptionType: sub.subscriptionType,
                                    value: sub.value,
                                    attractedEventVersionIds: attractedEventVersionId ? [{ eventVersionId: attractedEventVersionId, eventMeshIds: [] }] : []
                                });
                            }
                        }

                        consumers.push({
                            name: consumer.name,
                            consumerType: consumer.type,
                            brokerType: "solace",
                            queueConfig: consumer.queueConfig ? {
                                accessType: consumer.queueConfig.accessType,
                                maxMsgSpoolUsage: consumer.queueConfig.maxMsgSpoolUsage,
                                maxTtl: consumer.queueConfig.maxTtl || 0,
                                respectTtlEnabled: consumer.queueConfig.respectTtl !== false,
                                permission: consumer.queueConfig.permission
                            } : null,
                            subscriptions: subscriptions
                        });
                    }
                }

                log(`Constructed ${consumers.length} consumers for ${app.name} v${version.version}`);
                if (consumers.length > 0) {
                    log(`Consumer 0: ${JSON.stringify(consumers[0])}`);
                }

                const payload = {
                    applicationId: app.solaceId,
                    version: version.version,
                    stateId: version.stateId || "1",
                    declaredConsumedEventVersionIds: consumedEventVersionIds,
                    declaredProducedEventVersionIds: producedEventVersionIds,
                    messagingSettings: {
                        brokerType: "solace",
                        ...(app.clientUsername ? { clientUsername: app.clientUsername } : {}),
                        ...(app.clientUsername ? { clientUsername: app.clientUsername } : {}),
                        // clientPassword is now handled via dedicated configuration API
                        ...(version.messagingSettings?.clientUsername ? { clientUsername: version.messagingSettings.clientUsername } : {}), // Keep version override if exists
                        ...(version.messagingSettings?.clientProfile ? {
                            clientProfile: {
                                name: version.messagingSettings.clientProfile.name,
                                allowGuaranteedMsgReceive: true,
                                allowGuaranteedMsgSend: true
                            }
                        } : {})
                    }
                };

                log(`Sending payload for ${app.name} v${version.version}: ${JSON.stringify(payload, null, 2)}`);

                let versionId = version.solaceId;

                if (version.solaceId) {
                    // Update existing version
                    try {
                        await solaceApiCall('PATCH', `${ENDPOINTS.APPLICATION_VERSIONS}/${version.solaceId}`, {
                            stateId: payload.stateId,
                            declaredConsumedEventVersionIds: payload.declaredConsumedEventVersionIds,
                            declaredProducedEventVersionIds: payload.declaredProducedEventVersionIds,
                            messagingSettings: payload.messagingSettings
                        }, token);
                        log(`Updated App Version: ${app.name} v${version.version}`);
                    } catch (e) {
                        if (e.message.includes('404')) {
                            log(`Warning: Stale App Version ID ${version.solaceId} for ${app.name} v${version.version}. Resetting...`);
                            version.solaceId = null;
                            // Fall through to create logic
                        } else {
                            log(`Warning updating app version ${app.name} v${version.version}: ${e.message}`);
                            errorCount++;
                        }
                    }
                }

                if (!version.solaceId) {
                    // Try to find existing version by number (Reconciliation)
                    try {
                        const existingVersions = await solaceApiCallAll(`${ENDPOINTS.APPLICATION_VERSIONS}?applicationIds=${app.solaceId}`, token);
                        const match = existingVersions.data.find(v => v.version === version.version);
                        if (match) {
                            version.solaceId = match.id;
                            versionId = match.id;
                            log(`Reconciled: Linked existing App Version ${app.name} v${version.version} (${match.id})`);
                            configChanged = true;

                            // Optional: Update the reconciled version
                            await solaceApiCall('PATCH', `${ENDPOINTS.APPLICATION_VERSIONS}/${version.solaceId}`, {
                                stateId: payload.stateId,
                                declaredConsumedEventVersionIds: payload.declaredConsumedEventVersionIds,
                                declaredProducedEventVersionIds: payload.declaredProducedEventVersionIds,
                                messagingSettings: payload.messagingSettings
                            }, token);
                        }
                    } catch (e) {
                        log(`Warning: Failed to check existing app versions: ${e.message}`);
                    }
                }

                if (!version.solaceId) {
                    // Create new version
                    try {
                        const res = await solaceApiCall('POST', ENDPOINTS.APPLICATION_VERSIONS, payload, token);
                        version.solaceId = res.data.id;
                        versionId = res.data.id;
                        log(`Created App Version: ${app.name} v${version.version}`);
                    } catch (e) {
                        log(`Error creating app version ${app.name} v${version.version}: ${e.message}`);
                        errorCount++;
                    }
                }

                // Manage Client Username Configuration (Dedicated API)
                if (app.accessType === 'basic' && app.clientUsername && app.clientPassword && app.solaceId) {
                    try {
                        log(`Configuring Client Username for ${app.name}...`);
                        const clientUserPayload = {
                            entityId: app.solaceId,
                            entityType: "application",
                            contextId: appContextId,
                            contextType: "EVENT_BROKER",
                            configurationTypeId: "solaceClientUsername",
                            value: {
                                clientUsername: app.clientUsername,
                                password: app.clientPassword
                            }
                        };

                        if (!appContextId) throw new Error("No Broker Context available");

                        // Check if config already exists
                        let existingConfigs = { data: [] };
                        try {
                            const query = `?entityIds=${app.solaceId}&eventBrokerIds=${appContextId}`;
                            existingConfigs = await solaceApiCallAll(`${ENDPOINTS.CONFIG_CLIENT_USERNAMES}${query}`, token);
                            log(`Check Client Username result: found ${existingConfigs.data ? existingConfigs.data.length : 0} configs`);
                        } catch (fetchErr) {
                            log(`Warning: Failed to check existing Client Username config: ${fetchErr.message}`);
                        }

                        let matchingConfig = null;
                        let configsToDelete = [];

                        if (existingConfigs.data && existingConfigs.data.length > 0) {
                            matchingConfig = existingConfigs.data.find(c => c.value && c.value.clientUsername === app.clientUsername);
                            configsToDelete = existingConfigs.data.filter(c => c !== matchingConfig);

                            if (configsToDelete.length > 0) {
                                if (!confirmDeletions) {
                                    log(`Found ${configsToDelete.length} redundant Client Username configs. Pending confirmation...`);
                                    pendingDeletions.push({
                                        type: 'Client Username',
                                        name: app.clientUsername,
                                        broker: app.brokerName,
                                        count: configsToDelete.length,
                                        operations: configsToDelete.map(c => ({
                                            method: 'DELETE',
                                            url: `${ENDPOINTS.CONFIG_CLIENT_USERNAMES}/${c.id}`
                                        }))
                                    });
                                } else {
                                    log(`Found ${configsToDelete.length} redundant Client Username configs. Deleting...`);
                                    for (const config of configsToDelete) {
                                        log(`Deleting old config ${config.id}...`);
                                        await solaceApiCall('DELETE', `${ENDPOINTS.CONFIG_CLIENT_USERNAMES}/${config.id}`, null, token);
                                    }
                                    // Wait for deletions to propagate
                                    log('Waiting 2s for deletions to propagate...');
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                }
                            }
                        }

                        const isBlocked = !confirmDeletions && configsToDelete.length > 0;

                        if (matchingConfig) {
                            log(`Client Username for ${app.name} is up to date. Skipping creation.`);
                        } else if (isBlocked) {
                            log(`Skipping creation of Client Username for ${app.name} due to pending deletion.`);
                        } else {
                            log(`Creating new Client Username config for ${app.name}...`);
                            await solaceApiCall('POST', ENDPOINTS.CONFIG_CLIENT_USERNAMES, clientUserPayload, token);
                            log(`Configured Client Username for ${app.name}`);
                        }

                    } catch (e) {
                        log(`Error configuring Client Username for ${app.name}: ${e.message}`);
                        errorCount++;
                    }
                }

                // 5. Consumers & Queues
                if (versionId && consumers.length > 0) {
                    try {
                        // 1. Fetch existing consumers
                        const existingConsumersRes = await solaceApiCallAll(`${ENDPOINTS.CONSUMERS}?applicationVersionId=${versionId}`, token);
                        const existingConsumers = existingConsumersRes.data;


                        // 2. Process each desired consumer
                        for (const consumer of consumers) {
                            const existing = existingConsumers.find(c => c.name === consumer.name);

                            // 1. Prepare Queue Config (Defaults if missing)
                            const queueConfig = consumer.queueConfig || {
                                accessType: "exclusive",
                                maxMsgSpoolUsage: 1500,
                                permission: "consume"
                            };

                            const consumerPayload = {
                                applicationVersionId: versionId,
                                name: consumer.name,
                                consumerType: consumer.consumerType,
                                brokerType: "solace",
                                subscriptions: consumer.subscriptions
                            };

                            let consumerId = null;

                            // 3. Create or Update Consumer
                            if (existing) {
                                log(`Updating consumer ${consumer.name}...`);
                                const updateRes = await solaceApiCall('PATCH', `${ENDPOINTS.CONSUMERS}/${existing.id}`, consumerPayload, token);
                                consumerId = existing.id;
                                log(`Updated consumer ${consumer.name}`);
                            } else {
                                log(`Creating consumer ${consumer.name}...`);
                                const createRes = await solaceApiCall('POST', ENDPOINTS.CONSUMERS, consumerPayload, token);
                                consumerId = createRes.data.id;
                                log(`Created consumer ${consumer.name}`);
                            }

                            // 4. Create Queue Configuration (Separate Step)
                            if (consumerId) {
                                log(`Configuring queue for ${consumer.name}...`);
                                const configPayload = {
                                    consumerId: consumerId,
                                    entityId: consumerId,
                                    contextId: appContextId,
                                    contextType: "EVENT_BROKER",
                                    configurationTypeId: "solaceQueue",
                                    value: {
                                        ...queueConfig,
                                        queueName: consumer.name
                                    }
                                };
                                try {
                                    if (!appContextId) throw new Error("No Broker Context available");

                                    // Check if config already exists
                                    let existingConfigs = { data: [] };
                                    try {
                                        const query = `?entityIds=${consumerId}&eventBrokerIds=${appContextId}`;
                                        existingConfigs = await solaceApiCallAll(`${ENDPOINTS.CONFIG_QUEUES}${query}`, token);
                                        log(`Check Queue Config result for ${consumer.name}: found ${existingConfigs.data ? existingConfigs.data.length : 0} configs`);
                                    } catch (fetchErr) {
                                        log(`Warning: Failed to check existing queue config: ${fetchErr.message}`);
                                    }

                                    let matchingConfig = null;
                                    let configsToDelete = [];

                                    if (existingConfigs.data && existingConfigs.data.length > 0) {

                                        matchingConfig = existingConfigs.data.find(c =>
                                            c.value &&
                                            c.value.queueName === consumer.name &&
                                            c.value.accessType === queueConfig.accessType &&
                                            c.value.maxMsgSpoolUsage === queueConfig.maxMsgSpoolUsage &&
                                            c.value.permission === queueConfig.permission
                                        );
                                        configsToDelete = existingConfigs.data.filter(c => c !== matchingConfig);

                                        if (configsToDelete.length > 0) {
                                            if (!confirmDeletions) {
                                                log(`Found ${configsToDelete.length} redundant queue configs for ${consumer.name}. Pending confirmation...`);
                                                pendingDeletions.push({
                                                    type: 'Queue',
                                                    name: consumer.name,
                                                    broker: app.brokerName,
                                                    count: configsToDelete.length,
                                                    operations: configsToDelete.map(c => ({
                                                        method: 'DELETE',
                                                        url: `${ENDPOINTS.CONFIG_QUEUES}/${c.id}`
                                                    }))
                                                });
                                            } else {
                                                log(`Found ${configsToDelete.length} redundant queue configs for ${consumer.name}. Deleting...`);
                                                for (const config of configsToDelete) {
                                                    log(`Deleting old config ${config.id}...`);
                                                    await solaceApiCall('DELETE', `${ENDPOINTS.CONFIG_QUEUES}/${config.id}`, null, token);
                                                }
                                                // Wait for deletions to propagate
                                                log('Waiting 2s for deletions to propagate...');
                                                await new Promise(resolve => setTimeout(resolve, 2000));
                                            }
                                        }
                                    }


                                    const isBlocked = !confirmDeletions && configsToDelete.length > 0;

                                    if (matchingConfig) {
                                        log(`Queue config for ${consumer.name} is up to date. Skipping creation.`);
                                    } else if (isBlocked) {
                                        log(`Skipping creation of queue for ${consumer.name} due to pending deletion.`);
                                    } else {
                                        log(`Creating new queue config for ${consumer.name}...`);
                                        await solaceApiCall('POST', ENDPOINTS.CONFIG_QUEUES, configPayload, token);
                                        log(`Configured queue ${consumer.name}`);
                                    }
                                } catch (configErr) {
                                    log(`Warning: Failed to configure queue ${consumer.name}: ${configErr.message}`);
                                    // Don't fail the whole push, just log warning
                                }
                            }
                        }
                    } catch (e) {
                        log(`Error processing consumers for ${app.name}: ${e.message}`);
                        errorCount++;
                    }
                }
            }
        }
        updateConfig();

        if (pendingDeletions.length > 0) {
            res.status(200).json({ success: true, logs, errorCount, confirmationRequired: true, pendingDeletions });
        } else {
            res.status(200).json({ success: errorCount === 0, logs, errorCount });
        }

    } catch (error) {
        console.error('Push error:', error);
        res.status(500).json({ error: error.message, logs: [] });
    }
}

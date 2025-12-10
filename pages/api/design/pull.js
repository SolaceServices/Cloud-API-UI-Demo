import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { solaceApiCall, solaceApiCallAll } from '../../../lib/solace';
import { ENDPOINTS } from '../../../lib/solace-endpoints';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const token = req.headers.authorization?.split(' ')[1] || req.body.token;
    const { domainId } = req.body;
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

        // Ensure arrays exist
        config.applicationDomains = config.applicationDomains || [];
        config.schemas = config.schemas || [];
        config.events = config.events || [];
        config.applications = config.applications || [];

        const logs = [];
        const log = (msg) => {
            console.log(msg);
            logs.push({ timestamp: new Date().toISOString(), message: msg });
            try {
                fs.appendFileSync(path.join(process.cwd(), 'pull_debug.log'), `[${new Date().toISOString()}] ${msg}\n`);
            } catch (e) { /* ignore */ }
        };

        log(`Starting Pull for Domain ID: ${domainId}...`);

        // 0. Fetch Contexts (Brokers) to map IDs to Names
        let contextMap = {};
        try {
            log('Fetching Broker Contexts...');
            // CRITICAL FIX: Use solaceApiCallAll to handle pagination (default page size might be 20)
            let brokersRes = await solaceApiCallAll(ENDPOINTS.MODELED_EVENT_BROKERS, token);

            // Fallback not typically needed with All, but if primary fails with empty data:
            if (!brokersRes.data || brokersRes.data.length === 0) {
                log('Primary endpoint returned no data, trying fallback...');
                brokersRes = await solaceApiCallAll(ENDPOINTS.MODELED_EVENT_BROKERS_FALLBACK, token);
            }
            if (brokersRes.data) {
                brokersRes.data.forEach(b => {
                    contextMap[b.id] = b.name;
                    log(`Context Map: ${b.id} -> ${b.name}`);
                });
                log(`Mapped ${Object.keys(contextMap).length} broker contexts.`);
            } else {
                log('No broker contexts found.');
            }
        } catch (e) {
            log(`Warning: Failed to fetch broker contexts: ${e.message}`);
        }

        // 1. Fetch Domain Details
        const domainRes = await solaceApiCall('GET', `${ENDPOINTS.APPLICATION_DOMAINS}/${domainId}`, null, token);
        const domainData = domainRes.data;
        log(`Fetched Domain: ${domainData.name}`);

        // Update/Add Domain in Config
        let localDomain = config.applicationDomains.find(d => d.solaceId === domainId);
        if (!localDomain) {
            // Try to find by name
            localDomain = config.applicationDomains.find(d => d.name === domainData.name);
            if (localDomain) {
                log(`Found existing local domain by name: ${localDomain.name}. Linking to Solace ID.`);
                localDomain.solaceId = domainId;
            } else {
                localDomain = {
                    id: uuidv4(),
                    name: domainData.name,
                    description: domainData.description || "",
                    solaceId: domainId
                };
                config.applicationDomains.push(localDomain);
                log(`Added new local domain: ${localDomain.name}`);
            }
        } else {
            localDomain.name = domainData.name; // Update name if changed
            log(`Updated existing local domain: ${localDomain.name}`);
        }

        // 2. Fetch Schemas
        log('Fetching Schemas...');
        const schemasRes = await solaceApiCallAll(`${ENDPOINTS.SCHEMAS}?applicationDomainIds=${domainId}`, token);
        for (const schemaData of schemasRes.data) {
            let localSchema = config.schemas.find(s => s.solaceId === schemaData.id);
            if (!localSchema) {
                // Try to find by name AND domainId
                localSchema = config.schemas.find(s => s.name === schemaData.name && s.domainId === localDomain.id);
                if (localSchema) {
                    localSchema.solaceId = schemaData.id;
                } else {
                    localSchema = {
                        id: uuidv4(),
                        name: schemaData.name,
                        domainId: localDomain.id,
                        versions: [],
                        solaceId: schemaData.id
                    };
                    config.schemas.push(localSchema);
                }
            }

            // Fetch Schema Versions
            const versionsRes = await solaceApiCallAll(`${ENDPOINTS.SCHEMA_VERSIONS}?schemaIds=${schemaData.id}`, token);
            localSchema.versions = versionsRes.data.map(v => ({
                id: uuidv4(), // New local ID for version
                version: v.version,
                stateId: v.stateId,
                content: v.content ? JSON.parse(v.content) : {},
                solaceId: v.id
            }));
            log(`Pulled Schema: ${schemaData.name} (${localSchema.versions.length} versions)`);
        }

        // 3. Fetch Events
        log('Fetching Events...');
        const eventsRes = await solaceApiCallAll(`${ENDPOINTS.EVENTS}?applicationDomainIds=${domainId}`, token);
        for (const eventData of eventsRes.data) {
            let localEvent = config.events.find(e => e.solaceId === eventData.id);
            if (!localEvent) {
                // Try to find by name AND domainId
                localEvent = config.events.find(e => e.name === eventData.name && e.domainId === localDomain.id);
                if (localEvent) {
                    localEvent.solaceId = eventData.id;
                } else {
                    localEvent = {
                        id: uuidv4(),
                        name: eventData.name,
                        domainId: localDomain.id,
                        versions: [],
                        solaceId: eventData.id
                    };
                    config.events.push(localEvent);
                }
            }

            // Fetch Event Versions
            const versionsRes = await solaceApiCallAll(`${ENDPOINTS.EVENT_VERSIONS}?eventIds=${eventData.id}`, token);
            localEvent.versions = versionsRes.data.map(v => {
                // Find linked Schema Version
                let schemaVersionId = null;
                if (v.schemaVersionId) {
                    // We need to find the local ID of the schema version
                    // We look up by solaceId in our config
                    const linkedSchema = config.schemas.find(s => s.versions.some(sv => sv.solaceId === v.schemaVersionId));
                    const linkedSchemaVersion = linkedSchema?.versions.find(sv => sv.solaceId === v.schemaVersionId);
                    if (linkedSchemaVersion) schemaVersionId = linkedSchemaVersion.id;
                }

                return {
                    id: uuidv4(),
                    version: v.version,
                    stateId: v.stateId,
                    topic: v.deliveryDescriptor?.address?.addressLevels?.map(l => l.name).join('/') || '',
                    schemaVersionId: schemaVersionId, // Local ID
                    solaceId: v.id
                };
            });
            log(`Pulled Event: ${eventData.name} (${localEvent.versions.length} versions)`);
        }

        // 4. Fetch Applications
        log('Fetching Applications...');
        const appsRes = await solaceApiCallAll(`${ENDPOINTS.APPLICATIONS}?applicationDomainIds=${domainId}`, token);
        for (const appData of appsRes.data) {
            // STRICT FILTER: Ensure app belongs to the requested domain
            if (appData.applicationDomainId !== domainId) {
                log(`Skipping App: ${appData.name} (Domain Mismatch: ${appData.applicationDomainId} != ${domainId})`);
                continue;
            }

            let localApp = config.applications.find(a => a.solaceId === appData.id);
            if (!localApp) {
                // Try to find by name AND domainId
                localApp = config.applications.find(a => a.name === appData.name && a.domainId === localDomain.id);
                if (localApp) {
                    localApp.solaceId = appData.id;
                } else {
                    localApp = {
                        id: uuidv4(),
                        name: appData.name,
                        domainId: localDomain.id,
                        brokerName: "", // Cannot fetch this easily from App object, usually set manually
                        brokerConfigs: [], // Initialize empty array for multi-broker configs
                        versions: [],
                        solaceId: appData.id
                    };
                    config.applications.push(localApp);
                }
            }

            // Ensure brokerConfigs exists
            if (!localApp.brokerConfigs) localApp.brokerConfigs = [];

            // Fetch Client Username (if any)
            // Fetch Client Usernames (Multi-Broker)
            try {
                const clientUserConfigsRes = await solaceApiCallAll(`${ENDPOINTS.CONFIG_CLIENT_USERNAMES}?entityIds=${appData.id}`, token);
                if (clientUserConfigsRes.data && clientUserConfigsRes.data.length > 0) {
                    clientUserConfigsRes.data.forEach(uEntry => {
                        const configVal = uEntry.value;



                        if (configVal && configVal.clientUsername) {
                            localApp.clientUsername = configVal.clientUsername; // Fallback
                            log(`Imported Client Username: ${configVal.clientUsername} for Broker: ${brokerName}`);

                            const existingConfig = localApp.brokerConfigs.find(bc => bc.brokerName === brokerName || (ctxId && bc.brokerContextId === ctxId));
                            // Check if configVal has accessType or we can infer it
                            const importedAccessType = configVal.accessType || "reference";

                            if (existingConfig) {
                                existingConfig.clientUsername = configVal.clientUsername;
                                existingConfig.accessType = importedAccessType;
                                if (ctxId) existingConfig.brokerContextId = ctxId;
                                if (brokerName !== "Imported Broker" && existingConfig.brokerName === "Imported Broker") {
                                    existingConfig.brokerName = brokerName;
                                }
                            } else {
                                localApp.brokerConfigs.push({
                                    brokerName: brokerName,
                                    brokerContextId: ctxId,
                                    clientUsername: configVal.clientUsername,
                                    clientPassword: "",
                                    accessType: importedAccessType
                                });
                            }
                        }
                    });
                }
            } catch (e) {
                log(`Warning: Failed to fetch Client Username for ${appData.name}: ${e.message}`);
            }

            // Fetch App Versions
            const versionsRes = await solaceApiCallAll(`${ENDPOINTS.APPLICATION_VERSIONS}?applicationIds=${appData.id}`, token);

            // BACKUP existing local configurations (Queue Configs are inside consumers, inside versions)
            const existingConsumerConfigs = {}; // Map: version -> consumerName -> { queueConfigs, queueConfig }
            if (localApp.versions) {
                localApp.versions.forEach(ver => {
                    if (ver.consumers) {
                        ver.consumers.forEach(con => {
                            if (!existingConsumerConfigs[ver.version]) existingConsumerConfigs[ver.version] = {};
                            existingConsumerConfigs[ver.version][con.name] = {
                                queueConfigs: con.queueConfigs,
                                queueConfig: con.queueConfig
                            };
                        });
                    }
                });
            }

            localApp.versions = []; // Reset versions to rebuild
            for (const v of versionsRes.data) {
                let consumers = [];

                // Fetch Consumers for this version (ALL versions, not just latest)
                try {
                    const consumersRes = await solaceApiCallAll(`${ENDPOINTS.CONSUMERS}?applicationVersionIds=${v.id}`, token);
                    // log(`Fetched ${consumersRes.data.length} consumers for App Version ${v.version} (ID: ${v.id})`); // Reduce log spam

                    for (const c of consumersRes.data) {
                        // Fetch Queue Config for this consumer
                        let queueConfig = {
                            accessType: "exclusive", // Default
                            maxMsgSpoolUsage: 1500,
                            permission: "consume",
                            respectTtlEnabled: true
                        };

                        // RESTORE local configurations if they exist
                        let restoredQueueConfigs = undefined;
                        if (existingConsumerConfigs[v.version] && existingConsumerConfigs[v.version][c.name]) {
                            const saved = existingConsumerConfigs[v.version][c.name];
                            if (saved.queueConfigs) {
                                restoredQueueConfigs = saved.queueConfigs;
                            }
                        }

                        // Initialize restoredQueueConfigs if empty so we can add portal configs
                        if (!restoredQueueConfigs) restoredQueueConfigs = {};

                        // Fetch Queue Configs from Portal (Multi-Broker)
                        try {
                            const queueConfigsRes = await solaceApiCallAll(`${ENDPOINTS.CONFIG_QUEUES}?entityIds=${c.id}`, token);
                            if (queueConfigsRes.data && queueConfigsRes.data.length > 0) {
                                queueConfigsRes.data.forEach(qEntry => {
                                    const qVal = qEntry.value;



                                    if (qVal) {
                                        const newConfig = {
                                            accessType: qVal.accessType,
                                            maxMsgSpoolUsage: qVal.maxMsgSpoolUsage,
                                            permission: qVal.permission,
                                            respectTtlEnabled: qVal.respectTtlEnabled !== false,
                                            maxTtl: qVal.maxTtl
                                        };

                                        // Update/Set config using ID as key if available, fallback to Name (but user prefers ID)
                                        const key = ctxId || brokerName;
                                        restoredQueueConfigs[key] = newConfig;

                                        // Ensure brokerConfigs has this broker
                                        let existingBrokerConfig = localApp.brokerConfigs.find(bc => bc.brokerName === brokerName || (ctxId && bc.brokerContextId === ctxId));

                                        if (existingBrokerConfig) {
                                            if (ctxId && !existingBrokerConfig.brokerContextId) existingBrokerConfig.brokerContextId = ctxId;
                                            if (brokerName !== "Imported Broker" && existingBrokerConfig.brokerName === "Imported Broker") existingBrokerConfig.brokerName = brokerName;
                                        } else {
                                            localApp.brokerConfigs.push({
                                                brokerName: brokerName,
                                                brokerContextId: ctxId,
                                                clientUsername: "", // Unknown if not found yet
                                                clientPassword: "",
                                                accessType: "reference"
                                            });
                                        }
                                    }
                                });
                            }
                        } catch (e) {
                            // Ignore queue config fetch errors
                        }

                        // Determine "default" queueConfig omitted as requested


                        consumers.push({
                            name: c.name,
                            solaceId: c.id, // Add Solace ID as requested
                            type: c.consumerType,
                            subscriptions: c.subscriptions ? c.subscriptions.map(s => {
                                // Map attractedEventVersionId to local ID
                                let attractedEventVersionId = null;
                                if (s.attractedEventVersionIds && s.attractedEventVersionIds.length > 0) {
                                    const evId = s.attractedEventVersionIds[0].eventVersionId;
                                    const linkedEvent = config.events.find(e => e.versions.some(ev => ev.solaceId === evId));
                                    const linkedEventVersion = linkedEvent?.versions.find(ev => ev.solaceId === evId);
                                    if (linkedEventVersion) attractedEventVersionId = linkedEventVersion.id;
                                }
                                return {
                                    subscriptionType: s.subscriptionType,
                                    value: s.value,
                                    attractedEventVersionId: attractedEventVersionId
                                };
                            }) : [],

                            queueConfigs: restoredQueueConfigs // Restore the multi-broker configs
                        });
                    }
                } catch (e) {
                    log(`Warning: Failed to fetch consumers for ${appData.name} v${v.version}: ${e.message}`);
                }

                // Map Produced/Consumed Events
                const consumedEventVersionIds = (v.declaredConsumedEventVersionIds || []).map(id => {
                    const linkedEvent = config.events.find(e => e.versions.some(ev => ev.solaceId === id));
                    return linkedEvent?.versions.find(ev => ev.solaceId === id)?.id;
                }).filter(Boolean);

                const producedEventVersionIds = (v.declaredProducedEventVersionIds || []).map(id => {
                    const linkedEvent = config.events.find(e => e.versions.some(ev => ev.solaceId === id));
                    return linkedEvent?.versions.find(ev => ev.solaceId === id)?.id;
                }).filter(Boolean);

                localApp.versions.push({
                    version: v.version,
                    stateId: v.stateId,
                    consumedEventVersionIds,
                    producedEventVersionIds,
                    id: uuidv4(),
                    solaceId: v.id,
                    consumers: consumers
                });
            }
            log(`Pulled App: ${appData.name} (${localApp.versions.length} versions)`);
        }

        // Save Config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        log('Successfully updated solace-config.json');

        res.status(200).json({ success: true, logs });

    } catch (error) {
        console.error(error);
        const status = error.message.includes('(401)') ? 401 : 500;
        res.status(status).json({ success: false, error: error.message, logs: [] });
    }
}

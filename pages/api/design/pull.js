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
        };

        log(`Starting Pull for Domain ID: ${domainId}...`);

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
                        versions: [],
                        solaceId: appData.id
                    };
                    config.applications.push(localApp);
                }
            }

            // Fetch App Versions
            const versionsRes = await solaceApiCallAll(`${ENDPOINTS.APPLICATION_VERSIONS}?applicationIds=${appData.id}`, token);

            // Sort versions to find the latest
            const sortedVersions = versionsRes.data.sort((a, b) => {
                const vA = a.version.split('.').map(Number);
                const vB = b.version.split('.').map(Number);
                for (let i = 0; i < Math.max(vA.length, vB.length); i++) {
                    const numA = vA[i] || 0;
                    const numB = vB[i] || 0;
                    if (numA > numB) return -1;
                    if (numA < numB) return 1;
                }
                return 0;
            });

            const latestVersionId = sortedVersions.length > 0 ? sortedVersions[0].id : null;

            localApp.versions = []; // Reset versions to rebuild
            for (const v of versionsRes.data) {
                let consumers = [];

                // OPTIMIZATION: Only fetch consumers for the latest version
                if (v.id === latestVersionId) {
                    // Fetch Consumers for this version
                    // Note: Solace API often uses plural 'Ids' for filters. Switching to applicationVersionIds.
                    const consumersRes = await solaceApiCallAll(`${ENDPOINTS.CONSUMERS}?applicationVersionIds=${v.id}`, token);
                    log(`Fetched ${consumersRes.data.length} consumers for App Version ${v.version} (ID: ${v.id})`);
                    consumers = consumersRes.data.map(c => ({
                        name: c.name,
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
                        // Queue Config is not directly in Consumer object, it's a separate config object.
                        // For now, we might skip detailed queue config or try to fetch it if critical.
                        // The user asked to "dump resources", basic consumer info might be enough.
                        queueConfig: {
                            accessType: "exclusive", // Default
                            maxMsgSpoolUsage: 1500,
                            permission: "consume",
                            respectTtlEnabled: true
                        }
                    }));
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

# Core Logic Flows

This document details the internal logic of the application's primary workflows.

## 1. Pull (Import)
**Source**: `ui/pages/api/design/pull.js`

The Pull operation imports existing designs from Solace Event Portal into the local workspace.

### Algorithm (Pseudo-Code)
```pseudo
FUNCTION Pull(token, domainId):
    config = LoadLocalConfig("solace-config.json")
    
    // 0. Fetch Broker Contexts (Map ID -> Name)
    brokers = SolaceAPI.GET("/modeledEventBrokers")
    contextMap = { b.id: b.name FOR b IN brokers }

    // 1. Fetch Domain
    domainData = SolaceAPI.GET("/applicationDomains/{domainId}")
    localDomain = FindOrAddDomain(config, domainData)

    // 2. Fetch Schemas
    schemas = SolaceAPI.GET("/schemas?applicationDomainId={domainId}")
    FOR EACH schema IN schemas:
        localSchema = FindOrAddSchema(config, schema)
        versions = SolaceAPI.GET("/schemaVersions?schemaId={schema.id}")
        localSchema.versions = MapVersions(versions)

    // 3. Fetch Events
    events = SolaceAPI.GET("/events?applicationDomainId={domainId}")
    FOR EACH event IN events:
        localEvent = FindOrAddEvent(config, event)
        versions = SolaceAPI.GET("/eventVersions?eventId={event.id}")
        localEvent.versions = []
        FOR EACH v IN versions:
             // Link to local Schema Version ID
             schemaVerId = FindLocalSchemaVersionId(v.schemaVersionId)
             localEvent.versions.ADD({ ..., schemaVersionId: schemaVerId })

    // 4. Fetch Applications
    apps = SolaceAPI.GET("/applications?applicationDomainId={domainId}")
    FOR EACH app IN apps:
        localApp = FindOrAddApp(config, app)
        
        // 4a. Fetch Client Usernames (Broker Configuration)
        clientUsernames = SolaceAPI.GET("/clientUsernames?entityId={app.id}")
        localApp.brokerConfigs = []
        FOR EACH cu IN clientUsernames:
             ctxId = cu.contextId
             // Resolve Broker Name: Try Context Map -> Use Context ID -> Fallback "Imported Broker"
             brokerName = contextMap[ctxId] OR ctxId OR "Imported Broker"
             
             localApp.brokerConfigs.ADD({
                 brokerName: brokerName,
                 brokerContextId: ctxId,
                 clientUsername: cu.value.clientUsername,
                 configId: cu.id, // Capture Solace ID (for Orphan detection)
                 configType: "Client Username"
             })

        // 4b. Fetch Versions & Consumers
        versions = SolaceAPI.GET("/applicationVersions?applicationId={app.id}")
        localApp.versions = []
        
        FOR EACH v IN versions:
            consumers = SolaceAPI.GET("/consumers?applicationVersionId={v.id}")
            mappedConsumers = []
            
            FOR EACH c IN consumers:
                 // Fetch Queue Configs (Multi-Broker)
                 queueConfigsRes = SolaceAPI.GET("/queues?entityId={c.id}")
                 restoredQueueConfigs = {}
                 
                 FOR EACH qEntry IN queueConfigsRes:
                      ctxId = qEntry.contextId
                      brokerName = contextMap[ctxId] OR ctxId OR "Imported Broker"
                      
                      // Store Config mapped by Broker
                      restoredQueueConfigs[brokerName] = {
                          accessType: qEntry.value.accessType,
                          ...
                          configId: qEntry.id, // Capture ID
                          isOrphan: !ctxId
                      }
                      
                      // Sync Broker Config if missing (handle orphans)
                      IF brokerName NOT IN localApp.brokerConfigs:
                           localApp.brokerConfigs.ADD({ 
                               brokerName: brokerName, 
                               configType: "Queue Configuration",
                               isOrphan: true 
                           })

                 mappedConsumers.ADD({
                    name: c.name,
                    subscriptions: MapSubscriptions(c.subscriptions),
                    queueConfigs: restoredQueueConfigs
                })
            
            localApp.versions.ADD({
                version: v.version,
                consumers: mappedConsumers,
                consumedEvents: MapEventLinks(v.consumedEventVersionIds),
                producedEvents: MapEventLinks(v.producedEventVersionIds)
            })

    SaveConfig(config)
    RETURN Success
```

## 2. Sync Operation
**Source**: `ui/pages/api/sync.js`

The Sync operation provides a unified view of the synchronization status.
1.  **High-Level**: Checks existence of all resources (Domains, Schemas, Events, Applications).
2.  **Deep-Dive (Applications)**: If an Application exists locally and remotely, it performs a deep inspection of its Versions and Consumers.

### Algorithm (Pseudo-Code)
```pseudo
FUNCTION Sync(token):
    config = LoadLocalConfig("solace-config.json")
    report = { domains: [], schemas: [], events: [], apps: [] }

    // 1. Fetch ALL Cloud Resources (Parallel)
    cloudDomains = SolaceAPI.GET("/applicationDomains")
    cloudSchemas = SolaceAPI.GET("/schemas")
    cloudEvents  = SolaceAPI.GET("/events")
    cloudApps    = SolaceAPI.GET("/applications")

    // Helper: Check Status
    FUNCTION Check(localItem, cloudList):
        status = "synced"
        details = []
        
        IF localItem.solaceId AND localItem.solaceId NOT IN cloudList:
             status = "missing_cloud" (ID mismatch)
        ELSE IF localItem.name IN cloudList BUT localItem.solaceId IS NULL:
             status = "not_pushed" (Exists but not linked)
        ELSE IF localItem.solaceId IS NULL:
             status = "not_pushed" (New)
        
        RETURN { status, details, remoteItem }

    // 2. Compare All
    FOR EACH domain IN config.applicationDomains: report.domains.ADD(Check(domain, cloudDomains))
    FOR EACH schema IN config.schemas: report.schemas.ADD(Check(schema, cloudSchemas))
    FOR EACH event  IN config.events:  report.events.ADD(Check(event, cloudEvents))
    
    // 3. Deep Check Applications
    FOR EACH app IN config.applications:
        result = Check(app, cloudApps)
        
        // Only deep check if high-level is synced
        IF result.status == "synced":
             remoteVersions = SolaceAPI.GET("/applicationVersions?applicationId={result.remoteItem.id}")
             
             FOR EACH ver IN app.versions:
                 IF ver.version NOT IN remoteVersions:
                     result.status = "out_of_sync"
                     result.details.ADD("Version {ver.version} missing")
                 ELSE:
                     remoteConsumers = SolaceAPI.GET("/consumers?versionId={remoteVer.id}")
                     FOR EACH con IN ver.consumers:
                         IF con.name NOT IN remoteConsumers:
                             result.status = "out_of_sync"
                             result.details.ADD("Consumer {con.name} missing")

        report.apps.ADD(result)

    RETURN report
```

## 3. Push (Design)
**Source**: `ui/pages/api/design/push.js`

The Push operation promotes local designs to Solace Event Portal. It enforces a strict dependency order.

### Algorithm (Pseudo-Code)
```pseudo
FUNCTION Push(token, domainId, pendingDeletions):
    config = LoadLocalConfig()
    
    // 0. Fetch Contexts (Brokers)
    brokers = SolaceAPI.GET("/modeledEventBrokers")

    // 1. Handle Deletions (if confirmed)
    IF pendingDeletions IS NOT EMPTY:
        DELETE items in pendingDeletions

    // 2. Push Schemas (Dependency Level 1)
    FOR EACH schema IN config.schemas:
        remoteSchema = EnsureResourceExists("schema", schema)
        FOR EACH ver IN schema.versions:
            IF VersionMissing(remoteSchema, ver.version):
                SolaceAPI.POST("/schemaVersions", { schemaId: remoteSchema.id, ... })

    // 3. Push Events (Dependency Level 2)
    FOR EACH event IN config.events:
        remoteEvent = EnsureResourceExists("event", event)
        FOR EACH ver IN event.versions:
            // Resolve Schema Version ID
            schemaVerId = GetRemoteSchemaVersionId(ver.schemaVersionId)
            IF VersionMissing(remoteEvent, ver.version):
                SolaceAPI.POST("/eventVersions", { 
                    eventId: remoteEvent.id, 
                    schemaVersionId: schemaVerId,
                    ... 
                })

    // 4. Push Applications (Dependency Level 3)
    FOR EACH app IN config.applications:
        remoteApp = EnsureResourceExists("application", app)
        
        // 4a. Push Versions
        FOR EACH ver IN app.versions:
             // Map Event IDs
             consumedIDs = MapEventVersions(ver.consumedEventVersionIds)
             producedIDs = MapEventVersions(ver.producedEventVersionIds)
             
             IF VersionMissing(remoteApp, ver.version):
                 appVerId = SolaceAPI.POST("/applicationVersions", { 
                     applicationId: remoteApp.id,
                     declaredConsumedEventVersionIds: consumedIDs,
                     declaredProducedEventVersionIds: producedIDs
                     ... 
                 })
        
        // 4b. Configure Client Usernames (Per Broker)
        FOR EACH brokerConfig IN app.brokerConfigs:
             brokerContextId = FindBrokerId(brokers, brokerConfig.brokerName)
             IF brokerContextId FOUND:
                  SolaceAPI.POST("/clientUsernames", {
                      entityId: remoteApp.id,
                      contextId: brokerContextId,
                      value: { clientUsername: brokerConfig.clientUsername, ... }
                  })

        // 4c. Configure Consumers & Queues
        FOR EACH ver IN app.versions:
             remoteVer = GetRemoteVersion(remoteApp.id, ver.version)
             FOR EACH consumer IN ver.consumers:
                  consumerId = EnsureConsumerExists(remoteVer.id, consumer)
                  
                  // Iterating Brokers to Configure Queues
                  FOR EACH brokerConfig IN app.brokerConfigs:
                       brokerContextId = FindBrokerId(brokers, brokerConfig.brokerName)
                       
                       // Find Specific Config (Context ID > Broker Name > Fallback)
                       specificConfig = consumer.queueConfigs[brokerContextId] OR consumer.queueConfigs[brokerConfig.brokerName]
                       
                       IF specificConfig FOUND AND brokerContextId FOUND:
                            SolaceAPI.POST("/queues", {
                                entityId: consumerId,
                                contextId: brokerContextId,
                                value: { 
                                    queueName: specificConfig.queueName,
                                    accessType: specificConfig.accessType,
                                    ...
                                }
                            })

    RETURN Success
```

## 5. Configuration Management
**Source**: `ui/pages/api/config.js`

-   **Read**: Reads `solace-config.json`. Defaults to an empty structure if the file is missing or invalid.
-   **Write**: Overwrites `solace-config.json` with the new state.


export const SOLACE_API_BASE = 'https://api.solace.cloud/api/v2';

export const ENDPOINTS = {
    // Architecture
    APPLICATION_DOMAINS: '/architecture/applicationDomains',
    SCHEMAS: '/architecture/schemas',
    SCHEMA_VERSIONS: '/architecture/schemaVersions',
    EVENTS: '/architecture/events',
    EVENT_VERSIONS: '/architecture/eventVersions',
    APPLICATIONS: '/architecture/applications',
    APPLICATION_VERSIONS: '/architecture/applicationVersions',
    CONSUMERS: '/architecture/consumers',

    // Configurations
    CONFIG_QUEUES: '/architecture/designer/configuration/solaceQueues',
    CONFIG_CLIENT_USERNAMES: '/architecture/designer/configuration/solaceClientUsernames',

    // Runtime / Environment
    ENVIRONMENTS: '/architecture/environments',
    EVENT_MESHES: '/architecture/eventMeshes',
    MODELED_EVENT_BROKERS: '/architecture/about/modeledEventBrokers', // Primary
    MODELED_EVENT_BROKERS_FALLBACK: '/architecture/modeledEventBrokers', // Fallback
    EVENT_BROKER_SERVICES: '/missionControl/eventBrokerServices',
    APPLICATION_DEPLOYMENTS: '/architecture/runtimeManagement/applicationDeployments'
};
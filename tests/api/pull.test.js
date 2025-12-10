
import handler from '../../pages/api/design/pull';
import { solaceApiCallAll, solaceApiCall } from '../../lib/solace';
import fs from 'fs';
import { createMocks } from 'node-mocks-http';
import path from 'path';

// Mocks
jest.mock('fs');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));
jest.mock('../../lib/solace', () => ({
    solaceApiCall: jest.fn(),
    solaceApiCallAll: jest.fn()
}));

// Load Fixtures
const brokersFixture = require('../fixtures/solace-responses/brokers.json');
const clientUsersFixture = require('../fixtures/solace-responses/client-usernames.json');
const queuesFixture = require('../fixtures/solace-responses/queues.json');

describe('Pull API Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should pull configuration and produce stable output with multi-broker support', async () => {
        // 1. Mock File System
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            applicationDomains: [],
            applications: [],
            events: [],
            schemas: []
        }));
        fs.writeFileSync.mockImplementation(() => { });

        // 2. Mock Solace API Responses
        solaceApiCallAll.mockImplementation(async (url) => {
            if (url.includes('modeledEventBrokers')) {
                return { data: brokersFixture };
            }
            if (url.includes('applicationDomains')) {
                return { data: [{ id: 'dom-1', name: 'Test Domain' }] };
            }
            if (url.includes('schemas')) {
                return { data: [] };
            }
            if (url.includes('events')) {
                return { data: [] };
            }
            if (url.includes('applications')) {
                return { data: [{ id: 'app-1', name: 'Test App', applicationDomainId: 'dom-1' }] };
            }
            if (url.includes('ClientUsernames')) {
                return { data: clientUsersFixture };
            }
            if (url.includes('applicationVersions')) {
                return {
                    data: [{
                        id: 'ver-1',
                        version: '1.0.0',
                        stateId: '1',
                        declaredConsumedEventVersionIds: [],
                        declaredProducedEventVersionIds: []
                    }]
                };
            }
            if (url.includes('Queues')) {
                // Return queues for the mock consumer
                return { data: queuesFixture };
            }
            if (url.includes('consumers')) {
                return {
                    data: [{
                        id: 'con-1',
                        name: 'test-consumer',
                        consumerType: 'eventQueue',
                        subscriptions: []
                    }]
                };
            }
            return { data: [] };
        });

        solaceApiCall.mockImplementation(async (method, url) => {
            if (url.includes('applicationDomains') && url.includes('dom-1')) {
                return { data: { id: 'dom-1', name: 'Test Domain' } };
            }
            return { data: {} };
        });

        // 3. Create HTTP Request
        const { req, res } = createMocks({
            method: 'POST',
            body: {
                token: 'mock-token',
                domainId: 'dom-1' // Optional filter in real code, matches mock domain
            }
        });

        // 4. Run Handler
        await handler(req, res);

        // 5. Assertions
        expect(res._getStatusCode()).toBe(200);
        expect(fs.writeFileSync).toHaveBeenCalled();

        // 6. Snapshot Logic
        const writtenConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);

        // Assertions on specific fields to verify fixes
        const app = writtenConfig.applications[0];

        // Verify Legacy Fields are GONE
        expect(app.brokerName).toBeUndefined();
        expect(app.clientUsername).toBeUndefined();

        // Verify Broker Configs are Populated
        expect(app.brokerConfigs).toHaveLength(2);
        expect(app.brokerConfigs[0].brokerName).toBe('Test Broker 1');
        expect(app.brokerConfigs[0].clientUsername).toBe('client-user-1');

        // Verify Consumer Queue Configs
        const consumer = app.versions[0].consumers[0];
        expect(consumer.queueConfigs).toBeDefined();
        // Should be keyed by Context ID or Name (logic prefers Context ID if available)
        // In fixture we use 'ctx-broker-1'
        expect(consumer.queueConfigs['ctx-broker-1']).toBeDefined();
        expect(consumer.queueConfigs['ctx-broker-1'].accessType).toBe('exclusive');

        // Ensure Snapshot Consistency
        expect(writtenConfig).toMatchSnapshot();
    });
});

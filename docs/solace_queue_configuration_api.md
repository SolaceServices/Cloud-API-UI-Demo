# Solace Queue Configuration API Documentation

## Endpoint
**POST** `https://api.solace.cloud/api/v2/architecture/designer/configuration/solaceQueues`  
(Reference: `https://api.solace.dev/cloud/reference/createsolacequeueconfiguration`)

## Permissions
Token must have: `application:update:*`

## Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contextType` | string (enum) | No | The type of runtime service. Allowed: `EVENT_BROKER` |
| `contextId` | string | **Yes** | The unique identifier of the runtime service (Event Broker ID) |
| `entityId` | string | **Yes** | The unique identifier of the designer entity (Consumer ID). Length ≥ 1 |
| `templateId` | string | No | The unique identifier of the configuration template |
| `value` | object | No | The configuration value in JSON format (queue-specific settings) |
| `type` | string | No | The type of configuration |
| `workInProgress` | boolean | No | Indicates if the configuration is a draft/work in progress |

## Example Payload

```json
{
  "contextType": "EVENT_BROKER",
  "contextId": "service-id-123",
  "entityId": "consumer-id-456",
  "templateId": "template-789",
  "value": {
    "name": "myQueue",
    "ingressEnabled": true,
    "egressEnabled": true
  },
  "type": "solaceQueues",
  "workInProgress": false
}
```

## Notes
- The `value` object is a flexible JSON container for queue-specific configuration parameters.
- The exact schema of the `value` object is not strictly defined in the API docs - it accepts queue properties.
- The `contextId` should be the Event Broker ID from the `modeledEventBrokers` endpoint.
- The `entityId` is the Consumer ID from Event Portal.

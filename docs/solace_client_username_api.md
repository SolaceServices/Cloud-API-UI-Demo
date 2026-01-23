# Solace Client Username Configuration API Documentation

## Endpoint
**POST** `https://api.solace.cloud/api/v2/architecture/designer/configuration/solaceClientUsernames`  
(Reference: `https://api.solace.dev/cloud/reference/createsolaceclientusernameconfiguration`)

## Permissions
Token must have: `application:update:*`

## Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contextType` | string (enum) | No | The type of runtime service. Allowed: `EVENT_BROKER` |
| `contextId` | string | **Yes** | The unique identifier of the runtime service (Event Broker ID) |
| `entityId` | string | **Yes** | The unique identifier of the designer entity (Application ID). Length ≥ 1 |
| `templateId` | string | No | The unique identifier of the configuration template |
| `value` | object | No | The configuration value in JSON format (client username settings) |
| `type` | string | No | The type of configuration |
| `workInProgress` | boolean | No | Indicates if the configuration is a draft/work in progress |

## Example Payload

```json
{
  "contextType": "EVENT_BROKER",
  "contextId": "broker-service-id-123",
  "entityId": "application-id-456",
  "value": {
    "clientUsername": "my-app-user",
    "password": "secret123"
  },
  "type": "solaceClientUsernames",
  "workInProgress": false
}
```

## Notes
- The `value` object contains the actual client username and password configuration.
- The `contextId` should be the Event Broker ID from the `modeledEventBrokers` endpoint.
- The `entityId` is the Application ID from Event Portal.

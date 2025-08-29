# Payment Security Enhancement

This document describes the security enhancements implemented for the payment simulation API.

## Authentication

### API Key Authentication
All API endpoints (except `/health`) require authentication via API key.

**Methods to provide API key:**
- Header: `x-api-key: your-api-key`
- Query parameter: `?apiKey=your-api-key`

**Example:**
```bash
curl -H "x-api-key: test-api-key" http://localhost:3000/api/status
```

### Configuration
API keys are configured via environment variables:
```bash
VALID_API_KEYS=key1,key2,key3
```

## Rate Limiting

The API implements rate limiting to prevent abuse:
- **Window:** 15 minutes
- **Limit:** 100 requests per IP per window
- **Headers:** Rate limit information is returned in response headers

When rate limit is exceeded, the API returns:
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": "15 minutes"
}
```

## Request Validation

### Payment Simulation Validation
The `/api/simulate-payment` endpoint validates:

1. **Mode Detection:** Automatically detects Token mode vs Direct mode
2. **Required Fields:** Ensures all necessary fields are present
3. **Format Validation:** Validates data formats and structures

**Token Mode Requirements:**
- `stripeToken` (must start with "tok_")
- `browserEnv` with `userAgent` and `viewport`
- Optional: `cardholderName`

**Direct Mode Requirements:**
- `cardInfo` with `name`, `number`, `expMonth`, `expYear`, `cvv`
- `browserEnv` with `userAgent` and `viewport`
- Card number must be 13-19 digits

## Security Logging

### Audit Trail
All payment requests are logged with:
- Timestamp and request ID
- Source IP and User Agent
- API key ID (truncated)
- Processing mode and time
- Success/failure status

### Privacy Protection
Sensitive data is protected in logs:
- Card numbers: Only last 4 digits logged
- API keys: Only first 8 characters logged
- Tokens: Truncated for security

### Security Events
Security-related events are logged separately:
- Authentication failures
- Rate limit violations
- Processing errors

## Environment Configuration

### Required Variables
```bash
VALID_API_KEYS=comma,separated,keys
```

### Optional Variables
```bash
PORT=3000
NODE_ENV=production
```

### Validation
The server validates all required environment variables on startup and exits if any are missing.

## Endpoints

### Public Endpoints
- `GET /health` - Health check (no authentication required)

### Protected Endpoints
- `GET /api/status` - API status and rate limit info
- `POST /api/simulate-payment` - Payment simulation

## Error Responses

### Authentication Errors
```json
{
  "error": "Unauthorized",
  "message": "API key is required. Provide it in x-api-key header or apiKey query parameter"
}
```

### Validation Errors
```json
{
  "error": "Invalid request format",
  "message": "Use either Token mode (stripeToken + cardholderName) or Direct mode (cardInfo). Cannot use both or neither."
}
```

### Rate Limit Errors
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": "15 minutes"
}
```

## Testing

Start the server:
```bash
npm start
```

Test health endpoint:
```bash
curl http://localhost:3000/health
```

Test authenticated endpoint:
```bash
curl -H "x-api-key: test-api-key" http://localhost:3000/api/status
```

Test payment simulation:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key" \
  -d '{
    "stripeToken": "tok_test123",
    "browserEnv": {
      "userAgent": "Mozilla/5.0...",
      "viewport": {"width": 1920, "height": 1080}
    }
  }' \
  http://localhost:3000/api/simulate-payment
```
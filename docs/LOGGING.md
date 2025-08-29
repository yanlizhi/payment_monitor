# Enhanced Secure Logging System

## Overview

The Payment Security API implements a comprehensive structured logging system designed for production environments, security compliance, and integration with log aggregation systems like ELK Stack. All logs are output as structured JSON to stdout for container-friendly log collection.

## Features

### 🔒 Security-First Design
- **Sensitive Data Protection**: Automatically sanitizes credit card numbers, tokens, and API keys
- **PCI DSS Compliance**: Only logs last 4 digits of card numbers and token IDs
- **Audit Trail**: Complete request tracking with unique request IDs
- **Security Event Monitoring**: Dedicated logging for authentication failures, rate limiting, and suspicious activities

### 📊 Structured JSON Format
- **ELK Stack Ready**: Standardized format with `@timestamp` field for Elasticsearch
- **Container Friendly**: All logs output to stdout for easy collection
- **Searchable**: Consistent field naming and categorization
- **Contextual**: Rich metadata including request IDs, IP addresses, and user agents

### 🎯 Comprehensive Coverage
- **Payment Requests**: Detailed logging of both Token and Direct mode transactions
- **Security Events**: Authentication failures, rate limiting, unauthorized access
- **System Events**: Server startup/shutdown, health checks, configuration changes
- **Application Errors**: Uncaught exceptions with full context
- **Performance Metrics**: Request timing, memory usage, system resources

## Log Categories

### 1. Payment Request Logs (`payment_request`)
Logs all payment simulation requests with sanitized data:

```json
{
  "@timestamp": "2025-08-26T07:16:07.263Z",
  "level": "INFO",
  "category": "payment_request",
  "message": "Payment simulation request processed",
  "service": "payment-security-api",
  "version": "1.0.0",
  "environment": "development",
  "request": {
    "id": "req_1724656567263_abc123def",
    "ip": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "method": "POST",
    "url": "/api/simulate-payment"
  },
  "authentication": {
    "apiKeyId": "sk_test_1",
    "apiKeyTruncated": "sk_test_..."
  },
  "payment": {
    "mode": "token",
    "success": true,
    "processingTimeMs": 1250,
    "timestamp": "2025-08-26T07:16:07.267Z",
    "token": {
      "id": "tok_1234...cdef",
      "cardholderName": "[REDACTED]"
    },
    "card": {
      "last4": "4242",
      "brand": "visa",
      "expMonth": 12,
      "expYear": 2028
    }
  },
  "browser": {
    "viewport": {"width": 1920, "height": 1080},
    "locale": "en-US",
    "timezone": "America/New_York"
  },
  "result": {
    "status": "success",
    "paymentMethodId": "[REDACTED]",
    "mode": "token"
  }
}
```

### 2. Security Event Logs (`security_event`)
Logs security-related events with severity classification:

```json
{
  "@timestamp": "2025-08-26T07:16:07.268Z",
  "level": "WARN",
  "category": "security_event",
  "message": "Security event: authentication_failure",
  "service": "payment-security-api",
  "request": {
    "id": "req_1724656567268_xyz789",
    "ip": "192.168.1.100",
    "userAgent": "curl/7.68.0"
  },
  "security": {
    "eventType": "authentication_failure",
    "severity": "medium",
    "details": {
      "reason": "invalid_api_key",
      "apiKey": "sk_test_...",
      "attemptedEndpoint": "/api/simulate-payment"
    },
    "timestamp": "2025-08-26T07:16:07.268Z"
  }
}
```

### 3. System Event Logs (`system_event`)
Logs system lifecycle and operational events:

```json
{
  "@timestamp": "2025-08-26T07:16:34.708Z",
  "level": "INFO",
  "category": "system_event",
  "message": "Payment Security API server initializing",
  "service": "payment-security-api",
  "system": {
    "eventType": "server_startup",
    "details": {
      "port": "3000",
      "nodeEnv": "development",
      "nodeVersion": "v20.2.0",
      "pid": 40665
    },
    "timestamp": "2025-08-26T07:16:34.713Z",
    "pid": 40665,
    "memory": {
      "rss": 62685184,
      "heapTotal": 20791296,
      "heapUsed": 15801352
    },
    "uptime": 0.258653083
  }
}
```

### 4. API Access Logs (`api_access`)
Logs all API endpoint access for audit trail:

```json
{
  "@timestamp": "2025-08-26T07:16:07.300Z",
  "level": "INFO",
  "category": "api_access",
  "message": "API endpoint accessed",
  "service": "payment-security-api",
  "request": {
    "id": "req_1724656567300_def456",
    "ip": "192.168.1.100",
    "method": "POST",
    "url": "/api/simulate-payment"
  },
  "api": {
    "endpoint": "/api/simulate-payment",
    "method": "POST",
    "statusCode": 200,
    "responseTimeMs": 1250,
    "contentLength": "256",
    "timestamp": "2025-08-26T07:16:07.300Z"
  }
}
```

### 5. Application Error Logs (`application_error`)
Logs application errors with full context:

```json
{
  "@timestamp": "2025-08-26T07:16:07.400Z",
  "level": "ERROR",
  "category": "application_error",
  "message": "Browser automation failed",
  "service": "payment-security-api",
  "error": {
    "name": "Error",
    "message": "Browser automation failed",
    "stack": "Error: Browser automation failed\n    at ...",
    "context": {
      "mode": "token",
      "apiKeyId": "sk_test_1",
      "requestId": "req_1724656567400_ghi789"
    },
    "timestamp": "2025-08-26T07:16:07.400Z"
  }
}
```

## Security Features

### Data Sanitization
The logging system automatically sanitizes sensitive data:

- **Credit Card Numbers**: Only last 4 digits are logged (`4242424242424242` → `4242`)
- **Stripe Tokens**: Prefix and suffix only (`tok_1234567890abcdefghijklmnop` → `tok_1234...mnop`)
- **API Keys**: First 8 characters only (`sk_test_1234567890abcdef` → `sk_test_...`)
- **Cardholder Names**: Replaced with `[REDACTED]`
- **Payment Method IDs**: Replaced with `[REDACTED]`

### Security Event Types
- `authentication_success` - Successful API key validation
- `authentication_failure` - Failed API key validation
- `rate_limit_exceeded` - Rate limit threshold exceeded
- `unauthorized_access` - Access attempt without proper credentials
- `payment_simulation_error` - Errors during payment processing
- `api_key_breach` - Suspected API key compromise
- `data_exposure` - Potential sensitive data exposure

### Severity Levels
- **High**: `unauthorized_access`, `api_key_breach`, `data_exposure`
- **Medium**: `rate_limit_exceeded`, `invalid_request`, `authentication_failure`
- **Low**: Normal operational events

## Error Categorization

The system automatically categorizes errors for better monitoring:

- `timeout` - Browser or network timeouts
- `stripe_api` - Stripe API related errors
- `browser_automation` - Puppeteer/browser errors
- `validation` - Request validation errors
- `authentication` - Authentication/authorization errors
- `rate_limit` - Rate limiting errors
- `processing_error` - General processing errors

## Integration with Log Aggregation Systems

### ELK Stack (Elasticsearch, Logstash, Kibana)
The logs are formatted for direct ingestion into Elasticsearch:

1. **Timestamp Field**: Uses `@timestamp` for Elasticsearch compatibility
2. **Structured Fields**: Consistent field naming for easy indexing
3. **Log Levels**: Standard levels (INFO, WARN, ERROR) for filtering
4. **Categories**: Organized by category for dashboard creation

### Logstash Configuration Example
```ruby
input {
  docker {
    type => "payment-security-api"
  }
}

filter {
  if [type] == "payment-security-api" {
    json {
      source => "message"
    }
    
    date {
      match => [ "@timestamp", "ISO8601" ]
    }
    
    if [category] == "security_event" and [security][severity] == "high" {
      mutate {
        add_tag => [ "security_alert" ]
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "payment-security-api-%{+YYYY.MM.dd}"
  }
}
```

### Kibana Dashboard Queries
```json
// High severity security events
{
  "query": {
    "bool": {
      "must": [
        {"term": {"category": "security_event"}},
        {"term": {"security.severity": "high"}}
      ]
    }
  }
}

// Failed payment requests
{
  "query": {
    "bool": {
      "must": [
        {"term": {"category": "payment_request"}},
        {"term": {"payment.success": false}}
      ]
    }
  }
}

// Rate limit violations
{
  "query": {
    "bool": {
      "must": [
        {"term": {"category": "security_event"}},
        {"term": {"security.eventType": "rate_limit_exceeded"}}
      ]
    }
  }
}
```

## Monitoring and Alerting

### Key Metrics to Monitor
1. **Error Rate**: Percentage of failed payment requests
2. **Response Time**: Average processing time for requests
3. **Security Events**: Count of authentication failures and rate limit violations
4. **System Health**: Memory usage, uptime, and resource consumption

### Alert Conditions
- High severity security events (immediate alert)
- Error rate > 5% over 5 minutes
- Response time > 10 seconds average over 5 minutes
- Memory usage > 80% for 10 minutes
- More than 10 authentication failures from same IP in 1 minute

## Compliance and Audit

### PCI DSS Compliance
- ✅ No full credit card numbers in logs
- ✅ No CVV/CVC codes in logs
- ✅ Cardholder names redacted
- ✅ Complete audit trail with timestamps
- ✅ Secure handling of payment tokens

### Audit Trail Features
- **Request Tracking**: Unique request IDs for end-to-end tracing
- **User Attribution**: API key identification for all requests
- **Timestamp Precision**: ISO 8601 timestamps with millisecond precision
- **IP Tracking**: Source IP address for all requests
- **Complete Context**: Full request and response context (sanitized)

### Data Retention
- Logs should be retained according to compliance requirements
- Recommended: 1 year for audit logs, 90 days for operational logs
- Implement log rotation and archival policies
- Ensure secure deletion of expired logs

## Performance Considerations

### Log Volume
- Estimated 1-5 KB per payment request log
- Additional 0.5-2 KB for security and system event logs
- Plan storage capacity accordingly

### Performance Impact
- Minimal CPU overhead (< 1ms per log entry)
- Asynchronous logging to stdout
- No file I/O blocking
- Memory efficient JSON serialization

### Optimization Tips
1. Use log aggregation systems for storage, not local files
2. Implement log sampling for high-volume environments
3. Monitor log processing pipeline performance
4. Set up log rotation and compression

## Troubleshooting

### Common Issues
1. **Missing Logs**: Check stdout redirection in container environment
2. **Parsing Errors**: Validate JSON format in log aggregation pipeline
3. **High Volume**: Implement log sampling or filtering
4. **Performance Impact**: Monitor CPU and memory usage

### Debug Mode
Set `NODE_ENV=development` for additional debug information in logs.

### Log Validation
Use the following command to validate log format:
```bash
node server.js | jq '.' # Validates JSON format
```

## Configuration

### Environment Variables
- `NODE_ENV`: Controls log verbosity and format
- `LOG_LEVEL`: Minimum log level to output (INFO, WARN, ERROR)
- `ENABLE_AUDIT_LOGS`: Enable/disable audit trail logging

### Customization
The `SecureLogger` class can be extended for custom log formats or additional security measures. Ensure any modifications maintain PCI DSS compliance and data sanitization requirements.
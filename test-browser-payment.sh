#!/bin/bash

echo "=== 浏览器自动化支付API测试 ==="

# 测试命令
curl -X POST http://localhost:3000/api/card-to-payment \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key" \
  -d '{
    "cardInfo": {
      "name": "John Doe",
      "number": "4242424242424242",
      "expMonth": "12",
      "expYear": "2025",
      "cvv": "123",
      "postalCode": "12345"
    },
    "paymentInfo": {
      "amount": 25.99,
      "description": "浏览器自动化支付测试"
    },
    "browserEnv": {
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "viewport": {
        "width": 1280,
        "height": 720
      },
      "locale": "en-US",
      "timezone": "America/New_York"
    }
  }'
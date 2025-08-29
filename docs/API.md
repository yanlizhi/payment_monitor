# Payment Security Enhancement API 文档

## 概述

Payment Security Enhancement API 提供安全的支付模拟服务，支持两种操作模式：Token模式（推荐）和直接模式（向后兼容）。

## 基础信息

- **Base URL**: `http://localhost:3000` (开发环境)
- **Content-Type**: `application/json`
- **认证方式**: API密钥（x-api-key请求头或apiKey查询参数）

## 认证

所有API端点（除健康检查外）都需要有效的API密钥。

### 请求头认证（推荐）

```http
x-api-key: your-api-key-here
```

### 查询参数认证

```http
GET /api/endpoint?apiKey=your-api-key-here
```

## 端点

### 1. 支付模拟

模拟Stripe支付流程，支持Token模式和直接模式。

#### 端点信息

- **URL**: `/api/simulate-payment`
- **方法**: `POST`
- **认证**: 必需
- **速率限制**: 100次/15分钟

#### Token模式请求

Token模式使用Stripe.js在前端创建的安全token，推荐用于生产环境。

```http
POST /api/simulate-payment
Content-Type: application/json
x-api-key: your-api-key

{
  "stripeToken": "tok_1234567890abcdef",
  "cardholderName": "John Doe",
  "browserEnv": {
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "locale": "en-US",
    "timezone": "America/New_York"
  },
  "tokenMetadata": {
    "last4": "4242",
    "brand": "visa",
    "exp_month": 12,
    "exp_year": 2028
  }
}
```

##### Token模式字段说明

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `stripeToken` | string | 是 | Stripe token，以"tok_"开头 |
| `cardholderName` | string | 否 | 持卡人姓名 |
| `browserEnv` | object | 是 | 浏览器环境配置 |
| `browserEnv.userAgent` | string | 是 | 浏览器用户代理字符串 |
| `browserEnv.viewport` | object | 是 | 浏览器视口尺寸 |
| `browserEnv.viewport.width` | number | 是 | 视口宽度 |
| `browserEnv.viewport.height` | number | 是 | 视口高度 |
| `browserEnv.locale` | string | 否 | 浏览器语言设置 |
| `browserEnv.timezone` | string | 否 | 时区设置 |
| `tokenMetadata` | object | 否 | Token元数据（用于日志记录） |
| `tokenMetadata.last4` | string | 否 | 卡号后四位 |
| `tokenMetadata.brand` | string | 否 | 卡片品牌 |
| `tokenMetadata.exp_month` | number | 否 | 过期月份 |
| `tokenMetadata.exp_year` | number | 否 | 过期年份 |

#### 直接模式请求

直接模式直接传输卡片信息，主要用于向后兼容。

```http
POST /api/simulate-payment
Content-Type: application/json
x-api-key: your-api-key

{
  "cardInfo": {
    "name": "John Doe",
    "number": "4242424242424242",
    "expMonth": "12",
    "expYear": "2028",
    "cvv": "123",
    "postalCode": "12345"
  },
  "browserEnv": {
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  }
}
```

##### 直接模式字段说明

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `cardInfo` | object | 是 | 信用卡信息 |
| `cardInfo.name` | string | 是 | 持卡人姓名 |
| `cardInfo.number` | string | 是 | 信用卡号（13-19位数字） |
| `cardInfo.expMonth` | string | 是 | 过期月份（01-12） |
| `cardInfo.expYear` | string | 是 | 过期年份（4位数字） |
| `cardInfo.cvv` | string | 是 | CVV安全码（3-4位数字） |
| `cardInfo.postalCode` | string | 否 | 邮政编码 |
| `browserEnv` | object | 是 | 浏览器环境配置（同Token模式） |

#### 成功响应

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": {
    "paymentMethodId": "pm_1234567890abcdef",
    "mode": "token",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "metadata": {
      "last4": "4242",
      "brand": "visa"
    }
  }
}
```

##### 成功响应字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| `success.paymentMethodId` | string | Stripe PaymentMethod ID |
| `success.mode` | string | 使用的模式（"token" 或 "direct"） |
| `success.timestamp` | string | 处理时间戳（ISO 8601格式） |
| `success.metadata` | object | 卡片元数据 |
| `success.metadata.last4` | string | 卡号后四位 |
| `success.metadata.brand` | string | 卡片品牌 |

#### 错误响应

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid request format",
  "message": "Use either Token mode (stripeToken + cardholderName) or Direct mode (cardInfo). Cannot use both or neither.",
  "type": "validation_error",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Card was declined",
  "type": "stripe_error",
  "mode": "token",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "retryable": false
}
```

##### 错误响应字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| `error` | string | 错误消息 |
| `type` | string | 错误类型 |
| `mode` | string | 使用的模式（如适用） |
| `timestamp` | string | 错误发生时间戳 |
| `retryable` | boolean | 是否可重试（如适用） |

##### 错误类型

| 类型 | 描述 | HTTP状态码 |
|------|------|------------|
| `validation_error` | 请求验证失败 | 400 |
| `stripe_error` | Stripe API错误 | 500 |
| `timeout_error` | 浏览器操作超时 | 500 |
| `browser_error` | 浏览器自动化错误 | 500 |
| `general_error` | 通用错误 | 500 |

### 2. 健康检查

检查服务基础健康状态。

#### 端点信息

- **URL**: `/health`
- **方法**: `GET`
- **认证**: 不需要

#### 请求

```http
GET /health
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "environment": "development"
}
```

### 3. API状态检查

检查API服务详细状态。

#### 端点信息

- **URL**: `/api/status`
- **方法**: `GET`
- **认证**: 必需

#### 请求

```http
GET /api/status
x-api-key: your-api-key
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "operational",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "apiKeyId": "12345678",
  "rateLimitInfo": {
    "windowMs": 900000,
    "maxRequests": 100
  }
}
```

## 状态码

| 状态码 | 描述 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求格式错误 |
| 401 | 认证失败 |
| 429 | 速率限制超出 |
| 500 | 服务器内部错误 |

## 速率限制

- **限制**: 100次请求/15分钟/IP地址
- **响应头**: 
  - `RateLimit-Limit`: 速率限制
  - `RateLimit-Remaining`: 剩余请求次数
  - `RateLimit-Reset`: 重置时间

## 测试卡号

用于测试的Stripe测试卡号：

| 卡号 | 品牌 | 结果 |
|------|------|------|
| 4242424242424242 | Visa | 成功 |
| 4000000000000002 | Visa | 卡片被拒绝 |
| 4000000000000069 | Visa | 过期卡片 |
| 4000000000000127 | Visa | CVC错误 |
| 5555555555554444 | Mastercard | 成功 |

## 示例代码

### JavaScript (前端Token创建)

```javascript
// 初始化Stripe
const stripe = Stripe('pk_test_your_publishable_key');

async function createTokenAndSimulate() {
  try {
    // 创建Token
    const { token, error } = await stripe.createToken('card', {
      number: '4242424242424242',
      exp_month: 12,
      exp_year: 2028,
      cvc: '123',
      name: 'John Doe',
      address_zip: '12345'
    });

    if (error) {
      throw new Error(`Token creation failed: ${error.message}`);
    }

    // 调用API
    const response = await fetch('/api/simulate-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'your-api-key'
      },
      body: JSON.stringify({
        stripeToken: token.id,
        cardholderName: 'John Doe',
        browserEnv: {
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        },
        tokenMetadata: {
          last4: token.card.last4,
          brand: token.card.brand,
          exp_month: token.card.exp_month,
          exp_year: token.card.exp_year
        }
      })
    });

    const result = await response.json();
    console.log('Payment simulation result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Node.js (服务端调用)

```javascript
const axios = require('axios');

async function simulatePayment() {
  try {
    const response = await axios.post('http://localhost:3000/api/simulate-payment', {
      cardInfo: {
        name: 'John Doe',
        number: '4242424242424242',
        expMonth: '12',
        expYear: '2028',
        cvv: '123',
        postalCode: '12345'
      },
      browserEnv: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        viewport: {
          width: 1920,
          height: 1080
        }
      }
    }, {
      headers: {
        'x-api-key': 'your-api-key',
        'Content-Type': 'application/json'
      }
    });

    console.log('Payment simulation result:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}
```

### cURL 示例

#### Token模式

```bash
curl -X POST http://localhost:3000/api/simulate-payment \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "stripeToken": "tok_1234567890abcdef",
    "cardholderName": "John Doe",
    "browserEnv": {
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    }
  }'
```

#### 直接模式

```bash
curl -X POST http://localhost:3000/api/simulate-payment \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "cardInfo": {
      "name": "John Doe",
      "number": "4242424242424242",
      "expMonth": "12",
      "expYear": "2028",
      "cvv": "123",
      "postalCode": "12345"
    },
    "browserEnv": {
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    }
  }'
```

## 最佳实践

1. **优先使用Token模式**: 更安全，符合PCI DSS要求
2. **设置合理的超时时间**: 浏览器操作可能需要较长时间
3. **实现重试机制**: 对于可重试的错误进行重试
4. **监控API使用**: 关注速率限制和错误率
5. **保护API密钥**: 不要在客户端代码中暴露API密钥

## 故障排除

### 常见错误及解决方案

1. **401 Unauthorized**
   - 检查API密钥是否正确
   - 确认请求头格式

2. **400 Invalid request format**
   - 检查请求体格式
   - 确认必需字段都已提供

3. **429 Rate limit exceeded**
   - 减少请求频率
   - 等待速率限制重置

4. **500 Browser operation timed out**
   - 检查网络连接
   - 重试请求

5. **500 Stripe card input iframe not found**
   - 检查Stripe配置
   - 确认测试页面正常加载
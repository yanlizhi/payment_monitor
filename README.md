# Payment Security Enhancement API

一个安全的支付模拟API，支持Stripe Token模式和传统直接模式，专为开发和测试环境设计。

## 功能特性

- **双模式支持**: Token模式（推荐）和直接模式
- **安全增强**: API密钥认证、速率限制、安全日志记录
- **PCI DSS合规**: 不记录敏感信用卡信息
- **浏览器自动化**: 使用Puppeteer模拟真实支付流程
- **错误处理**: 完善的错误处理和重试机制

## 快速开始

### 环境要求

- Node.js 16+
- npm 或 yarn

### 安装

```bash
npm install
```

### 环境配置

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的环境变量：

```env
# API密钥配置（逗号分隔多个密钥）
VALID_API_KEYS=your-api-key-1,your-api-key-2

# Stripe配置
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key

# 服务器配置
PORT=3000
NODE_ENV=development
```

### 启动服务

```bash
npm start
```

服务将在 `http://localhost:3000` 启动。

## API使用指南

### 认证

所有API请求需要提供有效的API密钥：

```bash
# 通过请求头
curl -H "x-api-key: your-api-key" ...

# 或通过查询参数
curl "http://localhost:3000/api/endpoint?apiKey=your-api-key"
```

### Token模式（推荐）

Token模式使用Stripe.js在前端安全创建token，避免敏感信息传输到服务器。

#### 前端Token创建

```javascript
// 初始化Stripe
const stripe = Stripe('pk_test_your_publishable_key');

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
    console.error('Token creation failed:', error);
} else {
    // 使用token进行支付模拟
    simulatePaymentWithToken(token);
}
```

#### API请求格式

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
    },
    "tokenMetadata": {
      "last4": "4242",
      "brand": "visa",
      "exp_month": 12,
      "exp_year": 2028
    }
  }'
```

### 直接模式（向后兼容）

直接模式支持传统的卡片信息直接传输，主要用于向后兼容。

#### API请求格式

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

### 响应格式

#### 成功响应

```json
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

#### 错误响应

```json
{
  "error": "Card was declined",
  "type": "stripe_error",
  "mode": "token",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "retryable": false
}
```

## 健康检查

### 基础健康检查（无需认证）

```bash
curl http://localhost:3000/health
```

### API状态检查（需要认证）

```bash
curl -H "x-api-key: your-api-key" http://localhost:3000/api/status
```

## 安全特性

### 数据保护

- **Token优先**: 推荐使用Token模式避免敏感数据传输
- **日志安全**: 只记录卡号后四位和token ID
- **内存清理**: 及时清理内存中的敏感数据
- **传输加密**: 生产环境强制HTTPS

### 访问控制

- **API密钥认证**: 所有API请求需要有效密钥
- **速率限制**: 15分钟内最多100次请求
- **请求审计**: 记录所有API访问日志

### 合规性

- **PCI DSS**: 遵循支付卡行业数据安全标准
- **数据最小化**: 只处理必要的数据
- **审计跟踪**: 完整的操作记录

## 错误处理

系统提供分层错误处理：

- **Stripe错误**: 卡片被拒绝、过期等
- **浏览器错误**: 超时、iframe访问失败等
- **验证错误**: 请求格式错误、缺少必要字段等

## 开发指南

### 本地开发

```bash
# 开发模式启动
npm run dev

# 查看日志
tail -f logs/app.log
```

### 测试

```bash
# 运行测试
npm test

# 运行安全测试
npm run test:security
```

## 部署

### Docker部署

```bash
# 构建镜像
docker build -t payment-security-api .

# 运行容器
docker run -p 3000:3000 --env-file .env payment-security-api
```

### 生产环境配置

1. 设置环境变量 `NODE_ENV=production`
2. 配置HTTPS证书
3. 设置防火墙规则
4. 配置日志轮转
5. 设置监控告警

## 故障排除

### 常见问题

1. **Token创建失败**
   - 检查Stripe公钥配置
   - 验证卡片信息格式

2. **API认证失败**
   - 检查API密钥配置
   - 确认请求头格式

3. **浏览器超时**
   - 检查网络连接
   - 增加超时时间配置

### 日志分析

系统使用结构化日志，可以通过以下方式分析：

```bash
# 查看审计日志
grep "AUDIT:" logs/app.log | jq .

# 查看安全事件
grep "SECURITY_EVENT:" logs/app.log | jq .
```

## 支持

如有问题或建议，请查看：

- [API文档](./docs/API.md)
- [安全操作手册](./docs/SECURITY_OPERATIONS.md)
- [故障排除指南](./docs/TROUBLESHOOTING.md)

## 许可证

ISC License
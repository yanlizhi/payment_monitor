# 真实Stripe交易集成指南

## 概述

本指南将帮助你将支付模拟系统升级为真实的Stripe交易处理系统。

## 前提条件

### 1. Stripe账户设置

1. **注册Stripe账户**
   - 访问 [https://stripe.com](https://stripe.com)
   - 完成注册和身份验证
   - 提供必要的商业信息

2. **获取API密钥**
   ```bash
   # 测试环境（用于开发）
   pk_test_51xxxxx... (Publishable Key)
   sk_test_51xxxxx... (Secret Key)
   
   # 生产环境（用于真实交易）
   pk_live_51xxxxx... (Publishable Key)
   sk_live_51xxxxx... (Secret Key)
   ```

3. **商业验证**
   - 提供商业文件
   - 银行账户信息
   - 税务信息

### 2. 合规要求

1. **PCI DSS合规**
   - 如果处理信用卡数据，需要PCI DSS认证
   - 使用Stripe Elements可以降低合规要求

2. **SSL证书**
   - 生产环境必须使用HTTPS
   - 获取有效的SSL证书

3. **法律合规**
   - 了解当地金融法规
   - 准备隐私政策和服务条款

## 配置步骤

### 1. 环境变量配置

更新你的 `.env` 文件：

```env
# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_your_real_key_here
STRIPE_SECRET_KEY=sk_test_your_real_key_here

# Enable Real Transactions
ENABLE_REAL_TRANSACTIONS=true

# Security Settings
NODE_ENV=production
HTTPS_ONLY=true
```

### 2. 前端配置

更新 `public/index.html` 中的Stripe公钥：

```javascript
// 替换为你的真实公钥
const stripe = Stripe('pk_test_your_real_publishable_key_here');
```

### 3. 测试配置

使用Stripe测试卡号进行测试：

```javascript
const testCards = {
    visa_success: '4242424242424242',
    visa_declined: '4000000000000002',
    mastercard_success: '5555555555554444',
    amex_success: '378282246310005'
};
```

## 使用方法

### 1. 模拟模式（默认）

```bash
# 启动服务器
npm start

# 访问控制界面
http://localhost:3000

# 选择 "Simulation Mode"
# 这将使用模拟交易，不涉及真实金钱
```

### 2. 真实交易模式

```bash
# 确保环境变量正确配置
ENABLE_REAL_TRANSACTIONS=true

# 启动服务器
npm start

# 访问控制界面
http://localhost:3000

# 选择 "Real Transaction Mode"
# ⚠️ 警告：这将处理真实金钱交易！
```

### 3. API调用示例

#### 真实直接模式

```bash
curl -X POST http://localhost:3000/api/real-payment \
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
      "userAgent": "Mozilla/5.0...",
      "viewport": {"width": 1920, "height": 1080}
    }
  }'
```

#### 真实Token模式

```bash
curl -X POST http://localhost:3000/api/real-payment \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "stripeToken": "pm_1234567890abcdef",
    "cardholderName": "John Doe",
    "browserEnv": {
      "userAgent": "Mozilla/5.0...",
      "viewport": {"width": 1920, "height": 1080}
    }
  }'
```

## 安全考虑

### 1. 数据保护

```javascript
// 永远不要记录完整的信用卡信息
const secureLog = {
    cardLast4: cardInfo.number.slice(-4),
    cardBrand: detectCardBrand(cardInfo.number),
    // 不要记录: number, cvv, expMonth, expYear
};
```

### 2. 错误处理

```javascript
try {
    const paymentMethod = await stripe.paymentMethods.create({...});
} catch (error) {
    // 不要向客户端暴露详细的Stripe错误
    console.error('Stripe Error:', error);
    return { error: 'Payment processing failed' };
}
```

### 3. 访问控制

```javascript
// 确保API密钥安全
const validApiKeys = process.env.VALID_API_KEYS.split(',');
if (!validApiKeys.includes(providedKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
}
```

## 监控和日志

### 1. 交易日志

```javascript
const transactionLog = {
    timestamp: new Date().toISOString(),
    paymentMethodId: paymentMethod.id,
    amount: amount,
    currency: 'usd',
    status: 'succeeded',
    cardLast4: paymentMethod.card.last4,
    cardBrand: paymentMethod.card.brand
};
```

### 2. 错误监控

```javascript
// 设置错误告警
if (error.type === 'card_error') {
    // 卡片错误，通知客户
} else if (error.type === 'api_error') {
    // API错误，通知开发团队
}
```

## 测试策略

### 1. 单元测试

```javascript
describe('Real Stripe Integration', () => {
    it('should create PaymentMethod successfully', async () => {
        const result = await RealStripeHandler.createPaymentMethod(testCardInfo);
        expect(result.success).toBeDefined();
        expect(result.success.paymentMethodId).toMatch(/^pm_/);
    });
});
```

### 2. 集成测试

```javascript
describe('Real Payment API', () => {
    it('should process real payment', async () => {
        const response = await request(app)
            .post('/api/real-payment')
            .set('x-api-key', 'test-key')
            .send(realPaymentRequest);
            
        expect(response.status).toBe(200);
        expect(response.body.success.real_transaction).toBe(true);
    });
});
```

## 部署清单

### 生产环境部署前检查

- [ ] Stripe账户已完全验证
- [ ] 获得生产环境API密钥
- [ ] SSL证书已配置
- [ ] 环境变量已正确设置
- [ ] 错误监控已配置
- [ ] 日志系统已配置
- [ ] 备份策略已实施
- [ ] 安全审计已完成

### 合规性检查

- [ ] PCI DSS要求已满足
- [ ] 隐私政策已更新
- [ ] 服务条款已更新
- [ ] 数据保护措施已实施
- [ ] 事件响应计划已准备

## 故障排除

### 常见错误

1. **Invalid API Key**
   ```
   解决方案: 检查STRIPE_SECRET_KEY是否正确
   ```

2. **Card Declined**
   ```
   解决方案: 使用测试卡号或检查真实卡片状态
   ```

3. **Authentication Required**
   ```
   解决方案: 某些支付需要3D Secure验证
   ```

### 调试技巧

```javascript
// 启用Stripe调试日志
stripe.setApiVersion('2020-08-27');
stripe.setAppInfo({
    name: 'Payment Simulation API',
    version: '1.0.0'
});
```

## 支持资源

- [Stripe文档](https://stripe.com/docs)
- [Stripe测试卡号](https://stripe.com/docs/testing)
- [PCI DSS指南](https://stripe.com/docs/security)
- [Webhook指南](https://stripe.com/docs/webhooks)

## 重要提醒

⚠️ **警告**: 真实交易模式将处理真实金钱。请确保：

1. 在测试环境中充分测试
2. 理解所有费用和手续费
3. 有适当的退款和争议处理流程
4. 遵守所有相关法律法规

💡 **建议**: 在生产环境中使用真实交易前，请咨询法律和财务专家。
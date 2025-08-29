# 安全操作手册

## 概述

本手册提供Payment Security Enhancement API的安全操作指南，包括密钥管理、事件响应、合规性要求和安全最佳实践。

## 目录

1. [密钥管理](#密钥管理)
2. [事件响应流程](#事件响应流程)
3. [安全监控](#安全监控)
4. [合规性要求](#合规性要求)
5. [安全配置](#安全配置)
6. [应急响应](#应急响应)
7. [安全审计](#安全审计)

## 密钥管理

### API密钥管理

#### 密钥生成

```bash
# 生成强随机API密钥
openssl rand -hex 32

# 或使用Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 密钥存储

**开发环境**:
```env
# .env文件
VALID_API_KEYS=dev-key-1,dev-key-2
```

**生产环境**:
- 使用环境变量或密钥管理服务
- 避免在代码中硬编码密钥
- 使用AWS Secrets Manager、Azure Key Vault等

```bash
# 环境变量设置
export VALID_API_KEYS="prod-key-1,prod-key-2"
```

#### 密钥轮换

**轮换频率**: 每90天或发生安全事件时

**轮换步骤**:
1. 生成新密钥
2. 更新环境配置（保留旧密钥）
3. 通知客户端更新
4. 验证新密钥工作正常
5. 移除旧密钥

```bash
# 密钥轮换脚本示例
#!/bin/bash
NEW_KEY=$(openssl rand -hex 32)
echo "New API key generated: $NEW_KEY"
echo "Update VALID_API_KEYS to include both old and new keys"
echo "After client migration, remove old keys"
```

#### 密钥撤销

**即时撤销**:
```bash
# 从环境变量中移除密钥
export VALID_API_KEYS="remaining-valid-key-1,remaining-valid-key-2"

# 重启服务
systemctl restart payment-api
```

### Stripe密钥管理

#### 密钥类型

- **可发布密钥** (pk_): 前端使用，可公开
- **密钥** (sk_): 服务端使用，严格保密
- **Webhook密钥**: 验证Webhook签名

#### 安全存储

```env
# 生产环境配置
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
STRIPE_SECRET_KEY=sk_live_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

#### 密钥验证

```javascript
// 验证Stripe密钥格式
function validateStripeKeys() {
    const pubKey = process.env.STRIPE_PUBLISHABLE_KEY;
    const secKey = process.env.STRIPE_SECRET_KEY;
    
    if (!pubKey || !pubKey.startsWith('pk_')) {
        throw new Error('Invalid Stripe publishable key');
    }
    
    if (!secKey || !secKey.startsWith('sk_')) {
        throw new Error('Invalid Stripe secret key');
    }
    
    // 验证环境匹配
    const pubEnv = pubKey.includes('test') ? 'test' : 'live';
    const secEnv = secKey.includes('test') ? 'test' : 'live';
    
    if (pubEnv !== secEnv) {
        throw new Error('Stripe key environment mismatch');
    }
}
```

## 事件响应流程

### 安全事件分类

#### 级别1 - 严重 (Critical)
- API密钥泄露
- 未授权访问系统
- 数据泄露
- 服务完全中断

#### 级别2 - 高 (High)
- 异常访问模式
- 速率限制频繁触发
- 认证失败激增
- 部分服务中断

#### 级别3 - 中 (Medium)
- 单个IP异常行为
- 偶发认证失败
- 性能异常

#### 级别4 - 低 (Low)
- 正常错误率波动
- 预期的访问拒绝

### 响应流程

#### 级别1响应 (0-15分钟)

**立即行动**:
1. 确认事件真实性
2. 隔离受影响系统
3. 撤销泄露的密钥
4. 通知安全团队

```bash
# 紧急密钥撤销
export VALID_API_KEYS=""  # 临时禁用所有密钥
systemctl restart payment-api

# 检查活跃连接
netstat -an | grep :3000
```

**通知模板**:
```
SECURITY ALERT - LEVEL 1
Time: [timestamp]
Event: [description]
Impact: [affected systems/users]
Actions Taken: [immediate actions]
Next Steps: [planned actions]
```

#### 级别2响应 (15-60分钟)

**调查步骤**:
1. 分析日志模式
2. 识别攻击源
3. 实施临时防护措施
4. 评估影响范围

```bash
# 日志分析
grep "SECURITY_EVENT" /var/log/payment-api.log | tail -100
grep "401\|403\|429" /var/log/payment-api.log | tail -50

# IP分析
awk '{print $1}' /var/log/payment-api.log | sort | uniq -c | sort -nr | head -20
```

#### 级别3-4响应 (1-24小时)

**监控和分析**:
1. 持续监控异常模式
2. 更新安全规则
3. 记录事件详情
4. 制定预防措施

### 事件记录

```json
{
  "eventId": "SEC-2024-001",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "high",
  "type": "authentication_failure_spike",
  "description": "Unusual number of authentication failures from IP 192.168.1.100",
  "sourceIP": "192.168.1.100",
  "affectedEndpoints": ["/api/simulate-payment"],
  "actionsTaken": [
    "IP temporarily blocked",
    "Security team notified",
    "Enhanced monitoring enabled"
  ],
  "resolution": "Identified as legitimate user with incorrect API key",
  "preventiveMeasures": [
    "Improved API key validation error messages",
    "Rate limiting adjustment"
  ]
}
```

## 安全监控

### 监控指标

#### 认证指标
- 认证失败率
- 无效API密钥尝试
- 速率限制触发次数

#### 访问模式
- 请求频率异常
- 异常IP地址
- 非正常时间访问

#### 系统指标
- 响应时间异常
- 错误率激增
- 资源使用异常

### 监控实现

```javascript
// 安全监控中间件
class SecurityMonitor {
    static trackFailedAuth(req) {
        const key = `auth_fail_${req.ip}`;
        const count = this.incrementCounter(key, 300); // 5分钟窗口
        
        if (count > 10) {
            this.triggerAlert('high_auth_failure', {
                ip: req.ip,
                count: count,
                timeWindow: '5 minutes'
            });
        }
    }
    
    static trackRateLimit(req) {
        const key = `rate_limit_${req.ip}`;
        const count = this.incrementCounter(key, 900); // 15分钟窗口
        
        if (count > 5) {
            this.triggerAlert('repeated_rate_limit', {
                ip: req.ip,
                count: count
            });
        }
    }
    
    static triggerAlert(type, data) {
        const alert = {
            timestamp: new Date().toISOString(),
            type: type,
            severity: this.getSeverity(type),
            data: data
        };
        
        console.warn('SECURITY_ALERT:', JSON.stringify(alert));
        
        // 发送到监控系统
        this.sendToMonitoring(alert);
    }
}
```

### 告警配置

```yaml
# 告警规则配置
alerts:
  - name: high_auth_failure_rate
    condition: auth_failure_rate > 20%
    window: 5m
    severity: high
    
  - name: unusual_traffic_pattern
    condition: request_rate > baseline * 3
    window: 10m
    severity: medium
    
  - name: api_key_brute_force
    condition: invalid_key_attempts > 50
    window: 1m
    severity: critical
```

## 合规性要求

### PCI DSS合规

#### 要求1: 防火墙配置
```bash
# 防火墙规则示例
iptables -A INPUT -p tcp --dport 3000 -s trusted_ip_range -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

#### 要求2: 默认密码更改
- 所有默认密钥必须更改
- 使用强密钥策略

#### 要求3: 存储的持卡人数据保护
```javascript
// 数据脱敏示例
function sanitizeCardData(cardNumber) {
    if (!cardNumber || cardNumber.length < 4) return 'XXXX';
    return 'XXXX-XXXX-XXXX-' + cardNumber.slice(-4);
}

// 日志记录时的数据保护
function logPaymentData(data) {
    const sanitized = {
        ...data,
        cardNumber: sanitizeCardData(data.cardNumber),
        cvv: 'XXX',
        // 只保留非敏感信息
        last4: data.cardNumber?.slice(-4),
        brand: data.brand
    };
    
    console.log('Payment processed:', sanitized);
}
```

#### 要求4: 传输中的持卡人数据加密
```javascript
// HTTPS强制中间件
function enforceHTTPS(req, res, next) {
    if (process.env.NODE_ENV === 'production' && !req.secure) {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
}
```

### 数据保护

#### 数据分类
- **敏感数据**: 完整卡号、CVV、PIN
- **受限数据**: 卡号后四位、过期日期
- **公开数据**: Token ID、交易状态

#### 数据处理原则
1. **最小化**: 只收集必要数据
2. **加密**: 传输和存储加密
3. **脱敏**: 日志中脱敏处理
4. **清理**: 及时清理内存数据

```javascript
// 内存清理示例
function processPayment(cardData) {
    try {
        // 处理支付
        const result = performPayment(cardData);
        return result;
    } finally {
        // 清理敏感数据
        if (cardData) {
            Object.keys(cardData).forEach(key => {
                cardData[key] = null;
            });
        }
    }
}
```

## 安全配置

### 环境配置

#### 生产环境安全配置

```env
# 生产环境配置
NODE_ENV=production
HTTPS_ONLY=true
SECURE_COOKIES=true
HSTS_MAX_AGE=31536000

# 安全头配置
SECURITY_HEADERS=true
CSP_POLICY="default-src 'self'; script-src 'self' js.stripe.com"

# 日志配置
LOG_LEVEL=warn
AUDIT_LOG_ENABLED=true
LOG_RETENTION_DAYS=90
```

#### 安全中间件配置

```javascript
// 安全头配置
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    next();
});

// CORS配置
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
```

### 网络安全

#### IP白名单

```javascript
// IP白名单中间件
function ipWhitelist(req, res, next) {
    const allowedIPs = process.env.ALLOWED_IPS?.split(',') || [];
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
        SecureLogger.logSecurityEvent('ip_blocked', req, { clientIP });
        return res.status(403).json({
            error: 'Access denied',
            message: 'IP address not in whitelist'
        });
    }
    
    next();
}
```

#### DDoS防护

```javascript
// 简单DDoS防护
const ddosProtection = rateLimit({
    windowMs: 1 * 60 * 1000, // 1分钟
    max: 20, // 每分钟最多20次请求
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
```

## 应急响应

### 应急联系人

```yaml
# 应急联系人配置
emergency_contacts:
  security_team:
    primary: "security@company.com"
    phone: "+1-555-0123"
  
  infrastructure_team:
    primary: "infra@company.com"
    phone: "+1-555-0124"
  
  management:
    primary: "cto@company.com"
    phone: "+1-555-0125"
```

### 应急程序

#### 服务紧急停止

```bash
#!/bin/bash
# emergency_shutdown.sh

echo "EMERGENCY SHUTDOWN INITIATED"
echo "Timestamp: $(date)"

# 停止服务
systemctl stop payment-api

# 阻止所有流量
iptables -A INPUT -p tcp --dport 3000 -j DROP

# 记录事件
echo "$(date): Emergency shutdown executed" >> /var/log/emergency.log

# 通知团队
curl -X POST "https://hooks.slack.com/emergency" \
  -d '{"text":"EMERGENCY: Payment API has been shut down"}'
```

#### 密钥紧急撤销

```bash
#!/bin/bash
# emergency_key_revocation.sh

echo "EMERGENCY KEY REVOCATION"
echo "Revoking all API keys..."

# 清空API密钥
export VALID_API_KEYS=""

# 重启服务
systemctl restart payment-api

# 记录事件
echo "$(date): All API keys revoked" >> /var/log/security.log
```

### 恢复程序

#### 服务恢复检查清单

1. **安全验证**
   - [ ] 威胁已消除
   - [ ] 系统完整性验证
   - [ ] 新密钥已生成

2. **系统检查**
   - [ ] 配置文件正确
   - [ ] 依赖服务正常
   - [ ] 监控系统就绪

3. **功能测试**
   - [ ] 健康检查通过
   - [ ] API功能正常
   - [ ] 认证系统工作

4. **监控启用**
   - [ ] 日志记录正常
   - [ ] 告警系统激活
   - [ ] 安全监控运行

## 安全审计

### 审计日志

#### 日志格式

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "eventType": "api_request",
  "userId": "api_key_12345678",
  "sourceIP": "192.168.1.100",
  "endpoint": "/api/simulate-payment",
  "method": "POST",
  "statusCode": 200,
  "responseTime": 1250,
  "userAgent": "Mozilla/5.0...",
  "requestId": "req_1234567890",
  "dataClassification": "restricted",
  "complianceFlags": ["pci_dss"]
}
```

#### 审计查询

```bash
# 查询认证失败
grep '"statusCode":401' /var/log/audit.log | jq .

# 查询异常IP
grep '"sourceIP":"suspicious_ip"' /var/log/audit.log | jq .

# 查询高频访问
awk -F'"sourceIP":"' '{print $2}' /var/log/audit.log | \
  awk -F'"' '{print $1}' | sort | uniq -c | sort -nr | head -10
```

### 合规报告

#### 月度安全报告模板

```markdown
# 月度安全报告 - [YYYY-MM]

## 概述
- 报告期间: [开始日期] - [结束日期]
- 系统状态: [正常/异常]
- 安全事件: [数量]

## 关键指标
- 总请求数: [数量]
- 认证失败率: [百分比]
- 平均响应时间: [毫秒]
- 系统可用性: [百分比]

## 安全事件
| 日期 | 级别 | 类型 | 描述 | 状态 |
|------|------|------|------|------|
| [日期] | [级别] | [类型] | [描述] | [已解决/进行中] |

## 合规性状态
- PCI DSS: [合规/不合规]
- 数据保护: [合规/不合规]
- 访问控制: [合规/不合规]

## 改进建议
1. [建议1]
2. [建议2]
3. [建议3]

## 下月计划
- [计划项目1]
- [计划项目2]
```

### 定期审计任务

#### 每日任务
- [ ] 检查安全日志
- [ ] 验证系统状态
- [ ] 监控异常活动

#### 每周任务
- [ ] 审查访问模式
- [ ] 更新威胁情报
- [ ] 测试告警系统

#### 每月任务
- [ ] 安全配置审查
- [ ] 密钥轮换检查
- [ ] 合规性评估
- [ ] 生成安全报告

#### 每季度任务
- [ ] 渗透测试
- [ ] 安全培训
- [ ] 应急演练
- [ ] 政策更新

## 联系信息

**安全团队**: security@company.com  
**紧急热线**: +1-555-SECURITY  
**事件报告**: incidents@company.com  

---

*本手册应定期更新，确保与最新的安全要求和威胁环境保持一致。*
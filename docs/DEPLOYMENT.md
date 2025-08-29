# 部署指南

## 概述

本指南提供Payment Security Enhancement API的完整部署说明，包括开发环境和生产环境的配置。

## 目录

1. [系统要求](#系统要求)
2. [开发环境部署](#开发环境部署)
3. [生产环境部署](#生产环境部署)
4. [Docker部署](#docker部署)
5. [监控和维护](#监控和维护)
6. [故障排除](#故障排除)

## 系统要求

### 最低要求

- **操作系统**: Linux (Ubuntu 20.04+), macOS 10.15+, Windows 10+
- **Node.js**: 18.0+
- **内存**: 2GB RAM
- **存储**: 10GB 可用空间
- **网络**: 稳定的互联网连接

### 推荐配置

- **CPU**: 2核心以上
- **内存**: 4GB RAM以上
- **存储**: SSD，20GB以上可用空间
- **网络**: 100Mbps以上带宽

### 依赖服务

- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Redis**: 7.0+ (可选，用于会话存储)
- **Nginx**: 1.20+ (生产环境推荐)

## 开发环境部署

### 1. 克隆项目

```bash
git clone <repository-url>
cd payment-security-enhancement
```

### 2. 安装依赖

```bash
npm install
```

### 3. 环境配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
nano .env
```

必需的环境变量：

```env
VALID_API_KEYS=dev-key-1,dev-key-2
STRIPE_PUBLISHABLE_KEY=pk_test_your_key
NODE_ENV=development
PORT=3000
```

### 4. 启动服务

```bash
# 直接启动
npm start

# 或使用开发模式
npm run dev
```

### 5. 验证部署

```bash
# 健康检查
curl http://localhost:3000/health

# API测试
curl -H "x-api-key: dev-key-1" http://localhost:3000/api/status
```

## 生产环境部署

### 1. 服务器准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要软件
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 项目部署

```bash
# 克隆项目到生产目录
sudo mkdir -p /opt/payment-api
sudo chown $USER:$USER /opt/payment-api
cd /opt/payment-api
git clone <repository-url> .
```

### 3. 生产环境配置

```bash
# 创建生产环境配置
cp .env.example .env.production

# 编辑生产配置
nano .env.production
```

生产环境配置示例：

```env
# 生产环境配置
NODE_ENV=production
PORT=3000
HTTPS_ONLY=true
SECURE_COOKIES=true

# 强随机API密钥
VALID_API_KEYS=prod-key-abc123def456,prod-key-xyz789uvw012

# Stripe生产密钥
STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key
STRIPE_SECRET_KEY=sk_live_your_live_key

# 安全配置
ALLOWED_ORIGINS=https://yourdomain.com
ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8

# Redis配置
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=strong_redis_password

# 日志配置
LOG_LEVEL=warn
AUDIT_LOG_ENABLED=true
LOG_RETENTION_DAYS=90
```

### 4. SSL证书配置

```bash
# 创建SSL目录
mkdir -p ssl

# 使用Let's Encrypt获取证书
sudo certbot certonly --nginx -d yourdomain.com

# 复制证书到项目目录
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
sudo chown $USER:$USER ssl/*.pem
```

### 5. 防火墙配置

```bash
# 配置UFW防火墙
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 检查状态
sudo ufw status
```

## Docker部署

### 开发环境Docker部署

```bash
# 使用部署脚本
./scripts/deploy.sh development

# 或手动部署
docker-compose up -d
```

### 生产环境Docker部署

```bash
# 使用部署脚本
./scripts/deploy.sh production

# 或手动部署
docker-compose -f docker-compose.prod.yml up -d
```

### Docker服务管理

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f payment-api

# 重启服务
docker-compose restart payment-api

# 停止所有服务
docker-compose down

# 更新服务
docker-compose pull
docker-compose up -d
```

### 容器监控

```bash
# 查看资源使用
docker stats

# 查看容器详情
docker inspect payment-security-api

# 进入容器
docker exec -it payment-security-api sh
```

## 监控和维护

### 日志管理

```bash
# 查看应用日志
tail -f logs/app.log

# 查看审计日志
grep "AUDIT:" logs/app.log | jq .

# 查看安全事件
grep "SECURITY_EVENT:" logs/app.log | jq .

# 日志轮转配置
sudo nano /etc/logrotate.d/payment-api
```

日志轮转配置：

```
/opt/payment-api/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 nodejs nodejs
    postrotate
        docker-compose -f /opt/payment-api/docker-compose.prod.yml restart payment-api
    endscript
}
```

### 健康检查

```bash
# 创建健康检查脚本
cat > /opt/payment-api/scripts/health-check.sh << 'EOF'
#!/bin/bash
HEALTH_URL="http://localhost:3000/health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $STATUS -eq 200 ]; then
    echo "$(date): Health check passed"
    exit 0
else
    echo "$(date): Health check failed with status $STATUS"
    exit 1
fi
EOF

chmod +x /opt/payment-api/scripts/health-check.sh

# 添加到crontab
echo "*/5 * * * * /opt/payment-api/scripts/health-check.sh >> /var/log/health-check.log 2>&1" | crontab -
```

### 备份策略

```bash
# 手动备份
./scripts/backup.sh

# 自动备份 (添加到crontab)
echo "0 2 * * * cd /opt/payment-api && ./scripts/backup.sh >> /var/log/backup.log 2>&1" | crontab -

# 查看备份
ls -la backups/
```

### 性能监控

```bash
# 安装监控工具
npm install -g pm2

# 使用PM2管理进程
pm2 start server.js --name payment-api
pm2 monit

# 设置PM2开机启动
pm2 startup
pm2 save
```

### 安全更新

```bash
# 定期更新依赖
npm audit
npm update

# 更新Docker镜像
docker-compose pull
docker-compose up -d

# 系统更新
sudo apt update && sudo apt upgrade -y
```

## 故障排除

### 常见问题

#### 1. 服务无法启动

```bash
# 检查端口占用
sudo netstat -tlnp | grep :3000

# 检查环境变量
cat .env | grep -v '^#'

# 查看详细错误
docker-compose logs payment-api
```

#### 2. API认证失败

```bash
# 验证API密钥配置
echo $VALID_API_KEYS

# 测试API密钥
curl -H "x-api-key: your-key" http://localhost:3000/api/status
```

#### 3. SSL证书问题

```bash
# 检查证书有效性
openssl x509 -in ssl/cert.pem -text -noout

# 更新证书
sudo certbot renew
```

#### 4. 性能问题

```bash
# 检查系统资源
htop
df -h
free -m

# 检查Docker资源
docker stats

# 分析日志
grep "timeout\|error" logs/app.log | tail -20
```

### 紧急恢复

#### 服务紧急停止

```bash
# 停止所有服务
docker-compose down

# 阻止流量
sudo iptables -A INPUT -p tcp --dport 3000 -j DROP
sudo iptables -A INPUT -p tcp --dport 80 -j DROP
sudo iptables -A INPUT -p tcp --dport 443 -j DROP
```

#### 从备份恢复

```bash
# 停止服务
docker-compose down

# 恢复代码
tar -xzf backups/payment-api-backup-YYYYMMDD_HHMMSS.tar.gz

# 恢复Redis数据
docker cp backups/redis-YYYYMMDD_HHMMSS.rdb payment-redis:/data/dump.rdb

# 重启服务
docker-compose up -d
```

### 监控告警

#### 设置告警

```bash
# 创建告警脚本
cat > /opt/payment-api/scripts/alert.sh << 'EOF'
#!/bin/bash
MESSAGE="$1"
WEBHOOK_URL="your-slack-webhook-url"

curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"Payment API Alert: $MESSAGE\"}" \
    $WEBHOOK_URL
EOF

chmod +x /opt/payment-api/scripts/alert.sh
```

#### 监控脚本

```bash
# 创建监控脚本
cat > /opt/payment-api/scripts/monitor.sh << 'EOF'
#!/bin/bash
LOG_FILE="/var/log/payment-api-monitor.log"

# 检查服务状态
if ! curl -f -s http://localhost:3000/health > /dev/null; then
    echo "$(date): Service health check failed" >> $LOG_FILE
    ./scripts/alert.sh "Service health check failed"
fi

# 检查错误率
ERROR_COUNT=$(grep -c "ERROR" logs/app.log | tail -1)
if [ $ERROR_COUNT -gt 10 ]; then
    echo "$(date): High error rate detected: $ERROR_COUNT" >> $LOG_FILE
    ./scripts/alert.sh "High error rate: $ERROR_COUNT errors"
fi

# 检查磁盘空间
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "$(date): High disk usage: $DISK_USAGE%" >> $LOG_FILE
    ./scripts/alert.sh "High disk usage: $DISK_USAGE%"
fi
EOF

chmod +x /opt/payment-api/scripts/monitor.sh

# 添加到crontab (每5分钟检查一次)
echo "*/5 * * * * /opt/payment-api/scripts/monitor.sh" | crontab -
```

## 最佳实践

### 安全最佳实践

1. **定期更新**: 保持系统和依赖项最新
2. **强密钥**: 使用强随机API密钥
3. **HTTPS**: 生产环境强制使用HTTPS
4. **防火墙**: 配置适当的防火墙规则
5. **监控**: 实施全面的安全监控

### 运维最佳实践

1. **自动化**: 使用脚本自动化部署和维护
2. **备份**: 定期备份数据和配置
3. **监控**: 实施健康检查和性能监控
4. **文档**: 保持部署文档更新
5. **测试**: 在生产环境部署前充分测试

### 性能优化

1. **缓存**: 使用Redis缓存频繁访问的数据
2. **负载均衡**: 使用Nginx进行负载均衡
3. **资源限制**: 设置适当的Docker资源限制
4. **日志管理**: 实施日志轮转和清理
5. **监控**: 持续监控性能指标

## 支持

如需帮助，请参考：

- [API文档](./API.md)
- [安全操作手册](./SECURITY_OPERATIONS.md)
- [故障排除指南](./TROUBLESHOOTING.md)

或联系技术支持团队。
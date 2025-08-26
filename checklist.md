# 支付模拟API开发清单

本项目旨在创建一个API，用于模拟在支付网关（Stripe）上提交信用卡信息的行为，重点关注浏览器环境和指纹的模拟。

---

## Phase 1: 项目基础设置 (Project Foundation)

- [x] 1. 初始化Node.js项目 (`npm init -y`)
- [x] 2. 安装核心依赖 (`npm install express puppeteer puppeteer-extra puppeteer-extra-plugin-stealth`)
- [x] 3. 创建项目目录结构:
  ```
  /
  ├── public/
  │   ├── index.html         // 用户交互的前端页面
  │   └── payment-test.html  // 无头浏览器操作的Stripe支付页面
  ├── server.js              // Express后端服务器
  ├── checklist.md           // 本清单文件
  └── package.json
  ```

---

## Phase 2: 后端API实现 (Backend API Implementation)

- [x] 1. **创建Express服务器:** 在 `server.js` 中设置基本的Express应用，并配置静态文件服务（用于`public`目录）。
- [x] 2. **定义API端点:** 创建 `POST /api/simulate-payment` 路由。
- [x] 3. **实现Puppeteer逻辑:**
    - [x] a. 从请求体中接收 `cardInfo` 和 `browserEnv`。
    - [x] b. 使用 `puppeteer-extra` 和 `stealth` 插件启动浏览器实例。
    - [x] c. 根据 `browserEnv` 设置User-Agent、Viewport等。
    - [x] d. 指示浏览器打开 `http://localhost:[PORT]/payment-test.html`。
    - [x] e. 将 `cardInfo` 填入 `payment-test.html` 的表单中。
    - [x] f. 模拟点击支付按钮。
    - [x] g. 捕获 `payment-test.html` 页面上由Stripe.js返回的结果（成功或失败）。
    - [x] h. 关闭浏览器实例。
    - [x] i. 将捕获的结果作为API响应返回给调用方。
- [x] 4. **错误处理:** 添加try-catch块来处理Puppeteer操作中可能出现的超时或其他错误。

---

## Phase 3: Stripe支付测试页面 (Puppet Page)

- [x] 1. **创建HTML表单:** 在 `public/payment-test.html` 中，创建包含姓名、卡号、有效期、CVV的输入框和支付按钮。
- [x] 2. **引入Stripe.js:** 在HTML中添加Stripe官方的JS库链接。
- [x] 3. **编写Stripe逻辑:**
    - [x] a. 使用您的Stripe测试公钥（Publishable Key）初始化Stripe.js。
    - [x] b. 创建一个`div`用于显示Stripe Elements（安全的卡号输入框）。
    - [x] c. 编写JavaScript，监听支付按钮的点击事件。
    - [x] d. 调用 `stripe.createPaymentMethod()` 将表单数据发送到Stripe。
    - [x] e. 将Stripe返回的成功（PaymentMethod ID）或失败信息显示在页面上一个专门的`<div>`中。

---

## Phase 4: 用户交互前端 (Controller Page)

- [x] 1. **创建输入表单:** 在 `public/index.html` 中，创建一个完整的表单，让用户可以输入所有 `simulate-payment` API需要的参数（卡信息、User-Agent等）。
- [x] 2. **编写客户端脚本:**
    - [x] a. 监听表单的提交/按钮点击事件。
    - [x] b. 使用 `fetch` API 将表单数据以JSON格式 `POST` 到 `/api/simulate-payment`。
    - [x] c. 接收后端的响应。
    - [x] d. 将响应结果（如“模拟成功”或“模拟失败”）显示在页面上。

---

## Phase 5: 测试与完成 (Testing & Finalization)

- [x] 1. **端到端测试:** 启动服务器，打开 `index.html`，填写测试数据，执行模拟，并验证结果是否符合预期。
- [x] 2. **代码审查:** 检查代码，确保没有硬编码敏感信息（如Stripe私钥），并确保对信用卡数据处理的安全性（不在后端记录日志）。
- [ ] 3. **编写README:** 创建一个 `README.md` 文件，说明如何安装依赖、如何启动项目以及如何使用它。

---

## Phase 6: 安全性改进 - Stripe Token 机制 (Security Enhancement - Stripe Tokens)

- [ ] 1. **客户端 Token 创建:**
    - [ ] a. 修改 `public/index.html`，在发送请求前先创建 Stripe Token
    - [ ] b. 使用 `stripe.createToken()` 将卡片信息转换为安全的 token
    - [ ] c. 只发送 token 和非敏感信息到服务器，不再发送原始卡片数据
    - [ ] d. 添加 token 创建的错误处理和用户反馈

- [ ] 2. **服务器端 Token 处理:**
    - [ ] a. 修改 `server.js` API 接收 `stripeToken` 而不是 `cardInfo`
    - [ ] b. 更新 Puppeteer 逻辑，使用 token 进行支付模拟
    - [ ] c. 移除所有原始卡片数据的处理逻辑
    - [ ] d. 添加 token 验证和错误处理

- [ ] 3. **支付测试页面更新:**
    - [ ] a. 修改 `public/payment-test.html` 支持 token 模式
    - [ ] b. 更新 `triggerStripePayment()` 函数使用预创建的 token
    - [ ] c. 确保页面可以处理 token 和传统模式（向后兼容）

- [ ] 4. **日志安全性:**
    - [ ] a. 确保服务器日志不记录任何敏感的卡片信息
    - [ ] b. 只记录 token ID 和卡片后四位用于调试
    - [ ] c. 添加结构化日志记录，便于审计

---

## Phase 7: 生产环境合规性 (Production Compliance)

- [ ] 1. **环境配置:**
    - [ ] a. 创建 `.env` 文件模板，移除硬编码的 Stripe 密钥
    - [ ] b. 配置不同环境的 Stripe 密钥（测试/生产）
    - [ ] c. 确保生产环境使用 HTTPS
    - [ ] d. 添加环境变量验证

- [ ] 2. **访问控制和认证:**
    - [ ] a. 实现 API 认证机制（API Key 或 JWT）
    - [ ] b. 添加请求频率限制（Rate Limiting）
    - [ ] c. 实现 IP 白名单或来源验证
    - [ ] d. 添加请求日志和审计跟踪

- [ ] 3. **数据保护:**
    - [ ] a. 确保内存中的敏感数据及时清理
    - [ ] b. 实现请求数据的输入验证和清理
    - [ ] c. 添加 CORS 配置，限制跨域访问
    - [ ] d. 实现安全的错误处理，避免信息泄露

- [ ] 4. **监控和告警:**
    - [ ] a. 添加应用性能监控（APM）
    - [ ] b. 实现异常情况的告警机制
    - [ ] c. 添加健康检查端点
    - [ ] d. 配置日志聚合和分析

- [ ] 5. **合规性文档:**
    - [ ] a. 创建数据处理和隐私政策文档
    - [ ] b. 编写安全操作手册
    - [ ] c. 建立事件响应计划
    - [ ] d. 准备合规性检查清单

---

## Phase 8: 部署和维护 (Deployment & Maintenance)

- [ ] 1. **容器化:**
    - [ ] a. 创建 Dockerfile 用于应用容器化
    - [ ] b. 配置 Docker Compose 用于本地开发
    - [ ] c. 优化容器镜像大小和安全性
    - [ ] d. 配置容器健康检查

- [ ] 2. **部署配置:**
    - [ ] a. 配置反向代理（Nginx/Apache）
    - [ ] b. 设置 SSL/TLS 证书
    - [ ] c. 配置负载均衡（如需要）
    - [ ] d. 实现零停机部署策略

- [ ] 3. **备份和恢复:**
    - [ ] a. 建立配置文件备份策略
    - [ ] b. 实现应用状态监控
    - [ ] c. 创建灾难恢复计划
    - [ ] d. 定期进行恢复测试

- [ ] 4. **持续改进:**
    - [ ] a. 建立代码审查流程
    - [ ] b. 实现自动化测试
    - [ ] c. 配置持续集成/持续部署（CI/CD）
    - [ ] d. 定期安全审计和更新

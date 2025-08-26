# 支付模拟API开发清单

本项目旨在创建一个API，用于模拟在支付网关（Stripe）上提交信用卡信息的行为，重点关注浏览器环境和指纹的模拟。

---

## Phase 1: 项目基础设置 (Project Foundation)

- [ ] 1. 初始化Node.js项目 (`npm init -y`)
- [ ] 2. 安装核心依赖 (`npm install express puppeteer puppeteer-extra puppeteer-extra-plugin-stealth`)
- [ ] 3. 创建项目目录结构:
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

- [ ] 1. **创建Express服务器:** 在 `server.js` 中设置基本的Express应用，并配置静态文件服务（用于`public`目录）。
- [ ] 2. **定义API端点:** 创建 `POST /api/simulate-payment` 路由。
- [ ] 3. **实现Puppeteer逻辑:**
    - [ ] a. 从请求体中接收 `cardInfo` 和 `browserEnv`。
    - [ ] b. 使用 `puppeteer-extra` 和 `stealth` 插件启动浏览器实例。
    - [ ] c. 根据 `browserEnv` 设置User-Agent、Viewport等。
    - [ ] d. 指示浏览器打开 `http://localhost:[PORT]/payment-test.html`。
    - [ ] e. 将 `cardInfo` 填入 `payment-test.html` 的表单中。
    - [ ] f. 模拟点击支付按钮。
    - [ ] g. 捕获 `payment-test.html` 页面上由Stripe.js返回的结果（成功或失败）。
    - [ ] h. 关闭浏览器实例。
    - [ ] i. 将捕获的结果作为API响应返回给调用方。
- [ ] 4. **错误处理:** 添加try-catch块来处理Puppeteer操作中可能出现的超时或其他错误。

---

## Phase 3: Stripe支付测试页面 (Puppet Page)

- [ ] 1. **创建HTML表单:** 在 `public/payment-test.html` 中，创建包含姓名、卡号、有效期、CVV的输入框和支付按钮。
- [ ] 2. **引入Stripe.js:** 在HTML中添加Stripe官方的JS库链接。
- [ ] 3. **编写Stripe逻辑:**
    - [ ] a. 使用您的Stripe测试公钥（Publishable Key）初始化Stripe.js。
    - [ ] b. 创建一个`div`用于显示Stripe Elements（安全的卡号输入框）。
    - [ ] c. 编写JavaScript，监听支付按钮的点击事件。
    - [ ] d. 调用 `stripe.createPaymentMethod()` 将表单数据发送到Stripe。
    - [ ] e. 将Stripe返回的成功（PaymentMethod ID）或失败信息显示在页面上一个专门的`<div>`中。

---

## Phase 4: 用户交互前端 (Controller Page)

- [ ] 1. **创建输入表单:** 在 `public/index.html` 中，创建一个完整的表单，让用户可以输入所有 `simulate-payment` API需要的参数（卡信息、User-Agent等）。
- [ ] 2. **编写客户端脚本:**
    - [ ] a. 监听表单的提交/按钮点击事件。
    - [ ] b. 使用 `fetch` API 将表单数据以JSON格式 `POST` 到 `/api/simulate-payment`。
    - [ ] c. 接收后端的响应。
    - [ ] d. 将响应结果（如“模拟成功”或“模拟失败”）显示在页面上。

---

## Phase 5: 测试与完成 (Testing & Finalization)

- [ ] 1. **端到端测试:** 启动服务器，打开 `index.html`，填写测试数据，执行模拟，并验证结果是否符合预期。
- [ ] 2. **代码审查:** 检查代码，确保没有硬编码敏感信息（如Stripe私钥），并确保对信用卡数据处理的安全性（不在后端记录日志）。
- [ ] 3. **编写README:** 创建一个 `README.md` 文件，说明如何安装依赖、如何启动项目以及如何使用它。

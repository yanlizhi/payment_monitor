
require('dotenv').config();
const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

puppeteer.use(StealthPlugin());

const app = express();
const port = process.env.PORT || 3000;

// Environment variable validation
function validateEnvironmentConfig() {
    const requiredEnvVars = ['VALID_API_KEYS'];
    const optionalEnvVars = ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        console.error('Missing required environment variables:', missingVars);
        console.error('Please check your .env file or environment configuration');
        process.exit(1);
    }

    // Check Stripe configuration if real transactions are enabled
    if (process.env.ENABLE_REAL_TRANSACTIONS === 'true') {
        const missingStripeVars = optionalEnvVars.filter(varName => !process.env[varName]);
        if (missingStripeVars.length > 0) {
            console.error('Real transactions enabled but missing Stripe configuration:', missingStripeVars);
            process.exit(1);
        }
        console.log('Real Stripe transactions enabled');
    } else {
        console.log('Using simulation mode (ENABLE_REAL_TRANSACTIONS=false)');
    }

    console.log('Environment configuration validated successfully');
}

// API Key Authentication Middleware with enhanced security logging
class AuthenticationMiddleware {
    static validateApiKey(req, res, next) {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;

        if (!apiKey) {
            SecureLogger.logSecurityEvent('authentication_failure', req, {
                reason: 'missing_api_key',
                method: 'header_and_query_checked'
            });

            return res.status(401).json({
                error: 'Unauthorized',
                message: 'API key is required. Provide it in x-api-key header or apiKey query parameter',
                requestId: req.requestId
            });
        }

        if (!AuthenticationMiddleware.isValidApiKey(apiKey)) {
            SecureLogger.logSecurityEvent('authentication_failure', req, {
                reason: 'invalid_api_key',
                apiKeyPrefix: apiKey.substring(0, 8),
                attemptedKey: apiKey.length > 8 ? `${apiKey.substring(0, 8)}...` : '[SHORT_KEY]'
            });

            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid API key provided',
                requestId: req.requestId
            });
        }

        // Store API key info for logging
        req.apiKeyInfo = {
            id: AuthenticationMiddleware.getApiKeyId(apiKey),
            key: apiKey.substring(0, 8) + '...' // Truncated for logging
        };

        // Log successful authentication
        SecureLogger.logSecurityEvent('authentication_success', req, {
            apiKeyId: req.apiKeyInfo.id,
            method: apiKey.startsWith(req.headers['x-api-key'] || '') ? 'header' : 'query'
        });

        next();
    }

    static isValidApiKey(key) {
        const validKeys = process.env.VALID_API_KEYS?.split(',') || [];
        return validKeys.includes(key);
    }

    static getApiKeyId(key) {
        // Generate a simple ID based on the key for logging purposes
        return key.substring(0, 8);
    }
}

// Request Validation Middleware
class RequestValidator {
    static validatePaymentRequest(req, res, next) {
        const { stripeToken, cardInfo, browserEnv } = req.body;

        // Determine mode based on request content
        const isTokenMode = stripeToken && !cardInfo;
        const isDirectMode = cardInfo && !stripeToken;

        // Validate mode selection
        if (!isTokenMode && !isDirectMode) {
            return res.status(400).json({
                error: 'Invalid request format',
                message: 'Use either Token mode (stripeToken + cardholderName) or Direct mode (cardInfo). Cannot use both or neither.'
            });
        }

        // Validate required browserEnv
        if (!browserEnv) {
            return res.status(400).json({
                error: 'Missing required field',
                message: 'browserEnv is required for payment simulation'
            });
        }

        // Validate browserEnv structure
        if (!browserEnv.userAgent || !browserEnv.viewport) {
            return res.status(400).json({
                error: 'Invalid browserEnv',
                message: 'browserEnv must include userAgent and viewport properties'
            });
        }

        // Token mode specific validation
        if (isTokenMode) {
            try {
                // Check if it's a direct Stripe token/PaymentMethod ID
                if (stripeToken.startsWith('tok_') || stripeToken.startsWith('pm_')) {
                    // Valid direct token/PaymentMethod ID
                } else {
                    // Try to parse as JSON to validate it's our card data format
                    const tokenData = JSON.parse(stripeToken);
                    if (!tokenData.id) {
                        throw new Error('Invalid token data structure - missing id');
                    }
                    // Allow PaymentMethod IDs, tokens, or special card data formats
                    if (!tokenData.id.startsWith('tok_') &&
                        !tokenData.id.startsWith('pm_') &&
                        tokenData.id !== 'real_card_data' &&
                        tokenData.id !== 'real_simulation_token' &&
                        !tokenData._cardData &&
                        !tokenData._useTestToken) {
                        throw new Error('Invalid token data structure');
                    }
                }
            } catch (parseError) {
                return res.status(400).json({
                    error: 'Invalid token format',
                    message: `stripeToken must be a valid Stripe token or properly formatted card data. Error: ${parseError.message}`
                });
            }
        }

        // Direct mode specific validation
        if (isDirectMode) {
            const requiredCardFields = ['name', 'number', 'expMonth', 'expYear', 'cvv'];
            const missingFields = requiredCardFields.filter(field => !cardInfo[field]);

            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: 'Missing card information',
                    message: `Required fields missing: ${missingFields.join(', ')}`
                });
            }

            // Basic card number validation (length check)
            if (cardInfo.number.length < 13 || cardInfo.number.length > 19) {
                return res.status(400).json({
                    error: 'Invalid card number',
                    message: 'Card number must be between 13 and 19 digits'
                });
            }
        }

        // Store simulation mode for later use
        req.simulationMode = isTokenMode ? 'token' : 'direct';
        next();
    }
}

// Rate Limiting Middleware with enhanced logging
const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
        // Enhanced rate limit logging
        SecureLogger.logRateLimitEvent(req, {
            windowMs: 15 * 60 * 1000,
            max: 100,
            current: req.rateLimit?.current || 'unknown',
            resetTime: req.rateLimit?.resetTime || new Date(Date.now() + 15 * 60 * 1000)
        });

        SecureLogger.logSecurityEvent('rate_limit_exceeded', req, {
            requestsInWindow: req.rateLimit?.current,
            maxAllowed: 100,
            windowMs: 15 * 60 * 1000
        });

        res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: '15 minutes',
            requestId: req.requestId
        });
    }
});

// Enhanced Secure Logger for comprehensive audit trail and structured logging
class SecureLogger {
    /**
     * Generate a unique request ID for tracking
     */
    static generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sanitize sensitive data for safe logging
     */
    static sanitizeCardNumber(cardNumber) {
        if (!cardNumber || typeof cardNumber !== 'string') return null;
        return cardNumber.length >= 4 ? cardNumber.slice(-4) : null;
    }

    /**
     * Sanitize token for safe logging (keep only prefix and suffix)
     */
    static sanitizeToken(token) {
        if (!token || typeof token !== 'string') return null;
        if (token.length <= 12) return token;
        return `${token.substring(0, 8)}...${token.slice(-4)}`;
    }

    /**
     * Create standardized log entry structure for ELK Stack compatibility
     */
    static createBaseLogEntry(level, category, message, req = null) {
        const baseEntry = {
            '@timestamp': new Date().toISOString(),
            level: level.toUpperCase(),
            category,
            message,
            service: 'payment-security-api',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };

        // Add request context if available
        if (req) {
            baseEntry.request = {
                id: req.requestId || this.generateRequestId(),
                ip: req.ip || req.connection?.remoteAddress,
                userAgent: req.get('User-Agent'),
                method: req.method,
                url: req.originalUrl || req.url,
                headers: {
                    'content-type': req.get('Content-Type'),
                    'x-forwarded-for': req.get('X-Forwarded-For')
                }
            };

            // Add API key info if available
            if (req.apiKeyInfo) {
                baseEntry.authentication = {
                    apiKeyId: req.apiKeyInfo.id,
                    apiKeyTruncated: req.apiKeyInfo.key
                };
            }
        }

        return baseEntry;
    }

    /**
     * Log payment request with comprehensive audit trail
     */
    static logPaymentRequest(req, result) {
        const requestId = req.requestId || this.generateRequestId();
        const processingTime = Date.now() - (req.startTime || Date.now());

        const logEntry = this.createBaseLogEntry('info', 'payment_request', 'Payment simulation request processed', req);

        // Add payment-specific data
        logEntry.payment = {
            mode: req.simulationMode,
            success: !result.error,
            processingTimeMs: processingTime,
            timestamp: new Date().toISOString()
        };

        // Add mode-specific safe data
        if (req.simulationMode === 'token') {
            logEntry.payment.token = {
                id: this.sanitizeToken(req.body.stripeToken),
                cardholderName: req.body.cardholderName ? '[REDACTED]' : null
            };

            // Add token metadata if available
            if (req.body.tokenMetadata) {
                logEntry.payment.card = {
                    last4: req.body.tokenMetadata.last4,
                    brand: req.body.tokenMetadata.brand,
                    expMonth: req.body.tokenMetadata.exp_month,
                    expYear: req.body.tokenMetadata.exp_year
                };
            }
        } else if (req.simulationMode === 'direct') {
            logEntry.payment.card = {
                last4: this.sanitizeCardNumber(req.body.cardInfo?.number),
                cardholderName: req.body.cardInfo?.name ? '[REDACTED]' : null,
                expMonth: req.body.cardInfo?.expMonth,
                expYear: req.body.cardInfo?.expYear
            };
        }

        // Add browser environment info (non-sensitive)
        if (req.body.browserEnv) {
            logEntry.browser = {
                viewport: req.body.browserEnv.viewport,
                locale: req.body.browserEnv.locale,
                timezone: req.body.browserEnv.timezone
            };
        }

        // Add result information
        if (result.success) {
            logEntry.result = {
                status: 'success',
                paymentMethodId: result.success.paymentMethodId ? '[REDACTED]' : null,
                mode: result.success.mode
            };
        } else if (result.error) {
            logEntry.result = {
                status: 'error',
                errorType: this.categorizeError(result.error),
                retryable: result.retryable || false
            };
        }

        // Output structured JSON to stdout for container log collection
        console.log(JSON.stringify(logEntry));
    }

    /**
     * Log security events with detailed context
     */
    static logSecurityEvent(eventType, req, details = {}) {
        const logEntry = this.createBaseLogEntry('warn', 'security_event', `Security event: ${eventType}`, req);

        logEntry.security = {
            eventType,
            severity: this.getSecurityEventSeverity(eventType),
            details: this.sanitizeSecurityDetails(details),
            timestamp: new Date().toISOString()
        };

        // Output to stdout with SECURITY prefix for easy filtering
        console.log(JSON.stringify(logEntry));
    }

    /**
     * Log system events (startup, shutdown, configuration changes)
     */
    static logSystemEvent(eventType, message, details = {}) {
        const logEntry = this.createBaseLogEntry('info', 'system_event', message);

        logEntry.system = {
            eventType,
            details,
            timestamp: new Date().toISOString(),
            pid: process.pid,
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };

        console.log(JSON.stringify(logEntry));
    }

    /**
     * Log API access events for audit trail
     */
    static logApiAccess(req, res, responseTime) {
        const logEntry = this.createBaseLogEntry('info', 'api_access', 'API endpoint accessed', req);

        logEntry.api = {
            endpoint: req.route?.path || req.path,
            method: req.method,
            statusCode: res.statusCode,
            responseTimeMs: responseTime,
            contentLength: res.get('Content-Length'),
            timestamp: new Date().toISOString()
        };

        console.log(JSON.stringify(logEntry));
    }

    /**
     * Log rate limiting events
     */
    static logRateLimitEvent(req, limitInfo) {
        const logEntry = this.createBaseLogEntry('warn', 'rate_limit', 'Rate limit exceeded', req);

        logEntry.rateLimit = {
            windowMs: limitInfo.windowMs,
            maxRequests: limitInfo.max,
            currentRequests: limitInfo.current,
            resetTime: limitInfo.resetTime,
            timestamp: new Date().toISOString()
        };

        console.log(JSON.stringify(logEntry));
    }

    /**
     * Categorize errors for better monitoring and alerting
     */
    static categorizeError(errorMessage) {
        if (!errorMessage) return 'unknown';

        const errorLower = errorMessage.toLowerCase();

        if (errorLower.includes('timeout')) return 'timeout';
        if (errorLower.includes('stripe')) return 'stripe_api';
        if (errorLower.includes('browser') || errorLower.includes('puppeteer')) return 'browser_automation';
        if (errorLower.includes('validation')) return 'validation';
        if (errorLower.includes('authentication') || errorLower.includes('unauthorized')) return 'authentication';
        if (errorLower.includes('rate limit')) return 'rate_limit';

        return 'processing_error';
    }

    /**
     * Determine security event severity
     */
    static getSecurityEventSeverity(eventType) {
        const highSeverityEvents = ['unauthorized_access', 'api_key_breach', 'data_exposure'];
        const mediumSeverityEvents = ['rate_limit_exceeded', 'invalid_request', 'authentication_failure'];

        if (highSeverityEvents.includes(eventType)) return 'high';
        if (mediumSeverityEvents.includes(eventType)) return 'medium';
        return 'low';
    }

    /**
     * Sanitize security event details to prevent sensitive data leakage
     */
    static sanitizeSecurityDetails(details) {
        const sanitized = { ...details };

        // Remove or redact sensitive fields
        if (sanitized.cardNumber) {
            sanitized.cardNumber = this.sanitizeCardNumber(sanitized.cardNumber);
        }

        if (sanitized.token) {
            sanitized.token = this.sanitizeToken(sanitized.token);
        }

        if (sanitized.apiKey) {
            sanitized.apiKey = sanitized.apiKey.substring(0, 8) + '...';
        }

        // Redact any field that might contain sensitive data
        const sensitiveFields = ['password', 'secret', 'key', 'cvv', 'cvc', 'pin'];
        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    /**
     * Log application errors with stack traces (for debugging)
     */
    static logApplicationError(error, context = {}) {
        const logEntry = this.createBaseLogEntry('error', 'application_error', error.message);

        logEntry.error = {
            name: error.name,
            message: error.message,
            stack: error.stack,
            context: this.sanitizeSecurityDetails(context),
            timestamp: new Date().toISOString()
        };

        console.error(JSON.stringify(logEntry));
    }

    /**
     * Log performance metrics
     */
    static logPerformanceMetrics(metrics) {
        const logEntry = this.createBaseLogEntry('info', 'performance_metrics', 'System performance data');

        logEntry.performance = {
            ...metrics,
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };

        console.log(JSON.stringify(logEntry));
    }
}

// Secure Browser Launcher
class SecureBrowserLauncher {
    static async launch(browserEnv) {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        const page = await browser.newPage();

        // Set browser environment
        if (browserEnv.userAgent) {
            await page.setUserAgent(browserEnv.userAgent);
        }

        if (browserEnv.viewport) {
            await page.setViewport(browserEnv.viewport);
        }

        return { browser, page };
    }
}

// Real Stripe Transaction Handler
class RealStripeHandler {
    static async createPaymentMethod(cardInfo, amount = 1000, description = 'Test Payment') {
        try {
            const paymentMethod = await stripe.paymentMethods.create({
                type: 'card',
                card: {
                    number: cardInfo.number,
                    exp_month: parseInt(cardInfo.expMonth),
                    exp_year: parseInt(cardInfo.expYear),
                    cvc: cardInfo.cvv,
                },
                billing_details: {
                    name: cardInfo.name,
                    address: {
                        postal_code: cardInfo.postalCode
                    }
                }
            });

            // Create PaymentIntent with the PaymentMethod
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount, // Amount in cents
                currency: 'usd',
                payment_method: paymentMethod.id,
                description: description,
                confirm: true,
                return_url: 'https://your-website.com/return'
            });

            return {
                success: {
                    paymentIntentId: paymentIntent.id,
                    paymentMethodId: paymentMethod.id,
                    mode: 'real_direct',
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency,
                    description: description,
                    last4: paymentMethod.card.last4,
                    brand: paymentMethod.card.brand,
                    cardholderName: cardInfo.name,
                    real_transaction: true
                }
            };
        } catch (error) {
            return {
                error: `Real Stripe API error: ${error.message}`,
                type: 'stripe_api_error',
                real_transaction: true
            };
        }
    }

    // 新方法：使用浏览器自动化处理卡信息
    static async processCardWithBrowser(cardInfo, paymentInfo, browserEnv) {
        let browser = null;
        try {
            console.log('启动浏览器自动化支付流程...');

            // 使用传入的浏览器环境信息
            const { browser: launchedBrowser, page } = await SecureBrowserLauncher.launch(browserEnv);
            browser = launchedBrowser;

            // 导航到支付页面
            const port = process.env.PORT || 3000;
            await page.goto(`http://localhost:${port}/payment-test.html`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 填入支付信息
            await page.evaluate((data) => {
                document.getElementById('payment-amount').value = data.amount.toFixed(2);
                document.getElementById('payment-description').value = data.description;
                document.getElementById('card-name').value = data.cardholderName;
            }, {
                amount: paymentInfo.amount,
                description: paymentInfo.description,
                cardholderName: cardInfo.name
            });

            // 等待Stripe Elements加载
            await page.waitForSelector('#card-element iframe', { timeout: 15000 });
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 找到Stripe iframe并填入卡信息
            const frames = page.frames();
            const stripeFrame = frames.find(frame =>
                frame.url().includes('elements-inner-card')
            );

            if (!stripeFrame) {
                throw new Error('未找到Stripe卡片输入框');
            }

            await stripeFrame.waitForSelector('input[name="cardnumber"]', { timeout: 15000 });

            // 填入卡片信息
            await stripeFrame.type('input[name="cardnumber"]', cardInfo.number, { delay: 100 });
            await stripeFrame.type('input[name="exp-date"]', `${cardInfo.expMonth}${cardInfo.expYear.slice(-2)}`, { delay: 100 });
            await stripeFrame.type('input[name="cvc"]', cardInfo.cvv, { delay: 100 });

            // 如果有邮政编码，填入
            if (cardInfo.postalCode) {
                try {
                    await stripeFrame.waitForSelector('input[name="postal"]', { timeout: 2000 });
                    await stripeFrame.type('input[name="postal"]', cardInfo.postalCode, { delay: 100 });
                } catch (e) {
                    console.log('邮政编码字段未找到或不需要');
                }
            }

            console.log('卡片信息填入完成，触发支付...');

            // 触发支付
            const result = await page.evaluate(async () => {
                return await window.triggerStripePayment();
            });

            await browser.close();

            if (result.error) {
                throw new Error(result.error);
            }

            return {
                success: {
                    ...result.success,
                    flow: 'browser_automated',
                    real_transaction: true
                }
            };

        } catch (error) {
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {
                    console.error('关闭浏览器时出错:', e.message);
                }
            }

            return {
                error: `浏览器自动化支付失败: ${error.message}`,
                type: 'browser_automation_error',
                real_transaction: true
            };
        }
    }

    static async processPaymentMethod(paymentMethodId, amount = 1000, description = 'Test Payment') {
        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount, // Amount in cents
                currency: 'usd',
                payment_method: paymentMethodId,
                description: description,
                confirm: true,
                return_url: 'https://your-website.com/return'
            });

            return {
                success: {
                    paymentIntentId: paymentIntent.id,
                    paymentMethodId: paymentMethodId,
                    mode: 'real_token',
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency,
                    description: description,
                    real_transaction: true
                }
            };
        } catch (error) {
            return {
                error: `Payment processing failed: ${error.message}`,
                type: 'payment_processing_error',
                real_transaction: true
            };
        }
    }

    static async createPaymentMethodFromToken(tokenData, amount = 1000, description = 'Test Payment') {
        try {
            // If it's using a Stripe test token
            if (tokenData._useTestToken && tokenData.id.startsWith('tok_')) {
                return await this.processStripeToken(tokenData.id, null, amount, description);
            }

            // If it's a real card data marker, process the actual card info
            if (tokenData.id === 'real_card_data' && tokenData._cardData) {
                return await this.createPaymentMethod(tokenData._cardData, amount, description);
            }

            // If it's a real PaymentMethod ID, process it
            if (tokenData.id.startsWith('pm_')) {
                return await this.processPaymentMethod(tokenData.id, amount, description);
            }

            // Otherwise, it's a simulation token
            throw new Error('Invalid token format for real transactions');
        } catch (error) {
            return {
                error: `Token processing error: ${error.message}`,
                type: 'token_processing_error',
                real_transaction: true
            };
        }
    }

    static async processStripeToken(tokenId, billingDetails = null, amount = 1000, description = 'Test Payment') {
        try {
            // Create PaymentMethod from Stripe token with optional billing details
            const paymentMethodData = {
                type: 'card',
                card: {
                    token: tokenId
                }
            };

            // Add billing details if provided
            if (billingDetails) {
                paymentMethodData.billing_details = billingDetails;
            }

            const paymentMethod = await stripe.paymentMethods.create(paymentMethodData);

            // Create PaymentIntent with the PaymentMethod
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount, // Amount in cents
                currency: 'usd',
                payment_method: paymentMethod.id,
                description: description,
                confirm: true,
                return_url: 'https://your-website.com/return'
            });

            return {
                success: {
                    paymentIntentId: paymentIntent.id,
                    paymentMethodId: paymentMethod.id,
                    mode: 'real_token',
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency,
                    description: description,
                    last4: paymentMethod.card.last4,
                    brand: paymentMethod.card.brand,
                    real_transaction: true
                }
            };
        } catch (error) {
            return {
                error: `Stripe token processing failed: ${error.message}`,
                type: 'stripe_token_error',
                real_transaction: true
            };
        }
    }
}

// Payment Mode Handler
class PaymentModeHandler {
    static async handleTokenMode(page, stripeToken, cardholderName, port, paymentInfo = null) {
        try {
            await page.goto(`http://localhost:${port}/payment-test.html`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            await page.waitForSelector('#payment-form', { timeout: 15000 });

            // Fill payment information if provided
            if (paymentInfo) {
                if (paymentInfo.amount) {
                    await page.evaluate((amount) => {
                        document.getElementById('payment-amount').value = amount.toString();
                    }, paymentInfo.amount);
                }
                if (paymentInfo.description) {
                    await page.evaluate((description) => {
                        document.getElementById('payment-description').value = description;
                    }, paymentInfo.description);
                }
            }

            // Fill cardholder name if provided
            if (cardholderName) {
                await page.evaluate((name) => {
                    document.getElementById('card-name').value = name;
                }, cardholderName);
            }

            // Wait for page to be ready
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Call Token processing function with retry mechanism
            const result = await this.executeWithRetry(async () => {
                return await page.evaluate(async (token) => {
                    return await window.triggerStripePaymentWithToken(token);
                }, stripeToken);
            }, 3);

            return result;
        } catch (error) {
            throw new Error(`Token mode processing failed: ${error.message}`);
        }
    }

    static async handleDirectMode(page, cardInfo, port, paymentInfo = null) {
        try {
            await page.goto(`http://localhost:${port}/payment-test.html`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            await page.waitForSelector('#payment-form', { timeout: 15000 });

            // Fill payment information if provided
            if (paymentInfo) {
                if (paymentInfo.amount) {
                    await page.evaluate((amount) => {
                        document.getElementById('payment-amount').value = amount.toString();
                    }, paymentInfo.amount);
                }
                if (paymentInfo.description) {
                    await page.evaluate((description) => {
                        document.getElementById('payment-description').value = description;
                    }, paymentInfo.description);
                }
            }

            // Fill cardholder name
            if (cardInfo.name) {
                await page.evaluate((name) => {
                    document.getElementById('card-name').value = name;
                }, cardInfo.name);
            }

            // Wait for Stripe Elements to load
            await page.waitForSelector('#card-element iframe', { timeout: 15000 });
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Find and interact with Stripe iframe
            const frames = page.frames();
            const stripeFrame = frames.find(frame =>
                frame.url().includes('elements-inner-card')
            );

            if (!stripeFrame) {
                throw new Error('Stripe card input iframe not found');
            }

            // Wait for card input fields
            await stripeFrame.waitForSelector('input[name="cardnumber"]', { timeout: 15000 });

            // Fill card information with retry mechanism
            await this.executeWithRetry(async () => {
                await stripeFrame.type('input[name="cardnumber"]', cardInfo.number, { delay: 100 });
                await stripeFrame.type('input[name="exp-date"]', `${cardInfo.expMonth}${cardInfo.expYear.slice(-2)}`, { delay: 100 });
                await stripeFrame.type('input[name="cvc"]', cardInfo.cvv, { delay: 100 });

                // Add postal code if available
                if (cardInfo.postalCode) {
                    try {
                        await stripeFrame.waitForSelector('input[name="postal"]', { timeout: 2000 });
                        await stripeFrame.type('input[name="postal"]', cardInfo.postalCode, { delay: 100 });
                    } catch (e) {
                        console.log('Postal code field not found or not required');
                    }
                }
            }, 2);

            // Trigger payment with retry mechanism
            const result = await this.executeWithRetry(async () => {
                return await page.evaluate(async () => {
                    return await window.triggerStripePayment();
                });
            }, 3);

            return result;
        } catch (error) {
            throw new Error(`Direct mode processing failed: ${error.message}`);
        }
    }

    static async executeWithRetry(operation, maxRetries = 3, delay = 1000) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`Operation failed on attempt ${attempt}/${maxRetries}: ${error.message}`);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delay * attempt));
                }
            }
        }

        throw lastError;
    }
}

// Error Handler
class ErrorHandler {
    static handleStripeError(error) {
        const errorMap = {
            'card_declined': 'Card was declined',
            'expired_card': 'Card has expired',
            'incorrect_cvc': 'CVC is incorrect',
            'processing_error': 'Processing error occurred',
            'invalid_request_error': 'Invalid request parameters'
        };

        return {
            type: 'stripe_error',
            message: errorMap[error.code] || error.message,
            code: error.code
        };
    }

    static handlePuppeteerError(error) {
        if (error.message.includes('timeout')) {
            return {
                type: 'timeout_error',
                message: 'Browser operation timed out',
                retryable: true
            };
        }

        if (error.message.includes('iframe not found')) {
            return {
                type: 'iframe_error',
                message: 'Stripe payment form not accessible',
                retryable: true
            };
        }

        return {
            type: 'browser_error',
            message: 'Browser automation failed',
            details: error.message
        };
    }

    static handleValidationError(field, message) {
        return {
            type: 'validation_error',
            field: field,
            message: message
        };
    }
}

// Validate environment on startup and log system initialization
try {
    validateEnvironmentConfig();
    SecureLogger.logSystemEvent('server_startup', 'Payment Security API server initializing', {
        port: port,
        nodeEnv: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid: process.pid
    });
} catch (error) {
    SecureLogger.logApplicationError(error, { phase: 'startup', component: 'environment_validation' });
    process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced request tracking middleware
app.use((req, res, next) => {
    // Generate unique request ID for audit trail
    req.requestId = req.headers['x-request-id'] || SecureLogger.generateRequestId();
    req.startTime = Date.now();

    // Add request ID to response headers for client tracking
    res.setHeader('X-Request-ID', req.requestId);

    // Log API access on response finish
    const originalSend = res.send;
    res.send = function (data) {
        const responseTime = Date.now() - req.startTime;

        // Only log API access for API routes to avoid noise
        if (req.path.startsWith('/api/')) {
            SecureLogger.logApiAccess(req, res, responseTime);
        }

        return originalSend.call(this, data);
    };

    next();
});

// Apply security middleware to API routes
app.use('/api', AuthenticationMiddleware.validateApiKey);
app.use('/api', rateLimiter);

// Real Stripe Transaction API
// Card-to-Token-to-Payment API - 使用浏览器自动化安全处理卡信息
app.post('/api/card-to-payment', AuthenticationMiddleware.validateApiKey, async (req, res) => {
    const requestId = SecureLogger.generateRequestId();
    req.requestId = requestId;
    req.startTime = Date.now();

    const { cardInfo, paymentInfo, browserEnv } = req.body;

    // 验证必需字段
    if (!cardInfo || !cardInfo.number || !cardInfo.expMonth || !cardInfo.expYear || !cardInfo.cvv || !cardInfo.name) {
        return res.status(400).json({
            error: 'Missing required card information',
            message: 'cardInfo must include: number, expMonth, expYear, cvv, name',
            requestId: requestId
        });
    }

    if (!paymentInfo || !paymentInfo.amount) {
        return res.status(400).json({
            error: 'Missing payment information',
            message: 'paymentInfo must include amount',
            requestId: requestId
        });
    }

    if (!browserEnv || !browserEnv.userAgent || !browserEnv.viewport) {
        return res.status(400).json({
            error: 'Missing browser environment information',
            message: 'browserEnv must include userAgent and viewport',
            requestId: requestId
        });
    }

    // Log transaction attempt
    SecureLogger.logSystemEvent('card_to_payment_initiated', 'Browser-automated card-to-payment transaction initiated', {
        apiKeyId: req.apiKeyInfo.id,
        amount: paymentInfo.amount,
        description: paymentInfo.description,
        cardLast4: cardInfo.number.slice(-4),
        real_transaction: true,
        flow: 'browser_automated'
    });

    try {
        console.log(`处理支付金额: $${paymentInfo.amount} 使用浏览器自动化`);

        // 使用浏览器自动化处理卡信息
        const paymentResult = await RealStripeHandler.processCardWithBrowser(cardInfo, paymentInfo, browserEnv);

        // 添加时间戳和请求ID
        if (paymentResult.success) {
            paymentResult.success.timestamp = new Date().toISOString();
            paymentResult.success.requestId = requestId;
            paymentResult.success.processingTime = Date.now() - req.startTime;
        } else if (paymentResult.error) {
            paymentResult.timestamp = new Date().toISOString();
            paymentResult.requestId = requestId;
            paymentResult.processingTime = Date.now() - req.startTime;
        }

        // 记录结果
        SecureLogger.logPaymentRequest(req, paymentResult);

        const statusCode = paymentResult.success ? 200 : 400;
        res.status(statusCode).json(paymentResult);

    } catch (error) {
        SecureLogger.logApplicationError(error, {
            apiKeyId: req.apiKeyInfo?.id,
            real_transaction: true,
            flow: 'browser_automated',
            cardLast4: cardInfo.number.slice(-4)
        });

        res.status(500).json({
            error: 'Browser-automated payment processing failed',
            details: error.message,
            type: 'browser_automation_error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            processingTime: Date.now() - req.startTime
        });
    }
});

app.post('/api/real-payment', RequestValidator.validatePaymentRequest, async (req, res) => {
    const { cardInfo, stripeToken, cardholderName, paymentInfo } = req.body;
    const isTokenMode = req.simulationMode === 'token';

    // Extract payment amount (convert to cents for Stripe)
    const amount = paymentInfo ? Math.round(paymentInfo.amount * 100) : 1000; // Default $10.00
    const description = paymentInfo?.description || 'Test Payment Transaction';

    // Log real transaction attempt
    SecureLogger.logSystemEvent('real_payment_initiated', `Real Stripe payment initiated in ${isTokenMode ? 'token' : 'direct'} mode`, {
        mode: isTokenMode ? 'token' : 'direct',
        apiKeyId: req.apiKeyInfo.id,
        real_transaction: true
    });

    try {
        let paymentResult;

        if (isTokenMode) {
            // Token mode: Process token data (could be real card data or PaymentMethod ID)
            paymentResult = await RealStripeHandler.createPaymentMethodFromToken(JSON.parse(stripeToken), amount, description);
        } else {
            // Direct mode: Create PaymentMethod from card info
            paymentResult = await RealStripeHandler.createPaymentMethod(cardInfo, amount, description);
        }

        // Add timestamp and request ID
        if (paymentResult.success) {
            paymentResult.success.timestamp = new Date().toISOString();
            paymentResult.success.requestId = req.requestId;
        }

        // Log result
        SecureLogger.logPaymentRequest(req, paymentResult);

        res.status(200).json(paymentResult);

    } catch (error) {
        SecureLogger.logApplicationError(error, {
            mode: isTokenMode ? 'token' : 'direct',
            apiKeyId: req.apiKeyInfo?.id,
            real_transaction: true
        });

        res.status(500).json({
            error: 'Real payment processing failed',
            details: error.message,
            type: 'real_transaction_error',
            timestamp: new Date().toISOString(),
            requestId: req.requestId
        });
    }
});

app.post('/api/simulate-payment', RequestValidator.validatePaymentRequest, async (req, res) => {
    const { cardInfo, stripeToken, cardholderName, browserEnv, paymentInfo } = req.body;
    const isTokenMode = req.simulationMode === 'token';

    // Log request initiation with secure data handling
    SecureLogger.logSystemEvent('payment_request_initiated', `Payment simulation request received in ${isTokenMode ? 'token' : 'direct'} mode`, {
        mode: isTokenMode ? 'token' : 'direct',
        hasCardholderName: !!(isTokenMode ? cardholderName : cardInfo?.name),
        hasBrowserEnv: !!browserEnv,
        apiKeyId: req.apiKeyInfo.id
    });

    let browser = null;
    try {
        // Launch browser using secure launcher
        const { browser: launchedBrowser, page } = await SecureBrowserLauncher.launch(browserEnv);
        browser = launchedBrowser;

        let paymentResult;

        if (isTokenMode) {
            // Token Mode: Use PaymentModeHandler
            console.log('Using Token mode - processing with PaymentModeHandler');
            paymentResult = await PaymentModeHandler.handleTokenMode(page, stripeToken, cardholderName, port, paymentInfo);
        } else {
            // Direct Mode: Use PaymentModeHandler
            console.log('Using Direct mode - processing with PaymentModeHandler');
            paymentResult = await PaymentModeHandler.handleDirectMode(page, cardInfo, port, paymentInfo);
        }

        // Add mode and timestamp to result
        if (paymentResult.success) {
            paymentResult.success.mode = isTokenMode ? 'token' : 'direct';
            paymentResult.success.timestamp = new Date().toISOString();
        }

        // Log successful payment simulation
        SecureLogger.logPaymentRequest(req, paymentResult);

        // Add request ID to response
        if (paymentResult.success) {
            paymentResult.success.requestId = req.requestId;
        }

        res.status(200).json(paymentResult);

    } catch (error) {
        // Log application error with full context
        SecureLogger.logApplicationError(error, {
            mode: isTokenMode ? 'token' : 'direct',
            apiKeyId: req.apiKeyInfo?.id,
            requestId: req.requestId,
            hasCardInfo: !isTokenMode && !!cardInfo,
            hasToken: isTokenMode && !!stripeToken
        });

        // Enhanced error handling with specific error types
        let processedError;
        if (error.message.includes('Stripe')) {
            processedError = ErrorHandler.handleStripeError(error);
        } else if (error.message.includes('timeout') || error.message.includes('iframe')) {
            processedError = ErrorHandler.handlePuppeteerError(error);
        } else {
            processedError = {
                type: 'general_error',
                message: 'Payment simulation failed',
                details: error.message
            };
        }

        const errorResult = {
            error: processedError.message,
            type: processedError.type,
            mode: isTokenMode ? 'token' : 'direct',
            timestamp: new Date().toISOString(),
            requestId: req.requestId,
            ...(processedError.retryable && { retryable: true })
        };

        // Log payment request failure
        SecureLogger.logPaymentRequest(req, errorResult);

        // Log security event for payment simulation errors
        SecureLogger.logSecurityEvent('payment_simulation_error', req, {
            errorType: processedError.type,
            errorMessage: processedError.message,
            mode: isTokenMode ? 'token' : 'direct',
            retryable: processedError.retryable || false
        });

        res.status(500).json(errorResult);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// Health check endpoint (no authentication required)
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requestId: req.requestId
    };

    // Log health check access for monitoring
    SecureLogger.logSystemEvent('health_check', 'Health check endpoint accessed', {
        sourceIP: req.ip,
        userAgent: req.get('User-Agent')
    });

    res.status(200).json(healthData);
});

// API status endpoint (requires authentication)
app.get('/api/status', AuthenticationMiddleware.validateApiKey, (req, res) => {
    const statusData = {
        status: 'operational',
        timestamp: new Date().toISOString(),
        apiKeyId: req.apiKeyInfo.id,
        rateLimitInfo: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 100
        },
        systemInfo: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: '1.0.0'
        },
        requestId: req.requestId
    };

    // Log API status check
    SecureLogger.logSystemEvent('api_status_check', 'API status endpoint accessed', {
        apiKeyId: req.apiKeyInfo.id,
        sourceIP: req.ip
    });

    res.status(200).json(statusData);
});

// Global error handlers for comprehensive logging
process.on('uncaughtException', (error) => {
    SecureLogger.logApplicationError(error, {
        type: 'uncaught_exception',
        fatal: true
    });

    SecureLogger.logSystemEvent('server_shutdown', 'Server shutting down due to uncaught exception', {
        reason: 'uncaught_exception',
        error: error.message
    });

    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    SecureLogger.logApplicationError(new Error(`Unhandled Rejection: ${reason}`), {
        type: 'unhandled_rejection',
        promise: promise.toString()
    });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    SecureLogger.logSystemEvent('server_shutdown', 'Server received SIGTERM, shutting down gracefully', {
        signal: 'SIGTERM',
        uptime: process.uptime()
    });
    process.exit(0);
});

process.on('SIGINT', () => {
    SecureLogger.logSystemEvent('server_shutdown', 'Server received SIGINT, shutting down gracefully', {
        signal: 'SIGINT',
        uptime: process.uptime()
    });
    process.exit(0);
});

app.listen(port, () => {
    SecureLogger.logSystemEvent('server_ready', 'Payment Security API server is ready to accept connections', {
        port: port,
        endpoints: {
            health: `/health`,
            apiStatus: `/api/status`,
            paymentSimulation: `/api/simulate-payment`
        },
        security: {
            rateLimitEnabled: true,
            apiKeyAuthEnabled: true,
            corsEnabled: false
        }
    });

    // Legacy console logs for backward compatibility
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Health check available at http://localhost:${port}/health`);
    console.log(`API status available at http://localhost:${port}/api/status`);
});

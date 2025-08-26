
const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/simulate-payment', async (req, res) => {
    console.log('Received simulation request:', req.body);

    const { cardInfo, browserEnv } = req.body;

    if (!cardInfo || !browserEnv) {
        return res.status(400).json({ error: 'Missing cardInfo or browserEnv in request body' });
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        if (browserEnv.userAgent) {
            await page.setUserAgent(browserEnv.userAgent);
        }
        if (browserEnv.viewport) {
            await page.setViewport(browserEnv.viewport);
        }

        await page.goto(`http://localhost:${port}/payment-test.html`, { waitUntil: 'networkidle2' });

        await page.waitForSelector('#payment-form');

        // --- Data Filling ---
        if (cardInfo.name) {
            await page.type('#card-name', cardInfo.name);
        }

        // Wait for Stripe Elements to load
        await page.waitForSelector('#card-element iframe');
        
        // Wait a bit more for Stripe to fully initialize
        await page.waitForTimeout(2000);

        // --- Handle Stripe iFrame ---
        // Find the Stripe iframe
        const stripeFrame = await page.frames().find(frame => 
            frame.url().includes('js.stripe.com')
        );

        if (!stripeFrame) {
            throw new Error('Stripe iframe not found');
        }

        // Wait for the card input fields to be available
        await stripeFrame.waitForSelector('input[name="cardnumber"]', { timeout: 10000 });

        // Type card information into Stripe Elements
        await stripeFrame.type('input[name="cardnumber"]', cardInfo.number, { delay: 100 });
        await stripeFrame.type('input[name="exp-date"]', `${cardInfo.expMonth}${cardInfo.expYear.slice(-2)}`, { delay: 100 });
        await stripeFrame.type('input[name="cvc"]', cardInfo.cvv, { delay: 100 });

        // Now trigger the payment submission
        const paymentResult = await page.evaluate(async () => {
            return await window.triggerStripePayment();
        });

        console.log('Simulation result:', paymentResult);
        res.status(200).json(paymentResult);

    } catch (error) {
        console.error('Error during payment simulation:', error);
        res.status(500).json({ error: 'Failed to simulate payment.', details: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

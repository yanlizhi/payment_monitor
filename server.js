
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
        await page.waitForSelector('#card-element iframe', { timeout: 15000 });

        // Give Stripe a moment to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));

        // --- Handle Stripe iFrame ---
        // Find the Stripe iframe
        const frames = page.frames();
        console.log('Available frames:', frames.map(f => f.url()));

        const stripeFrame = frames.find(frame =>
            frame.url().includes('elements-inner-card')
        );

        if (!stripeFrame) {
            throw new Error('Stripe card input iframe not found');
        }

        console.log('Found Stripe card frame:', stripeFrame.url());

        // Wait for the card input fields to be available
        await stripeFrame.waitForSelector('input[name="cardnumber"]', { timeout: 15000 });

        // Type card information into Stripe Elements
        console.log('Typing card information...');
        await stripeFrame.type('input[name="cardnumber"]', cardInfo.number, { delay: 100 });
        await stripeFrame.type('input[name="exp-date"]', `${cardInfo.expMonth}${cardInfo.expYear.slice(-2)}`, { delay: 100 });
        await stripeFrame.type('input[name="cvc"]', cardInfo.cvv, { delay: 100 });

        // Add postal code if available
        if (cardInfo.postalCode) {
            try {
                await stripeFrame.waitForSelector('input[name="postal"]', { timeout: 2000 });
                await stripeFrame.type('input[name="postal"]', cardInfo.postalCode, { delay: 100 });
                console.log('Postal code entered');
            } catch (e) {
                console.log('Postal code field not found or not required');
            }
        }

        console.log('Card information entered, triggering payment...');

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


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

        // --- IMPORTANT: Handle Stripe iFrame ---
        // Stripe Elements are in an iframe, so we need to find the frame and type into it.
        await page.waitForSelector('iframe[src^="https://js.stripe.com"]');
        const stripeFrame = page.frames().find(f => f.url().startsWith('https://js.stripe.com'));

        if (!stripeFrame) {
            throw new Error('Stripe iframe not found');
        }

        // Type into the iframe's input fields.
        // Selectors are based on current Stripe Element structure and may need updates if Stripe changes them.
        await stripeFrame.type('input[name="cardnumber"]', cardInfo.number);
        await stripeFrame.type('input[name="exp-date"]', `${cardInfo.expMonth}${cardInfo.expYear}`);
        await stripeFrame.type('input[name="cvc"]', cardInfo.cvv);

        // Now, trigger the payment submission on the page
        const paymentResult = await page.evaluate(async () => {
            // The data has been typed, now we just call the function which will use the data from the Elements
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

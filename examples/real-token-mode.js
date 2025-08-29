// 真实Token模式实现示例

// 前端：使用Stripe Elements创建真实Token
async function createRealToken() {
    const stripe = Stripe('pk_test_your_real_publishable_key');
    const elements = stripe.elements();
    const cardElement = elements.create('card');
    
    // 挂载到隐藏元素
    const hiddenDiv = document.createElement('div');
    hiddenDiv.style.display = 'none';
    document.body.appendChild(hiddenDiv);
    cardElement.mount(hiddenDiv);
    
    // 创建真实PaymentMethod
    const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
            name: cardInfo.name
        }
    });
    
    // 清理
    cardElement.unmount();
    document.body.removeChild(hiddenDiv);
    
    if (error) {
        throw new Error(`Real token creation failed: ${error.message}`);
    }
    
    return {
        id: paymentMethod.id, // 真实的pm_xxx ID
        card: {
            last4: paymentMethod.card.last4,
            brand: paymentMethod.card.brand,
            exp_month: paymentMethod.card.exp_month,
            exp_year: paymentMethod.card.exp_year
        }
    };
}

// 后端：处理真实Token
window.triggerStripePaymentWithRealToken = async (paymentMethodId) => {
    try {
        // 这里可以调用你的后端API来处理真实的PaymentMethod
        const response = await fetch('/api/process-real-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk_test_your_secret_key'
            },
            body: JSON.stringify({
                payment_method: paymentMethodId,
                amount: 2000, // $20.00 in cents
                currency: 'usd',
                confirm: true
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'succeeded') {
            return {
                success: {
                    paymentIntentId: result.id,
                    paymentMethodId: paymentMethodId,
                    mode: 'real_token',
                    amount: result.amount,
                    status: result.status
                }
            };
        } else {
            return { error: `Payment failed: ${result.status}` };
        }
        
    } catch (error) {
        return { error: error.message };
    }
};

// 服务器端：真实支付处理
app.post('/api/process-real-payment', async (req, res) => {
    const stripe = require('stripe')('sk_test_your_secret_key');
    
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: req.body.amount,
            currency: req.body.currency,
            payment_method: req.body.payment_method,
            confirm: req.body.confirm
        });
        
        res.json(paymentIntent);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
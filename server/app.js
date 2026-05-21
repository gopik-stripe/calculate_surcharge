const Stripe = require('stripe');
const express = require('express');

const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
  throw new Error('Missing STRIPE_SECRET_KEY (set in .env locally or in Vercel / hosting env).');
}
const stripe = new Stripe(stripeSecret);
const app = express();

const SIGNING_SECRET = 'whsec_...'; // from Stripe Dashboard after EventDestination creation
const HEALTH_SECRET = process.env.HEALTH_SIGNING_SECRET || '';

// SURCHARGE ENDPOINT
app.post('/calculate_surcharge', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1. Verify the request is genuinely from Stripe
  /*
  try {
    stripe.webhooks.signature.verifyHeader(req.body, req.headers['stripe-signature'], SIGNING_SECRET);
  } catch (err) {
    return res.status(400).json({ code: 'unable_to_verify_signature', message: err.message });
  }
    */

  const { amount_total, payment_method_details, billing_details } = JSON.parse(req.body).data;
  const card = payment_method_details?.card;

  // 2. AU rules: all cards eligible, but must not exceed cost of acceptance
  //    Stripe platform cap: 4% for AU
  //    RBA/ACCC: must not exceed merchant's actual cost of acceptance
  //const MERCHANT_COA_PERCENT = 1.5;   // e.g. from acquirer statement — adjust per merchant
  //const STRIPE_MAX_PERCENT   = 4.0;   // Stripe's AU platform cap
  const SURCHARGE_PERCENT = 2.0; // Only applicable for Amex cards

  if (payment_method_details?.type !== 'card' && payment_method_details.card.brand !== 'amex') {
    return res.json({ surcharge_eligible: false });
  }

  // 3. Check jurisdiction (card issuing country or billing country is AU)
  const relevantCountry = card?.country || billing_details?.address?.country;
  if (relevantCountry !== 'AU') {
    return res.json({ surcharge_eligible: false });
  }

  // 4. Calculate surcharge
  const surchargeAmount = Math.floor(amount_total.value * (SURCHARGE_PERCENT / 100));

  res.json({
    surcharge_eligible: true,
    surcharge: {
      amount: { value: surchargeAmount, currency: amount_total.currency },
      reason: 'Card processing fee',
    },
    metadata: { calculation_id: `calc_${Date.now()}` },
  });
});

// HEALTH CHECK ENDPOINT
app.post('/verify-health', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    stripe.webhooks.signature.verifyHeader(req.body, req.headers['stripe-signature'], HEALTH_SECRET);
    res.json({ status: 'ready' });
  } catch (err) {
    res.json({ status: 'failure', failure: { error_code: 'sig_error', error_message: err.message } });
  }
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server listening at http://localhost:${PORT}`);
  });
}

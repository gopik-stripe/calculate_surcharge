require('dotenv').config();

const Stripe = require('stripe');
const express = require('express');

// Lazy-init so `vercel build` can load this module without STRIPE_SECRET_KEY
// (build time often has no env). Runtime on Vercel must set STRIPE_SECRET_KEY.
let stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        'Missing STRIPE_SECRET_KEY. Add it in .env locally or under Vercel → Settings → Environment Variables.'
      );
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

const app = express();

// Remote function signing secrets (Stripe Dashboard → your remote endpoint / webhook secret)
const SIGNING_SECRET = process.env.STRIPE_SURCHARGE_SIGNING_SECRET || '';
const HEALTH_SECRET = process.env.HEALTH_SIGNING_SECRET || '';

// SURCHARGE ENDPOINT
app.post('/calculate_surcharge', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1. Verify the request is genuinely from Stripe
  /*
  try {
    getStripe().webhooks.signature.verifyHeader(req.body, req.headers['stripe-signature'], SIGNING_SECRET);
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
  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    return res.status(500).json({
      status: 'failure',
      failure: { error_code: 'missing_config', error_message: err.message },
    });
  }
  try {
    stripe.webhooks.signature.verifyHeader(req.body, req.headers['stripe-signature'], HEALTH_SECRET);
    res.json({ status: 'ready' });
  } catch (err) {
    res.json({ status: 'failure', failure: { error_code: 'sig_error', error_message: err.message } });
  }
});

module.exports = app;

if (require.main === module) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      'Missing STRIPE_SECRET_KEY. Copy .env.example to .env and set your secret key.'
    );
  }
  getStripe(); // fail fast locally if key is invalid
  const { listenWithPortFallback } = require('./listen-dev');
  const basePort = Number(process.env.PORT) || 3001;
  listenWithPortFallback(app, basePort);
}

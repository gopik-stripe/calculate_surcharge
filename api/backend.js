'use strict';

/**
 * Local dev entry if you run `node api/backend.js` (from repo root or from `api/`).
 * Prefer: `npm run dev` or `node server/app.js` from the repo root.
 *
 * Omitted from Vercel builds via root `.vercelignore` so only `api/index.js` is deployed.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('../server/app');
const { listenWithPortFallback } = require('../server/listen-dev');

const basePort = Number(process.env.PORT) || 3001;
listenWithPortFallback(app, basePort);

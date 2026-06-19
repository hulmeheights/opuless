# Opuless storefront (opuless.co)

Bespoke single-page storefront for Opuless, deployed on Vercel.
Customer stays on opuless.co for the whole journey, including payment.

## Structure
- `index.html` — the full storefront (products, bag, on-page checkout)
- `api/checkout.js` — serverless: charges Square, emails confirmation (Resend), best-effort records the order in WooCommerce for Selfnamed fulfilment
- `api/config.js` — returns the PUBLIC Square app + location IDs to the card form

## Deploys
Connected to Vercel. Every push to `main` deploys automatically — no terminal needed.

## Environment variables (set in Vercel, NEVER in this repo)
- `SQUARE_ACCESS_TOKEN` (secret) — required to take payment
- `SQUARE_LOCATION_ID`, `SQUARE_APP_ID` — public Square IDs (also hardcoded as fallback)
- `RESEND_API_KEY` — order confirmation emails
- `WC_URL`, `WC_KEY`, `WC_SECRET` — WooCommerce order recording (fulfilment)

## Discount codes
Defined in `api/checkout.js` (`DISCOUNTS`) and mirrored in `index.html` (`CODES`).
`ATCOST` = at-cost owner testing (sets product subtotal to ~cost; delivery added).

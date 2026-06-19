// Returns the PUBLIC Square identifiers the on-page card form needs to render.
// These are NOT secret (they're sent to the browser anyway). The secret access token stays
// server-side in checkout.js. Hardcoded so the form never depends on env vars loading.
export default function handler(req, res) {
  res.status(200).json({
    appId: process.env.SQUARE_APP_ID || 'sq0idp-oqIrIgt-hmCuPsq1ovFeng',
    locationId: process.env.SQUARE_LOCATION_ID || 'LP6SQ281BJV6B'
  });
}

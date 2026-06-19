// Opuless headless checkout (Vercel).
// 1) charges the card with Square (the only charge that happens)
// 2) emails an order confirmation (Resend) — guaranteed if RESEND_API_KEY is set
// 3) best-effort records the order in WooCommerce (works once its REST API responds; never blocks the sale)
// Customer never sees opuless.store. Prices come from THIS file, never from the browser.

const PRICES = {
  'vitamin-c-serum':2800,'exosome-niacinamide-serum':3300,'retinol-alternative-oil-serum':3000,
  'all-in-one-facial-oil':2700,'foundation-with-peptides':4600,'sunscreen-spf30-tint':2700,
  'hydrating-toner':2000,'brightening-eye-cream':2600,'ceramide-barrier-night-cream':3400,
  'moisturising-day-cream':3200,'antioxidant-ginkgo-gel-booster':2900,'double-hydration-gel-booster':2900,
  'acne-spot-care':2400,'micellar-cleansing-water':1900,'cleansing-foam':2100,
  'sensitive-oil-milk-cleanser':3000,'moisturising-shampoo':2200,'moisturising-conditioner':2200,
  'test-checkout':100
};
const NAMES = {
  'vitamin-c-serum':'Vitamin C Serum','exosome-niacinamide-serum':'Exosome Niacinamide Serum','retinol-alternative-oil-serum':'Retinol-Alt Oil Serum',
  'all-in-one-facial-oil':'All-in-One Facial Oil','foundation-with-peptides':'Foundation w/ Peptides','sunscreen-spf30-tint':'Sunscreen SPF30 Tint',
  'hydrating-toner':'Hydrating Toner','brightening-eye-cream':'Brightening Eye Cream','ceramide-barrier-night-cream':'Ceramide Night Cream',
  'moisturising-day-cream':'Moisturising Day Cream','antioxidant-ginkgo-gel-booster':'Ginkgo Gel Booster','double-hydration-gel-booster':'Double Hydration Booster',
  'acne-spot-care':'Acne Spot Care','micellar-cleansing-water':'Micellar Water','cleansing-foam':'Cleansing Foam',
  'sensitive-oil-milk-cleanser':'Oil-Milk Cleanser','moisturising-shampoo':'Moisturising Shampoo','moisturising-conditioner':'Moisturising Conditioner',
  'test-checkout':'TEST checkout (ignore)'
};
const SLUG_TO_WCID = {
  'vitamin-c-serum':104,'exosome-niacinamide-serum':145,'retinol-alternative-oil-serum':153,'all-in-one-facial-oil':100,
  'foundation-with-peptides':115,'sunscreen-spf30-tint':107,'hydrating-toner':111,'brightening-eye-cream':136,
  'ceramide-barrier-night-cream':157,'moisturising-day-cream':96,'antioxidant-ginkgo-gel-booster':135,'double-hydration-gel-booster':134,
  'acne-spot-care':81,'micellar-cleansing-water':149,'cleansing-foam':84,'sensitive-oil-milk-cleanser':160,
  'moisturising-shampoo':88,'moisturising-conditioner':92
};
const DISCOUNTS = {};
const FREE_SHIP_THRESHOLD = 4000;
const SHIPPING = 495;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const sourceId = b.source_id;
    const items = Array.isArray(b.items) ? b.items : [];
    const customer = b.customer || {};
    const shipping = b.shipping || {};
    const code = (b.discount_code || '').trim().toUpperCase();

    if (!sourceId) { res.status(400).json({ error: 'Missing payment details.' }); return; }
    if (!items.length) { res.status(400).json({ error: 'Your bag is empty.' }); return; }

    let subtotal = 0; const lineItems = []; let allTest = true;
    for (const it of items) {
      const slug = String(it.slug || ''); const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      if (!(slug in PRICES)) { res.status(400).json({ error: 'Unknown product: ' + slug }); return; }
      subtotal += PRICES[slug] * qty;
      if (slug !== 'test-checkout') allTest = false;
      if (SLUG_TO_WCID[slug]) lineItems.push({ product_id: SLUG_TO_WCID[slug], quantity: qty });
    }

    let discount = 0;
    if (code && DISCOUNTS[code]) {
      const d = DISCOUNTS[code];
      if (d.type === 'percent') discount = Math.round(subtotal * d.value / 100);
      else if (d.type === 'set_subtotal') discount = Math.max(0, subtotal - d.value);
      else discount = d.value;
      if (discount > subtotal) discount = subtotal;
    }

    const shippingCost = allTest ? 0 : ((subtotal - discount) >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING);
    const total = subtotal - discount + shippingCost;
    if (total < 100) { res.status(400).json({ error: 'Order total is below the minimum.' }); return; }

    const nm = (customer.name || ((customer.first_name || '') + ' ' + (customer.last_name || ''))).trim();
    const addr = [shipping.address_1, shipping.address_2, shipping.city, shipping.postcode].filter(Boolean).join(', ');
    const itemSummary = items.map(function (it) { var s = String(it.slug || ''); var q = Math.max(1, parseInt(it.qty, 10) || 1); return (NAMES[s] || s) + ' x' + q; }).join(', ');
    const note = ('OPULESS | ' + nm + ' | ' + (customer.email || '') + ' | ' + addr + ' | ' + itemSummary).slice(0, 480);

    // 1) Charge
    const pay = await fetch('https://connect.squareup.com/v2/payments', {
      method: 'POST',
      headers: { 'Square-Version': '2026-05-20', 'Authorization': 'Bearer ' + process.env.SQUARE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)),
        source_id: sourceId, location_id: process.env.SQUARE_LOCATION_ID,
        amount_money: { amount: total, currency: 'GBP' }, autocomplete: true,
        buyer_email_address: customer.email || undefined, note: note
      })
    });
    const payData = await pay.json();
    if (!pay.ok || !payData.payment || payData.payment.status === 'FAILED') {
      res.status(402).json({ error: 'Payment was declined. Please check your card details.', detail: payData.errors || payData }); return;
    }
    const paymentId = payData.payment.id;

    // 2) Confirmation email (Resend)
    if (process.env.RESEND_API_KEY) {
      try {
        const itemsHtml = items.map(function (it) { var s = String(it.slug || ''); var q = Math.max(1, parseInt(it.qty, 10) || 1); return '<tr><td style="padding:4px 0">' + (NAMES[s] || s) + ' &times; ' + q + '</td><td style="padding:4px 0;text-align:right">&pound;' + (((PRICES[s] || 0) * q) / 100).toFixed(2) + '</td></tr>'; }).join('');
        const html = '<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1a1a1a;padding:8px"><h1 style="font-weight:400;font-size:24px">Order confirmed</h1><p>Thank you' + (nm ? (', ' + nm.split(' ')[0]) : '') + ' \u2014 we\u2019ve received your order and it\u2019s being prepared.</p><table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:14px">' + itemsHtml + '<tr><td style="padding-top:8px">Delivery</td><td style="padding-top:8px;text-align:right">' + (shippingCost ? ('&pound;' + (shippingCost / 100).toFixed(2)) : 'Free') + '</td></tr><tr><td style="font-weight:700;border-top:1px solid #ddd;padding-top:8px">Total</td><td style="font-weight:700;border-top:1px solid #ddd;padding-top:8px;text-align:right">&pound;' + (total / 100).toFixed(2) + '</td></tr></table><p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#666;margin-top:16px">Shipping to: ' + addr + '</p><p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#999">Opuless &middot; Considered skincare &amp; hair</p></div>';
        const rr = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.RESEND_FROM || 'Opuless <onboarding@resend.dev>', to: [customer.email], subject: 'Your Opuless order is confirmed', html: html })
        });
        const rj = await rr.json().catch(function(){ return {}; });
        if (!rr.ok) console.error('RESEND_FAIL ' + rr.status + ' ' + JSON.stringify(rj));
        else console.log('RESEND_OK ' + (rj.id || ''));
      } catch (e) { console.error('RESEND_ERROR ' + String(e)); }
    } else { console.error('RESEND_NO_KEY'); }

    // 3) Best-effort WooCommerce order (fulfilment). Skipped for the test item; never blocks the sale.
    // Accept either naming scheme for the credentials, and strip any trailing slash from the URL.
    const WC_URL = (process.env.WC_STORE_URL || process.env.WC_URL || '').replace(/\/+$/, '');
    const WC_KEY = process.env.WC_CONSUMER_KEY || process.env.WC_KEY;
    const WC_SECRET = process.env.WC_CONSUMER_SECRET || process.env.WC_SECRET;
    if (WC_URL && WC_KEY && WC_SECRET && lineItems.length) {
      try {
        const auth = 'Basic ' + Buffer.from(WC_KEY + ':' + WC_SECRET).toString('base64');
        const orderBody = {
          payment_method: 'opuless_card', payment_method_title: 'Card (Square)', set_paid: true, transaction_id: paymentId,
          billing: { first_name: customer.first_name || nm, last_name: customer.last_name || '', email: customer.email || '', phone: customer.phone || '', address_1: shipping.address_1 || '', address_2: shipping.address_2 || '', city: shipping.city || '', postcode: shipping.postcode || '', country: shipping.country || 'GB' },
          shipping: { first_name: customer.first_name || nm, last_name: customer.last_name || '', address_1: shipping.address_1 || '', address_2: shipping.address_2 || '', city: shipping.city || '', postcode: shipping.postcode || '', country: shipping.country || 'GB' },
          line_items: lineItems,
          shipping_lines: [{ method_id: shippingCost ? 'flat_rate' : 'free_shipping', method_title: shippingCost ? 'UK delivery' : 'Free UK delivery', total: (shippingCost / 100).toFixed(2) }]
        };
        if (discount > 0) orderBody.fee_lines = [{ name: 'Discount' + (code ? (' (' + code + ')') : ''), total: '-' + (discount / 100).toFixed(2) }];
        const wc = await fetch(WC_URL + '/wp-json/wc/v3/orders', { method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify(orderBody) });
        const wcData = await wc.json();
        if (wc.ok) console.log('WC_OK order ' + wcData.id); else console.error('WC_FAIL ' + wc.status + ' ' + JSON.stringify(wcData).slice(0, 300));
        res.status(200).json({ ok: true, paid: true, order_recorded: !!wc.ok, order_id: wc.ok ? wcData.id : undefined, payment_id: paymentId }); return;
      } catch (e) { console.error('WC_ERROR ' + String(e)); res.status(200).json({ ok: true, paid: true, order_recorded: false, payment_id: paymentId }); return; }
    }

    console.log('WC_SKIPPED no-credentials-or-no-line-items');
    res.status(200).json({ ok: true, paid: true, order_recorded: false, payment_id: paymentId });
  } catch (e) {
    res.status(500).json({ error: 'Something went wrong at checkout.', detail: String(e) });
  }
}

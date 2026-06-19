// TEMPORARY read-only diagnostic. Key-gated. Remove after use.
// Shows products (ids, sku, Selfnamed linkage meta) and recent orders' line items,
// so we can see whether the synced products got new IDs and what the orders reference.
export default async function handler(req, res) {
  const KEY = 'opl-diag-9f3k7Q';
  if ((req.query.key || '') !== KEY) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    const WC_URL = (process.env.WC_STORE_URL || process.env.WC_URL || '').replace(/\/+$/, '');
    const WC_KEY = process.env.WC_CONSUMER_KEY || process.env.WC_KEY;
    const WC_SECRET = process.env.WC_CONSUMER_SECRET || process.env.WC_SECRET;
    if (!WC_URL || !WC_KEY || !WC_SECRET) { res.status(200).json({ error: 'WC credentials missing in env', have: { WC_URL: !!WC_URL, WC_KEY: !!WC_KEY, WC_SECRET: !!WC_SECRET } }); return; }
    const auth = 'Basic ' + Buffer.from(WC_KEY + ':' + WC_SECRET).toString('base64');

    const pr = await fetch(WC_URL + '/wp-json/wc/v3/products?per_page=100&status=any', { headers: { Authorization: auth } });
    const prRaw = await pr.text();
    let products; try { products = JSON.parse(prRaw); } catch (e) { products = null; }
    const prodSummary = Array.isArray(products) ? products.map(function (p) {
      const snMeta = (p.meta_data || []).filter(function (m) { return /self.?named|^_sn_|selfnamed/i.test(String(m.key)); }).map(function (m) { return m.key + '=' + (typeof m.value === 'object' ? JSON.stringify(m.value) : m.value); });
      return { id: p.id, name: p.name, sku: p.sku, type: p.type, status: p.status, selfnamed_meta: snMeta };
    }) : { parse_failed: true, sample: prRaw.slice(0, 300) };

    const or = await fetch(WC_URL + '/wp-json/wc/v3/orders?per_page=5&orderby=date&order=desc', { headers: { Authorization: auth } });
    const orRaw = await or.text();
    let orders; try { orders = JSON.parse(orRaw); } catch (e) { orders = null; }
    const orderSummary = Array.isArray(orders) ? orders.map(function (o) {
      return { id: o.id, status: o.status, total: o.total, created: o.date_created, line_items: (o.line_items || []).map(function (li) { return { product_id: li.product_id, name: li.name, sku: li.sku, qty: li.quantity }; }) };
    }) : { parse_failed: true, sample: orRaw.slice(0, 300) };

    res.status(200).json({
      wc_url: WC_URL,
      products_http_status: pr.status,
      product_count: Array.isArray(products) ? products.length : null,
      products: prodSummary,
      orders_http_status: or.status,
      recent_orders: orderSummary
    });
  } catch (e) {
    res.status(200).json({ error: 'diag failed', detail: String(e) });
  }
}

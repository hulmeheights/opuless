// TEMPORARY read/write diagnostic. Key-gated. Remove after use.
// ?publish=1 publishes any Selfnamed-linked draft products and returns the linked list (id, name, status, selfnamed id).
export default async function handler(req, res) {
  const KEY = 'opl-diag-9f3k7Q';
  if ((req.query.key || '') !== KEY) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    const WC_URL = (process.env.WC_STORE_URL || process.env.WC_URL || '').replace(/\/+$/, '');
    const WC_KEY = process.env.WC_CONSUMER_KEY || process.env.WC_KEY;
    const WC_SECRET = process.env.WC_CONSUMER_SECRET || process.env.WC_SECRET;
    const auth = 'Basic ' + Buffer.from(WC_KEY + ':' + WC_SECRET).toString('base64');

    const pr = await fetch(WC_URL + '/wp-json/wc/v3/products?per_page=100&status=any', { headers: { Authorization: auth } });
    let products = await pr.json();
    if (!Array.isArray(products)) products = [];

    function snId(p) { var m = (p.meta_data || []).find(function (x) { return /_selfnamed_product_id/i.test(String(x.key)); }); return m ? m.value : null; }
    var linked = products.filter(function (p) { return snId(p); });

    var published_now = [];
    if (req.query.publish === '1') {
      for (var i = 0; i < linked.length; i++) {
        var p = linked[i];
        if (p.status !== 'publish') {
          try {
            var up = await fetch(WC_URL + '/wp-json/wc/v3/products/' + p.id, { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'publish' }) });
            var upj = await up.json();
            p.status = (upj && upj.status) ? upj.status : p.status;
            published_now.push({ id: p.id, name: p.name, new_status: p.status });
          } catch (e) { published_now.push({ id: p.id, name: p.name, error: String(e) }); }
        }
      }
    }

    var linked_products = linked.map(function (p) { return { id: p.id, name: p.name, status: p.status, selfnamed_product_id: snId(p) }; });

    res.status(200).json({
      wc_url: WC_URL,
      total_products: products.length,
      linked_count: linked.length,
      published_now: published_now,
      linked_products: linked_products
    });
  } catch (e) {
    res.status(200).json({ error: 'diag failed', detail: String(e) });
  }
}

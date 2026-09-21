import http from 'node:http';
// Public envelope/fields follow tests/e2e/catalog.spec.ts; no production data.
const menu = { categories: [{ id: 'jev-grill', name: 'Bò nướng', slug: 'bo-nuong', sort_order: 1 }], items: [{
  id: 'jev-beef', category_id: 'jev-grill', name: 'Bò tơ nướng tảng sốt tiêu', slug: 'bo-to-nuong', description: 'Món thử nghiệm',
  price_vnd: 185000, image_path: '/images/bo-nuong.jpg', image_url: '/images/bo-nuong.jpg', available: true, is_available: true,
  allow_dine_in: true, allow_delivery: true, featured_rank: 1, is_featured: true, tags: [], serving_size: '2-3 người',
  pairing_note: '', delivery_eta: '25-35 phút', spice_level: 0, is_signature: true, is_bestseller: false, is_new: false,
}] };
const settings = { name: 'Tiger 345', phone: '000 000 0000', address: 'Synthetic test location', opening_hours_text: '10:00 - 23:00',
  accepting_delivery_orders: false, booking_enabled: false, min_delivery_order_vnd: 100000,
  business_hours: [], business_closures: [], delivery_zones: [], seating_areas: [] };
export async function startFixture() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-request-id,x-client-info');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    const data = path === '/functions/v1/public-api/menu' ? menu : path === '/functions/v1/public-api/settings' ? settings : null;
    if (req.method === 'OPTIONS' && data) { res.writeHead(204); res.end(); return; }
    if (req.method !== 'GET' || !data) { res.writeHead(403); res.end(JSON.stringify({error:{code:'FIXTURE_DENIED',message:'Read-only fixture'},requestId:'jev-fixture'})); return; }
    res.end(JSON.stringify({data, requestId:'jev-fixture'}));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

/**
 * Minimal smoke test: pings backend health and optional routes.
 * Usage: node scripts/smoke-test.js [baseUrl]
 * Example: node scripts/smoke-test.js http://localhost:5001
 * Exit: 0 if all pass, 1 otherwise.
 */

const base = process.argv[2] || 'http://localhost:5001';

async function get(url) {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function run() {
  console.log('Smoke test:', base);

  const health = await get(`${base}/api/health`);
  if (!health.ok) {
    console.error('  /api/health FAIL:', health.status);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(health.body);
  } catch {
    console.error('  /api/health FAIL: invalid JSON');
    process.exit(1);
  }
  if (!data.success) {
    console.error('  /api/health FAIL: success !== true');
    process.exit(1);
  }
  console.log('  /api/health OK');

  // Optional: ping a route that exists but may require auth (expect 401 or 200)
  const me = await get(`${base}/api/user/me`);
  if (me.status !== 200 && me.status !== 401) {
    console.error('  /api/user/me unexpected status:', me.status);
    process.exit(1);
  }
  console.log('  /api/user/me reachable (status', me.status + ')');

  console.log('Smoke test passed.');
}

run().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});

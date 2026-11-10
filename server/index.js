import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent, searchDemo, searchLive } from './search.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

function loadLocalEnv() {
  const filename = path.join(ROOT, '.env');
  if (!fs.existsSync(filename)) return;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const entry = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (entry && !(entry[1] in process.env)) process.env[entry[1]] = entry[2].replace(/^['"]|['"]$/g,'');
  }
}
loadLocalEnv();

const TYPES = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json; charset=utf-8' };
const caches = new Map();
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(data));
}
function commonHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','geolocation=(self)');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; connect-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}

export function createApp({ key = process.env.SERPAPI_API_KEY, liveSearch = searchLive } = {}) {
  const requestBuckets = new Map();
  return async function handler(req,res) {
    commonHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') return json(res,405,{ error:'Method not allowed' });
    if (url.pathname === '/api/health') return json(res,200,{ ok:true });
    if (url.pathname === '/api/config') return json(res,200,{ liveEnabled:Boolean(key), demoEnabled:true, cities:['Abu Dhabi','Dubai','Sharjah','Al Ain','Ajman','Ras Al Khaimah','Fujairah','Umm Al Quwain'] });
    if (url.pathname === '/api/search') {
      const originalQuery = (url.searchParams.get('q') || '').trim();
      const city = (url.searchParams.get('city') || 'Abu Dhabi').slice(0,60);
      const mode = url.searchParams.get('mode') === 'live' ? 'live' : 'demo';
      if (originalQuery.length > 260) return json(res,400,{error:'Search is limited to 260 characters.'});
      if (mode === 'live' && !key) return json(res,503,{error:'Live shopping data is not configured. Add SERPAPI_API_KEY in .env to enable it.'});
      if (mode === 'live' && !originalQuery) return json(res,400,{error:'Enter a product to search live shopping results.'});
      if (mode === 'live') {
        const ip = req.socket.remoteAddress || 'unknown';
        const now = Date.now(), recent = (requestBuckets.get(ip)||[]).filter(ts=>now-ts<5*60*1000);
        if (recent.length >= 20) return json(res,429,{error:'Too many live searches. Please try again in a few minutes.'});
        recent.push(now); requestBuckets.set(ip,recent);
        if (requestBuckets.size > 10000) requestBuckets.clear();
      }
      const intent = parseIntent(originalQuery);
      try {
        let products, coverageNote, cacheHit = false;
        if (mode === 'demo') {
          ({ products } = searchDemo(originalQuery));
          coverageNote = 'Illustrative product data only. All demo prices, discounts, store listings and delivery times are fictional examples.';
        } else {
          const cacheKey = `${city}:${intent.query.toLowerCase()}`;
          const entry = caches.get(cacheKey);
          if (entry && Date.now() - entry.time < 4 * 60 * 1000) {
            ({ products, coverageNote } = entry.value);
            cacheHit = true;
          } else {
            ({ products, coverageNote } = await liveSearch(intent.query, city, key));
            if (caches.size > 80) caches.clear();
            caches.set(cacheKey, { time:Date.now(), value:{products, coverageNote} });
          }
        }
        return json(res,200,{
          products, intent, mode, city, cached:cacheHit, coverageNote,
          retrievedAt: new Date().toISOString(), count:products.length,
        });
      } catch (err) {
        console.error('[search] Shopping discovery request failed:', err.name || 'Error');
        return json(res,502,{error:'Live shopping search could not be completed. Check your API configuration or try again.', detail:process.env.NODE_ENV === 'development' ? err.message : undefined });
      }
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    let decoded;
    try { decoded = decodeURIComponent(pathname); }
    catch { return json(res,400,{error:'Invalid file path'}); }
    const local = path.resolve(PUBLIC, '.' + decoded);
    if (!local.startsWith(PUBLIC + path.sep) && local !== PUBLIC) return json(res,403,{error:'Forbidden'});
    if (!fs.existsSync(local) || !fs.statSync(local).isFile()) return json(res,404,{error:'Not found'});
    res.writeHead(200, { 'Content-Type':TYPES[path.extname(local).toLowerCase()] || 'application/octet-stream', 'Cache-Control':local.endsWith('index.html') ? 'no-cache' : 'public, max-age=1800' });
    fs.createReadStream(local).pipe(res);
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const server = http.createServer(createApp());
  server.listen(port, '0.0.0.0', () => console.log(`Product Finder AI ready at http://localhost:${port} (${process.env.SERPAPI_API_KEY ? 'live + demo' : 'demo only'})`));
}

import { DEMO_PRODUCTS } from './demo-data.js';

const STOP = new Set('a an the me my i want find show search for please can you could you get buy need to of in with that which is are cheap cheapest affordable lowest best top price good deals deal available at from on it want looking give some me delivered deliver delivery shipping ship and or one item product products offers option options around near under below less than maximum max no more than within'.split(' '));
const CATEGORY_ALIASES = [
  ['Phones',/\b(phone|phones|iphone|smartphone|samsung galaxy|galaxy s\d{1,2}|pixel \d|mobile)\b/i],
  ['Audio',/\b(airpods|earbuds|headphone|headphones|earphone|sony wh-|bose)\b/i],
  ['Kitchen',/\b(air ?fryer|espresso|coffee|nespresso|kitchen)\b/i],
  ['Toys',/\b(toy|toys|grasshopper|lizard|falcon|figurines?)\b/i],
  ['Fashion',/\b(shoes?|sneakers?|nike|adidas|running)\b/i],
  ['Computers',/\b(laptop|macbook|computer|logitech|mouse|dell xps)\b/i],
  ['Wearables',/\b(smartwatch|smart watch|apple watch|galaxy watch|wearable)\b/i],
];

export function tokenize(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(Boolean).filter(w => !STOP.has(w));
}

export function parseIntent(input) {
  const raw = String(input || '').trim().slice(0, 260);
  const priceMatchers = [
    /(?:under|below|less than|max(?:imum)?|not more than|within)\s*(?:aed\s*)?([\d,]+(?:\.\d{1,2})?)(?:\s*aed)?/i,
    /(?:aed|dhs?|dirhams?)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:or less|maximum|max)?/i,
  ];
  let maxPrice = null;
  for (const r of priceMatchers) {
    const m = raw.match(r);
    if (m) { maxPrice = Number(m[1].replaceAll(',', '')); break; }
  }
  const ratingMatch = raw.match(/(?:rating|rated|at least)\s*(?:of|above|over)?\s*([345](?:\.\d)?)(?:\s*stars?)?/i);
  const sameDay = /\b(today|same.day)\b/i.test(raw);
  const tomorrow = /\b(tomorrow|next.day)\b/i.test(raw);
  const category = CATEGORY_ALIASES.find(([,re]) => re.test(raw))?.[0] ?? null;
  const sort = /\b(cheapest|lowest price|least expensive|low to high)\b/i.test(raw) ? 'price-asc' :
    /\b(fastest|quickest|earliest delivery|soonest)\b/i.test(raw) ? 'delivery' :
    /\b(top rated|highest rated|best reviewed)\b/i.test(raw) ? 'rating' : 'relevance';
  const freeDelivery = /\bfree (?:delivery|shipping)\b/i.test(raw);
  const pricePart = priceMatchers.find(re => re.test(raw));
  let cleaned = raw;
  if (pricePart) cleaned = cleaned.replace(pricePart, ' ');
  cleaned = cleaned
    .replace(/\b(?:find me|show me|search for|look for|i (?:want|need)|can you find|please find|get me|looking for)\b/gi,' ')
    .replace(/\b(?:delivered?|shipping|shipped?)\s*(?:to|by|before|within)?\s*(?:today|tomorrow|next day|in \d+ days?)\b/gi,' ')
    .replace(/\b(?:cheapest|lowest price|best price|best deals?|fastest|quickest|top rated|highest rated|free delivery|free shipping|available)\b/gi, ' ')
    .replace(/\b(?:in|to|for)\s*(?:abu dhabi|dubai|sharjah|al ain|ajman|fujairah|ras al khaimah|umm al quwain|uae)\b/gi, ' ')
    .replace(/\s+/g,' ').trim().replace(/[,.?]+$/,'');
  return {
    original: raw,
    query: cleaned || raw,
    maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : null,
    minRating: ratingMatch ? Number(ratingMatch[1]) : null,
    maxDeliveryDays: sameDay ? 0 : tomorrow ? 1 : null,
    freeDelivery,
    category,
    sort,
  };
}

function scoreMatch(product, rawQuery) {
  const queryTokens = tokenize(rawQuery);
  if (queryTokens.length === 0) return 1;
  const title = product.title.toLowerCase();
  const hay = `${title} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
  const words = tokenize(hay);
  const normalized = new Set(words);
  let hits = 0;
  for (const token of queryTokens) {
    if (normalized.has(token) || (token.length >= 4 && words.some(w => w.startsWith(token)))) hits += 1;
  }
  const coverage = hits / queryTokens.length;
  const phraseBonus = rawQuery && title.includes(rawQuery.toLowerCase().trim()) ? 0.45 : 0;
  return coverage + phraseBonus;
}

export function searchDemo(query) {
  const intent = parseIntent(query);
  const ranked = DEMO_PRODUCTS.map(p => ({ ...p, relevanceScore: scoreMatch(p, intent.query) }));
  const featured = ['p01','p07','p12','p15','p17','p19','p22','p25'];
  const curated = [...ranked].sort((a,b)=> {
    const ai=featured.indexOf(a.id),bi=featured.indexOf(b.id);
    return (ai<0?100+DEMO_PRODUCTS.findIndex(p=>p.id===a.id):ai) - (bi<0?100+DEMO_PRODUCTS.findIndex(p=>p.id===b.id):bi);
  });
  let products = query.trim() ? ranked.filter(p => p.relevanceScore >= (tokenize(intent.query).length >= 3 ? 0.6 : 0.5)) : curated.map((p,index)=>({...p,relevanceScore:1-index/100}));
  // Category-only searches should return all products in that category.
  if (intent.category && tokenize(intent.query).length <= 2) {
    const byCategory = ranked.filter(p => p.category === intent.category);
    if (byCategory.length > products.length) products = byCategory;
  }
  products.sort((a,b) => b.relevanceScore - a.relevanceScore || a.price - b.price);
  return { products, intent };
}

function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
function finiteMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
function normalizeDelivery(source) {
  const raw = typeof source === 'string' ? source.trim() : '';
  if (!raw) return { deliveryDays: null, deliveryText: 'Check delivery with seller', shipping: null, freeDelivery: false };
  const shippingFree = /\bfree\s+(?:shipping|delivery)\b/i.test(raw);
  // These are indicative dates as displayed by the source, not verified destination-specific promises.
  const deliveryDays = /\b(today|same.day)\b/i.test(raw) ? 0 : /\b(tomorrow|next.day)\b/i.test(raw) ? 1 : null;
  return { deliveryDays, deliveryText: raw.slice(0, 130), shipping: shippingFree ? 0 : null, freeDelivery: shippingFree };
}

export function normalizeShoppingResult(row, index) {
  if (!row || typeof row !== 'object') return null;
  const price = finiteMoney(row.extracted_price);
  const title = typeof row.title === 'string' ? row.title.trim().slice(0, 250) : '';
  // Currency differences cannot be compared without verified FX conversion.
  const priceString = String(row.price || '');
  if (!price || !title || !/(?:AED|د\.?\s*إ|Dhs?|Dirhams?|درهم)/i.test(priceString) || (/\b(?:USD|EUR|GBP|INR|SAR|PKR)\b/i.test(priceString) || /[$€£₹]/.test(priceString))) return null;
  const oldPrice = finiteMoney(row.extracted_old_price);
  const delivery = normalizeDelivery(row.delivery);
  const rating = Number.isFinite(Number(row.rating)) && Number(row.rating) >= 0 && Number(row.rating) <= 5 ? Number(row.rating) : null;
  const store = String(row.source || 'Store not supplied').slice(0, 80);
  const productLink = safeUrl(row.link) || safeUrl(row.product_link);
  return {
    id: `live-${row.product_id || index}-${index}`, title,
    brand: title.split(' ')[0].slice(0, 50), category: CATEGORY_ALIASES.find(([,re])=>re.test(title))?.[0] || 'Other', store, price, oldPrice,
    rating, reviews: Number.isInteger(row.reviews) && row.reviews >= 0 ? row.reviews : null,
    ...delivery,
    condition: String(row.second_hand_condition || 'Not specified').slice(0,60),
    image: safeUrl(row.thumbnail) || '/assets/general.svg',
    description: String(row.snippet || 'Details provided by the shopping source.').slice(0,180),
    url: productLink,
    provider: 'serpapi',
    deliveryVerified: false,
    relevanceScore: 1 - Math.min(index,100)/150,
  };
}

export async function searchLive(query, city, apiKey, fetchFn = fetch) {
  const allowedCities = new Map([
    ['Abu Dhabi','Abu Dhabi, Abu Dhabi, United Arab Emirates'],
    ['Dubai','Dubai, Dubai, United Arab Emirates'],
    ['Sharjah','Sharjah, Sharjah, United Arab Emirates'],
    ['Al Ain','Al Ain, Abu Dhabi, United Arab Emirates'],
    ['Ajman','Ajman, Ajman, United Arab Emirates'],
    ['Ras Al Khaimah','Ras Al Khaimah, United Arab Emirates'],
    ['Fujairah','Fujairah, United Arab Emirates'],
    ['Umm Al Quwain','Umm Al Quwain, United Arab Emirates']
  ]);
  const targetCity = allowedCities.get(city) || allowedCities.get('Abu Dhabi');
  const params = new URLSearchParams({
    engine:'google_shopping',q:query,gl:'ae',hl:'en',google_domain:'google.ae',location:targetCity,api_key:apiKey
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  let response;
  try { response = await fetchFn(`https://serpapi.com/search.json?${params}`, { signal: controller.signal }); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`Shopping provider returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Shopping provider: ${String(data.error).slice(0,160)}`);
  const rows = Array.isArray(data.shopping_results) ? data.shopping_results : [];
  return {
    products: rows.map(normalizeShoppingResult).filter(Boolean),
    // Google Shopping results are offers discovered for this city, not confirmed delivery eligibility.
    coverageNote: 'Shopping offers are discovered for the selected city. Seller delivery eligibility, final price and ETA must be confirmed at checkout.',
  };
}

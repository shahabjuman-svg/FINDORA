import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent, tokenize, searchDemo, normalizeShoppingResult, searchLive } from '../server/search.js';

const parse = text => parseIntent(text);
test('exact product name stays recognizable',()=>{
  const r=parse('Samsung Galaxy S26 Ultra 256GB');
  assert.equal(r.query,'Samsung Galaxy S26 Ultra 256GB');
  assert.equal(r.category,'Phones');
});
test('extracts AED price limit from natural language',()=>{
  const r=parse('Find me Samsung S26 Ultra under AED 3,500 delivered tomorrow');
  assert.equal(r.maxPrice,3500);
  assert.equal(r.maxDeliveryDays,1);
  assert.match(r.query,/Samsung S26 Ultra/i);
  assert.doesNotMatch(r.query,/3500|3,500|tomorrow/i);
});
test('extracts an inline budget in AED',()=>assert.equal(parse('wireless earbuds AED 300').maxPrice,300));
test('extracts same-day intent',()=>assert.equal(parse('air fryer delivered today').maxDeliveryDays,0));
test('extracts sorting intent cheapest',()=>assert.equal(parse('cheapest iPhone').sort,'price-asc'));
test('extracts sorting intent fastest',()=>assert.equal(parse('fastest delivery coffee machine').sort,'delivery'));
test('extracts sorting intent best rated',()=>assert.equal(parse('top rated headphones').sort,'rating'));
test('extracts free delivery requirement',()=>assert.equal(parse('shoes with free delivery').freeDelivery,true));
test('extracts numeric rating',()=>assert.equal(parse('headphones rated 4.5 stars').minRating,4.5));
test('recognizes toy category',()=>assert.equal(parse('two toy grasshoppers').category,'Toys'));
test('tokenization does not leave punctuation',()=>assert.deepEqual(tokenize('Hello, AMAZING !!! product.'),['hello','amazing']));
test('search demo matches Samsung Galaxy listings',()=>{
  const {products}=searchDemo('Samsung Galaxy S26 Ultra 256GB');
  assert.ok(products.length>=2);
  assert.ok(products[0].title.includes('Samsung'));
  assert.ok(products.every(p=>p.provider==='demo'));
  assert.ok(products.every(p=>p.title.toLowerCase().includes('s26 ultra')), 'Unrelated Samsung products must not appear');
});
test('search demo recognizes natural language category',()=>{
  const {products}=searchDemo('wireless noise cancelling headphones');
  assert.ok(products.some(p=>p.category==='Audio'));
});
test('demo has no invented match for impossible search',()=>assert.equal(searchDemo('laser-guided superluminal airship').products.length,0));
test('demo empty query shows catalogue',()=>assert.ok(searchDemo('').products.length>=20));
test('live result parser retains real values and unverified ETA',()=>{
  const p=normalizeShoppingResult({product_id:'123',title:'Samsung Phone',extracted_price:3230,price:'AED 3,230',source:'Sample Merchant',rating:4.3,reviews:8,delivery:'Free delivery tomorrow',thumbnail:'https://example.com/photo.png',product_link:'https://example.com/p/123'},0);
  assert.equal(p.price,3230);
  assert.equal(p.deliveryDays,1);
  assert.equal(p.shipping,0);
  assert.equal(p.deliveryVerified,false);
  assert.equal(p.url,'https://example.com/p/123');
});
test('live result parser safely rejects no price',()=>assert.equal(normalizeShoppingResult({title:'Nice Product'},0),null));
test('live result parser rejects dollar-priced products rather than treat as AED',()=>assert.equal(normalizeShoppingResult({title:'Nice Product',price:'$80',extracted_price:80},0),null));
test('live result parser blocks unsafe links and images',()=>{
  const p=normalizeShoppingResult({title:'Product',price:'AED 60',extracted_price:60,link:'javascript:alert(1)',thumbnail:'data:text/html,hi'},0);
  assert.equal(p.url,null);
  assert.equal(p.image,'/assets/general.svg');
});
test('live result parser leaves unknown delivery dates unknown',()=>{
  const p=normalizeShoppingResult({title:'Product',price:'AED 60',extracted_price:60,delivery:'Standard delivery'},0);
  assert.equal(p.deliveryDays,null);
  assert.match(p.deliveryText,/Standard delivery/);
});
test('live shopping uses UAE geography and the sanitized query',async()=>{
  let captured;
  const fakeFetch=async (url,opts)=>{
    captured={url,opts};
    return {ok:true,json:async()=>({shopping_results:[{title:'Test Phone',extracted_price:100,price:'AED 100',source:'Test Store'}]})};
  };
  const result=await searchLive('phone','Dubai','SECRET',fakeFetch);
  const u=new URL(captured.url);
  assert.equal(u.searchParams.get('engine'),'google_shopping');
  assert.equal(u.searchParams.get('gl'),'ae');
  assert.match(u.searchParams.get('location'),/Dubai/);
  assert.equal(u.searchParams.get('q'),'phone');
  assert.equal(result.products.length,1);
  assert.match(result.coverageNote,/confirm/i);
});
test('live shopping errors on provider-level failure',async()=>{
  const f=async()=>({ok:true,json:async()=>({error:'Invalid API key'})});
  await assert.rejects(searchLive('phone','Abu Dhabi','FAKE',f),/Invalid API key/);
});

const $ = id => document.getElementById(id);
const ico = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money = value => value == null || !Number.isFinite(Number(value)) ? 'Not available' : new Intl.NumberFormat('en-AE',{maximumFractionDigits:2,minimumFractionDigits: Number(value)%1 ? 2 : 0}).format(Number(value));
const storage = {
  read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
const state = {
  products: [], saved: new Map(), compare: new Set(), city:'Abu Dhabi', liveEnabled:false, mode:'demo',
  view:'discover', sort:'relevance', query:'', lastIntent:null, pageSize:8,
  filters:{ min:'', max:'', categories:new Set(), stores:new Set(), delivery:'all', rating:'all', free:false, deals:false },
};
const CITIES = [
  ['Abu Dhabi',24.4539,54.3773],['Dubai',25.2048,55.2708],['Sharjah',25.3463,55.4209],
  ['Al Ain',24.2075,55.7447],['Ajman',25.4052,55.5136],['Ras Al Khaimah',25.8007,55.9762],
  ['Fujairah',25.1288,56.3265],['Umm Al Quwain',25.5647,55.5552]
];
let toastTimer, requestCounter = 0;
function safeLink(url) { try { const u = new URL(url); return ['https:','http:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
function formatCount(n) { return `${n} ${n === 1 ? 'offer' : 'offers'}`; }
function discountPct(p) { return p.oldPrice > p.price ? Math.round((1-p.price/p.oldPrice)*100) : 0; }
function totalCost(p) { return typeof p.shipping === 'number' ? p.price + p.shipping : null; }
function notKnown(value) { return value === null || value === undefined || !Number.isFinite(Number(value)); }
function notify(message) { const t=$('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3300); }
function setBanner(message, isError=false) {
  $('status-text').textContent=message;
  const banner=$('status-banner'); banner.hidden=false; banner.style.borderColor=isError?'#efcac7':''; banner.style.background=isError?'#fff6f4':''; banner.style.color=isError?'#9a5651':'';
}
function updateMode() {
  $('mode-label').textContent = state.mode === 'live' ? '● Live discovery' : '● Demo results';
  $('mode-label').classList.toggle('live',state.mode === 'live');
  $('rail-status').textContent = state.liveEnabled ? 'Live search available' : 'Demo workspace';
}
function setCurrentView(view) {
  state.view=view;
  $('nav-discover').classList.toggle('active',view==='discover');
  $('nav-saved').classList.toggle('active',view==='saved');
  if (view==='saved') {
    $('results-heading').textContent='Your saved finds';
    $('results-subtitle').textContent='All the offers you bookmarked in this browser.';
  } else if (state.query) {
    $('results-heading').textContent=`Results for “${state.query.slice(0,52)}${state.query.length>52?'…':''}”`;
    $('results-subtitle').textContent=`Showing shopping matches around ${state.city}.`;
  } else {
    $('results-heading').textContent='Discover your next good deal';
    $('results-subtitle').textContent='Explore sample offers or connect live shopping search.';
  }
  state.pageSize=8;
  renderFilters(); renderProducts();
}
function getCurrentProducts() { return state.view==='saved' ? [...state.saved.values()] : state.products; }
function renderFilters() {
  const source=getCurrentProducts();
  const categories=[...new Set(source.map(p=>p.category).filter(Boolean))].sort();
  const stores=[...new Set(source.map(p=>p.store).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const build=(items,kind)=>items.map(item=>{
    const checked=state.filters[kind].has(item) ? 'checked' : '';
    const count=source.filter(p=>(kind==='stores'?p.store:p.category)===item).length;
    return `<label class="check-item"><input type="checkbox" name="${kind}" value="${escapeHtml(item)}" ${checked}/><span>${escapeHtml(item)}</span><em>${count}</em></label>`;
  }).join('') || '<p class="filter-note">No options available</p>';
  $('category-filters').innerHTML=build(categories,'categories');
  $('store-filters').innerHTML=build(stores,'stores');
  $('price-min').value=state.filters.min;
  $('price-max').value=state.filters.max;
  $('delivery-filter').value=state.filters.delivery;
  $('rating-filter').value=state.filters.rating;
  $('free-shipping').checked=state.filters.free;
  $('deals-only').checked=state.filters.deals;
  $('sort-select').value=state.sort;
  $('saved-rail-count').textContent=state.saved.size;
}
function clearFilters(render=true) {
  state.filters={min:'',max:'',categories:new Set(),stores:new Set(),delivery:'all',rating:'all',free:false,deals:false};
  state.sort=state.lastIntent?.sort || 'relevance';
  if(render){ renderFilters(); renderProducts(); }
}
function getVisibleProducts() {
  const f=state.filters;
  const min=f.min!==''&&Number.isFinite(Number(f.min))?Number(f.min):null;
  const max=f.max!==''&&Number.isFinite(Number(f.max))?Number(f.max):null;
  const delivery=f.delivery==='all'?null:Number(f.delivery);
  const rating=f.rating==='all'?null:Number(f.rating);
  const selected=getCurrentProducts().filter(p=>
    (min===null||p.price>=min) && (max===null||p.price<=max) &&
    (f.categories.size===0||f.categories.has(p.category)) &&
    (f.stores.size===0||f.stores.has(p.store)) &&
    (delivery===null||(!notKnown(p.deliveryDays)&&p.deliveryDays<=delivery)) &&
    (rating===null||(!notKnown(p.rating)&&p.rating>=rating)) &&
    (!f.free||p.freeDelivery===true) && (!f.deals||discountPct(p)>0)
  );
  const compareOptional=(a,b,k,desc=false)=>{
    const av=a[k],bv=b[k];
    if(notKnown(av)&&notKnown(bv)) return 0;
    if(notKnown(av)) return 1;
    if(notKnown(bv)) return -1;
    return desc ? bv-av : av-bv;
  };
  const sorters={
    relevance:(a,b)=>(b.relevanceScore||0)-(a.relevanceScore||0)||a.price-b.price,
    'price-asc':(a,b)=>a.price-b.price,
    'price-desc':(a,b)=>b.price-a.price,
    delivery:(a,b)=>compareOptional(a,b,'deliveryDays')||a.price-b.price,
    rating:(a,b)=>compareOptional(a,b,'rating',true)||a.price-b.price,
    discount:(a,b)=>discountPct(b)-discountPct(a)||a.price-b.price,
    reviews:(a,b)=>compareOptional(a,b,'reviews',true)||a.price-b.price,
    'name-asc':(a,b)=>a.title.localeCompare(b.title),
    'name-desc':(a,b)=>b.title.localeCompare(a.title),
    total:(a,b)=>{const av=totalCost(a),bv=totalCost(b);return av===null?(bv===null?0:1):bv===null?-1:av-bv;},
  };
  return selected.sort(sorters[state.sort]||sorters.relevance);
}
function activeFilterCount() {
  const f=state.filters;
  return Number(f.min!=='')+Number(f.max!=='')+f.categories.size+f.stores.size+Number(f.delivery!=='all')+Number(f.rating!=='all')+Number(f.free)+Number(f.deals);
}
function renderActiveChips() {
  const f=state.filters, chips=[];
  if(f.min!=='') chips.push(['min',`Min AED ${f.min}`]);
  if(f.max!=='') chips.push(['max',`Max AED ${f.max}`]);
  for(const cat of f.categories) chips.push(['category:'+cat,cat]);
  for(const store of f.stores) chips.push(['store:'+store,store]);
  if(f.delivery!=='all')chips.push(['delivery',`Within ${f.delivery} day${f.delivery==='1'?'':'s'}`]);
  if(f.rating!=='all')chips.push(['rating',`${f.rating}+ stars`]);
  if(f.free)chips.push(['free','Free delivery']);
  if(f.deals)chips.push(['deals','Deals only']);
  $('active-chips').innerHTML=chips.map(([key,label])=>`<span class="active-chip">${escapeHtml(label)}<button data-remove-filter="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(label)}">${ico('x')}</button></span>`).join('');
  $('mobile-filter-count').textContent=String(chips.length);
  $('mobile-filter-count').hidden=chips.length===0;
}
function offerCard(p) {
  const deal=discountPct(p);
  const saved=state.saved.has(p.id);
  const selected=state.compare.has(p.id);
  const text=p.deliveryText||'Check delivery with seller';
  const missing=notKnown(p.deliveryDays);
  const deliveryFee=p.shipping===0?'Free shipping':typeof p.shipping==='number'?`Shipping AED ${money(p.shipping)}`:'Shipping fee not confirmed';
  return `<article class="product-card" data-product="${escapeHtml(p.id)}">
    <div class="product-media">${deal?`<span class="deal-pill">${deal}% OFF</span>`:''}
      <button class="favorite-btn ${saved?'is-saved':''}" data-save="${escapeHtml(p.id)}" aria-label="${saved?'Remove from':'Save to'} saved products" aria-pressed="${saved}">${ico('heart')}</button>
      <img src="${escapeHtml(safeLink(p.image) || (p.image?.startsWith('/assets/') ? p.image : '/assets/general.svg'))}" alt="${escapeHtml(p.title)}" loading="lazy" />
    </div>
    <div class="product-details"><div class="product-store">${escapeHtml(p.store)}</div>
      <h3 class="product-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</h3>
      <p class="product-description" title="${escapeHtml(p.description)}">${escapeHtml(p.description)}</p>
      <div class="price-row"><span class="price"><span class="currency">AED</span>${money(p.price)}</span>${p.oldPrice>p.price?`<span class="old-price">AED ${money(p.oldPrice)}</span>`:''}</div>
      <div class="meta-line">${typeof p.rating==='number'?`<span class="rating">${ico('star')}${p.rating.toFixed(1)}${p.reviews!=null?` <em>(${new Intl.NumberFormat('en').format(p.reviews)})</em>`:''}</span>`:'<span class="condition">Rating unavailable</span>'}<span class="condition">${escapeHtml(p.condition||'Condition not provided')}</span></div>
      <div class="delivery-row ${missing?'missing':''}">${ico('truck')}<div class="delivery-copy"><span>${escapeHtml(text)}</span><div class="delivery-fee">${escapeHtml(deliveryFee)}</div></div></div>
      <div class="card-footer"><button class="offer-button" data-view="${escapeHtml(p.id)}">${p.provider==='demo'?'View sample offer':'View offer'} ${ico('arrow-up-right')}</button><button class="compare-button ${selected?'selected':''}" data-compare="${escapeHtml(p.id)}" aria-pressed="${selected}">${selected?ico('check'):''}${selected?'Added':'Compare'}</button></div>
    </div></article>`;
}
function renderProducts() {
  const all=getVisibleProducts();
  const shown=all.slice(0,state.pageSize);
  $('product-count').textContent=`${formatCount(all.length)} ${state.view==='saved'?'saved':`found${state.products.length!==all.length?' after filtering':''}`}`;
  $('product-grid').innerHTML=shown.map(offerCard).join('');
  $('product-grid').hidden=all.length===0;
  $('load-more-wrap').hidden=all.length<=state.pageSize;
  $('load-more').textContent=`Show more products (${all.length-state.pageSize} remaining) ↓`;
  if(!all.length){
    $('empty-results').hidden=false;
    const noSaved=state.view==='saved'&&state.saved.size===0;
    $('empty-results').innerHTML=`<div class="empty-icon">${ico(noSaved?'heart':'search')}</div><h3>${noSaved?'No saved items yet':'No matching offers'}</h3><p>${noSaved?'Save products using the heart icon to keep them here.':'Try a different product, broaden your price range, or remove some filters. In demo mode, only sample categories are available.'}</p><button data-empty-action="${noSaved?'explore':'clear'}">${noSaved?'Explore products':'Clear filters'}</button>`;
  } else $('empty-results').hidden=true;
  renderActiveChips();
  renderCompareDock();
  $('saved-rail-count').textContent=state.saved.size;
}
function renderLoading() {
  $('product-grid').hidden=false; $('empty-results').hidden=true; $('load-more-wrap').hidden=true;
  $('product-count').textContent='Looking for matches…';
  $('product-grid').innerHTML=Array.from({length:4},()=>'<div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-text"></div><div class="skeleton-text line"></div><div class="skeleton-text short"></div></div>').join('');
}
async function search(query,forcedMode=null) {
  const trimmed=String(query||'').trim();
  const mode=forcedMode||(state.liveEnabled&&trimmed?'live':'demo');
  const request=++requestCounter;
  state.view='discover'; state.query=trimmed; state.pageSize=8;
  $('nav-discover').classList.add('active');$('nav-saved').classList.remove('active');
  $('search-input').value=trimmed;
  if(trimmed){ $('results-heading').textContent=`Results for “${trimmed.slice(0,52)}${trimmed.length>52?'…':''}”`; $('results-subtitle').textContent=`Searching offers around ${state.city}.`; }
  else { $('results-heading').textContent='Discover your next good deal';$('results-subtitle').textContent='Browse sample offers and explore what Findora can do.'; }
  renderLoading(); $('search-submit').disabled=true;
  try {
    const r=await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&city=${encodeURIComponent(state.city)}&mode=${mode}`);
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Search failed');
    if(request!==requestCounter)return;
    state.mode=data.mode;state.products=data.products;state.lastIntent=data.intent;
    clearFilters(false);
    if(data.intent?.maxPrice)state.filters.max=String(data.intent.maxPrice);
    if(data.intent?.minRating)state.filters.rating=String(data.intent.minRating);
    if(data.intent?.maxDeliveryDays!==null&&data.intent?.maxDeliveryDays!==undefined)state.filters.delivery=String(data.intent.maxDeliveryDays);
    state.filters.free=Boolean(data.intent?.freeDelivery);
    state.sort=data.intent?.sort||'relevance';
    renderFilters(); renderProducts(); updateMode();
    setBanner(data.coverageNote);
    $('results-subtitle').textContent = mode==='demo' ? 'Sample listings to demonstrate search, sorting and filters.' : `Live shopping discovery around ${state.city}. Verify delivery and checkout details with sellers.`;
    if(!data.products.length)notify(mode==='demo'?'No sample products match. Try a suggestion above.':'No shopping listings returned for this search.');
  } catch(err) {
    if(request!==requestCounter)return;
    state.products=[];state.mode=mode;
    renderFilters();renderProducts();updateMode();
    setBanner(err.message,true);
    $('results-subtitle').textContent='We could not complete this search.';
    notify(err.message);
  } finally { if(request===requestCounter)$('search-submit').disabled=false; }
}
function saveProduct(id) {
  const p=[...state.products,...state.saved.values()].find(p=>p.id===id);
  if(!p)return;
  if(state.saved.has(id)){state.saved.delete(id);notify('Removed from saved items.');}
  else {state.saved.set(id,p);notify('Saved to your shortlist.');}
  storage.write('findora-saved-v1',[...state.saved.values()]);
  if(state.view==='saved')renderFilters();
  renderProducts();
}
function compareProduct(id) {
  if(state.compare.has(id)){state.compare.delete(id);renderProducts();return;}
  if(state.compare.size>=3){notify('You can compare up to 3 products.');return;}
  state.compare.add(id);renderProducts();
}
function renderCompareDock(){
  $('compare-dock').hidden=state.compare.size===0;
  $('compare-count').textContent=`${state.compare.size} ${state.compare.size===1?'product':'products'} selected`;
  $('compare-open').disabled=state.compare.size<2;
}
function getProduct(id) { return [...state.products,...state.saved.values()].find(p=>p.id===id); }
function showProduct(id) {
  const p=getProduct(id);if(!p)return;
  const isDemo=p.provider==='demo';
  $('product-title').textContent=p.title;
  const dest=safeLink(p.url);
  const searchUrl=`https://www.google.com/search?tbm=shop&gl=ae&q=${encodeURIComponent(p.title)}`;
  const summary=`<div class="offer-dialog-content"><img src="${escapeHtml(safeLink(p.image)||(p.image?.startsWith('/assets/')?p.image:'/assets/general.svg'))}" alt="${escapeHtml(p.title)}"/><div><strong>${escapeHtml(p.store)}</strong><p>${escapeHtml(p.description)}</p><div class="price"><span class="currency">AED</span>${money(p.price)}</div><p>${escapeHtml(p.deliveryText||'Delivery details not provided')}</p></div></div>`;
  const warning=isDemo?'This is sample data, not a real offer. Prices, delivery and availability shown here are not verified.': 'Live shopping discovery shows source listings, not guaranteed delivery to your address. Verify the final price, seller and delivery date before ordering.';
  $('product-dialog-body').innerHTML=summary+`<div class="offer-warning">${escapeHtml(warning)}</div><a class="primary-wide" href="${escapeHtml(dest||searchUrl)}" target="_blank" rel="noopener noreferrer">${isDemo?'Explore on Google Shopping':dest?'Open shopping listing':'Search this product'} ${ico('external')}</a>`;
  openModal('product-modal');
}
function showCompare() {
  const picked=[...state.compare].map(getProduct).filter(Boolean);if(picked.length<2)return;
  const rows=[
    ['Price',p=>`AED ${money(p.price)}`],['Total with known shipping',p=>totalCost(p)!=null?`AED ${money(totalCost(p))}`:'Unknown'],
    ['Store',p=>p.store],['Delivery',p=>p.deliveryText||'Not specified'],
    ['Shipping fee',p=>p.shipping==null?'Unknown':p.shipping===0?'Free':`AED ${money(p.shipping)}`],
    ['Rating',p=>p.rating==null?'Not available':`${p.rating.toFixed(1)} / 5`],
    ['Condition',p=>p.condition||'Not specified'],['Source',p=>p.provider==='demo'?'Illustrative demo':'Live discovery']
  ];
  $('compare-body').innerHTML=`<table class="compare-table"><thead><tr><th>Feature</th>${picked.map(p=>`<th>${escapeHtml(p.title)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label,get])=>`<tr><td>${escapeHtml(label)}</td>${picked.map(p=>`<td>${escapeHtml(get(p))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  openModal('compare-modal');
}
function openModal(id) { closeAll(); $('overlay').hidden=false;$(id).hidden=false; const b=$(id).querySelector('.close-dialog');if(b)b.focus(); }
function closeAll() { $('overlay').hidden=true; for(const id of ['location-modal','info-modal','product-modal','compare-modal'])$(id).hidden=true; $('filters').classList.remove('open'); }
function openFilters() {closeAll();$('overlay').hidden=false;$('filters').classList.add('open');}
function removeChip(key) {
  if(key==='min')state.filters.min='';else if(key==='max')state.filters.max='';
  else if(key.startsWith('category:'))state.filters.categories.delete(key.slice(9));
  else if(key.startsWith('store:'))state.filters.stores.delete(key.slice(6));
  else if(key==='delivery')state.filters.delivery='all';else if(key==='rating')state.filters.rating='all';
  else if(key==='free')state.filters.free=false;else if(key==='deals')state.filters.deals=false;
  state.pageSize=8;renderFilters();renderProducts();
}
function updatePriceFilters() {state.filters.min=$('price-min').value;state.filters.max=$('price-max').value;state.pageSize=8;renderProducts();}
function setupEvents() {
  $('search-form').addEventListener('submit',ev=>{ev.preventDefault();search($('search-input').value);$('results-section').scrollIntoView({behavior:'smooth',block:'start'});});
  $('search-input').addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing){ev.preventDefault();$('search-form').requestSubmit();}});
  for(const el of document.querySelectorAll('[data-query]'))el.addEventListener('click',()=>{ $('search-input').value=el.dataset.query;search(el.dataset.query);$('results-section').scrollIntoView({behavior:'smooth',block:'start'}); });
  $('sort-select').insertAdjacentHTML('beforeend','<option value="total">Lowest total with known shipping</option>');
  $('sort-select').addEventListener('change',()=>{state.sort=$('sort-select').value;state.pageSize=8;renderProducts();});
  $('price-min').addEventListener('input',updatePriceFilters);$('price-max').addEventListener('input',updatePriceFilters);
  $('delivery-filter').addEventListener('change',()=>{state.filters.delivery=$('delivery-filter').value;state.pageSize=8;renderProducts();});
  $('rating-filter').addEventListener('change',()=>{state.filters.rating=$('rating-filter').value;state.pageSize=8;renderProducts();});
  $('free-shipping').addEventListener('change',()=>{state.filters.free=$('free-shipping').checked;state.pageSize=8;renderProducts();});
  $('deals-only').addEventListener('change',()=>{state.filters.deals=$('deals-only').checked;state.pageSize=8;renderProducts();});
  for(const id of ['category-filters','store-filters'])$(id).addEventListener('change',event=>{
    const target=event.target;
    if(target instanceof HTMLInputElement&&target.type==='checkbox') {
      const group=state.filters[target.name];
      if(group){target.checked?group.add(target.value):group.delete(target.value);state.pageSize=8;renderProducts();}
    }
  });
  $('reset-filters').addEventListener('click',()=>clearFilters());
  $('active-chips').addEventListener('click',ev=>{const target=ev.target.closest('[data-remove-filter]');if(target)removeChip(target.dataset.removeFilter);});
  $('product-grid').addEventListener('click',ev=>{
    const save=ev.target.closest('[data-save]');if(save)return saveProduct(save.dataset.save);
    const compare=ev.target.closest('[data-compare]');if(compare)return compareProduct(compare.dataset.compare);
    const view=ev.target.closest('[data-view]');if(view)return showProduct(view.dataset.view);
  });
  $('product-grid').addEventListener('error',ev=>{ if(ev.target instanceof HTMLImageElement && !ev.target.getAttribute('src')?.startsWith('data:') && ev.target.getAttribute('src')!=='/assets/general.svg') ev.target.src='/assets/general.svg'; },true);
  $('empty-results').addEventListener('click',ev=>{const b=ev.target.closest('[data-empty-action]');if(!b)return;b.dataset.emptyAction==='explore'?setCurrentView('discover'):clearFilters();});
  $('load-more').addEventListener('click',()=>{state.pageSize+=8;renderProducts();});
  $('nav-discover').addEventListener('click',()=>setCurrentView('discover'));
  $('nav-saved').addEventListener('click',()=>setCurrentView('saved'));
  $('saved-mobile').addEventListener('click',()=>{setCurrentView('saved');$('results-section').scrollIntoView({behavior:'smooth'});});
  $('mobile-nav').addEventListener('click',()=>setCurrentView('discover'));
  $('location-btn').addEventListener('click',()=>{$('city-select').value=state.city;openModal('location-modal');});
  $('about-btn').addEventListener('click',()=>openModal('info-modal'));
  $('save-location').addEventListener('click',()=>{
    const next=$('city-select').value;closeAll();if(next===state.city)return;
    state.city=next;storage.write('findora-city',next);$('location-label').textContent=`${next}, UAE`;notify(`Searching around ${next}.`);
    if(state.mode==='live'&&state.query)search(state.query,'live');
  });
  $('detect-location').addEventListener('click',()=>{
    if(!navigator.geolocation){notify('Location is not supported by your browser. Select your city manually.');return;}
    const b=$('detect-location');b.disabled=true;b.querySelector('span').textContent='Finding nearest city…';
    navigator.geolocation.getCurrentPosition(position=>{
      const lat=position.coords.latitude,lon=position.coords.longitude;
      const km=([,y,x])=>{const rad=Math.PI/180;const a=Math.sin((y-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(y*rad)*Math.sin((x-lon)*rad/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));};
      const nearest=[...CITIES].sort((a,b)=>km(a)-km(b))[0];
      if(km(nearest)>250)notify('Your location appears outside the UAE. Please choose a city manually.');
      else{$('city-select').value=nearest[0];notify(`Nearest supported city: ${nearest[0]}.`);}
      b.disabled=false;b.querySelector('span').textContent='Use my current location';
    },()=>{notify('Location was unavailable or permission was denied. Select a city manually.');b.disabled=false;b.querySelector('span').textContent='Use my current location';},{timeout:8000,maximumAge:120000});
  });
  $('overlay').addEventListener('click',closeAll);
  for(const b of document.querySelectorAll('.close-dialog'))b.addEventListener('click',closeAll);
  $('mobile-filter-btn').addEventListener('click',openFilters);
  $('close-mobile-filter').addEventListener('click',closeAll);
  $('apply-mobile-filter').addEventListener('click',closeAll);
  $('banner-close').addEventListener('click',()=>{$('status-banner').hidden=true;});
  $('compare-clear').addEventListener('click',()=>{state.compare.clear();renderProducts();});
  $('compare-open').addEventListener('click',showCompare);
  document.addEventListener('keydown',ev=>{
    if(ev.key==='Escape')closeAll();
    if((ev.metaKey||ev.ctrlKey)&&ev.key.toLowerCase()==='k'){ev.preventDefault();$('search-input').focus();window.scrollTo({top:0,behavior:'smooth'});}
  });
}
async function init() {
  state.city=storage.read('findora-city','Abu Dhabi');
  if(!CITIES.some(c=>c[0]===state.city))state.city='Abu Dhabi';
  $('location-label').textContent=`${state.city}, UAE`;
  const persisted=storage.read('findora-saved-v1',[]);
  if(Array.isArray(persisted))for(const p of persisted.slice(0,200))if(p&&typeof p.id==='string'&&typeof p.title==='string')state.saved.set(p.id,p);
  setupEvents();
  try {
    const res=await fetch('/api/config');const config=await res.json();
    state.liveEnabled=Boolean(config.liveEnabled);
    for(const city of config.cities||CITIES.map(c=>c[0])){
      const o=document.createElement('option');o.value=city;o.textContent=`${city}, UAE`;$('city-select').appendChild(o);
    }
    if(state.liveEnabled){setBanner('Live shopping search is connected. The introductory cards below are demo examples. Search for a product to retrieve live discovery results.');}
  } catch {for(const c of CITIES){const o=document.createElement('option');o.value=c[0];o.textContent=`${c[0]}, UAE`;$('city-select').appendChild(o);}}
  updateMode();await search('', 'demo');
  if(state.liveEnabled)setBanner('Live shopping search is connected. The introductory cards are examples; enter a product to retrieve live results. Delivery and prices require seller verification.');
}
init();

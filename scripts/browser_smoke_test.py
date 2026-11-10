"""Browser UI smoke tests with mocked API responses.

Run the Node server separately first. Page content is injected in-memory while
product fixture responses are fetched from the local development server.
These checks complement (not replace) the Node HTTP/API test suite.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, urllib.request, base64, mimetypes, os

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT
BASE='http://127.0.0.1:3000'

def json_from_server(url):
    with urllib.request.urlopen(url) as response: return json.load(response)

def get_fixture(q):
    from urllib.parse import urlencode
    return json_from_server(BASE+'/api/search?'+urlencode({'q':q,'mode':'demo','city':'Abu Dhabi'}))

fixtures={
 'default':get_fixture(''),
 'samsung':get_fixture('Samsung Galaxy S26 Ultra 256GB under AED 3500 delivered tomorrow'),
 'audio':get_fixture('wireless noise cancelling headphones'),
 'fryer':get_fixture('air fryer under AED 700'),
}
config=json_from_server(BASE+'/api/config')
boot='''window.fetch = async function(input) {
 const url = new URL(String(input), 'http://localhost:3000');
 let data;
 if(url.pathname === '/api/config') data = window.__config;
 else if(url.pathname === '/api/search') {
   const q = (url.searchParams.get('q')||'').toLowerCase();
   data = q.includes('samsung') ? window.__fixtures.samsung : q.includes('headphone') ? window.__fixtures.audio : q.includes('air fryer') ? window.__fixtures.fryer : window.__fixtures.default;
 } else throw Error('Unexpected API '+url.pathname);
 return {ok:true,status:200,json:async()=>data};
};'''

def load_page(browser,viewport):
    page=browser.new_page(viewport=viewport,device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.set_content((ROOT/'public/index.html').read_text())
    page.add_style_tag(content=(ROOT/'public/styles.css').read_text())
    page.evaluate('(data)=>{window.__fixtures=data.fixtures; window.__config=data.config;}',{'fixtures':fixtures,'config':config})
    page.add_script_tag(content=boot)
    page.add_script_tag(content=(ROOT/'public/app.js').read_text())
    page.locator('.product-card').first.wait_for(timeout=10000)
    return page,errors

def inline_assets(page):
    urls={}
    for svg in (ROOT/'public/assets').glob('*.svg'):
        urls[svg.name]='data:image/svg+xml;base64,'+base64.b64encode(svg.read_bytes()).decode()
    product_images={prod['id']:prod['image'].split('/')[-1] for fixture in fixtures.values() for prod in fixture['products']}
    page.evaluate('''(data)=>{
     for(const card of document.querySelectorAll('.product-card')) {
       const id=card.dataset.product, image=card.querySelector('img');
       const name=data.product_images[id];
       if(name&&data.sources[name]) image.src=data.sources[name];
     }
    }''',{'sources':urls,'product_images':product_images})

with sync_playwright() as p:
    configured_chromium = os.environ.get('CHROMIUM_PATH')
    system_chromium = '/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None
    browser=p.chromium.launch(headless=True, executable_path=configured_chromium or system_chromium, args=['--no-sandbox','--disable-dev-shm-usage'])
    page,errors=load_page(browser,{'width':1440,'height':1000})
    print('initial cards',page.locator('.product-card').count())
    print('initial products',page.locator('#product-count').inner_text())
    inline_assets(page)
    page.wait_for_timeout(350)
    page.screenshot(path=str(OUT/'preview-desktop.png'),full_page=True)
    page.locator('#search-input').fill('Samsung Galaxy S26 Ultra 256GB under AED 3500 delivered tomorrow')
    page.locator('#search-submit').click()
    page.wait_for_timeout(300)
    print('search count',page.locator('#product-count').inner_text())
    print('search titles',page.locator('.product-title').all_inner_texts())
    assert page.locator('.product-card').count()>0,'No search results'
    assert 'Max AED 3500' in page.locator('#active-chips').inner_text(),'Price filter not parsed'
    assert 'Within 1 day' in page.locator('#active-chips').inner_text(),'Delivery filter not parsed'
    page.locator('.favorite-btn').first.click()
    page.locator('#nav-saved').click()
    assert page.locator('.product-card').count()==1,'Saved products not shown'
    page.locator('#nav-discover').click()
    page.locator('#reset-filters').click()
    page.locator('[data-compare]').first.click()
    page.locator('[data-compare]').nth(1).click()
    assert page.locator('#compare-open').is_enabled(),'Compare button not enabled'
    page.locator('#compare-open').click()
    assert page.locator('#compare-modal').is_visible(),'Compare modal not shown'
    page.keyboard.press('Escape')
    assert not page.locator('#compare-modal').is_visible(),'Escape did not close modal'
    print('desktop browser checks passed')
    mobile,mobile_errors=load_page(browser,{'width':390,'height':844})
    print('mobile window overflow',mobile.evaluate('document.documentElement.scrollWidth > innerWidth'))
    assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth'),'Horizontal overflow mobile'
    mobile.locator('#mobile-filter-btn').click()
    assert mobile.locator('#filters').evaluate('(el)=>el.classList.contains("open")'),'Mobile filter not opened'
    mobile.locator('#close-mobile-filter').click()
    assert not mobile.locator('#filters').evaluate('(el)=>el.classList.contains("open")'),'Mobile filter not closed'
    inline_assets(mobile)
    mobile.wait_for_timeout(350)
    mobile.screenshot(path=str(OUT/'preview-mobile.png'),full_page=True)
    print('browser js errors',errors+mobile_errors)
    assert not errors+mobile_errors,errors+mobile_errors
    browser.close()

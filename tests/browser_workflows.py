"""End-to-end UI regression with fictional accounts and mocked same-origin API.
No external requests, live credentials, or database mutations.
"""
import json
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse,parse_qs
from contextlib import contextmanager
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:18767'

@contextmanager
def server():
    p=subprocess.Popen([sys.executable,'-m','http.server','18767','--bind','127.0.0.1','--directory','public'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                with urllib.request.urlopen(BASE,timeout=1) as r:
                    if r.status==200:break
            except Exception:time.sleep(.1)
        else:raise RuntimeError('Local UI fixture server unavailable')
        yield
    finally:
        p.terminate()
        try:p.wait(timeout=4)
        except subprocess.TimeoutExpired:p.kill()

admin={'id':'11111111-1111-4111-8111-111111111111','email':'admin@test.invalid','role':'administrator'}
docs=[
 {'id':'22222222-2222-4222-8222-222222222222','title':'Existing contract','number':'R-103','recipient':'Fictional','type':'letter','language':'en','status':'draft','audience':'all','version':1,'updated':'2026-11-04T12:00:00Z'},
 {'id':'33333333-3333-4333-8333-333333333333','title':'Test invoice','number':'R-104','recipient':'Fictional','type':'invoice','language':'fa','status':'finalized','audience':'all','version':1,'updated':'2026-11-03T12:00:00Z'}
]
accounts=[]
def fulfill(route):
    req=route.request
    path=urlparse(req.url).path
    payload={}
    if req.method in ('POST','PATCH','DELETE'):
        try:payload=req.post_data_json or {}
        except Exception:pass
    if path.endswith('/config'):value={'mode':'server'}
    elif path.endswith('/session'):value={'user':admin,'csrf':'fictional-csrf'}
    elif path.endswith('/summary'):value={'total':2,'draft':1,'finalized':1,'archived':0}
    elif path.endswith('/capabilities'):value={'phase3':False}
    elif path.endswith('/share-targets'):value=[]
    elif path.endswith('/templates'):value=[]
    elif path.endswith('/users'):
        if req.method=='POST':
            if not payload.get('password') or len(payload['password'])<12:raise AssertionError('Expected direct password-based account creation')
            account={'id':'44444444-4444-4444-8444-444444444444','email':payload['email'],'role':payload['role'],'active':True,'has_password':True,'pending':False}
            accounts.append(account);value={'account':account}
        else:value=accounts if parse_qs(urlparse(req.url).query).get('includeInactive')==['1'] else [a for a in accounts if a['active']]
    elif path.startswith('/api/v1/users/') and req.method=='DELETE':
        for item in accounts:
            if item['id']==path.split('/')[-1]:item['active']=False
        value={'removed':True,'retainedHistory':True}
    elif path.startswith('/api/v1/documents/') and req.method=='DELETE':
        ident=path.split('/')[-1]
        docs[:]=[d for d in docs if d['id']!=ident]
        value={'ok':True}
    elif path.endswith('/documents'):
        query=parse_qs(urlparse(req.url).query).get('q',[''])[0].lower()
        value=[x for x in docs if query in (x['title']+' '+x['number']+' '+x['recipient']).lower()]
    else:route.fulfill(status=404,content_type='application/json',body='{"error":"Unknown fictional endpoint"}');return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(value))

with server(),sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    try:
        page=browser.new_page(viewport={'width':1420,'height':900})
        errors=[]
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        page.route('**/api/v1/**',fulfill)
        page.goto(BASE,wait_until='domcontentloaded',timeout=15000)
        page.locator('#searchInput').wait_for(state='visible',timeout=12000)
        page.locator('#searchInput').fill('contract')
        page.wait_for_timeout(500)
        assert page.locator('#docList').inner_text().count('Existing contract')==1
        assert 'Test invoice' not in page.locator('#docList').inner_text()
        page.locator('#rimdanClearSearch').click()
        page.wait_for_timeout(400)
        assert 'Test invoice' in page.locator('#docList').inner_text()
        assert page.locator('[data-delete]').count()>=1
        assert page.locator('.rimdan-location').first.inner_text().strip()
        page.locator('.rimdan-theme-toggle').click()
        assert page.locator('html').get_attribute('data-theme')=='dark'
        page.locator('.rimdan-theme-toggle').click()
        assert page.locator('html').get_attribute('data-theme')=='light'
        page.locator('.rimdan-theme-toggle').click()
        assert page.locator('html').get_attribute('data-theme')=='dark'
        # Ensure dark-mode table headers and body text remain distinguishable.
        contrast=page.locator('.document-table th').first.evaluate("""(node)=>{
          const c=getComputedStyle(node);const row=getComputedStyle(document.querySelector('.document-table tbody tr'));
          return {fg:c.color,bg:c.backgroundColor,row:row.backgroundColor}
        }""")
        assert contrast['bg']!='rgb(248, 250, 251)',contrast
        assert contrast['fg']!='rgb(255, 255, 255)' or contrast['bg']!='rgb(255, 255, 255)',contrast
        page.locator('.rimdan-theme-toggle').click()
        page.locator('[data-new="letter"]').first.click()
        assert page.locator('#fontFamily option').count()>=15
        assert page.locator('.format-details').evaluate('(el)=>el.open')
        assert page.locator('#fontSize option').count()==44
        page.locator('#fontSize').select_option('50')
        assert page.locator('#pvBody').evaluate("(el)=>Math.round(parseFloat(getComputedStyle(el).fontSize))")>=60
        page.locator('#fontSize').select_option('12')
        page.locator('#titleSize').select_option('20')
        page.locator('#recipientSize').select_option('16')
        assert page.locator('#pvTitle').evaluate("(el)=>getComputedStyle(el).fontSize")=='26.6667px'
        assert page.locator('#pvRecipient').evaluate("(el)=>parseFloat(getComputedStyle(el).fontSize)")>20
        assert page.locator('#saveBtn .rimdan-svg').count()==1
        assert page.locator('#pdfBtn .rimdan-svg').count()==1

        page.locator('#docBody').fill('First sentence. Second sentence.')
        page.locator('#docBody').evaluate('(el)=>{el.setSelectionRange(0,5);el.focus();}')
        page.locator('[data-format="bold"]').click()
        assert page.locator('#pvBody strong').first.inner_text()=='First'
        assert '**' not in page.locator('#pvBody').inner_text()
        page.locator('[data-page="users"]').click()
        page.locator('.rimdan-modal button.primary').click()
        page.locator('#staffPassword').wait_for(state='visible')
        page.locator('#staffGenerate').click()
        assert len(page.locator('#staffPassword').input_value())>=20
        page.locator('#accountForm input[name="email"]').fill('worker@test.invalid')
        page.locator('#accountForm button[type="submit"]').click()
        page.get_by_text('worker@test.invalid').first.wait_for(state='visible',timeout=8000)
        assert len(accounts)==1 and accounts[0]['has_password']
        page.locator('[data-remove-user]').first.click()
        page.locator('.rimdan-modal button.primary').click()
        page.wait_for_timeout(350)
        assert accounts[0]['active'] is False
        assert page.get_by_text('worker@test.invalid').count()==0
        page.locator('#toggleRemovedAccounts').click()
        page.get_by_text('worker@test.invalid').first.wait_for(state='visible',timeout=6000)
        removed_row=page.locator('.rimdan-staff-row').filter(has_text='worker@test.invalid').inner_text().lower()
        assert any(word in removed_row for word in ('inactive','غیرفعال','حذف‌شده')),removed_row
        assert page.locator('.rimdan-completion').count()>=1
        assert not errors,errors
        # Mobile editor, document library, navigation stacking, and compact actions.
        phone=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        phone.route('**/api/v1/**',fulfill)
        phone.goto(BASE,wait_until='domcontentloaded',timeout=15000)
        phone.locator('#searchInput').wait_for(state='visible',timeout=10000)
        phone.locator('#menuBtn').click()
        phone.locator('#sidebar.open').wait_for(state='visible')
        layers=phone.evaluate("""() => {let s=document.querySelector('#sidebar'),b=document.querySelector('#navBackdrop'),r=s.getBoundingClientRect();
          return {sidebar:getComputedStyle(s).zIndex,backdrop:getComputedStyle(b).zIndex,hit:document.elementFromPoint(r.left+50,r.top+250)?.closest('#sidebar')===s};
        }""")
        assert int(layers['sidebar'])>int(layers['backdrop']) and layers['hit'],layers
        phone.locator('#closeNav').click()
        assert not phone.locator('#sidebar').evaluate("(el)=>el.classList.contains('open')")
        phone.locator('#docList .rimdan-icon-action').first.wait_for(state='visible')
        sizes=phone.locator('#docList .rimdan-icon-action').first.evaluate("(el)=>{let r=el.getBoundingClientRect();return [r.width,r.height]}")
        assert 30<=sizes[0]<=46 and 30<=sizes[1]<=46,sizes
        phone.locator('[data-new="letter"]').first.click()
        phone.locator('#editTab').click()
        if not phone.locator('.format-details').evaluate('(el)=>el.open'):
            phone.locator('.format-details > summary').click()
        assert phone.locator('#fontSize option').count()==44
        phone.locator('#fontSize').select_option('7')
        assert phone.locator('#fontSize').input_value()=='7'
        phone.locator('#previewTab').click()
        phone.locator('#zoomIn .rimdan-svg').wait_for(state='visible')
        assert phone.locator('#saveBtn').is_visible()
        phone.close()
        print('PASS: search, formatting 7-50 pt, mobile drawer and compact actions, staff workflows')
    finally:browser.close()

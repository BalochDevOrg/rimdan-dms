"""Regression: no render-loop freeze before the signed-out login appears.

Serves the Vercel build output locally and mocks only the two startup endpoints;
uses no credentials, remote database, or live website.
"""
import json
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager
from playwright.sync_api import sync_playwright

BASE='http://127.0.0.1:18765'
@contextmanager
def server():
    p=subprocess.Popen([sys.executable,'-m','http.server','18765','--bind','127.0.0.1','--directory','public'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            if p.poll() is not None:
                raise RuntimeError('Static server exited')
            try:
                with urllib.request.urlopen(BASE,timeout=1) as r:
                    if r.status==200:break
            except Exception:time.sleep(.1)
        else:raise RuntimeError('Static server unavailable')
        yield
    finally:
        p.terminate()
        try:p.wait(timeout=4)
        except subprocess.TimeoutExpired:p.kill()

with server(),sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    try:
        for language in ('fa','en'):
            page=browser.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.route('**/api/v1/config',lambda route:route.fulfill(status=200,content_type='application/json',body='{"mode":"server"}'))
            page.route('**/api/v1/session',lambda route:route.fulfill(status=401,content_type='application/json',body='{"error":"Unauthorized"}'))
            page.goto(BASE,wait_until='domcontentloaded',timeout=15000)
            page.locator('#authForm').wait_for(state='visible',timeout=8000)
            page.locator('#authEmail').wait_for(state='visible',timeout=8000)
            # A trapped MutationObserver starves page.evaluate/interaction.
            assert page.evaluate("() => document.querySelector('#authForm') !== null")
            if language=='en':
                page.locator('#langBtn').click(timeout=4000)
                assert page.locator('html').get_attribute('lang')=='en'
                page.locator('#authEmail').fill('fictional@example.invalid',timeout=4000)
            else:
                assert page.locator('html').get_attribute('lang')=='fa'
            assert not errors,errors
            page.close()
        # UI-only mobile navigation smoke: signed-in visual state is simulated.
        # No auth endpoint is bypassed or used for real data.
        mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        mobile.route('**/api/v1/config',lambda route:route.fulfill(status=200,content_type='application/json',body='{"mode":"server"}'))
        mobile.route('**/api/v1/session',lambda route:route.fulfill(status=401,content_type='application/json',body='{"error":"Unauthorized"}'))
        mobile.goto(BASE,wait_until='domcontentloaded',timeout=15000)
        mobile.locator('#authForm').wait_for(state='visible',timeout=8000)
        mobile.evaluate("() => { document.documentElement.dataset.auth='signed-in'; }")
        mobile.locator('#menuBtn').click(timeout=5000)
        assert mobile.locator('#sidebar').evaluate("(el)=>el.classList.contains('open')")
        assert mobile.locator('#navBackdrop').is_visible()
        info=mobile.evaluate("""() => {
          const s=document.querySelector('#sidebar'),b=document.querySelector('#navBackdrop');
          const r=s.getBoundingClientRect();
          const x=r.left+Math.min(60,r.width/2), y=r.top+Math.min(210,r.height/2);
          return {sideZ:Number(getComputedStyle(s).zIndex),backZ:Number(getComputedStyle(b).zIndex),
                  hit:document.elementFromPoint(x,y)?.closest('#sidebar')===s, width:r.width};
        }""")
        assert info['sideZ']>info['backZ'] and info['hit'],info
        mobile.locator('#closeNav').click(timeout=5000)
        assert not mobile.locator('#sidebar').evaluate("(el)=>el.classList.contains('open')")
        mobile.close()
        print('PASS: bilingual login responsive and mobile drawer interactive above backdrop')
    finally:
        browser.close()

"""Checks Chromium's actual Save as PDF pagination for official Rimdan A4 artwork.
Uses local static output and fixture text only; never touches user documents.
"""
import io
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager
from pypdf import PdfReader
from playwright.sync_api import sync_playwright

BASE='http://127.0.0.1:18766'
@contextmanager
def server():
    p=subprocess.Popen([sys.executable,'-m','http.server','18766','--bind','127.0.0.1','--directory','public'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                with urllib.request.urlopen(BASE,timeout=1) as r:
                    if r.status==200:break
            except Exception:time.sleep(.1)
        else:raise RuntimeError('Local build server not ready')
        yield
    finally:
        p.terminate()
        try:p.wait(timeout=4)
        except subprocess.TimeoutExpired:p.kill()

def page_markup(lang,continuations=0):
    pad='persian-pad.jpg' if lang=='fa' else 'english-pad.png'
    direction='rtl' if lang=='fa' else 'ltr'
    body='آزمایش صفحه چاپی' if lang=='fa' else 'Print layout test'
    pages=''.join(f"""<article class="preview-paper has-letterhead official-paper {'continuation-paper' if i else ''}" dir="{direction}" lang="{lang}">
     <img class="letterhead-art" src="{BASE}/assets/{pad}" alt="">
     <header class="paper-head"></header><div class="paper-date">2026/11/04</div>
     <h1 id="p-{i}">{body} {i+1}</h1><div class="paper-recipient">Recipient</div>
     <div class="paper-body">{body}</div><div class="paper-footer"></div>
     </article>""" for i in range(continuations+1))
    return f"""<!doctype html><html dir="{direction}" lang="{lang}"><head>
    <link rel="stylesheet" href="{BASE}/styles.css">
    <link rel="stylesheet" href="{BASE}/mobile.css">
    <link rel="stylesheet" href="{BASE}/server-client.css">
    <link rel="stylesheet" href="{BASE}/ux-premium.css"></head>
    <body><div class="app"><aside class="sidebar"></aside><div class="main-wrap"><header class="topbar"></header>
    <main><div class="editor-grid"><div class="panel editor-fields"></div><section class="preview-panel">
    <div class="preview-caption">Preview</div><div class="preview-scroll"><div id="paperViewport">{pages}</div></div>
    </section></div></main></div></div></body></html>"""

with server(),sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    try:
        for language in ('fa','en'):
            for extra in (0,1):
                page=browser.new_page()
                page.set_content(page_markup(language,extra),wait_until='load')
                page.wait_for_function("() => [...document.querySelectorAll('.letterhead-art')].every(img => img.complete && img.naturalWidth > 0)",timeout=12000)
                pdf=page.pdf(format='A4',print_background=True,prefer_css_page_size=True)
                reader=PdfReader(io.BytesIO(pdf))
                actual=len(reader.pages)
                expected=extra+1
                assert actual==expected,f'{language} letterhead with {extra} continuation: got {actual}, expected {expected}'
                assert all(float(p.mediabox.width)>580 and float(p.mediabox.height)>830 for p in reader.pages)
                page.close()
        print('PASS: Persian/English official A4 print outputs have no trailing blank pages')
    finally:
        browser.close()

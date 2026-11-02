"""Official-pad integration: both languages, every template, physical layout and PDFs."""
import base64
import os
from pathlib import Path
import re
import subprocess
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('RIMDAN_TEST_URL','http://127.0.0.1:8000')
OUT = Path(os.environ.get('RIMDAN_TEST_ARTIFACTS','/tmp'))
OUT.mkdir(parents=True,exist_ok=True)
PADS = {'fa':'assets/persian-pad.jpg','en':'assets/english-pad.png'}
TYPES = ['letter','invoice','receipt','delivery','transaction','custom']

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1600,'height':1100},has_touch=True)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE,wait_until='networkidle')
    page.evaluate('document.fonts.ready')
    # Abstract marks; no authentic-looking signature or stamp fixture.
    mark=base64.b64decode(page.evaluate("""() => {const c=document.createElement('canvas');c.width=200;c.height=100;
        const x=c.getContext('2d');x.fillStyle='#3659ae';x.fillRect(40,30,120,40);return c.toDataURL().split(',')[1]}"""))
    for language in ['fa','en']:
        if page.locator('html').get_attribute('lang')!=language:page.locator('#langBtn').click()
        for template in TYPES:
            page.locator('[data-page=templates]').click()
            page.locator(f'[data-new={template}]').click()
            assert page.locator('#docLanguage').input_value()==language
            title=f'{language}-{template}-test'
            page.locator('#docTitle').fill(title)
            page.locator('#docRecipient').fill('گیرنده آزمایشی' if language=='fa' else 'Fictional recipient')
            page.locator('#docNumber').fill('RT-102')
            page.locator('#docDate').fill('2026-11-02')
            expected=page.locator('#docBody').input_value()
            art=page.locator('#paper .letterhead-art')
            expect(art).to_have_attribute('src',PADS[language])
            page.wait_for_function("document.querySelector('#paper .letterhead-art').naturalWidth>0")
            assert page.locator('#paper').get_attribute('dir')==('rtl' if language=='fa' else 'ltr')
            assert page.locator('#letterDate').inner_text().count('/')==2
            assert page.locator('#numberLabel').inner_text()==''
            assert page.locator('#paper .paper-head').is_hidden() and page.locator('#paper .paper-footer').is_hidden()
            assert page.locator('#letterheadStatus').inner_text()==''
            # No character loss across measured pages, and no body text in protected regions.
            joined=''.join(page.locator('.paper-body').all_text_contents())
            assert joined==expected,(language,template)
            physical=page.locator('#paper').evaluate("""paper=>{const scale=paper.getBoundingClientRect().width/(210*96/25.4);
                const r=paper.getBoundingClientRect(),body=paper.querySelector('.paper-body').getBoundingClientRect();
                return {height:r.height/scale/96*25.4,top:(body.top-r.top)/scale/96*25.4,bottom:(body.bottom-r.top)/scale/96*25.4}}""")
            assert abs(physical['height']-297)<.1 and physical['top']>=98 and physical['bottom']<=242.1,physical
            page.locator('.mark-tools > summary').click()
            for kind in ['signature','stamp']:
                page.locator(f'#{kind}-file').set_input_files(dict(name='abstract.png',mimeType='image/png',buffer=mark))
                expect(page.locator(f'#{kind}-place')).to_be_enabled()
                page.locator(f'#{kind}-place').click()
                expect(page.locator(f'[data-mark={kind}]')).to_have_count(1)
            page.locator('#saveBtn').click()
            saved=page.evaluate('JSON.parse(JSON.stringify(working))')
            assert saved['letterhead']==f'official-{language}'
            for asset in saved['marks'].values():assert asset['y']+asset['width']/asset['ratio']<=242.01
            page.pdf(path=str(OUT/f'rimdan-official-{language}-{template}.pdf'),prefer_css_page_size=True,display_header_footer=False)
            info=subprocess.check_output(['pdfinfo',str(OUT/f'rimdan-official-{language}-{template}.pdf')],text=True)
            assert '(A4)' in info
            count=int(re.search(r'Pages:\s+(\d+)',info).group(1))
            assert count==page.locator('#paperViewport .preview-paper').count()
            if template=='letter':
                page.screenshot(path=str(OUT/f'rimdan-official-{language}.png'),full_page=True)
                for width in [320,390,768]:
                    page.set_viewport_size({'width':width,'height':900})
                    page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
                page.screenshot(path=str(OUT/f'rimdan-official-{language}-mobile.png'),full_page=True)
                page.set_viewport_size({'width':1600,'height':1100})
            page.reload(wait_until='domcontentloaded')
            page.locator('[data-page=documents]').click();page.locator('#searchInput').fill(title)
            page.locator('button[data-open]').click()
            reopened=page.evaluate('JSON.parse(JSON.stringify(working))')
            assert reopened['marks']==saved['marks'] and reopened['letterhead']==saved['letterhead'] and reopened['language']==language
            expect(page.locator('#paper .letterhead-art')).to_have_attribute('src',PADS[language])
    # Document language alone changes official selection; UI language is independent.
    page.locator('#docLanguage').select_option('fa')
    expect(page.locator('#paper .letterhead-art')).to_have_attribute('src',PADS['fa'])
    assert page.locator('html').get_attribute('lang')=='en'
    page.locator('#saveBtn').click()
    # Long mixed-direction text paginates without character loss or footer collisions.
    content=('متن آزمایشی برای بررسی صفحه‌بندی — Fictional text 😀\n'*80)
    page.locator('#docBody').fill(content)
    assert ''.join(page.locator('.paper-body').all_text_contents())==content
    count=page.locator('#paperViewport .preview-paper').count()
    assert count>1 and page.locator('#overflowNotice').is_visible()
    assert page.locator('.continuation-paper [data-mark]').count()==0
    assert page.locator('#paperViewport [id=paper]').count()==1
    page.pdf(path=str(OUT/'rimdan-official-multipage.pdf'),prefer_css_page_size=True,display_header_footer=False)
    info=subprocess.check_output(['pdfinfo',str(OUT/'rimdan-official-multipage.pdf')],text=True)
    assert int(re.search(r'Pages:\s+(\d+)',info).group(1))==count,info
    assert not errors,errors
    browser.close()
print('PASS: 12 language/template combinations; official selection; labels hidden; safe writing region; original aspect-fit assets; signature/stamp overlays; persisted language/pad/marks; mobile widths; 12 A4 exports; lossless multipage content and page-count parity')

"""Mobile UX regression: Chromium/CDP touch, not physical-device certification."""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
from playwright.sync_api import sync_playwright, expect

BASE=os.environ.get('RIMDAN_TEST_URL','http://127.0.0.1:8000')
OUT=Path(os.environ.get('RIMDAN_TEST_ARTIFACTS','/tmp'))
OUT.mkdir(parents=True,exist_ok=True)
WIDTHS=[int(v) for v in os.environ.get('RIMDAN_MOBILE_WIDTHS','320,360,375,390,414,768,1024').split(',')]
TEMPLATES=['letter','invoice','receipt','delivery','transaction','custom']
results=[]


def nav(pg,screen):
    if pg.locator('#menuBtn').is_visible():
        pg.locator('#menuBtn').click()
    pg.locator(f'[data-page={screen}]').click()


def preview(pg):
    if pg.locator('#previewTab').is_visible():pg.locator('#previewTab').click()


def edit(pg):
    if pg.locator('#editTab').is_visible():pg.locator('#editTab').click()


def touch_drag(cdp,x,y,dx,dy):
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for step in range(1,5):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+dx*step/4,'y':y+dy*step/4}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})


with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for language in ['fa','en']:
        for width in WIDTHS:
            context=browser.new_context(viewport={'width':width,'height':900},has_touch=True)
            pg=context.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            pg.goto(BASE,wait_until='domcontentloaded')
            pg.evaluate("""language=>{localStorage.setItem('rimdan_lang',language);localStorage.setItem('rimdan_demo_docs',JSON.stringify([{id:'legacy-mobile',title:'نمونه آزمایشی — Fictional long document title '+ 'VeryLongUnbrokenTitle'.repeat(4),number:'RT-LEGACY-001',recipient:'Fictional recipient',body:'Old draft body',type:'letter',status:'draft',updated:'2026-11-02T00:00:00Z'}]))}""",language)
            pg.reload(wait_until='domcontentloaded');pg.evaluate('document.fonts.ready')
            # Modal drawer: keyboard trap, Escape, outside tap, focus restoration.
            pg.locator('#menuBtn').click()
            expect(pg.locator('#sidebar')).to_have_attribute('aria-hidden','false')
            assert pg.locator('.main-wrap').evaluate('(e)=>e.inert')
            pg.locator('#closeNav').focus();pg.keyboard.press('Shift+Tab')
            assert pg.evaluate("document.activeElement.dataset.page==='settings'")
            pg.keyboard.press('Tab');assert pg.locator('#closeNav').evaluate('(e)=>e===document.activeElement')
            pg.keyboard.press('Escape');assert pg.locator('#menuBtn').evaluate('(e)=>e===document.activeElement')
            pg.locator('#menuBtn').click();pg.mouse.click(10 if language=='fa' else width-10,400)
            expect(pg.locator('#sidebar')).to_have_attribute('aria-hidden','true')
            # Inspect every screen, including long real card/table rows.
            for screen in ['dashboard','documents','templates','settings']:
                nav(pg,screen)
                pg.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
                assert pg.locator('#view').get_attribute('dir') is None
                assert pg.locator('html').get_attribute('dir')==('rtl' if language=='fa' else 'ltr')
                if screen in ['dashboard','documents']:
                    assert pg.locator('.table-wrap').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
                # Actual visible buttons, not hidden descendants of details or drawer.
                small=pg.locator('button').evaluate_all("""nodes=>nodes.filter(n=>n.checkVisibility({visibilityProperty:true})&&!n.closest('.document-mark')).filter(n=>{const r=n.getBoundingClientRect();return r.width<43.5||r.height<43.5}).map(n=>n.id||n.textContent.trim())""")
                assert not small,(language,width,screen,small)
                results.append(dict(language=language,width=width,screen=screen,overflow=False))
                if width in [390,768,1024] and screen in ['dashboard','documents']:
                    pg.screenshot(path=str(OUT/f'rimdan-mobile-{language}-{width}-{screen}.png'),full_page=True,animations='disabled')
            # All document templates at every requested width in both languages.
            for template in TEMPLATES:
                nav(pg,'templates');pg.locator(f'[data-new={template}]').click()
                title=f'Mobile-{language}-{width}-{template}'
                pg.locator('#docTitle').fill(title)
                pg.locator('#docRecipient').fill('گیرنده آزمایشی' if language=='fa' else 'Fictional recipient')
                pg.locator('#docBody').fill('متن آزمایشی' if language=='fa' else 'Fictional mobile document')
                pg.locator('#saveBtn').click()
                expect(pg.locator('#actionSaveState')).to_have_text('ذخیره‌شده در این مرورگر' if language=='fa' else 'Saved in this browser')
                assert pg.locator('#saveBtn').bounding_box()['height']>=44
                if width<900:
                    expect(pg.locator('#editTab')).to_have_attribute('aria-selected','true')
                    assert pg.locator('#previewPane').evaluate('(e)=>e.inert')
                    assert float(pg.locator('#docTitle').evaluate('(e)=>getComputedStyle(e).fontSize').removesuffix('px'))>=16
                preview(pg)
                pg.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
                expect(pg.locator('#paper .letterhead-art')).to_have_attribute('src','assets/persian-pad.jpg' if language=='fa' else 'assets/english-pad.png')
                r=pg.locator('#paper').bounding_box();box=pg.locator('#previewScroll').bounding_box()
                assert r['width']<=box['width']+1 and r['height']<=box['height']+1,(language,width,r,box)
                assert abs(r['width']/r['height']-210/297)<.003
                pg.locator('#zoomIn').click();pg.locator('#zoomIn').click()
                assert pg.locator('#paper').bounding_box()['width']>r['width']*1.4
                pg.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
                pg.locator('#zoomFit').click()
                expect(pg.locator('#zoomLevel')).to_have_text('100%')
                if template=='letter' and width in [390,768,1024]:
                    pg.screenshot(path=str(OUT/f'rimdan-mobile-{language}-{width}-preview.png'),full_page=False,animations='disabled')
                    edit(pg);pg.screenshot(path=str(OUT/f'rimdan-mobile-{language}-{width}-edit.png'),full_page=False,animations='disabled');preview(pg)
                # Export from the phone Edit tab too: hidden preview must still print.
                if width==390:
                    edit(pg)
                    path=OUT/f'rimdan-mobile-{language}-{template}.pdf'
                    pg.pdf(path=str(path),prefer_css_page_size=True,display_header_footer=False)
                    info=subprocess.check_output(['pdfinfo',str(path)],text=True)
                    assert '(A4)' in info and re.search(r'Pages:\s+1\b',info),info
                nav(pg,'documents');pg.locator('#searchInput').fill(title)
                expect(pg.locator('button[data-open]')).to_have_count(1)
                pg.locator('button[data-open]').click()
                assert pg.locator('#docTitle').input_value()==title
                assert pg.evaluate('working.language')==language
                results.append(dict(language=language,width=width,screen='editor',template=template,overflow=False))
            # Physical touch gesture coverage and reduced viewport/keyboard simulation.
            if width==390:
                pg.locator('#docBody').fill('Scrollable text for gesture test.\n'*35)
                pg.locator('#saveBtn').click()
                pg.locator('.mark-tools > summary').click()
                pg.locator('.signature-drawing > summary').click()
                assert pg.locator('.mark-check').first.bounding_box()['height']>=44
                canvas=pg.locator('#signature-canvas');canvas.scroll_into_view_if_needed();r=canvas.bounding_box()
                assert abs(r['width']/r['height']-720/420)<.05
                cdp=context.new_cdp_session(pg)
                touch_drag(cdp,r['x']+20,r['y']+25,60,15)
                pg.locator('#preview-drawing').click();pg.locator('#signature-place').click()
                # Simple rectangle fixture, not an authentic-looking company stamp.
                data=base64.b64decode(pg.evaluate("""()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const x=c.getContext('2d');x.fillStyle='#277253';x.fillRect(20,20,60,60);return c.toDataURL().split(',')[1]}"""))
                pg.locator('#stamp-file').set_input_files(dict(name='abstract.png',mimeType='image/png',buffer=data))
                expect(pg.locator('#stamp-place')).to_be_enabled();pg.locator('#stamp-place').click()
                for key,value in [('x','130'),('y','190'),('width','40')]:
                    pg.locator(f'#stamp-{key}').fill(value);pg.locator(f'#stamp-{key}').press('Tab')
                original=pg.evaluate('JSON.parse(JSON.stringify(working.marks))')
                preview(pg)
                assert pg.locator('#adjustMarks').get_attribute('aria-pressed')=='false'
                # Keyboard tab selection has the same visibility and scroll behavior.
                pg.locator('#previewTab').focus();pg.keyboard.press('Home');expect(pg.locator('#editTab')).to_have_attribute('aria-selected','true')
                pg.keyboard.press('End');expect(pg.locator('#previewTab')).to_have_attribute('aria-selected','true')
                # Native touch scrolling over a locked mark must leave coordinates intact.
                pg.locator('#zoomIn').click();pg.locator('#zoomIn').click()
                pg.locator('[data-mark=stamp]').scroll_into_view_if_needed();r=pg.locator('[data-mark=stamp]').bounding_box()
                touch_drag(cdp,r['x']+r['width']/2,r['y']+r['height']/2,0,-45)
                assert pg.evaluate('JSON.parse(JSON.stringify(working.marks))')==original
                # Explicit 44px handles allow precise movement/resize with real touch.
                pg.locator('#adjustMarks').click()
                r=pg.locator('[data-mark=stamp]').bounding_box();before_scroll=pg.evaluate('JSON.parse(JSON.stringify(working.marks))')
                touch_drag(cdp,r['x']+r['width']/2,r['y']+r['height']/2,0,-25)
                assert pg.evaluate('JSON.parse(JSON.stringify(working.marks))')==before_scroll
                mover=pg.locator('[data-mark=stamp] .mark-move');mover.scroll_into_view_if_needed();r=mover.bounding_box()
                assert r['width']>=43 and r['height']>=43
                touch_drag(cdp,r['x']+r['width']/2,r['y']+r['height']/2,-12,-8)
                moved=pg.evaluate('JSON.parse(JSON.stringify(working.marks))')
                assert moved['stamp']['x']<original['stamp']['x']
                handle=pg.locator('[data-mark=stamp] .mark-resize');handle.scroll_into_view_if_needed();r=handle.bounding_box()
                touch_drag(cdp,r['x']+r['width']/2,r['y']+r['height']/2,-8,0)
                assert pg.evaluate('working.marks.stamp.width')<moved['stamp']['width']
                pg.locator('#adjustMarks').click()
                pg.locator('#zoomFit').click()
                # Pinch zoom in the preview is tested through Chromium touch events.
                scroll=pg.locator('#previewScroll');scroll.scroll_into_view_if_needed();r=scroll.bounding_box()
                cx=r['x']+r['width']/2;cy=r['y']+70
                cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-25,'y':cy},{'x':cx+25,'y':cy}]})
                for dx in [32,40,50]:cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-dx,'y':cy},{'x':cx+dx,'y':cy}]})
                cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                assert pg.locator('#zoomLevel').inner_text()!='100%'
                pg.locator('#zoomFit').click()
                pg.locator('#saveBtn').click();saved=pg.evaluate('JSON.parse(JSON.stringify(working.marks))')
                edit(pg);pg.locator('#docBody').focus();pg.set_viewport_size({'width':390,'height':420})
                pg.wait_for_function('innerHeight===420');pg.wait_for_timeout(100)
                bar=pg.locator('.editor-actions-bar').bounding_box()
                assert bar['y']>=0 and bar['y']+bar['height']<=421,bar
                assert pg.locator('#docBody').evaluate('(e)=>e===document.activeElement')
                pg.set_viewport_size({'width':390,'height':900})
                pg.locator('#saveBtn').click()
                pg.reload(wait_until='domcontentloaded');nav(pg,'documents');pg.locator('#searchInput').fill(f'Mobile-{language}-{width}-custom');pg.locator('button[data-open]').click()
                assert pg.evaluate('JSON.parse(JSON.stringify(working.marks))')==saved
                preview(pg);expect(pg.locator('#adjustMarks')).to_have_attribute('aria-pressed','false')
                # Multipage + zoom never alters the physical print pagination.
                pg.locator('#zoomIn').click();pg.locator('#zoomIn').click()
                count=pg.locator('#paperViewport .preview-paper').count()
                before_print=pg.locator('#paper').bounding_box()['width']
                path=OUT/f'rimdan-mobile-{language}-multipage.pdf'
                pg.pdf(path=str(path),prefer_css_page_size=True,display_header_footer=False)
                info=subprocess.check_output(['pdfinfo',str(path)],text=True)
                assert int(re.search(r'Pages:\s+(\d+)',info).group(1))==count and count>1,info
                assert abs(pg.locator('#paper').bounding_box()['width']-before_print)<1
            assert not errors,(language,width,errors)
            context.close()
    # Desktop screenshot and split-layout check without changing print settings.
    pg=browser.new_page(viewport={'width':1440,'height':1000});pg.goto(BASE);pg.locator('[data-new=letter]').first.click()
    assert pg.locator('.editor-fields').bounding_box()['x']<pg.locator('.preview-panel').bounding_box()['x']
    pg.screenshot(path=str(OUT/'rimdan-mobile-desktop-1440.png'),full_page=True,animations='disabled')
    browser.close()
(OUT/('rimdan-mobile-results.json' if len(WIDTHS)==7 else 'rimdan-mobile-results-filtered.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(f'PASS: {len(WIDTHS)} widths × 2 languages; all screens; {len(WIDTHS)*12} template edit/save/reopen flows; drawer focus/Escape/outside tap; preview tabs/zoom/fit/pinch; locked touch scrolling; touch drawing/placement/resize; small viewport simulation; A4 PDFs from Edit/Preview, multipage and zoom parity; desktop split layout')

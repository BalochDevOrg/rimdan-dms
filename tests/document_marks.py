"""Signature/stamp regression coverage with abstract, non-authentic image fixtures."""
import base64
import os
import shutil
import subprocess
from pathlib import Path
from browser_support import launch_options, ARTIFACT_ROOT
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get('RIMDAN_TEST_URL', 'http://127.0.0.1:8000')
ARTIFACTS = Path(os.environ.get('RIMDAN_TEST_ARTIFACTS', ARTIFACT_ROOT))
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def fixture(page, mime='image/png', color='#194b96', white=False, width=300, height=100):
    return base64.b64decode(page.evaluate('''({mime,color,white,width,height}) => {
        const c=document.createElement('canvas');c.width=width;c.height=height;
        const ctx=c.getContext('2d');
        if(white){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);}
        ctx.fillStyle=color;ctx.fillRect(width/4,height/3,width/2,height/3);
        return c.toDataURL(mime).split(',')[1];
    }''', dict(mime=mime, color=color, white=white, width=width, height=height)))


def upload(page, kind, data, mime='image/png'):
    page.locator(f'#{kind}-file').set_input_files(dict(name='abstract-fixture', mimeType=mime, buffer=data))
    expect(page.locator(f'#{kind}-pending img')).to_have_count(1)
    expect(page.locator(f'#{kind}-place')).to_be_enabled()


def marks(page):
    return page.evaluate('JSON.parse(JSON.stringify(working.marks || {}))')


def alpha(page, src):
    return page.evaluate('''async src => {const i=new Image();i.src=src;await i.decode();
        const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;
        const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return ctx.getImageData(0,0,1,1).data[3];}''', src)


def inside(mark):
    assert 18 <= mark['x'] <= 192 - mark['width'] + .001
    assert 100 <= mark['y'] <= 242 - mark['width'] / mark['ratio'] + .001


with sync_playwright() as p:
    browser = p.chromium.launch(**launch_options())
    context = browser.new_context(viewport={'width':1600,'height':1100}, has_touch=True)
    page = context.new_page()
    cdp=context.new_cdp_session(page)
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto(BASE_URL, wait_until='domcontentloaded')
    page.evaluate("localStorage.setItem('rimdan_lang','en')")
    page.reload(wait_until='domcontentloaded')
    page.locator('[data-new=letter]').first.click()
    page.locator('#docTitle').fill('Signature and stamp fictional test')
    page.locator('#docBody').fill('Fictional test document. Abstract fixtures are not authentic signatures or stamps.')
    page.locator('#saveBtn').click()
    page.locator('.mark-tools > summary').click()
    # Upload preparation never applies an asset automatically or marks the draft dirty.
    png = fixture(page)
    upload(page, 'signature', png)
    assert page.locator('[data-mark]').count() == 0
    assert page.locator('#saveState').inner_text() == 'Saved in this browser'
    page.locator('#signature-clear').click()
    expect(page.locator('#signature-pending img')).to_have_count(0)
    upload(page, 'signature', png)
    page.locator('#signature-place').click()
    expect(page.locator('[data-mark=signature]')).to_have_count(1)
    assert alpha(page, marks(page)['signature']['src']) == 0
    stamp_png = fixture(page, color='#287644', width=160, height=160)
    upload(page, 'stamp', stamp_png)
    assert page.locator('[data-mark=stamp]').count() == 0
    page.locator('#stamp-place').click()
    expect(page.locator('[data-mark=stamp]')).to_have_count(1)
    assert alpha(page, marks(page)['stamp']['src']) == 0
    for kind in ['signature', 'stamp']:
        for key, value in [('x','999'),('y','-99'),('width','999')]:
            page.locator(f'#{kind}-{key}').fill(value)
            page.locator(f'#{kind}-{key}').press('Tab')
        inside(marks(page)[kind])
    page.locator('#adjustMarks').click()
    # Numeric positioning and keyboard movement/resizing, in physical directions.
    for key, value in [('width','48'),('x','35'),('y','210')]:
        page.locator(f'#signature-{key}').fill(value);page.locator(f'#signature-{key}').press('Tab')
    node = page.locator('[data-mark=signature]')
    node.focus();node.press('ArrowRight');node.press('Shift+ArrowDown');node.press('+')
    current = marks(page)['signature']
    assert current['x']==36 and current['y']==215 and current['width']==50
    # Desktop mouse drag and handle resize use the scaled preview coordinates.
    node.scroll_into_view_if_needed();box=node.bounding_box()
    before=marks(page)['signature']
    page.mouse.move(box['x']+box['width']/3, box['y']+box['height']/3)
    page.mouse.down();page.mouse.move(box['x']+box['width']/3+20,box['y']+box['height']/3+5,steps=5);page.mouse.up()
    assert marks(page)['signature']['x'] > before['x']
    handle=page.locator('[data-mark=signature] .mark-resize');handle.scroll_into_view_if_needed();box=handle.bounding_box()
    before=marks(page)['signature']['width']
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']/2+15,box['y']+box['height']/2,steps=4);page.mouse.up()
    assert marks(page)['signature']['width'] > before
    # Exact persistence and isolation from unsaved edits.
    saved=marks(page);page.locator('#saveBtn').click()
    page.locator('#signature-x').fill('80');page.locator('#signature-x').press('Tab')
    stored=page.evaluate("JSON.parse(localStorage.getItem('rimdan_demo_docs'))[0].marks")
    assert stored == saved
    page.once('dialog',lambda d:d.accept());page.locator('[data-go=documents]').first.click()
    page.locator('button[data-open]').click()
    assert marks(page)==saved
    page.locator('.mark-tools > summary').click()
    # SVG masquerading as PNG, corrupt data, and oversized files are rejected.
    for data,mime in [(b'<svg xmlns="http://www.w3.org/2000/svg"/>','image/png'), (b'not a jpeg','image/jpeg'), (b'x'*(2*1024*1024+1),'image/png')]:
        page.locator('#stamp-file').set_input_files(dict(name='invalid',mimeType=mime,buffer=data))
        expect(page.locator('#mark-status')).to_contain_text('Image rejected')
        assert marks(page)['stamp']==saved['stamp']
    upload_candidate=fixture(page,width=4097,height=400)
    page.locator('#stamp-file').set_input_files(dict(name='too-wide.png',mimeType='image/png',buffer=upload_candidate))
    expect(page.locator('#mark-status')).to_contain_text('Image rejected')
    assert marks(page)['stamp']==saved['stamp']
    # JPEG white background can be explicitly removed; replacing keeps placement.
    jpg=fixture(page,mime='image/jpeg',white=True,color='#ad2e34')
    upload(page,'signature',jpg,'image/jpeg')
    assert marks(page)['signature']==saved['signature']
    page.locator('#signature-white').check();page.locator('#signature-place').click()
    expect(page.locator('#mark-status')).to_contain_text('Image placed')
    assert alpha(page,marks(page)['signature']['src'])==0
    assert marks(page)['signature']['x']==saved['signature']['x']
    # WebP is decoded, normalized to PNG, and preserves transparency.
    page.locator('#stamp-remove').click();assert marks(page)['stamp'] is None
    upload(page,'stamp',fixture(page,mime='image/webp',width=200,height=200),'image/webp')
    page.locator('#stamp-place').click();expect(page.locator('[data-mark=stamp]')).to_have_count(1)
    assert marks(page)['stamp']['src'].startswith('data:image/png;base64,')
    assert alpha(page,marks(page)['stamp']['src'])==0
    # Draw with mouse and pen. Preview/clear are separate from placement.
    page.locator('.signature-drawing > summary').click()
    canvas=page.locator('#signature-canvas');canvas.scroll_into_view_if_needed();box=canvas.bounding_box()
    before=marks(page)['signature']['src']
    page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.mouse.move(box['x']+100,box['y']+45,steps=6);page.mouse.up()
    cdp.send('Input.dispatchMouseEvent',dict(type='mousePressed',x=box['x']+40,y=box['y']+30,button='left',buttons=1,clickCount=1,pointerType='pen'))
    cdp.send('Input.dispatchMouseEvent',dict(type='mouseMoved',x=box['x']+70,y=box['y']+55,button='left',buttons=1,pointerType='pen'))
    cdp.send('Input.dispatchMouseEvent',dict(type='mouseReleased',x=box['x']+70,y=box['y']+55,button='left',buttons=0,clickCount=1,pointerType='pen'))
    page.locator('#preview-drawing').click();expect(page.locator('#signature-pending img')).to_have_count(1)
    assert marks(page)['signature']['src']==before
    page.locator('#clear-drawing').click();page.locator('#preview-drawing').click()
    expect(page.locator('#mark-status')).to_have_text('Draw a signature first.')
    page.locator('#signature-place').click();expect(page.locator('#signature-pending img')).to_have_count(0)
    page.locator('#saveBtn').click()
    # Mobile real touchscreen drag, drawing, and 44px resize target.
    page.set_viewport_size({'width':390,'height':844})
    page.locator('#previewTab').click()
    if page.locator('#adjustMarks').get_attribute('aria-pressed')=='false':page.locator('#adjustMarks').click()
    node=page.locator('[data-mark=stamp] .mark-move');node.scroll_into_view_if_needed();box=node.bounding_box();before=marks(page)['stamp']
    assert box['width']>=43 and box['height']>=43
    x=box['x']+box['width']/3;y=box['y']+box['height']/3
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-12,'y':y-8}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert marks(page)['stamp']['x']<before['x']
    handle=page.locator('[data-mark=stamp] .mark-resize');handle.scroll_into_view_if_needed();box=handle.bounding_box()
    assert box['width']>=43 and box['height']>=43
    x=box['x']+box['width']/2;y=box['y']+box['height']/2;before=marks(page)['stamp']['width']
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-10,'y':y}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert marks(page)['stamp']['width']<before
    page.locator('#editTab').click()
    canvas.scroll_into_view_if_needed();box=canvas.bounding_box();x=box['x']+20;y=box['y']+20
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+50,'y':y+15}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    page.locator('#preview-drawing').click();expect(page.locator('#signature-pending img')).to_have_count(1)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # Both interface directions retain placements. Only explicit Place applies drawing.
    saved=marks(page);page.locator('#langBtn').click();assert page.locator('html').get_attribute('dir')=='rtl'
    assert marks(page)==saved
    page.locator('.mark-tools > summary').click();expect(page.locator('#signature-heading')).to_have_text('امضا')
    page.locator('#signature-clear').click()
    # Unplaced ink survives interface rerenders but still needs explicit placement.
    page.locator('.signature-drawing > summary').click();page.locator('#preview-drawing').click()
    expect(page.locator('#signature-pending img')).to_have_count(1)
    assert marks(page)==saved
    page.locator('#signature-clear').click()
    page.locator('#saveBtn').click()
    page.locator('[data-mark=stamp]').scroll_into_view_if_needed()
    page.screenshot(path=str(ARTIFACTS/'rimdan-marks-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1600,'height':1100})
    page.screenshot(path=str(ARTIFACTS/'rimdan-marks-desktop.png'),full_page=True)
    page.pdf(path=str(ARTIFACTS/'rimdan-marks-a4.pdf'),prefer_css_page_size=True,display_header_footer=False)
    page.emulate_media(media='print')
    for kind in ['signature','stamp']:
        expect(page.locator(f'[data-mark={kind}] img')).to_be_visible()
        assert page.locator(f'[data-mark={kind}] .mark-resize').is_hidden()
        assert page.locator(f'[data-mark={kind}] .mark-move').is_hidden()
        # Signed documents use an A4 named page with 18mm internal content margins.
        box=page.locator(f'[data-mark={kind}]').bounding_box();paper=page.locator('#paper').bounding_box()
        assert abs((box['x']-paper['x'])-marks(page)[kind]['x']*96/25.4)<1
    page.emulate_media(media='screen')
    page.locator('.document-setup').evaluate('(e)=>e.open=true')
    page.locator('.letterhead-controls summary').click()
    page.locator('#letterheadFile').set_input_files(dict(name='blank-letterhead.png',mimeType='image/png',buffer=fixture(page,width=840,height=1188,white=True)))
    expect(page.locator('#paper')).to_have_attribute('data-pad','custom')
    page.emulate_media(media='print')
    page.pdf(path=str(ARTIFACTS/'rimdan-marks-letterhead-a4.pdf'),prefer_css_page_size=True,display_header_footer=False)
    page.emulate_media(media='print')
    for kind in ['signature','stamp']:
        box=page.locator(f'[data-mark={kind}]').bounding_box();paper=page.locator('#paper').bounding_box()
        assert abs((box['y']-paper['y'])-marks(page)[kind]['y']*96/25.4)<1
    page.emulate_media(media='screen')
    # Import rerenders the details controls closed.
    page.locator('.letterhead-controls summary').click();page.locator('#removeLetterhead').click();page.locator('#saveBtn').click()
    # New documents have no inherited assets, and saved documents retain their own.
    page.locator('[data-go=documents]').first.click();page.locator('[data-new=letter]').click()
    assert not any(marks(page).values()) and page.locator('[data-mark]').count()==0
    page.locator('[data-go=documents]').first.click();page.locator('button[data-open]').click();assert marks(page)==saved
    page.locator('.mark-tools > summary').click()
    page.locator('#signature-remove').click();page.locator('#stamp-remove').click();page.locator('#saveBtn').click()
    page.reload(wait_until='domcontentloaded');page.locator('[data-page=documents]').click();page.locator('button[data-open]').click()
    assert not any(marks(page).values())
    page.evaluate("""() => {const data=JSON.parse(localStorage.getItem('rimdan_demo_docs'));
        data[0].marks={signature:{src:'https://example.invalid/signature.png'},stamp:{src:'data:image/svg+xml;base64,PHN2Zy8+'}};
        localStorage.setItem('rimdan_demo_docs',JSON.stringify(data));}""")
    page.reload(wait_until='domcontentloaded');page.locator('[data-page=documents]').click();page.locator('button[data-open]').click()
    assert not any(marks(page).values()) and page.locator('[data-mark]').count()==0
    if shutil.which('pdfinfo'):
        for name in ['rimdan-marks-a4.pdf','rimdan-marks-letterhead-a4.pdf']:
            info=subprocess.check_output(['pdfinfo',str(ARTIFACTS/name)],text=True)
            assert 'Pages:           1' in info,info
            assert '(A4)' in info,info
    assert not errors, errors
    browser.close()
print('PASS: explicit upload/place; PNG/JPEG/WebP and transparency; invalid/spoofed/oversized rejection; keyboard/numeric bounds; desktop drag/resize; mouse/pen/touch drawing; mobile touch drag/resize; per-draft save/reopen/isolation; clearing/replacing/deleting; RTL/LTR; print positioning and A4 PDF')

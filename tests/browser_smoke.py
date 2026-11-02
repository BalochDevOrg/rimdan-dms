from playwright.sync_api import sync_playwright
from pathlib import Path
import os
BASE_URL=os.environ.get('RIMDAN_TEST_URL','http://127.0.0.1:8000')
ARTIFACTS=Path(os.environ.get('RIMDAN_TEST_ARTIFACTS','/tmp'))
ARTIFACTS.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1600,'height':1100});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE_URL)
 page.evaluate("localStorage.setItem('rimdan_demo_docs',JSON.stringify([{id:'legacy',title:'Legacy draft',number:'OLD-01',recipient:'Old customer',body:'Old body',type:'letter',status:'draft',updated:'2026-01-01T00:00:00Z'}]))")
 page.reload();page.locator('[data-new=letter]').first.click()
 assert page.locator('#paper').get_attribute('dir')=='rtl'
 page.locator('#docTitle').fill('نامه آزمایشی')
 page.locator('#docRecipient').fill('گیرنده آزمایشی')
 page.locator('#docNumber').fill('RT-TEST')
 page.locator('#docBody').fill('متن فارسی برای آزمون\nخط دوم')
 page.locator('[data-format=bold]').click();page.locator('[data-format=italic]').click();page.locator('[data-format=underline]').click()
 page.locator('#fontSize').select_option('16');page.locator('#textAlign').select_option('center')
 assert page.locator('#pvBody').evaluate('(e)=>getComputedStyle(e).fontWeight')=='700'
 assert 'گیرنده آزمایشی' in page.locator('#pvRecipient').inner_text()
 page.locator('#saveBtn').click();page.screenshot(path=str(ARTIFACTS/'rimdan-persian-workspace.png'),full_page=True);page.reload();page.locator('[data-page=documents]').click()
 page.locator('#searchInput').fill('RT-TEST');page.locator('button[data-open]').click()
 assert page.locator('#docBody').input_value()=='متن فارسی برای آزمون\nخط دوم'
 assert page.locator('#fontSize').input_value()=='16'
 assert page.locator('[data-format=bold]').get_attribute('aria-pressed')=='true'
 page.locator('#docBody').fill('Unsaved retained text')
 page.once('dialog',lambda d:d.dismiss());page.locator('[data-go=documents]').first.click()
 assert page.locator('#docBody').input_value()=='Unsaved retained text'
 page.locator('#langBtn').click()
 assert page.locator('#docBody').input_value()=='Unsaved retained text'
 assert page.locator('#paper').get_attribute('dir')=='rtl'
 page.locator('#docLanguage').select_option('en')
 assert page.locator('#paper').get_attribute('dir')=='ltr'
 page.locator('#docTitle').fill('Test letter');page.locator('#docBody').fill('Dear Customer,\n\nThis fictional letter validates the A4 document workspace.\n\nKind regards,\nRimdan Trade')
 page.locator('#saveBtn').click()
 left=page.locator('.editor-fields').bounding_box();right=page.locator('.preview-panel').bounding_box()
 assert left['x']<right['x']
 for width in [320,375,390,768,1024,1600]:
  page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(100)
  if width==390:
   page.locator('#menuBtn').click();assert page.locator('#menuBtn').get_attribute('aria-expanded')=='true'
   page.locator('#closeNav').click();assert page.locator('#menuBtn').get_attribute('aria-expanded')=='false'
  if width==390:page.screenshot(path=str(ARTIFACTS/'rimdan-mobile-workspace.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 page.screenshot(path=str(ARTIFACTS/'rimdan-workspace.png'),full_page=True)
 page.pdf(path=str(ARTIFACTS/'rimdan-a4.pdf'),prefer_css_page_size=True,display_header_footer=False)
 # Both export controls invoke the browser print API.
 page.evaluate('window.print=()=>{window.printCalled=true}')
 page.locator('#pdfBtn').click();assert page.evaluate('window.printCalled')
 page.evaluate('window.printCalled=false');page.locator('#printBtn').click();assert page.evaluate('window.printCalled')
 page.locator('[data-go=documents]').first.click();page.locator('#searchInput').fill('OLD-01');page.locator('button[data-open]').click()
 assert page.locator('#docBody').input_value()=='Old body'
 # Template replacement is guarded and produces distinct starting content.
 page.once('dialog',lambda d:d.accept());page.locator('#templateSelect').select_option('invoice')
 assert 'INVOICE' in page.locator('#docBody').input_value()
 # Additional document controls preserve values across duplication and reopening.
 page.locator('#docDate').fill('2026-08-15')
 page.locator('#fontFamily').select_option('Tahoma')
 page.locator('#lineSpacing').select_option('2.3')
 page.locator('#duplicateBtn').click()
 assert 'Copy' in page.locator('#docTitle').input_value()
 page.locator('#saveBtn').click()
 page.locator('[data-go=documents]').first.click()
 page.locator('#searchInput').fill('Copy')
 page.locator('button[data-open]').click()
 assert page.locator('#docDate').input_value()=='2026-08-15'
 assert page.locator('#fontFamily').input_value()=='Tahoma'
 assert page.locator('#lineSpacing').input_value()=='2.3'
 # A synthetic blank PNG tests import without substituting for company artwork.
 import base64
 fixture=page.evaluate("() => {const c=document.createElement('canvas');c.width=840;c.height=1188;const ctx=c.getContext('2d');ctx.fillStyle='#edf1f6';ctx.fillRect(0,0,840,1188);return c.toDataURL('image/png').split(',')[1]}")
 page.locator('#letterheadFile').set_input_files({'name':'test-letterhead.png','mimeType':'image/png','buffer':base64.b64decode(fixture)})
 page.wait_for_selector('#paper[data-pad=custom]')
 page.locator('#saveBtn').click()
 assert page.locator('.letterhead-art').evaluate('(e)=>e.complete && e.naturalWidth===840')
 page.pdf(path=str(ARTIFACTS/'rimdan-import-test.pdf'),prefer_css_page_size=True)
 page.reload();page.locator('[data-page=documents]').click();page.locator('#searchInput').fill('Copy');page.locator('button[data-open]').click()
 assert page.locator('.letterhead-art').count()==1
 page.locator('.letterhead-controls summary').click();page.locator('#removeLetterhead').click()
 assert page.locator('#paper .letterhead-art').get_attribute('src')=='assets/english-pad.png'
 page.locator('#docBody').fill('Long paragraph for pagination.\n'*180)
 assert page.locator('#overflowNotice').is_visible()
 page.pdf(path=str(ARTIFACTS/'rimdan-long-test.pdf'),prefer_css_page_size=True)
 # Storage failure must leave dirty state and existing drafts untouched.
 page.locator('#docTitle').fill('Storage failure')
 page.evaluate("() => {Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')}}")
 page.locator('#saveBtn').click();assert page.locator('#saveState').inner_text()=='Unsaved changes'
 assert not errors,errors
 b.close()
print('PASS: legacy compatibility; Persian/English direction; formatting persistence; save/reopen/search; live recipient preview; unsaved guard; UI language preservation; template replacement; storage failure; 6 viewport overflow checks; PDF action; browser PDF rendering; date/font/spacing persistence; duplicate; letterhead import/remove/reload; long-document warning and PDF; no JS errors')

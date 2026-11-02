"""Local PostgreSQL + HTTP browser integration; never creates production users."""
import base64
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.request import urlopen
from browser_support import launch_options, ARTIFACT_ROOT
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:3001'
PASSWORD='Fictional-Test-Password-2026'
fixture=json.loads(subprocess.check_output(['node','tests/prepare-browser-db.js'],text=True))
environment={**os.environ,'DATABASE_URL':fixture['url'],'APP_ORIGIN':BASE,'APP_ENV':'development','PORT':'3001'}
artifacts=Path(os.environ.get('RIMDAN_TEST_ARTIFACTS',ARTIFACT_ROOT));artifacts.mkdir(parents=True,exist_ok=True)
log=open(artifacts/'rimdan-backend-browser.log','w',encoding='utf-8')
server=subprocess.Popen(['node','server/dev.js'],env=environment,stdout=log,stderr=log)
try:
 for _ in range(50):
  try:
   with urlopen(BASE+'/api/v1/config') as r:assert r.status==200
   break
  except OSError:time.sleep(.1)
 with sync_playwright() as p:
  browser=p.chromium.launch(**launch_options())
  errors=[]
  def login(email,width=1440):
   context=browser.new_context(viewport={'width':width,'height':1000},has_touch=True)
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(BASE);page.locator('#authEmail').fill(email);page.locator('#authPassword').fill(PASSWORD);page.locator('#authForm button').click()
   expect(page.locator('#cloudLogout')).to_be_visible();return context,page
  blocked_context=browser.new_context();blocked=blocked_context.new_page();blocked.route('**/api/v1/config',lambda route:route.fulfill(status=404,body='Not found'));blocked.goto(BASE);expect(blocked.locator('#authForm')).to_be_visible();assert blocked.locator('[data-new]').count()==0;blocked_context.close()
  admin_context,admin=login('admin@test.invalid')
  admin.locator('[data-page=users]').click();admin.locator('#accountForm input[name=email]').fill('invited@test.invalid');admin.locator('#accountForm button').click()
  expect(admin.locator('#invitationOutput')).to_contain_text('#invite=')
  original_invitation=admin.locator('#invitationOutput').inner_text()
  admin.locator('[data-revoke]').click();expect(admin.locator('[data-revoke]')).to_have_count(0)
  admin.locator('[data-reinvite]').click();expect(admin.locator('#invitationOutput')).to_contain_text('#invite=')
  invitation=admin.locator('#invitationOutput').inner_text();assert invitation!=original_invitation
  invite_context=browser.new_context();invite=invite_context.new_page();invite.goto(invitation)
  expect(invite.locator('#authPassword')).to_be_visible();assert '#invite=' not in invite.url
  invite.locator('#authPassword').fill(PASSWORD);invite.locator('#authForm button').click();expect(invite.locator('#authEmail')).to_be_visible()
  admin.locator('#cloudLogout').click();admin.locator('#authEmail').fill('manager@test.invalid');admin.locator('#authPassword').fill(PASSWORD);admin.locator('#authForm button').click();expect(admin.locator('#cloudLogout')).to_be_visible();expect(admin.locator('[data-page=users]')).to_be_hidden()
  manager_context,manager=login('manager@test.invalid')
  expect(manager.locator('[data-page=users]')).to_be_hidden()
  legacy={'id':'local-browser-fixture','title':'Local migration fixture','recipient':'Fictional','number':'LOCAL-1','body':'Original local content','date':'2026-11-02','type':'letter','language':'en','status':'draft','updated':'2026-11-02T00:00:00Z','format':{'font':'Tahoma','size':12,'spacing':1.95,'align':'start'}}
  manager.evaluate("d=>localStorage.setItem('rimdan_demo_docs',JSON.stringify([d]))",legacy)
  manager.locator('[data-page=templates]').click();manager.locator('.cloud-panel summary').click()
  values={'key':'letter','name_fa':'قالب سرور آزمایشی','name_en':'Server test template','body_fa':'متن قالب سرور','body_en':'Server template content'}
  for key,value in values.items():manager.locator(f'#cloudTemplateForm [name={key}]').fill(value)
  manager.locator('#cloudTemplateForm button.primary').click();expect(manager.locator('#cloudTemplateSelect option',has_text='قالب سرور آزمایشی')).to_have_count(1)
  manager.locator('[data-new=letter]').click();assert manager.locator('#docBody').input_value()=='متن قالب سرور'
  manager.locator('#docTitle').fill('Company finalized fixture');manager.locator('#docBody').fill('Fictional server-backed document')
  manager.locator('.mark-tools > summary').click()
  image=base64.b64decode(manager.evaluate("()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const x=c.getContext('2d');x.fillStyle='#225c81';x.fillRect(25,25,50,50);return c.toDataURL().split(',')[1]}"))
  manager.locator('#signature-file').set_input_files(dict(name='abstract.png',mimeType='image/png',buffer=image));expect(manager.locator('#signature-place')).to_be_enabled();manager.locator('#signature-place').click()
  manager.locator('#saveBtn').click();manager.wait_for_function('working && working.version===1')
  assert manager.evaluate('!!working.marks.signature.assetId')
  expect(manager.locator('#saveState')).to_have_text('ذخیره‌شده در پایگاه داده شرکت')
  assert manager.evaluate("JSON.parse(localStorage.getItem('rimdan_demo_docs'))[0].title")=='Local migration fixture'
  manager.get_by_role('button',name='نهایی کردن',exact=True).click();manager.wait_for_function("working.status==='finalized'")
  manager.locator('[data-go=documents]').first.click();manager.locator('button[data-open]').first.click();manager.wait_for_function('working && working.version===2')
  assert manager.locator('#docBody').input_value()=='Fictional server-backed document'
  employee_context,employee=login('employee@test.invalid',390)
  expect(employee.locator('[data-new]')).to_be_hidden();expect(employee.locator('[data-page=templates]')).to_be_hidden()
  employee.locator('button[data-open]').click();expect(employee.locator('#paper')).to_be_visible()
  assert employee.locator('#saveBtn').count()==0 and employee.locator('#pdfBtn').count()==0
  assert employee.locator('[data-mark=signature] img').count()==1
  employee.emulate_media(media='print');assert employee.locator('.app').is_hidden();expect(employee.locator('.employee-print-warning')).to_be_visible();employee.emulate_media(media='screen')
  employee.screenshot(path=str(artifacts/'rimdan-server-employee.png'),full_page=True)
  manager.locator('[data-go=documents]').first.click();manager.once('dialog',lambda d:d.accept());manager.get_by_role('button',name='انتقال پیش‌نویس‌های مرورگر',exact=True).click();manager.wait_for_function("docs.some(d=>d.title==='Local migration fixture')")
  assert manager.evaluate("JSON.parse(localStorage.getItem('rimdan_demo_docs'))[0].body")=='Original local content'
  manager.screenshot(path=str(artifacts/'rimdan-server-manager.png'),full_page=True)
  assert employee.evaluate("fetch('/server/auth.js').then(r=>r.status)")==404
  assert not errors,errors
  browser.close()
 print('PASS: real server sessions; admin invitation acceptance; role-aware navigation; manager private mark save/finalize/reopen; employee finalized read/no output; explicit local import preserves source; no browser errors')
finally:
 server.terminate();server.wait(timeout=10);log.close();subprocess.run(['node','tests/prepare-browser-db.js','drop',fixture['name']],check=True)

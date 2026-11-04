"""Phase-one regressions on a disposable local PostgreSQL fixture, never Supabase."""
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import urlopen
from browser_support import launch_options, ARTIFACT_ROOT
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
out = Path(os.environ.get('RIMDAN_TEST_ARTIFACTS', ARTIFACT_ROOT))
out.mkdir(parents=True, exist_ok=True)
fixture = json.loads(subprocess.check_output(['node', 'tests/prepare-browser-db.js'], cwd=root, text=True))
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
base = f'http://127.0.0.1:{port}'
env = {**os.environ, 'DATABASE_URL': fixture['url'], 'APP_ORIGIN': base, 'APP_ENV': 'development', 'PORT': str(port)}
env.pop('VERCEL', None)
env.pop('DATABASE_SSL_CA', None)
env.pop('MIGRATION_DATABASE_URL', None)
log = (out / 'remediation-server.log').open('w', encoding='utf-8')
server = subprocess.Popen(['node', 'server/dev.js'], cwd=root, env=env, stdout=log, stderr=log)
results = []

try:
    for _ in range(100):
        try:
            with urlopen(base + '/api/v1/config') as response:
                assert response.status == 200
            break
        except OSError:
            time.sleep(.1)
    else:
        raise AssertionError('Local server did not become ready')
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_options())
        def login(email):
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            context.add_init_script("localStorage.setItem('rimdan_lang','en')")
            page = context.new_page()
            page.goto(base)
            page.locator('#authEmail').fill(email)
            page.locator('#authPassword').fill('Fictional-Test-Password-2026')
            page.locator('#authForm button').click()
            expect(page.locator('#cloudLogout')).to_be_visible()
            return context, page
        context, page = login('manager@test.invalid')
        def new_document(title):
            if page.locator('[data-go=documents]').count():
                page.locator('[data-go=documents]').first.click()
            page.locator('[data-new=letter]').first.click()
            page.locator('#docTitle').fill(title)
            page.locator('#docBody').fill('Fictional fixture body')
        new_document('Save race fixture')
        page.locator('#saveBtn').click()
        page.wait_for_function('working.version===1 && !dirty')
        document_id = page.evaluate('working.id')
        pending = []
        def delay_patch(route):
            if route.request.method == 'PATCH':
                pending.append((route, route.fetch()))
            else:
                route.continue_()
        pattern = '**/api/v1/documents/' + document_id
        context.route(pattern, delay_patch)
        page.locator('#docBody').fill('Saved snapshot')
        page.locator('#saveBtn').click()
        page.wait_for_timeout(150)
        assert pending
        page.locator('#docBody').fill('Newer unsaved text during save')
        route, response = pending.pop()
        route.fulfill(response=response)
        context.unroute(pattern, delay_patch)
        page.wait_for_function('working.version===2')
        expect(page.locator('#saveBtn')).to_be_enabled()
        expect(page.locator('#docBody')).to_have_value('Newer unsaved text during save')
        assert page.evaluate('dirty')
        page.locator('#saveBtn').click()
        page.wait_for_function('working.version===3 && !dirty')
        assert page.request.get(base + '/api/v1/documents/' + document_id).json()['body'] == 'Newer unsaved text during save'
        results.append('Delayed save retains newer edits, latest revision and subsequent persistence')

        other_context, other = login('other@test.invalid')
        other.locator(f'button[data-open="{document_id}"]').click()
        other.locator('#docBody').fill('Manager B current revision')
        other.locator('#saveBtn').click()
        other.wait_for_function('working.version===4 && !dirty')
        statuses = []
        page.on('response', lambda response: statuses.append(response.status) if response.url.endswith(('/print', '/export')) else None)
        page.evaluate('()=>{window.printCount=0;window.print=()=>{window.printCount++;window.printedBody=working.body;window.printedVersion=working.version}}')
        for button in ['#printBtn', '#pdfBtn']:
            page.locator(button).click()
            page.wait_for_timeout(150)
        assert statuses == [409, 409], statuses
        assert page.evaluate('window.printCount||0') == 0
        page.locator('[data-go=documents]').first.click()
        page.locator(f'button[data-open="{document_id}"]').click()
        page.wait_for_function('working.version===4')
        page.locator('#printBtn').click()
        page.wait_for_function('window.printCount===1')
        assert page.evaluate('window.printedBody') == 'Manager B current revision'
        assert page.evaluate('window.printedVersion') == 4
        page.locator('#pdfBtn').click()
        page.wait_for_function('window.printCount===2')
        results.append('Two-manager stale print/export denied; reopened current authorized revision prints')
        pending_output = []
        def delay_output(route):
            pending_output.append((route, route.fetch()))
        context.route('**/api/v1/documents/' + document_id + '/print', delay_output)
        page.locator('#printBtn').click()
        page.wait_for_timeout(150)
        assert pending_output
        page.locator('#docBody').fill('New edits while output waits')
        route, response = pending_output.pop()
        route.fulfill(response=response)
        context.unroute('**/api/v1/documents/' + document_id + '/print', delay_output)
        expect(page.locator('#printBtn')).to_be_enabled()
        assert page.evaluate('window.printCount') == 2
        expect(page.locator('#docBody')).to_have_value('New edits while output waits')
        page.locator('#saveBtn').click()
        page.wait_for_function('!dirty && working.version===5')
        results.append('Edits made during output preparation remain unsaved and prevent printing')


        for action, status in [('Finalize', 'finalized'), ('Archive', 'archived')]:
            new_document('New ' + action + ' fixture')
            page.get_by_role('button', name=action, exact=True).click()
            page.wait_for_function('(s)=>working.status===s && working.version===2 && !dirty', arg=status)
            results.append('New document ' + action + ' performs create then versioned transition')


        new_document('Finalize during create race fixture')
        pending_create = []
        def delay_create(route):
            if route.request.method == 'POST':
                pending_create.append((route, route.fetch()))
            else:
                route.continue_()
        context.route('**/api/v1/documents', delay_create)
        page.get_by_role('button', name='Finalize', exact=True).click()
        page.wait_for_timeout(150)
        assert pending_create
        page.locator('#docBody').fill('Newer edits during creation')
        route, response = pending_create.pop()
        route.fulfill(response=response)
        context.unroute('**/api/v1/documents', delay_create)
        expect(page.locator('#saveBtn')).to_be_enabled()
        assert page.evaluate('dirty && working.status==="draft" && working.version===1')
        expect(page.locator('#docBody')).to_have_value('Newer edits during creation')
        created_id = page.evaluate('working.id')
        page.get_by_role('button', name='Finalize', exact=True).click()
        page.wait_for_function('!dirty && working.status==="finalized"')
        assert page.evaluate('working.id') == created_id
        assert page.request.get(base + '/api/v1/documents/' + created_id).json()['body'] == 'Newer edits during creation'
        results.append('Edits during new creation retain identity and postpone finalization until saved')

        new_document('Retry finalize fixture')
        def fail_transition(route):
            if route.request.method == 'PATCH':
                route.fulfill(status=503, content_type='application/json', body='{"error":"Temporary fixture failure","category":"database_connection"}')
            else:
                route.continue_()
        context.route('**/api/v1/documents/*', fail_transition)
        page.get_by_role('button', name='Finalize', exact=True).click()
        page.wait_for_function('working.id && working.version===1')
        expect(page.locator('#saveBtn')).to_be_enabled()
        assert page.evaluate('working.status') == 'draft'
        retry_id = page.evaluate('working.id')
        context.unroute('**/api/v1/documents/*', fail_transition)
        page.get_by_role('button', name='Finalize', exact=True).click()
        page.wait_for_function('working.status==="finalized" && !dirty')
        assert page.evaluate('working.id') == retry_id
        records = page.request.get(base + '/api/v1/documents').json()
        assert len([d for d in records if d['title'] == 'Retry finalize fixture']) == 1
        results.append('Failed new-document transition retries without duplicate creation')


        new_document('Recovery finalize fixture')
        created_recovery_ids = []
        def expire_transition(route):
            if route.request.method == 'PATCH':
                created_recovery_ids.append(route.request.url.rsplit('/', 1)[1])
                route.fulfill(status=401, content_type='application/json', body='{"error":"Fixture session expired"}')
            else:
                route.continue_()
        context.route('**/api/v1/documents/*', expire_transition)
        page.get_by_role('button', name='Finalize', exact=True).click()
        expect(page.locator('#authForm')).to_be_visible()
        assert len(created_recovery_ids) == 1
        context.unroute('**/api/v1/documents/*', expire_transition)
        page.locator('#authEmail').fill('manager@test.invalid')
        page.locator('#authPassword').fill('Fictional-Test-Password-2026')
        page.locator('#authForm button').click()
        expect(page.locator('#docBody')).to_be_visible()
        assert page.evaluate('working.id') == created_recovery_ids[0]
        assert page.evaluate('dirty && working.version===1')
        page.get_by_role('button', name='Finalize', exact=True).click()
        page.wait_for_function('!dirty && working.status==="finalized"')
        records = page.request.get(base + '/api/v1/documents').json()
        assert len([d for d in records if d['title'] == 'Recovery finalize fixture']) == 1
        results.append('Same-account expiry recovery keeps acknowledged draft identity and avoids duplicate creation')

        page.locator('.sidebar [data-page=settings]').click()
        assert 'not implemented in this demo' not in page.locator('#view').inner_text()
        assert 'stored on the server' in page.locator('#view').inner_text()
        page.locator('#langBtn').click()
        assert page.locator('html').get_attribute('lang') == 'fa'
        assert 'سرور' in page.locator('#view').inner_text()
        results.append('Company settings accurately describe server storage in English and Persian')
        context.close()
        other_context.close()
        for language, direction in [('en', 'ltr'), ('fa', 'rtl')]:
            context = browser.new_context(viewport={'width': 390, 'height': 900})
            context.add_init_script(f"localStorage.setItem('rimdan_lang','{language}')")
            context.route('**/api/v1/config', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"Fixture unavailable"}'))
            auth = context.new_page()
            auth.goto(base)
            expect(auth.locator('#authForm')).to_be_visible()
            assert auth.locator('html').get_attribute('lang') == language
            assert auth.locator('html').get_attribute('dir') == direction
            auth.locator('#langBtn').click()
            assert auth.locator('html').get_attribute('lang') != language
            assert auth.locator('html').get_attribute('dir') != direction
            context.close()
        results.append('Signed-out English/Persian mobile auth and language switches update lang/dir')
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
    log.close()
    subprocess.run(['node', 'tests/prepare-browser-db.js', 'drop', fixture['name']], cwd=root, check=True)
(out / 'remediation-browser-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'PASS: {len(results)} remediation browser scenarios')

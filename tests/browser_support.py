"""Portable Chromium configuration shared by the existing browser regressions."""
import os
from pathlib import Path
import tempfile

ARTIFACT_ROOT = str(Path(tempfile.gettempdir()) / 'rimdan-test-artifacts')

def launch_options():
    options = dict(headless=True, args=['--no-sandbox'])
    executable = os.environ.get('RIMDAN_CHROMIUM')
    if executable:
        options['executable_path'] = executable
    elif Path('/usr/bin/chromium').is_file():
        options['executable_path'] = '/usr/bin/chromium'
    # Otherwise Playwright uses its installed browser on Windows/macOS.
    return options

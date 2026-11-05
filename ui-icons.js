/* Self-hosted, dependency-free outline icon set matching Lucide's visual language.
   SVG markup contains no external references, fonts, or network requests. */
(function(){
 const paths={
 'menu':'<path d="M4 6h16M4 12h16M4 18h16"/>',
 'close':'<path d="M18 6 6 18M6 6l12 12"/>',
 'save':'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
 'cloud':'<path d="M20 16.6A4.5 4.5 0 0 0 17.5 8a6 6 0 0 0-11.3 1.8A4.5 4.5 0 0 0 7.5 19H18a4 4 0 0 0 2-7.4"/>',
 'printer':'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6zM18 12h.01"/>',
 'file-down':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 12v6m-3-3 3 3 3-3"/>',
 'search':'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 'filter':'<path d="M4 7h16M7 12h10M10 17h4"/><circle cx="8" cy="7" r="1.3" fill="currentColor" stroke="none"/>',
 'back':'<path d="m15 18-6-6 6-6"/>',
 'plus':'<path d="M12 5v14M5 12h14"/>',
 'minus':'<path d="M5 12h14"/>',
 'fit':'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M3 8l5-5m8 0 5 5M3 16l5 5m8 0 5-5"/>',
 'duplicate':'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
 'archive':'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
 'trash':'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
 'check':'<path d="m4 12 5 5L20 6"/>',
 'eye':'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
 'pen':'<path d="m15 5 4 4M4 20l4.5-1L20 7.5a2.1 2.1 0 0 0-3-3L5.5 16Z"/>',
 'file':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
 'send':'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
 'chevron-down':'<path d="m6 9 6 6 6-6"/>',
 'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
 'rotate':'<path d="M3 11a9 9 0 1 1 3 7M3 4v7h7"/>'
 };
 function svg(name,cls=''){const body=paths[name]||paths.file;return '<svg class="rimdan-svg '+String(cls).replace(/[^a-z0-9_-]/gi,'')+'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">'+body+'</svg>';}
 window.RimdanIcons=Object.freeze({svg});
})();

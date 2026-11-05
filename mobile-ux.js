/* Responsive interaction state stays local to the view; document data is unchanged. */
const MobileUX = (() => {
  const labels = {
    en: {edit:'Edit',preview:'Preview',settings:'Document settings',formatting:'Text formatting',fit:'Fit page',zoomIn:'Zoom in',zoomOut:'Zoom out',zoom:'Preview zoom',help:'Preview help',adjust:'Position marks',locked:'Scroll mode · marks locked',unlocked:'Placement mode · drag handles or use keyboard',tools:'Signature / stamp tools',close:'Close navigation',navigation:'Main navigation',pan:'Drag empty page space to pan when zoomed, or use scrollbars. Pinch to zoom; print size stays A4.'},
    fa: {edit:'ویرایش',preview:'پیش‌نمایش',settings:'تنظیمات سند',formatting:'قالب‌بندی متن',fit:'نمای کامل',zoomIn:'بزرگ‌نمایی',zoomOut:'کوچک‌نمایی',zoom:'بزرگ‌نمایی پیش‌نمایش',help:'راهنمای پیش‌نمایش',adjust:'جای‌گذاری امضا و مهر',locked:'حالت پیمایش · امضا و مهر قفل هستند',unlocked:'حالت جای‌گذاری · از دستگیره یا صفحه‌کلید استفاده کنید',tools:'ابزار امضا و مهر',close:'بستن فهرست',navigation:'فهرست اصلی',pan:'در حالت بزرگ‌نمایی، بخش خالی صفحه را بکشید یا از نوار پیمایش استفاده کنید. بزرگ‌نمایی با دو انگشت ممکن است؛ اندازه چاپ A4 می‌ماند.'}
  };
  const text = k => labels[lang][k];
  const compact = matchMedia('(max-width: 899px)');
  const drawer = matchMedia('(max-width: 1100px)');
  let view='edit', zoom=1, adjusting=false, navigationOpen=false, observer;
  let oldOverflow='';
  const clamp = n => Math.max(1,Math.min(3,n));

  function reset() { view='edit';zoom=1;adjusting=false; }
  function tabs() {
    return `<div id="editorStart" aria-hidden="true"></div><div class="editor-tabs" role="tablist" aria-label="${t('editor')}"><button id="editTab" type="button" role="tab" aria-controls="editPane">${text('edit')}</button><button id="previewTab" type="button" role="tab" aria-controls="previewPane">${text('preview')}</button></div>`;
  }
  function actions() {
    return `<div class="editor-actions-bar"><div id="actionMessage" role="status" hidden></div><span id="actionSaveState" role="status"></span><div class="primary-document-actions"><button class="primary rimdan-labelled-action" id="saveBtn">${RimdanIcons.svg('save')}<span>${t('save')}</span></button><button class="secondary rimdan-labelled-action" id="printBtn">${RimdanIcons.svg('printer')}<span>${t('printAction')}</span></button><button class="secondary rimdan-labelled-action" id="pdfBtn">${RimdanIcons.svg('file-down')}<span>${t('pdf')}</span></button></div></div>`;
  }
  function toolbar() {
    return `<div class="preview-toolbar" aria-label="${text('zoom')}"><div class="zoom-actions"><button type="button" id="zoomOut" title="${text('zoomOut')}" aria-label="${text('zoomOut')}">${RimdanIcons.svg("minus")}</button><output id="zoomLevel" aria-live="polite"></output><button type="button" id="zoomIn" title="${text('zoomIn')}" aria-label="${text('zoomIn')}">${RimdanIcons.svg("plus")}</button><button type="button" id="zoomFit" class="rimdan-labelled-action">${RimdanIcons.svg("fit")}<span>${text('fit')}</span></button></div><button type="button" id="adjustMarks" class="rimdan-labelled-action" aria-pressed="false">${RimdanIcons.svg("pen")}<span>${text('adjust')}</span></button><button type="button" id="openMarkTools" class="rimdan-labelled-action">${RimdanIcons.svg("file-text")}<span>${text('tools')}</span></button></div><p id="previewInteraction" class="preview-instruction"></p><details class="preview-help"><summary aria-label="${text('help')}" title="${text('help')}">?</summary><p class="preview-pan-help">${text('pan')}</p></details>`;
  }
  let messageTimer;
  function editorMessage(message) {
    const box=document.getElementById('actionMessage');
    document.getElementById('toast').dataset.editor=String(!!box);
    if(!box)return;
    box.textContent=message===t('saved')?'':message;box.hidden=!box.textContent;
    clearTimeout(messageTimer);
    messageTimer=setTimeout(()=>{if(box.isConnected){box.hidden=true;Letterheads.fitPages();}},5000);
    Letterheads.fitPages();
  }
  function syncStatus() {
    const from=document.getElementById('saveState'),to=document.getElementById('actionSaveState');
    if(from&&to)to.textContent=from.textContent;
  }
  function setView(next, focus=false) {
    view=next;
    const editing=view==='edit';
    const fields=document.getElementById('editPane'),preview=document.getElementById('previewPane');
    if(!fields||!preview)return;
    document.querySelector('.editor-grid').dataset.view=view;
    fields.inert=compact.matches&&!editing; preview.inert=compact.matches&&editing;
    fields.setAttribute('aria-hidden',String(compact.matches&&!editing));preview.setAttribute('aria-hidden',String(compact.matches&&editing));
    for(const [id,selected] of [['editTab',editing],['previewTab',!editing]]){
      const tab=document.getElementById(id);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
    }
    if(!editing && document.activeElement?.matches('input,textarea,select'))document.activeElement.blur();
    Letterheads.fitPages();
    if(focus)document.getElementById(editing?'editTab':'previewTab').focus({preventScroll:true});
  }
  function syncMarks() {
    const scroll=document.getElementById('previewScroll');if(!scroll)return;
    scroll.classList.toggle('adjusting-marks',adjusting);
    document.getElementById('adjustMarks')?.setAttribute('aria-pressed',String(adjusting));
    document.getElementById('previewInteraction').textContent=text(adjusting?'unlocked':'locked');
    scroll.querySelectorAll('.document-mark').forEach(n=>{
      n.tabIndex=adjusting?0:-1;
      n.querySelectorAll('button').forEach(b=>b.tabIndex=adjusting?0:-1);
    });
  }
  function setZoom(value, anchor) {
    const scroll=document.getElementById('previewScroll');if(!scroll)return;
    const old=zoom;
    const r=scroll.getBoundingClientRect();
    const x=anchor?anchor.x-r.left:scroll.clientWidth/2,y=anchor?anchor.y-r.top:Math.min(scroll.clientHeight/2,250);
    const px=(scroll.scrollLeft+x)/old,py=(scroll.scrollTop+y)/old;
    zoom=clamp(value);Letterheads.fitPages();
    scroll.scrollLeft=px*zoom-x;scroll.scrollTop=py*zoom-y;
    document.getElementById('zoomLevel').textContent=`${Math.round(zoom*100)}%`;
    document.getElementById('zoomOut').disabled=zoom<=1;
    document.getElementById('zoomIn').disabled=zoom>=3;
  }
  function previewHeight(scroll) {
    const panel=document.getElementById('previewPane'),bar=document.querySelector('.editor-actions-bar');
    const extras=Math.max(0,panel.offsetHeight-scroll.offsetHeight);
    const chrome=compact.matches?document.querySelector('.topbar').offsetHeight+(document.querySelector('.editor-tabs')?.offsetHeight||0)+24:Math.max(16,panel.getBoundingClientRect().top);
    const available=Math.max(220,(window.visualViewport?.height||innerHeight)-chrome-extras-(bar?.offsetHeight||80)-24);
    scroll.style.maxHeight=available+'px';
  }
  function scaleFor(width,height=Infinity) { return Math.min(1,width/(210*96/25.4),height/(297*96/25.4))*zoom; }

  function attachPan(scroll) {
    // Native one-finger scrolling remains available, including directly over a
    // locked mark. Explicit handles are the only draggable part on touch screens.
    const pointers=new Map();let pan=null,pinch=null;
    scroll.addEventListener('pointerdown',e=>{
      if(e.target.closest('button') || (adjusting&&e.target.closest('.document-mark')))return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(e.pointerType==='mouse'&&zoom>1&&e.button===0){
        e.preventDefault();scroll.setPointerCapture(e.pointerId);pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};
      }
      if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};}
    });
    scroll.addEventListener('pointermove',e=>{
      if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pan?.id===e.pointerId){scroll.scrollLeft=pan.left-(e.clientX-pan.x);scroll.scrollTop=pan.top-(e.clientY-pan.y);}
      if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()];setZoom(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance),{x:(a.x+b.x)/2,y:(a.y+b.y)/2});}
    });
    const end=e=>{pointers.delete(e.pointerId);if(pan?.id===e.pointerId)pan=null;if(pointers.size<2)pinch=null;};
    scroll.addEventListener('pointerup',end);scroll.addEventListener('pointercancel',end);
    // Touch Events permit two-finger zoom while preserving native single-finger
    // scroll. Prevent default only for a two-finger gesture in the preview.
    let touchStart=null;
    scroll.addEventListener('touchstart',e=>{if(e.touches.length===2){const [a,b]=e.touches;touchStart={distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),zoom};}},{passive:true});
    scroll.addEventListener('touchmove',e=>{if(e.touches.length===2&&touchStart){e.preventDefault();const [a,b]=e.touches;setZoom(touchStart.zoom*Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/Math.max(1,touchStart.distance),{x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2});}},{passive:false});
    scroll.addEventListener('touchend',e=>{if(e.touches.length<2)touchStart=null;},{passive:true});
  }
  function attachEditor() {
    const edit=document.getElementById('editPane');if(!edit)return;
    const activate=(next,focus=false)=>{setView(next,focus);if(compact.matches){const top=document.getElementById('editorStart').getBoundingClientRect().top+scrollY-document.querySelector('.topbar').offsetHeight;window.scrollTo({top:Math.max(0,top),behavior:'instant'});}Letterheads.fitPages();};
    document.getElementById('editTab').onclick=()=>activate('edit');
    document.getElementById('previewTab').onclick=()=>activate('preview');
    document.querySelector('.editor-tabs').onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();let next;
      if(e.key==='Home')next='edit';else if(e.key==='End')next='preview';else next=view==='edit'?'preview':'edit';
      activate(next,true);
    };
    document.getElementById('zoomIn').onclick=()=>setZoom(zoom+.25);
    document.getElementById('zoomOut').onclick=()=>setZoom(zoom-.25);
    document.getElementById('zoomFit').onclick=()=>{setZoom(1);document.getElementById('previewScroll').scrollTo(0,0);};
    document.getElementById('adjustMarks').onclick=()=>{adjusting=!adjusting;syncMarks();};
    document.getElementById('openMarkTools').onclick=()=>{setView('edit');const tools=document.querySelector('.mark-tools');tools.open=true;tools.scrollIntoView({block:'start',behavior:'smooth'});tools.querySelector('summary').focus({preventScroll:true});};
    document.querySelectorAll('.document-setup,.format-details').forEach(d=>d.open=!compact.matches);
    observer?.disconnect();observer=new MutationObserver(syncStatus);observer.observe(document.getElementById('saveState'),{childList:true,subtree:true,characterData:true});
    document.getElementById('saveState').removeAttribute('role');
    syncStatus();setView(view);setZoom(zoom);syncMarks();attachPan(document.getElementById('previewScroll'));
  }

  function closeNavigation(restore=true) {
    const wasOpen=navigationOpen;navigationOpen=false;
    document.documentElement.style.overflow=oldOverflow;syncNavigation();
    if(wasOpen&&restore)document.getElementById('menuBtn').focus({preventScroll:true});
    return wasOpen;
  }
  function syncNavigation() {
    const sidebar=document.getElementById('sidebar'),main=document.querySelector('.main-wrap');
    const open=drawer.matches&&navigationOpen;
    sidebar.classList.toggle('open',open);sidebar.inert=drawer.matches&&!open;
    sidebar.setAttribute('aria-hidden',String(drawer.matches&&!open));
    sidebar.setAttribute('aria-label',text('navigation'));
    main.inert=open;
    document.getElementById('navBackdrop').hidden=!open;
    const toggle=document.getElementById('menuBtn');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',t(open?'closeMenu':'openMenu'));
    document.getElementById('closeNav').setAttribute('aria-label',text('close'));
    document.getElementById('navBackdrop').setAttribute('aria-label',text('close'));
    document.querySelectorAll('[data-page]').forEach(b=>{if(b.dataset.page===page||(page==='editor'&&b.dataset.page==='documents'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  }
  function installNavigation() {
    document.getElementById('menuBtn').onclick=()=>{
      if(navigationOpen){closeNavigation();return;}
      oldOverflow=document.documentElement.style.overflow;navigationOpen=true;syncNavigation();document.documentElement.style.overflow='hidden';document.getElementById('closeNav').focus();
    };
    document.getElementById('closeNav').onclick=()=>closeNavigation();
    document.getElementById('navBackdrop').onclick=()=>closeNavigation();
    document.addEventListener('keydown',e=>{
      if(!navigationOpen)return;
      if(e.key==='Escape'){e.preventDefault();closeNavigation();return;}
      if(e.key==='Tab'){
        const items=[...document.querySelectorAll('#sidebar button')].filter(b=>b.getBoundingClientRect().height&&!b.disabled);
        const first=items[0],last=items.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    drawer.addEventListener('change',()=>closeNavigation(false));
    compact.addEventListener('change',()=>{if(page==='editor'){setView(view);Letterheads.fitPages();}});
    const revealFocusedField=()=>{
      const active=document.activeElement;
      if(!compact.matches||!active?.matches('#editPane input,#editPane textarea,#editPane select'))return;
      const bar=document.querySelector('.editor-actions-bar');
      const r=active.getBoundingClientRect(),bottom=(window.visualViewport?.height||innerHeight)-(bar?.offsetHeight||90)-12;
      if(r.bottom>bottom||r.top<130)active.scrollIntoView({block:'center',behavior:'auto'});
    };
    document.addEventListener('focusin',()=>requestAnimationFrame(revealFocusedField));
    const viewport=(reveal=true)=>{
      const v=window.visualViewport;
      const inset=v?Math.max(0,innerHeight-v.height-v.offsetTop):0;
      document.documentElement.style.setProperty('--keyboard-inset',`${inset}px`);
      document.documentElement.style.setProperty('--visual-height',`${v?.height||innerHeight}px`);
      requestAnimationFrame(()=>{if(typeof page!=='undefined'&&page==='editor')Letterheads.fitPages();if(reveal)revealFocusedField();});
    };
    window.visualViewport?.addEventListener('resize',()=>viewport());window.visualViewport?.addEventListener('scroll',()=>viewport(false));window.addEventListener('resize',()=>viewport());viewport();
  }
  function afterRender() { syncNavigation();if(page!=='editor')observer?.disconnect();attachEditor(); }
  return {tabs,toolbar,actions,reset,scaleFor,previewHeight,editorMessage,setZoom,setView,syncMarks,closeNavigation,installNavigation,afterRender};
})();

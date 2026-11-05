/* Progressive, dependency-free enhancements. No authority or persistence decisions
   are made here: server permissions and save/version checks remain authoritative. */
(()=>{
 'use strict';
 const $=(selector,root=document)=>root.querySelector(selector);
 const words={
  en:{collapse:'Collapse sidebar',expand:'Expand sidebar',search:'Search documents',clear:'Clear search',busy:'Loading content',save:'Save draft',open:'Open',accounts:'Accounts'},
  fa:{collapse:'جمع‌کردن نوار کناری',expand:'بازکردن نوار کناری',search:'جستجوی اسناد',clear:'پاک کردن جستجو',busy:'در حال بارگذاری',save:'ذخیره پیش‌نویس',open:'بازکردن',accounts:'حساب‌ها'}
 };
 const tr=k=>words[document.documentElement.lang==='fa'?'fa':'en'][k]||k;
 const icons={
  dashboard:'<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/>',
  documents:'<path d="M8 3h9l4 4v14H8z"/><path d="M17 3v5h4"/><path d="M11 12h7M11 16h7"/><path d="M4 7v14"/>',
  templates:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12M14 13h4M14 17h4"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  clear:'<path d="M6 6l12 12M18 6 6 18"/>',
  start:'<path d="M4 6h16M4 10h11M4 14h16M4 18h11"/>',
  center:'<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  end:'<path d="M4 6h16M9 10h11M4 14h16M9 18h11"/>',
  justify:'<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  check:'<path d="m4 12 5 5L20 6"/>'
 };
 function svg(name){return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';}
 const root=document.documentElement,nav=$('#sidebar'),collapse=$('#collapseNav');
 function updateCollapse(){
  const on=root.dataset.navCollapsed==='true';
  if(collapse){collapse.setAttribute('aria-expanded',String(!on));collapse.title=tr(on?'expand':'collapse');collapse.setAttribute('aria-label',collapse.title);const glyph=on?'⇥':'⇤';if(collapse.textContent!==glyph)collapse.textContent=glyph;}
 }
 try{root.dataset.navCollapsed=localStorage.getItem('rimdan_nav_collapsed')==='true'?'true':'false';}catch{root.dataset.navCollapsed='false';}
 collapse?.addEventListener('click',()=>{
  root.dataset.navCollapsed=root.dataset.navCollapsed==='true'?'false':'true';
  try{localStorage.setItem('rimdan_nav_collapsed',root.dataset.navCollapsed);}catch{}
  updateCollapse();
 });
 updateCollapse();
 let pending=0,timer=null,hideTimer=null,progress,waiting,shownAt=0;
 function clearProgress(){progress?.remove();progress=null;waiting?.remove();waiting=null;shownAt=0;}
 function showProgress(){
  if(pending<1)return;
  if(!progress){progress=document.createElement('div');progress.className='rimdan-page-progress';progress.setAttribute('role','progressbar');progress.setAttribute('aria-label',tr('busy'));document.body.append(progress);}
  if(!waiting){
   shownAt=Date.now();waiting=document.createElement('div');waiting.className='rimdan-wait';waiting.setAttribute('role','status');waiting.setAttribute('aria-live','polite');
   const spinner=document.createElement('span');spinner.className='rimdan-spinner';spinner.setAttribute('aria-hidden','true');
   const label=document.createElement('span');label.textContent=document.documentElement.lang==='fa'?'در حال دریافت اطلاعات…':'Working on your request…';
   waiting.append(spinner,label);document.body.append(waiting);
  }
 }
 function trackRequest(request){
  clearTimeout(hideTimer);
  pending++;
  if(pending===1)timer=setTimeout(()=>{if(pending)showProgress()},320);
  return Promise.resolve(request).finally(()=>{
   pending=Math.max(0,pending-1);
   if(!pending){
    clearTimeout(timer);
    // Retain the indicator across sequential API requests. When it appears,
    // keep it on screen long enough to avoid one-frame flashes.
    hideTimer=setTimeout(()=>{if(!pending)clearProgress();},Math.max(380,shownAt?660-(Date.now()-shownAt):380));
   }
  });
 }
 const originalFetch=window.fetch.bind(window);
 window.fetch=(...args)=>trackRequest(originalFetch(...args));
 async function confirmAction(message,options={}){
  if(typeof HTMLDialogElement==='undefined')return window.confirm(message);
  const dialog=document.createElement('dialog');dialog.className='rimdan-modal';
  const header=document.createElement('div');header.className='rimdan-modal-header';
  const title=document.createElement('h2');title.textContent=options.title||(document.documentElement.lang==='fa'?'تأیید عملیات':'Confirm action');
  const close=document.createElement('button');close.type='button';close.className='rimdan-modal-close';close.textContent='×';close.setAttribute('aria-label','Close');
  header.append(close,title);
  const content=document.createElement('div');content.className='rimdan-modal-content';content.textContent=String(message);
  const footer=document.createElement('div');footer.className='rimdan-modal-footer';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent=document.documentElement.lang==='fa'?'انصراف':'Cancel';
  const approve=document.createElement('button');approve.type='button';approve.className='primary';approve.textContent=options.confirmText||(document.documentElement.lang==='fa'?'تأیید':'Confirm');
  footer.append(cancel,approve);dialog.append(header,content,footer);document.body.append(dialog);
  return new Promise(resolve=>{
   let result=false;
   cancel.onclick=()=>dialog.close();
   close.onclick=()=>dialog.close();
   approve.onclick=()=>{result=true;dialog.close();};
   dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});
   try{dialog.showModal();}catch{dialog.remove();resolve(window.confirm(message));}
  });
 }
 let noticeTimer=null;
 function notify(message,{kind='info',timeout=3800}={}){
  const old=document.getElementById('rimdan-completion');if(old)old.remove();
  clearTimeout(noticeTimer);
  const notice=document.createElement('div');notice.id='rimdan-completion';notice.className='rimdan-completion '+kind;
  notice.setAttribute('role',kind==='error'?'alert':'status');
  const badge=document.createElement('span');badge.className='rimdan-completion-symbol';badge.setAttribute('aria-hidden','true');
  badge.textContent=kind==='success'?'✓':kind==='error'?'!':'i';
  const text=document.createElement('span');text.textContent=String(message);text.className='rimdan-completion-text';
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',document.documentElement.lang==='fa'?'بستن':'Close notification');
  close.onclick=()=>{clearTimeout(noticeTimer);notice.remove();};
  notice.append(badge,text,close);document.body.append(notice);
  if(timeout>0)noticeTimer=setTimeout(()=>notice.remove(),timeout);
  return true;
 }
 function setTheme(theme){
  const selected=theme==='dark'?'dark':'light';
  root.dataset.theme=selected;
  try{localStorage.setItem('rimdan_theme',selected);}catch{}
  for(const button of document.querySelectorAll('[data-rimdan-theme]')){
   button.setAttribute('aria-pressed',String(selected==='dark'));
   button.setAttribute('aria-label',selected==='dark'?'Switch to light theme':'Switch to dark theme');
   button.title=selected==='dark'?'Light mode':'Dark mode';
   const icon=button.querySelector('.rimdan-theme-glyph');if(icon)icon.textContent=selected==='dark'?'☀':'☾';
   const text=button.querySelector('.rimdan-theme-label');if(text)text.textContent=selected==='dark'?(document.documentElement.lang==='fa'?'حالت روشن':'Light theme'):(document.documentElement.lang==='fa'?'حالت تیره':'Dark theme');
  }
 }
 let preferredTheme='light';try{preferredTheme=localStorage.getItem('rimdan_theme')||'light';}catch{}
 setTheme(preferredTheme);
 function createThemeButton(labelled=false){
  const button=document.createElement('button');button.type='button';
  button.className=labelled?'secondary rimdan-theme-setting':'outline-btn rimdan-theme-toggle';
  button.dataset.rimdanTheme='true';button.innerHTML='<span class="rimdan-theme-glyph" aria-hidden="true">☾</span>'+(labelled?'<span class="rimdan-theme-label"></span>':'');
  button.onclick=()=>setTheme(root.dataset.theme==='dark'?'light':'dark');
  return button;
 }
 function decorateTheme(){
  const header=$('.top-actions');
  if(header&&!header.querySelector('.rimdan-theme-toggle'))header.insertBefore(createThemeButton(),header.querySelector('#langBtn'));
  const settings=$('#view .settings-grid');
  if(settings&&!settings.querySelector('.rimdan-theme-setting')){
   const card=document.createElement('section');card.className='panel rimdan-theme-panel';
   const h=document.createElement('h2');h.textContent=document.documentElement.lang==='fa'?'ظاهر برنامه':'Appearance';
   const p=document.createElement('p');p.textContent=document.documentElement.lang==='fa'?'نمای روشن یا تیره را انتخاب کنید. فقط رابط کاربری تغییر می‌کند، نه سربرگ چاپی.':'Switch the interface between light and dark. Printed letters remain unchanged.';
   card.append(h,p,createThemeButton(true));settings.append(card);
  }
  setTheme(root.dataset.theme);
 }
 window.RimdanUI=Object.freeze({confirm:confirmAction,notify,success:message=>notify(message,{kind:'success',timeout:4200}),setTheme});
 function decorate(){
  const navigation=$('#sidebar nav');
  if(navigation){
   navigation.querySelectorAll('button[data-page]').forEach(btn=>{
    const page=btn.dataset.page;
    if(!icons[page])return;
    let icon=$('.nav-icon',btn);
    if(!icon){icon=document.createElement('span');icon.className='nav-icon';btn.prepend(icon);}
    if(icon.dataset.icon!==page){icon.innerHTML=svg(page);icon.dataset.icon=page;}
    let label=$('.nav-text',btn)||btn.querySelector('span:not(.nav-icon)');
    if(!label){const text=[...btn.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();if(text){[...btn.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());label=document.createElement('span');label.className='nav-text';label.textContent=text;btn.append(label);}}
    if(label){label.classList.add('nav-text');btn.title=label.textContent.trim();btn.setAttribute('aria-label',label.textContent.trim());}
    else{btn.title=tr(page);btn.setAttribute('aria-label',tr(page));}
   });
  }
  updateCollapse();decorateTheme();
  if($('#searchInput')&&!$('#rimdanSearchAction')){
   const search=$('#searchInput'),bar=search.closest('.toolbar');
   if(bar){
    const controls=document.createElement('div');controls.className='rimdan-search-actions';
    const go=document.createElement('button');go.type='button';go.id='rimdanSearchAction';go.innerHTML=svg('search');go.title=tr('search');go.setAttribute('aria-label',tr('search'));
    go.onclick=()=>{search.dispatchEvent(new Event('input',{bubbles:true}));search.focus();};
    const clear=document.createElement('button');clear.type='button';clear.id='rimdanClearSearch';clear.innerHTML=svg('clear');clear.title=tr('clear');clear.setAttribute('aria-label',tr('clear'));
    clear.onclick=()=>{search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));search.focus();};
    controls.append(go,clear);search.after(controls);
   }
  }
  const align=$('#textAlign');
  if(align&&!$('#rimdanAlignmentTools')){
   const strip=document.createElement('div');strip.id='rimdanAlignmentTools';strip.className='rimdan-alignment-tools';strip.setAttribute('role','group');strip.setAttribute('aria-label',document.documentElement.lang==='fa'?'تراز متن':'Text alignment');
   for(const mode of ['start','center','end','justify']){
    const b=document.createElement('button');b.type='button';b.className='rimdan-align-button';b.innerHTML=svg(mode);
    b.title=mode;b.setAttribute('aria-label',mode);
    b.setAttribute('aria-pressed',String(align.value===mode));
    b.onclick=()=>{align.value=mode;align.dispatchEvent(new Event('change',{bubbles:true}));strip.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
    strip.append(b);
   }
   align.after(strip);
  }
  if($('#editPane')&&!$('#editorExpand')){
   const b=document.createElement('button');b.id='editorExpand';b.type='button';b.className='secondary rimdan-editor-expand';
   b.textContent='↔';b.title=document.documentElement.lang==='fa'?'گسترش بخش ویرایش':'Expand editing panel';b.setAttribute('aria-label',b.title);
   b.onclick=()=>{root.dataset.editorWide=root.dataset.editorWide==='true'?'false':'true';b.setAttribute('aria-pressed',String(root.dataset.editorWide==='true'));};
   $('#editPane .panel-title')?.append(b);
  }
  const toast=$('#toast');
  if(toast?.classList.contains('show')&&!toast.querySelector('.rimdan-toast-close')){
   const b=document.createElement('button');b.type='button';b.className='rimdan-toast-close';b.textContent='×';b.title=document.documentElement.lang==='fa'?'بستن':'Dismiss';b.setAttribute('aria-label',b.title);
   b.onclick=()=>toast.classList.remove('show');toast.append(b);
  }
  const state=$('#saveState');
  if(state){
    const msg=state.textContent||'';
    const unsaved=/unsaved|ذخیره‌نشده|پیش‌نویس جدید/i.test(msg),saving=/saving|در حال ذخیره/i.test(msg),failed=/failed|ناموفق/i.test(msg);
    state.dataset.sync=failed?'failed':saving?'saving':unsaved?'unsaved':'stored';
  }
  document.querySelectorAll('button').forEach(btn=>{
   if(!btn.title&&btn.classList.contains('format-button'))btn.title=btn.getAttribute('aria-label')||'';
  });
 }
 let queued=false;
 const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate();});});
 // Observe only the rendered page, never the sidebar elements decorate() updates.
 observer.observe($('#view')||document.body,{childList:true,subtree:true});
 const notification=$('#toast');
 if(notification){
  const toastObserver=new MutationObserver(()=>{
   if(!notification.classList.contains('show')||notification.querySelector('.rimdan-toast-close'))return;
   const close=document.createElement('button');close.type='button';close.className='rimdan-toast-close';
   close.textContent='×';close.setAttribute('aria-label',document.documentElement.lang==='fa'?'بستن':'Dismiss');
   close.onclick=()=>notification.classList.remove('show');notification.append(close);
  });
  toastObserver.observe(notification,{attributes:true,attributeFilter:['class'],childList:true});
 }
 decorate();
})();

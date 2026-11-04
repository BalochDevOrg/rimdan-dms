/* Optional same-origin backend adapter. A missing API (404) preserves standalone
   prototype mode; an unhealthy configured API fails closed, never to local data. */
const ServerClient=(()=>{
 let active=false,user=null,csrf='',templates=[],users=[],loadError='',inviteToken='',resetToken='',forgotMode=false,shareTargets=[],busy=false,recovery=null,nextOffset=null,searchTimer,searchVersion=0,stats={total:0,draft:0,finalized:0,archived:0};
 const strings={en:{login:'Sign in',email:'Email',password:'Password (12–128 characters)',logout:'Sign out',users:'Accounts',read:'Read',reader:'Finalized document',finalized:'Finalized',archived:'Archived',invite:'Create account / invitation',role:'Role',manager:'Manager',employee:'Employee',administrator:'Administrator',import:'Import browser-local drafts',finalize:'Finalize',archive:'Archive',remove:'Delete document',retry:'Retry',templates:'Manage templates',save:'Save',accept:'Accept invitation',private:'Company data is stored on the server. Browser-local drafts are separate until explicitly imported.',denied:'Access denied.',failed:'The server operation failed. Your unsaved content remains open.',saveFirst:'Save the document before printing or exporting.',imported:'Local draft import completed. Original browser copies were preserved.',confirmImport:'Import local drafts into the company database? Original copies will remain in this browser.',confirmDelete:'Delete this company document?',readOnly:'Read-only account. PDF and printing are disabled.',duplicate:'Draft copy created. Images not authorized for reuse were omitted.',local:'Browser-local prototype',templateKey:'Template key',nameEn:'English name',nameFa:'Persian name',bodyEn:'English content',bodyFa:'Persian content',newTemplate:'New template'},fa:{login:'ورود',email:'ایمیل',password:'گذرواژه (۱۲ تا ۱۲۸ نویسه)',logout:'خروج',users:'حساب‌ها',read:'مشاهده',reader:'سند نهایی',finalized:'نهایی',archived:'بایگانی',invite:'ایجاد حساب / دعوت‌نامه',role:'نقش',manager:'مدیر',employee:'کارمند',administrator:'مدیر سامانه',import:'انتقال پیش‌نویس‌های مرورگر',finalize:'نهایی کردن',archive:'بایگانی',remove:'حذف سند',retry:'تلاش دوباره',templates:'مدیریت قالب‌ها',save:'ذخیره',accept:'پذیرش دعوت‌نامه',private:'اطلاعات شرکت روی سرور ذخیره می‌شود. پیش‌نویس‌های مرورگر فقط با انتقال صریح وارد سامانه می‌شوند.',denied:'دسترسی مجاز نیست.',failed:'عملیات سرور انجام نشد. تغییرات ذخیره‌نشده باز می‌مانند.',saveFirst:'پیش از چاپ یا خروجی، سند را ذخیره کنید.',imported:'انتقال انجام شد. نسخه‌های اصلی مرورگر حفظ شدند.',confirmImport:'پیش‌نویس‌های مرورگر به پایگاه داده شرکت منتقل شوند؟ نسخه‌های اصلی در مرورگر باقی می‌مانند.',confirmDelete:'این سند شرکت حذف شود؟',readOnly:'حساب فقط‌خواندنی است. چاپ و خروجی PDF غیرفعال است.',duplicate:'نسخه مشابه ساخته شد. تصاویر بدون مجوز استفاده دوباره حذف شدند.',local:'نمونه محلی مرورگر',templateKey:'شناسه قالب',nameEn:'نام انگلیسی',nameFa:'نام فارسی',bodyEn:'متن انگلیسی',bodyFa:'متن فارسی',newTemplate:'قالب جدید'}};
 Object.assign(strings.en,{newerEdits:'The saved snapshot is stored. Newer edits remain unsaved; save again before finalizing or printing.',changedDuringOutput:'The document changed while preparing output. Save or reopen it before printing.',failed:'The server operation failed. Please retry.',unavailable:'The service is temporarily unavailable. Please retry or contact the Administrator.',credentials:'Invalid email or password.',expired:'Your session expired. Sign in again.'});
 Object.assign(strings.fa,{newerEdits:'نسخه ذخیره شد. تغییرات جدید هنوز ذخیره نشده‌اند؛ پیش از نهایی کردن یا چاپ دوباره ذخیره کنید.',changedDuringOutput:'هنگام آماده‌سازی خروجی، سند تغییر کرد. پیش از چاپ آن را ذخیره یا دوباره باز کنید.',failed:'عملیات سرور انجام نشد. دوباره تلاش کنید.',unavailable:'سرویس موقتاً در دسترس نیست. دوباره تلاش کنید یا با مدیر سامانه تماس بگیرید.',credentials:'ایمیل یا گذرواژه نادرست است.',expired:'نشست شما پایان یافته است. دوباره وارد شوید.'});
 const tr=k=>strings[lang][k]||k;
 const staff=()=>user&&user.role!=='employee';
 async function api(path,method='GET',data){
  const response=await fetch('/api/v1/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{...(data?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:data?JSON.stringify(data):undefined});
  if(!response.ok){const detail=await response.json().catch(()=>({}));const e=new Error(detail.error||'Request failed');e.status=response.status;e.path=path;e.requestId=detail.requestId;if(response.status===403&&user&&path!=='session'){const check=await fetch('/api/v1/session',{credentials:'same-origin',cache:'no-store'});if(check.ok){const current=await check.json();if(current.user.role!==user.role){clearMemory();user=current.user;csrf=current.csrf;document.documentElement.dataset.role=user.role;await refresh();page='documents';render();}}}
   if(response.status===401&&user){if(dirty&&working&&staff())recovery={accountId:user.id,source:working,draft:structuredClone(working)};clearMemory(false);authScreen();}throw e;}
  return response.json();
 }
 function error(e){if(e.status===401&&user){if(dirty&&working&&staff())recovery={accountId:user.id,source:working,draft:structuredClone(working)};clearMemory(false);authScreen();}loadError=e.status===401?tr(e.path==='login'?'credentials':'expired'):e.status===403?tr('denied'):e.status===409?(lang==='fa'?'نسخه سند تغییر کرده است؛ پیش از ذخیره دوباره بارگیری کنید.':'Document revision changed. Reopen before saving or printing.'):e.status===503?tr('unavailable'):tr('failed');if(/^[a-f0-9-]{36}$/i.test(e.requestId||''))loadError+=' · '+(lang==='fa'?'شناسه پیگیری: ':'Reference: ')+e.requestId;if(page==='editor')toast(loadError);else{const node=document.getElementById('cloudError');if(node)node.textContent=loadError;else toast(loadError);}}
 function clearMemory(clearRecovery=true){if(clearRecovery)recovery=null;user=null;csrf='';docs=[];working=null;docId=null;dirty=false;templates=[];users=[];shareTargets=[];letterheadImage='';DocumentMarks.reset();MobileUX.reset();document.documentElement.dataset.role='';}
 async function refresh(){docs=await api('documents');nextOffset=docs.length===1000?1000:null;stats=await api('summary');templates=staff()?await api('templates'):[];users=user.role==='administrator'?await api('users'):[];shareTargets=staff()?await api('share-targets'):[];}
 function authScreen(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='fa'?'rtl':'ltr';document.getElementById('app').dir=document.documentElement.dir;
  document.getElementById('langBtn').textContent=lang==='fa'?'English':'فارسی';
  document.querySelectorAll('[data-i]').forEach(node=>node.textContent=t(node.dataset.i));
  MobileUX.closeNavigation(false);document.querySelector('.main-wrap').inert=false;
  document.documentElement.dataset.auth='signed-out';document.documentElement.dataset.role='';
  const heading=resetToken?(lang==='fa'?'بازنشانی گذرواژه':'Reset your password'):forgotMode?(lang==='fa'?'فراموشی گذرواژه':'Forgot password'):inviteToken?tr('accept'):tr('login');
  const passwordForm=resetToken||inviteToken||!forgotMode;
  document.getElementById('view').innerHTML=`<section class="auth-panel panel"><h1>${heading}</h1><p id="cloudError" role="alert">${escapeHTML(loadError)}</p><form id="authForm">${resetToken?'':`<label for="authEmail">${tr('email')}</label><input id="authEmail" type="email" autocomplete="username" required maxlength="254">`}${passwordForm?`<label for="authPassword">${tr('password')}</label><input id="authPassword" type="password" autocomplete="${inviteToken||resetToken?'new-password':'current-password'}" minlength="12" maxlength="128" required>`:''}<button class="primary" type="submit">${resetToken?(lang==='fa'?'تغییر گذرواژه':'Set new password'):forgotMode?(lang==='fa'?'درخواست راهنمای بازیابی':'Request recovery instructions'):inviteToken?tr('accept'):tr('login')}</button></form>${!inviteToken&&!resetToken?`<button id="toggleForgot" class="link" type="button">${forgotMode?(lang==='fa'?'بازگشت به ورود':'Back to sign in'):(lang==='fa'?'گذرواژه را فراموش کرده‌اید؟':'Forgot password?')}</button>`:''}<p class="muted">${forgotMode?(lang==='fa'?'برای دریافت پیوند یک‌بارمصرف با مدیر شرکت تماس بگیرید.':'The Administrator provides a 30-minute one-time reset link through a verified channel.'):''}</p></section>`;
  const toggle=document.getElementById('toggleForgot');if(toggle)toggle.onclick=()=>{forgotMode=!forgotMode;loadError='';authScreen();};
  document.getElementById('authForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{
   if(forgotMode&&!inviteToken&&!resetToken){
    const result=await api('password-reset/request','POST',{email:document.getElementById('authEmail').value});
    loadError=lang==='fa'?'برای دریافت پیوند بازیابی امن با مدیر شرکت تماس بگیرید.':result.message;
    authScreen();return;
   }
   const password=document.getElementById('authPassword').value;
   if(inviteToken){await api('invitations/accept','POST',{token:inviteToken,password});inviteToken='';loadError='';authScreen();return;}
   if(resetToken){await api('password-reset/accept','POST',{token:resetToken,password});resetToken='';loadError=lang==='fa'?'گذرواژه تغییر کرد؛ اکنون وارد شوید.':'Password changed. Sign in with the new password.';authScreen();return;}
   await api('login','POST',{email:document.getElementById('authEmail').value,password});await establish();
  }catch(err){error(err);}finally{if(button.isConnected)button.disabled=false;}};
 }
 async function establish(){const result=await api('session');user=result.user;csrf=result.csrf;document.documentElement.dataset.auth='signed-in';document.documentElement.dataset.role=user.role;await refresh();page='documents';if(recovery?.accountId===user.id&&staff()){working=recovery.draft;docId=working.id||null;dirty=true;page='editor';}recovery=null;render();}
 async function start(){
  Object.assign(copy.en,{reader:strings.en.reader,read:strings.en.read,users:strings.en.users,finalized:strings.en.finalized,archived:strings.en.archived});Object.assign(copy.fa,{reader:strings.fa.reader,read:strings.fa.read,users:strings.fa.users,finalized:strings.fa.finalized,archived:strings.fa.archived});
  inviteToken=location.hash.startsWith('#invite=')?location.hash.slice(8):'';
  resetToken=location.hash.startsWith('#reset=')?location.hash.slice(7):'';
  if(inviteToken||resetToken)history.replaceState(null,'',location.pathname+location.search);
  if(document.querySelector('meta[name=rimdan-mode]')?.content!=='server'){active=false;render();return;}
  Object.assign(copy.en,{pending:'Archived',approved:'Finalized',saved:'Draft saved to company database',savedState:'Saved to company database',demoMode:'Company workspace',demoOnly:'Company workspace',prototype:'COMPANY DATABASE'});Object.assign(copy.fa,{pending:'بایگانی',approved:'نهایی',saved:'پیش‌نویس در پایگاه داده شرکت ذخیره شد',savedState:'ذخیره‌شده در پایگاه داده شرکت',demoMode:'فضای کاری شرکت',demoOnly:'فضای کاری شرکت',prototype:'پایگاه داده شرکت'});
  Object.assign(copy.en,{settingsSub:'Company workspace information and browser-local draft controls.',securityHelp:'Use your assigned company account. The server enforces account and document access. Contact the Administrator for access or account recovery.',demoNotice:'Company documents and private images are stored on the server. Browser-local drafts remain separate until explicitly imported.',clearDemo:'Clear browser-local prototype drafts',clearConfirm:'Delete only prototype drafts stored in this browser? Company records will remain on the server.',footer:'Rimdan Trade company workspace · Authorized staff only'});
  Object.assign(copy.fa,{settingsSub:'اطلاعات فضای کاری شرکت و مدیریت پیش‌نویس‌های محلی مرورگر.',securityHelp:'از حساب اختصاصی شرکت استفاده کنید. دسترسی حساب و اسناد در سرور کنترل می‌شود. برای دسترسی یا بازیابی حساب با مدیر سامانه تماس بگیرید.',demoNotice:'اسناد شرکت و تصاویر خصوصی در سرور ذخیره می‌شوند. پیش‌نویس‌های محلی مرورگر تنها با انتقال صریح وارد سامانه می‌شوند.',clearDemo:'پاک کردن پیش‌نویس‌های نمونه این مرورگر',clearConfirm:'فقط پیش‌نویس‌های نمونه این مرورگر حذف شوند؟ اسناد شرکت در سرور باقی می‌مانند.',footer:'فضای کاری شرکت ریمدان · ویژه کارکنان مجاز'});
  try{
   const response=await fetch('/api/v1/config',{cache:'no-store',credentials:'same-origin'});
   active=true;letterheadImage='';document.documentElement.dataset.auth='signed-out';if(!response.ok)throw Error('API unavailable');
   if(inviteToken||resetToken){authScreen();return;}
   try{await establish();}catch(e){if(e.status!==401)loadError=tr('failed');authScreen();}
  }catch{active=true;loadError=tr('failed');authScreen();}
 }
 async function dataURL(path){const r=await fetch('/api/v1/'+path,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Object.assign(Error('Private asset unavailable'),{status:r.status});const blob=await r.blob();return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(blob);});}
 async function hydrate(d){
  const value=structuredClone(d);for(const kind of ['signature','stamp'])if(value.marks?.[kind])value.marks[kind].src=await dataURL(`documents/${d.id}/assets/${value.marks[kind].assetId}`);
  if(value.letterhead==='custom')value.customLetterhead=await dataURL(`documents/${d.id}/assets/${value.letterheadAsset}`);
  return value;
 }
 async function open(id){if(!guard())return;try{const d=await hydrate(await api('documents/'+id));DocumentMarks.reset();MobileUX.reset();working={...d,marks:DocumentMarks.clean(d.marks)};docId=d.id;dirty=false;page=staff()?'editor':'reader';render();}catch(e){error(e);}}
 async function prepare(d){
  const value=structuredClone(d);for(const kind of ['signature','stamp'])if(value.marks?.[kind]){
   const m=value.marks[kind];if(!m.assetId)m.assetId=(await api('assets','POST',{kind,dataUrl:m.src})).id;delete m.src;
  }
  if(value.letterhead==='custom'&&!value.letterheadAsset)value.letterheadAsset=(await api('assets','POST',{kind:'letterhead',dataUrl:value.customLetterhead})).id;
  delete value.customLetterhead;return value;
 }
 // The editable snapshot is independent of server-owned identity/revision fields.
 function setBusy(value){busy=value;for(const id of ['saveBtn','printBtn','pdfBtn']){const button=document.getElementById(id);if(button)button.disabled=value;}}
 function draftSignature(value){const {id,version,updated,createdBy,importKey,status,...draft}=value;return JSON.stringify(draft);}
 function retainSavedIdentity(current,snapshot,saved){
  for(const key of ['id','version','updated','createdBy','importKey','status'])current[key]=saved[key];
  for(const kind of ['signature','stamp']){
   if(current.marks?.[kind]&&current.marks[kind].src===snapshot.marks?.[kind]?.src&&saved.marks?.[kind])current.marks[kind].assetId=saved.marks[kind].assetId;
  }
  if(current.letterhead==='custom'&&current.customLetterhead===snapshot.customLetterhead&&saved.letterheadAsset)current.letterheadAsset=saved.letterheadAsset;
 }
 function renderEditorPreservingFocus(){
  const node=document.activeElement,focus={id:node?.id,start:node?.selectionStart,end:node?.selectionEnd};
  render();const next=document.getElementById(focus.id);
  if(next){next.focus({preventScroll:true});if(typeof focus.start==='number'&&next.setSelectionRange)try{next.setSelectionRange(focus.start,focus.end);}catch{}}
 }
 async function save(status){
  if(!staff()||busy)return;captureEditor();if(!working.title.trim()){MobileUX.setView('edit');toast(t('required'));document.getElementById('docTitle').focus();return;}
  setBusy(true);
  const source=working,snapshot=structuredClone(working),signature=draftSignature(snapshot),existingId=docId,actor=user.id;
  const unchanged=()=>working===source&&draftSignature(working)===signature;let acknowledged=null;
  try{
   const payload=await prepare(snapshot);if(working!==source)return;
   let saved=await api('documents'+(existingId?'/'+existingId:''),existingId?'PATCH':'POST',{...payload,status:existingId?(status||'draft'):'draft'});
   if(working!==source)return;
   acknowledged=saved;
   // Creation/import stays draft-only. Only an unchanged new snapshot may then
   // make a separately versioned Finalize/Archive transition.
   if(!existingId&&status&&status!=='draft'&&unchanged())saved=await api('documents/'+saved.id,'PATCH',{...saved,status});
   if(working!==source)return;
   acknowledged=saved;
   const hydrated=await hydrate(saved);if(working!==source)return;
   if(unchanged()){working=hydrated;dirty=false;}
   else{retainSavedIdentity(working,snapshot,saved);dirty=true;}
   docId=saved.id;const visible=working;
   await refresh();if(working!==visible||page!=='editor')return;
   renderEditorPreservingFocus();setBusy(true);toast(dirty?tr('newerEdits'):t('saved'));
  }catch(e){if(working===source&&acknowledged){retainSavedIdentity(source,snapshot,acknowledged);docId=acknowledged.id;dirty=true;}else if(acknowledged&&recovery?.accountId===actor&&recovery.source===source){retainSavedIdentity(recovery.draft,snapshot,acknowledged);}error(e);}finally{setBusy(false);}
 }
 async function duplicate(){if(!staff())return;if(!docId||dirty){toast(lang==='fa'?'پیش از ایجاد نسخه مشابه، پیش‌نویس را ذخیره کنید.':'Save the draft before making a copy.');return;}try{const d=await api(`documents/${docId}/duplicate`,'POST',{});dirty=false;await refresh();await open(d.id);toast(tr('duplicate'));}catch(e){error(e);}}
 async function print(operation){
  if(!staff()||busy)return;if(dirty||!docId){toast(tr('saveFirst'));return;}
  const source=working,signature=JSON.stringify(working);setBusy(true);
  try{
   const authorized=await api(`documents/${docId}/${operation}`,'POST',{version:source.version});
   const hydrated=await hydrate(authorized);
   if(working!==source||dirty||JSON.stringify(working)!==signature){if(working===source)toast(tr('changedDuringOutput'));return;}
   working=hydrated;render();setBusy(true);const rendered=working,renderedSignature=JSON.stringify(working);
   await Promise.all([...document.querySelectorAll('#paperViewport img')].map(img=>img.decode()));
   if(working!==rendered||dirty||JSON.stringify(working)!==renderedSignature){if(working===rendered)toast(tr('changedDuringOutput'));return;}
   window.print();
  }catch(e){error(e);}finally{setBusy(false);}
 }
 function readerPage(){
  const temp=document.createElement('template');temp.innerHTML=editor();const panel=temp.content.querySelector('.preview-panel');
  panel.querySelector('#adjustMarks')?.remove();panel.querySelector('#openMarkTools')?.remove();
  return `<h1>${escapeHTML(working.title)}</h1><p>${tr('readOnly')}</p><div id="cloudError" role="alert"></div><button class="secondary" data-go="documents">${t('back')}</button><div hidden><textarea id="docBody"></textarea><select id="letterheadSelect"><option value="official"></option><option value="custom"></option></select><button id="removeLetterhead"></button></div>${panel.outerHTML}`;
 }
 function usersPage(){return `<section class="panel cloud-panel"><h1>${tr('users')}</h1><p id="cloudError" role="alert"></p><form id="accountForm"><label>${tr('email')}<input name="email" type="email" required maxlength="254"></label><label>${tr('role')}<select name="role"><option value="employee">${tr('employee')}</option><option value="manager">${tr('manager')}</option></select></label><button class="primary">${tr('invite')}</button></form><output id="invitationOutput"></output><div class="cloud-accounts">${users.map(u=>`<div><b>${escapeHTML(u.email)}</b><span>${tr(u.role)} · ${u.active?'✓':'—'}</span>${u.id===user.id?'':`<select aria-label="${tr('role')}" data-account-role="${u.id}"><option value="employee" ${u.role==='employee'?'selected':''}>${tr('employee')}</option><option value="manager" ${u.role==='manager'?'selected':''}>${tr('manager')}</option></select>${u.pending||!u.has_password?'':`<button class="secondary" data-account-active="${u.id}">${u.active?(lang==='fa'?'غیرفعال کردن':'Deactivate'):(lang==='fa'?'فعال کردن':'Activate')}</button>`}`}${u.id!==user.id&&!u.active?`<button class="secondary" data-reinvite="${u.id}">${lang==='fa'?'دعوت دوباره':'Reissue invitation'}</button>`:''}${u.id!==user.id&&u.pending?`<button class="secondary" data-revoke="${u.id}">${lang==='fa'?'لغو دعوت‌نامه':'Revoke invitation'}</button>`:''}${u.active?`<button class="secondary" data-recovery="${u.id}">${lang==='fa'?'پیوند بازیابی':'Recovery link'}</button>`:''}</div>`).join('')}</div></section>`;}
 function templatePanel(){return `<details class="panel cloud-panel"><summary>${tr('templates')}</summary><p id="cloudError" role="alert"></p><select id="cloudTemplateSelect" aria-label="${tr('templates')}"><option value="">${tr('newTemplate')}</option>${templates.map(x=>`<option value="${x.id}">${escapeHTML(x[lang==='fa'?'name_fa':'name_en'])}</option>`).join('')}</select><form id="cloudTemplateForm">${['key','name_fa','name_en','body_fa','body_en'].map((key,i)=>`<label>${tr(['templateKey','nameFa','nameEn','bodyFa','bodyEn'][i])}${key.startsWith('body')?`<textarea name="${key}" required></textarea>`:`<input name="${key}" required maxlength="${key==='key'?80:200}">`}</label>`).join('')}<button class="primary">${tr('save')}</button><button class="secondary" type="button" id="deleteCloudTemplate">${tr('remove')}</button></form></details>`;}
 async function importLocal(){if(!staff()||!confirm(tr('confirmImport')))return;try{
  const local=JSON.parse(localStorage.getItem('rimdan_demo_docs')||'[]');if(!Array.isArray(local))throw Error('Invalid local drafts');
  const known=new Set(docs.map(d=>d.importKey));for(const d of local){const key='local:'+String(d.id);if(known.has(key))continue;
   const payload=await prepare({...d,language:d.language||lang,date:d.date||d.updated?.slice(0,10)||new Date().toISOString().slice(0,10),letterhead:d.letterhead||`official-${d.language||lang}`,marks:DocumentMarks.clean(d.marks),importKey:key});await api('documents','POST',payload);
  }await refresh();render();toast(tr('imported'));
 }catch(e){error(e);}}
 function moreButton(){
  document.getElementById('cloudMore')?.remove();if(nextOffset===null||page!=='documents')return;
  const button=document.createElement('button');button.id='cloudMore';button.className='secondary';button.textContent=lang==='fa'?'نمایش اسناد بیشتر':'Load more documents';button.onclick=()=>search(true);document.getElementById('docList').after(button);
 }
 function search(append=false){
  clearTimeout(searchTimer);const generation=++searchVersion;
  searchTimer=setTimeout(async()=>{try{
   const offset=append?nextOffset||0:0;
   const rows=await api('documents?q='+encodeURIComponent(windowSearch())+'&status='+encodeURIComponent(statusFilter)+'&type='+encodeURIComponent(typeFilter)+'&offset='+offset);
   if(generation!==searchVersion||page!=='documents')return;
   docs=append?docs.concat(rows):rows;nextOffset=rows.length===1000?offset+1000:null;
   document.getElementById('docList').innerHTML=docTable(docs);document.querySelectorAll('[data-open]').forEach(n=>n.onclick=e=>{e.stopPropagation();open(n.dataset.open);});if(typeof bindPreviewButtons==='function')bindPreviewButtons();moreButton();
  }catch(e){error(e);}},append?0:180);
 }
 function windowSearch(){return document.getElementById('searchInput')?.value||'';}
 function decorate(){
  if(!active||!user)return;
  document.documentElement.dataset.role=user.role;
  const nav=document.querySelector('.sidebar nav');let usersNav=nav.querySelector('[data-page=users]');
  if(user.role==='administrator'&&!usersNav){usersNav=document.createElement('button');usersNav.className='nav';usersNav.dataset.page='users';usersNav.onclick=()=>navigate('users');nav.append(usersNav);}if(usersNav){usersNav.textContent=tr('users');usersNav.hidden=user.role!=='administrator';}
  nav.querySelectorAll('[data-page]').forEach(n=>n.hidden=n.dataset.page==='users'?user.role!=='administrator':user.role==='employee'&&n.dataset.page!=='documents');
  document.querySelectorAll('[data-new]').forEach(n=>n.hidden=!staff());
  document.querySelector('.sidebar .user strong').textContent=user.email;document.querySelector('.sidebar .user small').textContent=tr(user.role);
  const header=document.querySelector('.top-actions');header.querySelector('#cloudLogout')?.remove();const logout=document.createElement('button');logout.className='outline-btn';logout.id='cloudLogout';logout.textContent=tr('logout');logout.onclick=async()=>{if(!guard())return;try{await api('logout','POST',{});clearMemory();authScreen();}catch(e){error(e);}};header.append(logout);
  if(page==='documents'){
   moreButton();document.getElementById('searchInput').maxLength=200;
   document.querySelectorAll('button[data-open]').forEach(b=>b.textContent=staff()?t('edit'):tr('read'));
   if(staff()){
    const button=document.createElement('button');button.className='secondary';button.textContent=tr('import');button.onclick=importLocal;document.querySelector('.heading').append(button);
   }else document.querySelectorAll('#statusSelect option').forEach(o=>{if(o.value&&o.value!=='finalized')o.remove();});
  }
  if(page==='editor'&&staff()){
    const setup=document.querySelector('.document-setup');
    if(setup){
      const box=document.createElement('div');box.className='document-sharing form-field';
      const audience=working.audience||'all',selection=new Set(working.visibleTo||[]);
      box.innerHTML=`<label for="documentAudience">${lang==='fa'?'دسترسی سند':'Document access'}</label><select id="documentAudience"><option value="all" ${audience==='all'?'selected':''}>${lang==='fa'?'همه کاربران مجاز':'All authorized users'}</option><option value="selected" ${audience==='selected'?'selected':''}>${lang==='fa'?'کاربران انتخاب‌شده':'Selected users only'}</option></select><div id="documentRecipients" ${audience==='selected'?'':'hidden'}><p class="muted">${lang==='fa'?'انتخاب دریافت‌کنندگان':'Choose recipients'}</p>${shareTargets.map(x=>`<label class="recipient-option"><input type="checkbox" value="${x.id}" ${selection.has(x.id)?'checked':''}><span>${escapeHTML(x.email)} · ${tr(x.role)}</span></label>`).join('')}</div>`;
      setup.append(box);
      box.querySelector('#documentAudience').onchange=e=>{working.audience=e.target.value;working.visibleTo=e.target.value==='selected'?[...box.querySelectorAll('input:checked')].map(x=>x.value):[];box.querySelector('#documentRecipients').hidden=e.target.value!=='selected';dirty=true;document.getElementById('saveState').textContent=t('unsaved');};
      box.querySelectorAll('input[type=checkbox]').forEach(c=>c.onchange=()=>{working.visibleTo=[...box.querySelectorAll('input:checked')].map(x=>x.value);dirty=true;document.getElementById('saveState').textContent=t('unsaved');});
    }
   const actions=document.querySelector('.form-actions');for(const [label,action] of [['finalize',()=>save('finalized')],['archive',()=>save('archived')],['remove',async()=>{if(!docId||!confirm(tr('confirmDelete')))return;try{await api('documents/'+docId,'DELETE',{version:working.version});dirty=false;await refresh();navigate('documents');}catch(e){error(e);}}]]){const b=document.createElement('button');b.className='secondary';b.textContent=tr(label);b.onclick=action;actions.append(b);}
  }
  if(page==='templates'&&staff()){
   document.getElementById('view').insertAdjacentHTML('beforeend',templatePanel());
   const select=document.getElementById('cloudTemplateSelect'),form=document.getElementById('cloudTemplateForm');
   select.onchange=()=>{const item=templates.find(t=>t.id===select.value);for(const key of ['key','name_fa','name_en','body_fa','body_en'])form.elements[key].value=item?.[key]||'';};
   form.onsubmit=async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(form));const old=templates.find(t=>t.id===select.value);try{await api('templates'+(old?'/'+old.id:''),old?'PATCH':'POST',{...payload,version:old?.version});await refresh();render();}catch(e){error(e);}};
   document.getElementById('deleteCloudTemplate').onclick=async()=>{const old=templates.find(t=>t.id===select.value);if(!old||!confirm(tr('confirmDelete')))return;try{await api('templates/'+old.id,'DELETE',{version:old.version});await refresh();render();}catch(e){error(e);}};
   for(const item of templates.filter(t=>!types.includes(t.key))){const b=document.createElement('button');b.className='template-card';b.textContent=item[lang==='fa'?'name_fa':'name_en'];b.onclick=()=>{create('custom');working.body=item[lang==='fa'?'body_fa':'body_en'];working.title=item[lang==='fa'?'name_fa':'name_en'];dirty=true;render();};document.querySelector('.templates-grid').append(b);}
  }
  if(page==='users'&&user.role==='administrator'){
   document.getElementById('accountForm').onsubmit=async e=>{e.preventDefault();try{const value=await api('users','POST',Object.fromEntries(new FormData(e.target)));await refresh();render();const out=document.getElementById('invitationOutput');out.textContent=value.invitationURL;out.style.overflowWrap='anywhere';}catch(e){error(e);}};
   document.querySelectorAll('[data-revoke]').forEach(n=>n.onclick=async()=>{try{await api('users/'+n.dataset.revoke,'PATCH',{active:false});await refresh();render();}catch(e){error(e);}});
   document.querySelectorAll('[data-recovery]').forEach(n=>n.onclick=async()=>{if(!confirm(lang==='fa'?'پیوند یک‌بارمصرف بازیابی ساخته شود؟':'Generate a one-time recovery link?'))return;try{const result=await api('users/'+n.dataset.recovery+'/recovery','POST',{});const out=document.getElementById('invitationOutput');out.textContent=result.recoveryURL;out.style.overflowWrap='anywhere';}catch(e){error(e);}});
    document.querySelectorAll('[data-reinvite]').forEach(n=>n.onclick=async()=>{try{const result=await api('users/'+n.dataset.reinvite+'/invitation','POST',{});await refresh();render();document.getElementById('invitationOutput').textContent=result.invitationURL;}catch(e){error(e);}});
   document.querySelectorAll('[data-account-role],[data-account-active]').forEach(n=>{const id=n.dataset.accountRole||n.dataset.accountActive;const u=users.find(u=>u.id===id);const run=async()=>{try{await api('users/'+id,'PATCH',n.dataset.accountRole?{role:n.value}:{active:!u.active});await refresh();render();}catch(e){error(e);}};if(n.dataset.accountRole)n.onchange=run;else n.onclick=run;});
  }
  if(page==='reader'){
   paintPreview();MobileUX.setZoom(1);document.getElementById('zoomIn').onclick=()=>MobileUX.setZoom(2);document.getElementById('zoomOut').onclick=()=>MobileUX.setZoom(1);document.getElementById('zoomFit').onclick=()=>MobileUX.setZoom(1);
  }
 }
 function templateBody(type,language){return templates.find(t=>t.key===type)?.[language==='fa'?'body_fa':'body_en'];}
 return {start,authScreen,decorate,open,save,duplicate,print,readerPage,usersPage,templateBody,staff,search,get stats(){return stats;},get active(){return active;},get user(){return user;}};
})();

/* Optional same-origin backend adapter. A missing API (404) preserves standalone
   prototype mode; an unhealthy configured API fails closed, never to local data. */
const ServerClient=(()=>{
 let active=false,user=null,csrf='',templates=[],users=[],loadError='',inviteToken='',busy=false,recovery=null,nextOffset=null,searchTimer,searchVersion=0,stats={total:0,draft:0,finalized:0,archived:0};
 const strings={en:{login:'Sign in',email:'Email',password:'Password (12–128 characters)',logout:'Sign out',users:'Accounts',read:'Read',reader:'Finalized document',finalized:'Finalized',archived:'Archived',invite:'Create account / invitation',role:'Role',manager:'Manager',employee:'Employee',administrator:'Administrator',import:'Import browser-local drafts',finalize:'Finalize',archive:'Archive',remove:'Delete document',retry:'Retry',templates:'Manage templates',save:'Save',accept:'Accept invitation',private:'Company data is stored on the server. Browser-local drafts are separate until explicitly imported.',denied:'Access denied.',failed:'The server operation failed. Your unsaved content remains open.',saveFirst:'Save the document before printing or exporting.',imported:'Local draft import completed. Original browser copies were preserved.',confirmImport:'Import local drafts into the company database? Original copies will remain in this browser.',confirmDelete:'Delete this company document?',readOnly:'Read-only account. PDF and printing are disabled.',duplicate:'Draft copy created. Images not authorized for reuse were omitted.',local:'Browser-local prototype',templateKey:'Template key',nameEn:'English name',nameFa:'Persian name',bodyEn:'English content',bodyFa:'Persian content',newTemplate:'New template'},fa:{login:'ورود',email:'ایمیل',password:'گذرواژه (۱۲ تا ۱۲۸ نویسه)',logout:'خروج',users:'حساب‌ها',read:'مشاهده',reader:'سند نهایی',finalized:'نهایی',archived:'بایگانی',invite:'ایجاد حساب / دعوت‌نامه',role:'نقش',manager:'مدیر',employee:'کارمند',administrator:'مدیر سامانه',import:'انتقال پیش‌نویس‌های مرورگر',finalize:'نهایی کردن',archive:'بایگانی',remove:'حذف سند',retry:'تلاش دوباره',templates:'مدیریت قالب‌ها',save:'ذخیره',accept:'پذیرش دعوت‌نامه',private:'اطلاعات شرکت روی سرور ذخیره می‌شود. پیش‌نویس‌های مرورگر فقط با انتقال صریح وارد سامانه می‌شوند.',denied:'دسترسی مجاز نیست.',failed:'عملیات سرور انجام نشد. تغییرات ذخیره‌نشده باز می‌مانند.',saveFirst:'پیش از چاپ یا خروجی، سند را ذخیره کنید.',imported:'انتقال انجام شد. نسخه‌های اصلی مرورگر حفظ شدند.',confirmImport:'پیش‌نویس‌های مرورگر به پایگاه داده شرکت منتقل شوند؟ نسخه‌های اصلی در مرورگر باقی می‌مانند.',confirmDelete:'این سند شرکت حذف شود؟',readOnly:'حساب فقط‌خواندنی است. چاپ و خروجی PDF غیرفعال است.',duplicate:'نسخه مشابه ساخته شد. تصاویر بدون مجوز استفاده دوباره حذف شدند.',local:'نمونه محلی مرورگر',templateKey:'شناسه قالب',nameEn:'نام انگلیسی',nameFa:'نام فارسی',bodyEn:'متن انگلیسی',bodyFa:'متن فارسی',newTemplate:'قالب جدید'}};
 const tr=k=>strings[lang][k]||k;
 const staff=()=>user&&user.role!=='employee';
 async function api(path,method='GET',data){
  const response=await fetch('/api/v1/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{...(data?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:data?JSON.stringify(data):undefined});
  if(!response.ok){const detail=await response.json().catch(()=>({}));const e=new Error(detail.error||'Request failed');e.status=response.status;e.path=path;if(response.status===403&&user&&path!=='session'){const check=await fetch('/api/v1/session',{credentials:'same-origin',cache:'no-store'});if(check.ok){const current=await check.json();if(current.user.role!==user.role){clearMemory();user=current.user;csrf=current.csrf;document.documentElement.dataset.role=user.role;await refresh();page='documents';render();}}}
   if(response.status===401&&user){if(dirty&&working&&staff())recovery={accountId:user.id,draft:structuredClone(working)};clearMemory(false);authScreen();}throw e;}
  return response.json();
 }
 function error(e){if(e.status===401&&user){if(dirty&&working&&staff())recovery={accountId:user.id,draft:structuredClone(working)};clearMemory(false);authScreen();}loadError=e.status===403?tr('denied'):e.status===409?(lang==='fa'?'نسخه سند تغییر کرده است؛ پیش از ذخیره دوباره بارگیری کنید.':'Version conflict. Reopen before saving.'):tr('failed');if(page==='editor')toast(loadError);else{const node=document.getElementById('cloudError');if(node)node.textContent=loadError;else toast(loadError);}}
 function clearMemory(clearRecovery=true){if(clearRecovery)recovery=null;user=null;csrf='';docs=[];working=null;docId=null;dirty=false;templates=[];users=[];letterheadImage='';DocumentMarks.reset();MobileUX.reset();document.documentElement.dataset.role='';}
 async function refresh(){docs=await api('documents');nextOffset=docs.length===1000?1000:null;stats=await api('summary');templates=staff()?await api('templates'):[];users=user.role==='administrator'?await api('users'):[];}
 function authScreen(){
  MobileUX.closeNavigation(false);document.querySelector('.main-wrap').inert=false;
  document.documentElement.dataset.auth='signed-out';document.documentElement.dataset.role='';
  document.getElementById('view').innerHTML=`<section class="auth-panel panel"><h1>${inviteToken?tr('accept'):tr('login')}</h1><p id="cloudError" role="alert">${escapeHTML(loadError)}</p><form id="authForm">${inviteToken?'':`<label for="authEmail">${tr('email')}</label><input id="authEmail" type="email" autocomplete="username" required maxlength="254">`}<label for="authPassword">${tr('password')}</label><input id="authPassword" type="password" autocomplete="${inviteToken?'new-password':'current-password'}" minlength="12" maxlength="128" required><button class="primary">${inviteToken?tr('accept'):tr('login')}</button></form></section>`;
  document.getElementById('authForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{
   const password=document.getElementById('authPassword').value;
   if(inviteToken){await api('invitations/accept','POST',{token:inviteToken,password});inviteToken='';loadError='';authScreen();return;}
   await api('login','POST',{email:document.getElementById('authEmail').value,password});await establish();
  }catch(err){error(err);}finally{if(button.isConnected)button.disabled=false;}};
 }
 async function establish(){const result=await api('session');user=result.user;csrf=result.csrf;document.documentElement.dataset.auth='signed-in';document.documentElement.dataset.role=user.role;await refresh();page='documents';if(recovery?.accountId===user.id&&staff()){working=recovery.draft;docId=working.id||null;dirty=true;page='editor';}recovery=null;render();}
 async function start(){
  Object.assign(copy.en,{reader:strings.en.reader,read:strings.en.read,users:strings.en.users,finalized:strings.en.finalized,archived:strings.en.archived});Object.assign(copy.fa,{reader:strings.fa.reader,read:strings.fa.read,users:strings.fa.users,finalized:strings.fa.finalized,archived:strings.fa.archived});
  inviteToken=location.hash.startsWith('#invite=')?location.hash.slice(8):'';if(inviteToken)history.replaceState(null,'',location.pathname+location.search);
  if(document.querySelector('meta[name=rimdan-mode]')?.content!=='server'){active=false;render();return;}
  Object.assign(copy.en,{pending:'Archived',approved:'Finalized',saved:'Draft saved to company database',savedState:'Saved to company database',demoMode:'Company workspace',demoOnly:'Company workspace',prototype:'COMPANY DATABASE'});Object.assign(copy.fa,{pending:'بایگانی',approved:'نهایی',saved:'پیش‌نویس در پایگاه داده شرکت ذخیره شد',savedState:'ذخیره‌شده در پایگاه داده شرکت',demoMode:'فضای کاری شرکت',demoOnly:'فضای کاری شرکت',prototype:'پایگاه داده شرکت'});
  try{
   const response=await fetch('/api/v1/config',{cache:'no-store',credentials:'same-origin'});
   active=true;letterheadImage='';document.documentElement.dataset.auth='signed-out';if(!response.ok)throw Error('API unavailable');
   if(inviteToken){authScreen();return;}
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
 async function save(status){
  if(!staff()||busy)return;captureEditor();if(!working.title.trim()){MobileUX.setView('edit');toast(t('required'));document.getElementById('docTitle').focus();return;}
  busy=true;document.getElementById('saveBtn').disabled=true;
  try{const source=working,payload=await prepare(working);payload.status=status||'draft';
   const saved=await api('documents'+(docId?'/'+docId:''),docId?'PATCH':'POST',payload);
   if(working!==source)return;working=await hydrate(saved);docId=saved.id;dirty=false;await refresh();render();toast(t('saved'));
  }catch(e){error(e);}finally{busy=false;const b=document.getElementById('saveBtn');if(b)b.disabled=false;}
 }
 async function duplicate(){if(!staff())return;if(!docId||dirty){toast(lang==='fa'?'پیش از ایجاد نسخه مشابه، پیش‌نویس را ذخیره کنید.':'Save the draft before making a copy.');return;}try{const d=await api(`documents/${docId}/duplicate`,'POST',{});dirty=false;await refresh();await open(d.id);toast(tr('duplicate'));}catch(e){error(e);}}
 async function print(operation){if(!staff())return;if(dirty||!docId){toast(tr('saveFirst'));return;}try{await api(`documents/${docId}/${operation}`,'POST',{});window.print();}catch(e){error(e);}}
 function readerPage(){
  const temp=document.createElement('template');temp.innerHTML=editor();const panel=temp.content.querySelector('.preview-panel');
  panel.querySelector('#adjustMarks')?.remove();panel.querySelector('#openMarkTools')?.remove();
  return `<h1>${escapeHTML(working.title)}</h1><p>${tr('readOnly')}</p><div id="cloudError" role="alert"></div><button class="secondary" data-go="documents">${t('back')}</button><div hidden><textarea id="docBody"></textarea><select id="letterheadSelect"><option value="official"></option><option value="custom"></option></select><button id="removeLetterhead"></button></div>${panel.outerHTML}`;
 }
 function usersPage(){return `<section class="panel cloud-panel"><h1>${tr('users')}</h1><p id="cloudError" role="alert"></p><form id="accountForm"><label>${tr('email')}<input name="email" type="email" required maxlength="254"></label><label>${tr('role')}<select name="role"><option value="employee">${tr('employee')}</option><option value="manager">${tr('manager')}</option></select></label><button class="primary">${tr('invite')}</button></form><output id="invitationOutput"></output><div class="cloud-accounts">${users.map(u=>`<div><b>${escapeHTML(u.email)}</b><span>${tr(u.role)} · ${u.active?'✓':'—'}</span>${u.id===user.id?'':`<select aria-label="${tr('role')}" data-account-role="${u.id}"><option value="employee" ${u.role==='employee'?'selected':''}>${tr('employee')}</option><option value="manager" ${u.role==='manager'?'selected':''}>${tr('manager')}</option></select>${u.pending||!u.has_password?'':`<button class="secondary" data-account-active="${u.id}">${u.active?(lang==='fa'?'غیرفعال کردن':'Deactivate'):(lang==='fa'?'فعال کردن':'Activate')}</button>`}`}${u.id!==user.id&&!u.active?`<button class="secondary" data-reinvite="${u.id}">${lang==='fa'?'دعوت دوباره':'Reissue invitation'}</button>`:''}${u.id!==user.id&&u.pending?`<button class="secondary" data-revoke="${u.id}">${lang==='fa'?'لغو دعوت‌نامه':'Revoke invitation'}</button>`:''}</div>`).join('')}</div></section>`;}
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
   document.getElementById('docList').innerHTML=docTable(docs);document.querySelectorAll('[data-open]').forEach(n=>n.onclick=e=>{e.stopPropagation();open(n.dataset.open);});moreButton();
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

/* Original artwork is referenced directly; never resized or re-encoded on disk. */
const Letterheads = (() => {
  const official = { fa: 'assets/persian-pad.jpg', en: 'assets/english-pad.png' };
  const messages = {
    en: { official: 'Official pad — follows document language', custom: 'Custom imported pad',
      selected: 'Official company letterhead', pages: 'Additional A4 pages were created. Review each page before printing.',
      fields: 'A date, number, subject or recipient exceeds its writing area. Shorten it before printing.',
      failure: 'The letterhead could not load. Check the local asset before printing.' },
    fa: { official: 'سربرگ رسمی — بر اساس زبان سند', custom: 'سربرگ واردشده سفارشی',
      selected: 'سربرگ رسمی شرکت', pages: 'صفحات A4 دیگری ایجاد شد. پیش از چاپ همه صفحات را بررسی کنید.',
      fields: 'تاریخ، شماره، موضوع یا گیرنده از فضای مجاز بزرگ‌تر است. پیش از چاپ آن را کوتاه کنید.',
      failure: 'تصویر سربرگ بارگیری نشد. پیش از چاپ فایل محلی را بررسی کنید.' }
  };
  const text = key => messages[lang][key];
  const selection = (language, value) => value === 'custom' ? 'custom' : `official-${language}`;
  const isCustom = () => working.letterhead === 'custom' && /^data:image\/(png|jpeg|webp);base64,/.test(working.customLetterhead || '');
  function controls() {
    return `<label for="letterheadSelect">${t('letterhead')}</label><select id="letterheadSelect"><option value="official" ${!isCustom()?'selected':''}>${text('official')}</option><option value="custom" ${isCustom()?'selected':''} ${working.customLetterhead||letterheadImage?'':'disabled'}>${text('custom')}</option></select>`;
  }
  function apply() {
    working.letterhead = selection(working.language, working.letterhead);
    const custom = isCustom();
    if (!custom) working.letterhead = `official-${working.language}`;
    const paper = document.getElementById('paper');
    paper.classList.add('has-letterhead','official-paper');
    paper.dataset.pad = custom ? 'custom' : working.language;
    const img = paper.querySelector('.letterhead-art');
    const src = custom ? working.customLetterhead : official[working.language];
    if (img.getAttribute('src') !== src) img.src = src;
    img.onerror = () => { document.getElementById('letterheadStatus').textContent = text('failure'); };
    const date = new Date((/^\d{4}-\d{2}-\d{2}$/.test(working.date)?working.date:new Date().toISOString().slice(0,10))+'T12:00:00');
    document.getElementById('letterDate').textContent = new Intl.DateTimeFormat(working.language==='fa'?'fa-IR':'en-GB',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    document.getElementById('numberLabel').textContent = '';
    document.querySelector('.letterhead-notice').textContent = custom ? t('letterheadImported') : text('selected');
    document.getElementById('letterheadSelect').value = custom ? 'custom' : 'official';
    document.getElementById('removeLetterhead').disabled = !custom;
  }

  // Measure with the browser's actual typography, then split at word boundaries.
  // All pages keep the same artwork and writing rectangle; no text enters footer.
  function paginate() {
    const first=document.getElementById('paper'),viewport=document.getElementById('paperViewport');
    if(!first||!viewport)return;
    viewport.querySelectorAll('.continuation-paper').forEach(node=>node.remove());
    const body=document.getElementById('pvBody');
    const runs=InlineText.parse(working.body||'');
    const visible=InlineText.plain(runs);
    const total=InlineText.length(runs);
    const probe=document.createElement('div');
    probe.className='pagination-probe';
    const style=getComputedStyle(body);
    for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','textDecoration','textAlign','lineHeight','letterSpacing','wordSpacing','whiteSpace'])probe.style[key]=style[key];
    probe.style.width=body.clientWidth+'px';probe.dir=first.dir;probe.lang=first.lang;
    document.body.append(probe);
    const capacity=body.clientHeight;
    const fits=(start,end)=>{
      InlineText.render(probe,InlineText.segment(runs,start,end));
      return probe.scrollHeight<=capacity+1;
    };
    let start=0,page=first,count=1;
    while(start<total){
      let end=total;
      if(!fits(start,total)){
        let low=start+1,high=total;
        while(low<high){
          const middle=Math.ceil((low+high)/2);
          if(fits(start,middle))low=middle;else high=middle-1;
        }
        end=Math.max(start+1,low);
        const blank=Math.max(visible.lastIndexOf(' ',end-1),visible.lastIndexOf('\n',end-1));
        if(blank>start+(end-start)/2)end=blank+1;
        if(end<total && /[\uD800-\uDBFF]/.test(visible[end-1]))end=end===start+1?end+1:end-1;
      }
      InlineText.render(page.querySelector('.paper-body'),InlineText.segment(runs,start,end));
      start=end;
      if(start>=total)break;
      const next=first.cloneNode(true);
      next.classList.add('continuation-paper');
      next.querySelector('.document-marks')?.remove();
      next.removeAttribute('id');
      next.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
      next.querySelector('.paper-body').replaceChildren();
      viewport.append(next);
      page=next;count++;
    }
    if(total===0)body.replaceChildren();
    probe.remove();
    const fields=['pvTitle','pvRecipient','letterDate','pvNumber'].some(id=>{
      const node=document.getElementById(id);
      return node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1;
    });
    document.getElementById('letterheadStatus').textContent=fields?text('fields'):'';
    const notice=document.getElementById('overflowNotice');notice.hidden=count===1;notice.textContent=text('pages');
    fitPages();
  }
  function fitPages() {
    const scroll=document.getElementById('previewScroll');
    const viewport=document.getElementById('paperViewport');
    if (!scroll || !viewport || !scroll.clientWidth) return;
    MobileUX.previewHeight(scroll);
    const style=getComputedStyle(scroll);
    const maxHeight=Math.max(parseFloat(style.minHeight)||0,parseFloat(style.maxHeight)||Infinity);
    const scale=MobileUX.scaleFor(Math.max(1,scroll.clientWidth-16),maxHeight-16);
    viewport.style.width=(210*96/25.4*scale)+'px';
    document.querySelectorAll('#paperViewport .preview-paper').forEach(p => {
      p.style.zoom=scale;p.style.setProperty('--mark-control-scale',1/scale);
    });
  }
  function attach() {
    document.getElementById('letterheadSelect').onchange = e => {
      captureEditor();
      if (e.target.value==='custom') { working.customLetterhead ||= letterheadImage; working.letterhead='custom'; }
      else working.letterhead=`official-${working.language}`;
      updatePreview();
    };
  }
  // Browser print/PDF must use the same measured pages even after font loading.
  window.addEventListener('beforeprint',()=>{if(typeof page!=='undefined' && page==='editor') paginate();});
  window.addEventListener('afterprint',()=>{if(typeof page!=='undefined' && page==='editor') fitPages();});
  document.fonts?.ready.then(()=>{if(typeof page!=='undefined' && page==='editor') {paginate();}});
  return {controls,apply,paginate,fitPages,attach,selection};
})();

/* Per-draft signature and stamp tools. No asset registry or network requests. */
const DocumentMarks = (() => {
  const messages = {
    en: {
      tools: 'Signature and company stamp', signature: 'Signature', stamp: 'Company stamp',
      privacy: 'Prototype: assets are stored only inside this browser’s drafts, not in secure organizational storage. Permissions and secure asset management require a production backend. Anyone using this browser profile may access them.',
      upload: 'Upload PNG, JPEG or WebP (up to 2 MB)', place: 'Place / replace on document',
      remove: 'Remove from document', clear: 'Clear pending image', pending: 'Pending image — not placed',
      empty: 'No pending image', transparent: 'Remove near-white background (signature only)',
      draw: 'Draw a signature', canvas: 'Signature drawing area. Use a mouse, touch or pen; image upload is the keyboard-accessible alternative.',
      clearDrawing: 'Clear drawing', useDrawing: 'Preview drawing', background: 'Transparent drawing background',
      left: 'From left (mm)', top: 'From top (mm)', width: 'Width (mm)',
      help: 'Drag the placed image to move; drag its corner to resize. Keyboard: arrow keys move (Shift = 5 mm); +/− resize. Numeric fields provide an alternative. Assets stay within x 18–192 mm, y 100–250 mm on the first A4 page. Check for overlap with text.',
      invalid: 'Image rejected. Use a valid PNG, JPEG or WebP up to 2 MB and 4096 × 4096 pixels (at most 12 megapixels). Use aspect ratios from 1:5 to 12:1. Try a smaller image if conversion is too large. SVG and external URLs are not accepted.',
      ready: 'Image ready for preview. Choose Place to apply it.', applied: 'Image placed on this draft.', removed: 'Image removed from this draft.',
      blank: 'Draw a signature first.', resize: 'Resize', move: 'Move', busy: 'Reading image…',
      firstPage: 'Signatures and stamps appear on the first page only; they do not certify authenticity.'
    },
    fa: {
      tools: 'امضا و مهر شرکت', signature: 'امضا', stamp: 'مهر شرکت',
      privacy: 'نسخه آزمایشی: تصاویر فقط در پیش‌نویس‌های همین مرورگر ذخیره می‌شوند و فضای امن سازمانی نیستند. مدیریت امن تصاویر و مجوزها به سامانه سمت سرور نیاز دارد. کاربران این نمایه مرورگر ممکن است به آن‌ها دسترسی داشته باشند.',
      upload: 'انتخاب PNG، JPEG یا WebP (حداکثر ۲ مگابایت)', place: 'قرار دادن / جایگزینی روی سند',
      remove: 'حذف از سند', clear: 'پاک کردن تصویر آماده', pending: 'تصویر آماده — هنوز روی سند نیست',
      empty: 'تصویر آماده‌ای وجود ندارد', transparent: 'حذف پس‌زمینه نزدیک به سفید (فقط امضا)',
      draw: 'رسم امضا', canvas: 'ناحیه رسم امضا با ماوس، لمس یا قلم؛ انتخاب فایل جایگزین قابل استفاده با صفحه‌کلید است.',
      clearDrawing: 'پاک کردن رسم', useDrawing: 'پیش‌نمایش رسم', background: 'پس‌زمینه شفاف رسم',
      left: 'فاصله از چپ (میلی‌متر)', top: 'فاصله از بالا (میلی‌متر)', width: 'عرض (میلی‌متر)',
      help: 'برای جابه‌جایی تصویر را بکشید و برای تغییر اندازه گوشه آن را بکشید. صفحه‌کلید: کلیدهای جهت، جابه‌جایی؛ همراه Shift، پنج میلی‌متر؛ + و −، تغییر اندازه. فیلدهای عددی نیز قابل استفاده هستند. محدوده مجاز صفحه اول: افقی ۱۸ تا ۱۹۲ و عمودی ۱۰۰ تا ۲۵۰ میلی‌متر. هم‌پوشانی با متن را بررسی کنید.',
      invalid: 'تصویر پذیرفته نشد. فایل معتبر PNG، JPEG یا WebP تا ۲ مگابایت و ابعاد حداکثر ۴۰۹۶ × ۴۰۹۶ پیکسل (حداکثر ۱۲ مگاپیکسل) انتخاب کنید. نسبت عرض به ارتفاع باید بین ۱ به ۵ و ۱۲ به ۱ باشد. اگر تبدیل تصویر حجیم است، فایل کوچک‌تری انتخاب کنید. SVG و نشانی اینترنتی پذیرفته نمی‌شود.',
      ready: 'تصویر برای پیش‌نمایش آماده است. برای اعمال، دکمه قرار دادن را انتخاب کنید.', applied: 'تصویر روی این پیش‌نویس قرار گرفت.', removed: 'تصویر از این پیش‌نویس حذف شد.',
      blank: 'ابتدا امضا را رسم کنید.', resize: 'تغییر اندازه', move: 'جابه‌جایی', busy: 'در حال خواندن تصویر…',
      firstPage: 'امضا و مهر فقط در صفحه اول ظاهر می‌شوند و تأیید اصالت نیستند.'
    }
  };
  const kinds = ['signature', 'stamp'];
  const pending = { signature: null, stamp: null };
  const versions = { signature: 0, stamp: 0 };
  let drawingCanvas = null, drawingHasInk = false;
  const MAX_BYTES = 2 * 1024 * 1024;
  const MAX_DATA = 1500000;
  const safePNG = value => typeof value === 'string' && value.length <= MAX_DATA && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  const text = key => messages[lang][key];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function normalize(mark) {
    if (!mark || !safePNG(mark.src)) return null;
    const ratio = clamp(number(mark.ratio, 2), 0.2, 12);
    const width = clamp(number(mark.width, 48), 12, Math.min(80, 60 * ratio));
    return { src: mark.src, ratio, width,
      x: clamp(number(mark.x, 30), 18, 192 - width),
      y: clamp(number(mark.y, 210), 100, 250 - width / ratio) };
  }

  function clean(marks) {
    return Object.fromEntries(kinds.map(kind => [kind, normalize(marks?.[kind])]));
  }

  function reset() {
    drawingCanvas = null; drawingHasInk = false;
    for (const kind of kinds) { pending[kind] = null; versions[kind]++; }
  }

  function panel() {
    return `<details class="mark-tools"><summary>${text('tools')}</summary>
      <p class="mark-privacy">${text('privacy')}</p><p>${text('firstPage')}</p>
      ${kinds.map(kind => `<section class="mark-tool" aria-labelledby="${kind}-heading">
        <h3 id="${kind}-heading">${text(kind)}</h3>
        <label for="${kind}-file">${text('upload')}</label>
        <input id="${kind}-file" type="file" accept="image/png,image/jpeg,image/webp">
        ${kind === 'signature' ? `<label class="mark-check"><input type="checkbox" id="signature-white">${text('transparent')}</label>
        <details class="signature-drawing"><summary>${text('draw')}</summary>
          <canvas id="signature-canvas" width="720" height="240" aria-label="${text('canvas')}"></canvas>
          <label class="mark-check"><input id="drawing-transparent" type="checkbox" checked>${text('background')}</label>
          <div class="mark-actions"><button type="button" id="clear-drawing">${text('clearDrawing')}</button><button type="button" id="preview-drawing">${text('useDrawing')}</button></div>
        </details>` : ''}
        <div class="mark-pending" id="${kind}-pending"></div>
        <div class="mark-actions"><button type="button" id="${kind}-place">${text('place')}</button><button type="button" id="${kind}-clear">${text('clear')}</button><button type="button" id="${kind}-remove">${text('remove')}</button></div>
        <div class="mark-position">${['x','y','width'].map((key, i) => `<label for="${kind}-${key}">${text(['left','top','width'][i])}<input id="${kind}-${key}" type="number" step="1" inputmode="decimal"></label>`).join('')}</div>
      </section>`).join('')}
      <p id="mark-help">${text('help')}</p><p id="mark-status" role="status" aria-live="polite"></p>
    </details>`;
  }

  function status(key) {
    const node = document.getElementById('mark-status');
    if (node) node.textContent = text(key);
  }

  // Verify magic bytes as well as the declared MIME. Rasterize to strip metadata
  // and keep scripts, SVG, URLs, and original file names out of saved documents.
  async function decodeFile(file) {
    if (!file || file.size === 0 || file.size > MAX_BYTES) throw Error('size');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) throw Error('type');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const w = image.naturalWidth, h = image.naturalHeight;
      if (!w || !h || w > 4096 || h > 4096 || w * h > 12000000 || w / h < 0.2 || w / h > 12) throw Error('dimensions');
      const scale = Math.min(1, 1200 / Math.max(w,h));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(w*scale); canvas.height = Math.round(h*scale);
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      return raster(canvas);
    } finally { URL.revokeObjectURL(url); }
  }

  function raster(canvas) {
    const src = canvas.toDataURL('image/png');
    if (!safePNG(src)) throw Error('output size');
    return { src, ratio: canvas.width / canvas.height };
  }

  async function whiteToTransparent(asset) {
    const image = new Image(); image.src = asset.src; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image,0,0);
    const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
    for (let i=0;i<pixels.data.length;i+=4) {
      if (pixels.data[i] >= 245 && pixels.data[i+1] >= 245 && pixels.data[i+2] >= 245) pixels.data[i+3] = 0;
    }
    ctx.putImageData(pixels,0,0); return raster(canvas);
  }

  function refreshControls() {
    for (const kind of kinds) {
      const preview = document.getElementById(`${kind}-pending`);
      if (!preview) continue;
      preview.replaceChildren();
      const label = document.createElement('span'); label.textContent = text(pending[kind] ? 'pending' : 'empty'); preview.append(label);
      if (pending[kind]) { const img = document.createElement('img'); img.src = pending[kind].src; img.alt = text(kind); preview.append(img); }
      document.getElementById(`${kind}-place`).disabled = !pending[kind];
      document.getElementById(`${kind}-clear`).disabled = !pending[kind];
      const mark = working.marks?.[kind];
      document.getElementById(`${kind}-remove`).disabled = !mark;
      for (const key of ['x','y','width']) {
        const input = document.getElementById(`${kind}-${key}`); input.disabled = !mark;
        input.value = mark ? Math.round(mark[key]*10)/10 : '';
        input.min = key === 'x' ? 18 : key === 'y' ? 100 : 12;
        input.max = mark ? (key === 'x' ? 192-mark.width : key === 'y' ? 250-mark.width/mark.ratio : Math.min(80,60*mark.ratio)) : 80;
      }
    }
  }

  function changed() {
    dirty = true;
    document.getElementById('saveState').textContent = t('unsaved');
    drawMarks(); refreshControls();
  }

  function move(kind, changes) {
    if (!working.marks?.[kind]) return;
    working.marks[kind] = normalize({ ...working.marks[kind], ...changes });
    changed();
  }

  function drawMarks() {
    const paper = document.getElementById('paper'); if (!paper) return;
    let layer = paper.querySelector('.document-marks');
    if (!layer) { layer = document.createElement('div'); layer.className = 'document-marks'; paper.append(layer); }
    // Reuse nodes during movement so focus and pointer capture are preserved.
    for (const kind of kinds) {
      const mark = working.marks?.[kind];
      let node = layer.querySelector(`[data-mark="${kind}"]`);
      if (!mark) { node?.remove(); continue; }
      if (!node) {
        node = document.createElement('div'); node.className = 'document-mark'; node.dataset.mark = kind;
        node.tabIndex = 0; node.setAttribute('role','group'); node.setAttribute('aria-describedby','mark-help');
        const img = document.createElement('img'); img.draggable = false; node.append(img);
        const mover = document.createElement('button'); mover.type = 'button'; mover.className = 'mark-move';mover.textContent = '+';node.append(mover);
        const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'mark-resize';
        handle.textContent = '↘'; node.append(handle); layer.append(node);
        node.addEventListener('pointerdown', e => startDrag(e,kind,node, e.target === handle));
        node.addEventListener('keydown', e => {
          const current = working.marks?.[kind]; if (!current) return;
          const step = e.shiftKey ? 5 : 1;
          const deltas = {ArrowLeft:{x:current.x-step},ArrowRight:{x:current.x+step},ArrowUp:{y:current.y-step},ArrowDown:{y:current.y+step},'+':{width:current.width+2},'=':{width:current.width+2},'-':{width:current.width-2}};
          if (deltas[e.key]) { e.preventDefault(); move(kind,deltas[e.key]); }
        });
      }
      node.setAttribute('aria-label',`${text(kind)} — ${text('move')}`);
      node.querySelector('img').src = mark.src; node.querySelector('img').alt = text(kind);
      node.querySelector('.mark-resize').setAttribute('aria-label',`${text('resize')} ${text(kind)}`);
      node.querySelector('.mark-move').setAttribute('aria-label',`${text('move')} ${text(kind)}`);
      Object.assign(node.style,{left:`${mark.x}mm`,top:`${mark.y}mm`,width:`${mark.width}mm`,height:`${mark.width/mark.ratio}mm`});
    }
  }

  function startDrag(event, kind, node, resizing) {
    if (event.button !== 0) return;
    event.preventDefault(); node.focus();
    const target = resizing ? node.querySelector('.mark-resize') : node;
    const mark = {...working.marks[kind]}, x = event.clientX, y = event.clientY;
    const layer = node.parentElement.getBoundingClientRect();
    const pxPerMM = layer.width / 210;
    target.setPointerCapture(event.pointerId);
    const onMove = e => {
      if (e.pointerId !== event.pointerId) return;
      const dx = (e.clientX-x)/pxPerMM, dy = (e.clientY-y)/pxPerMM;
      move(kind, resizing ? {width:mark.width+dx} : {x:mark.x+dx,y:mark.y+dy});
    };
    const end = () => {
      target.removeEventListener('pointermove',onMove);
      target.removeEventListener('pointerup',end); target.removeEventListener('pointercancel',end);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    };
    target.addEventListener('pointermove',onMove); target.addEventListener('pointerup',end); target.addEventListener('pointercancel',end);
  }

  function attachDrawing() {
    const canvas = document.getElementById('signature-canvas'), ctx = canvas.getContext('2d');
    if (drawingCanvas) ctx.drawImage(drawingCanvas,0,0);
    drawingCanvas = canvas;
    let active = null, hasInk = drawingHasInk;
    ctx.strokeStyle = '#102c49'; ctx.fillStyle = '#102c49'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const point = e => { const r=canvas.getBoundingClientRect(); return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height]; };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || active !== null) return;
      e.preventDefault(); active=e.pointerId; canvas.setPointerCapture(active);
      const [x,y]=point(e); ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(x,y);hasInk=true;drawingHasInk=true;
    });
    canvas.addEventListener('pointermove',e=>{if(e.pointerId!==active)return;e.preventDefault();ctx.lineTo(...point(e));ctx.stroke();});
    const end=e=>{if(e.pointerId===active){if(canvas.hasPointerCapture(active))canvas.releasePointerCapture(active);active=null;}};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    document.getElementById('clear-drawing').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;drawingHasInk=false;};
    document.getElementById('preview-drawing').onclick=()=>{
      if(!hasInk){status('blank');return;}
      const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;
      const out=output.getContext('2d');
      if(!document.getElementById('drawing-transparent').checked){out.fillStyle='#fff';out.fillRect(0,0,output.width,output.height);}
      out.drawImage(canvas,0,0);pending.signature=raster(output);versions.signature++;refreshControls();status('ready');
    };
  }

  function attach() {
    for (const kind of kinds) {
      document.getElementById(`${kind}-file`).onchange = async e => {
        const file = e.target.files[0]; e.target.value = ''; if (!file) return;
        const version = ++versions[kind], draft = working;
        status('busy');
        try {
          const asset = await decodeFile(file);
          if (versions[kind]!==version || working!==draft || page!=='editor') return;
          pending[kind] = asset;refreshControls();status('ready');
        } catch { if(versions[kind]===version && page==='editor')status('invalid'); }
      };
      document.getElementById(`${kind}-place`).onclick = async () => {
        if (!pending[kind]) return;
        const version=versions[kind], draft=working;
        try {
          const asset = kind==='signature' && document.getElementById('signature-white').checked ? await whiteToTransparent(pending[kind]) : pending[kind];
          if (versions[kind]!==version || working!==draft || page!=='editor') return;
          const current=working.marks?.[kind];
          working.marks={...working.marks,[kind]:normalize({...asset,width:current?.width||Math.min(50,60*asset.ratio),x:current?.x||(kind==='signature'?35:130),y:current?.y||210})};
          pending[kind]=null;versions[kind]++;changed();status('applied');
        } catch { status('invalid'); }
      };
      document.getElementById(`${kind}-clear`).onclick=()=>{pending[kind]=null;versions[kind]++;refreshControls();};
      document.getElementById(`${kind}-remove`).onclick=()=>{working.marks={...working.marks,[kind]:null};changed();status('removed');};
      for(const key of ['x','y','width'])document.getElementById(`${kind}-${key}`).onchange=e=>move(kind,{[key]:number(e.target.value,working.marks[kind][key])});
    }
    attachDrawing();refreshControls();drawMarks();
  }

  return {panel,attach,drawMarks,clean,reset};
})();

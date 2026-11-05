/* Safe inline emphasis for the current plain-text document model.
   Supported editor markers: **bold**, *italic*, ++underline++.
   No HTML supplied by document authors is interpreted or evaluated. */
const InlineText=(()=>{
 const tokens=[['**','bold'],['++','underline'],['*','italic']];
 function parse(source){
  const text=String(source||'');
  let result=[],buffer='',flags={bold:false,italic:false,underline:false};
  function flush(){if(buffer){result.push({text:buffer,...flags});buffer='';}}
  for(let i=0;i<text.length;){
   let used=false;
   for(const [mark,key] of tokens){
    if(text.startsWith(mark,i)){
     // An unmatched delimiter remains literal text, not hidden content.
     const rest=text.indexOf(mark,i+mark.length);
     if(!flags[key]&&rest<0)continue;
     flush();flags={...flags,[key]:!flags[key]};i+=mark.length;used=true;break;
    }
   }
   if(!used){buffer+=text[i];i++;}
  }
  flush();return result;
 }
 function length(runs){return runs.reduce((n,r)=>n+r.text.length,0);}
 function segment(runs,start,end){
  const out=[];let cursor=0;
  for(const run of runs){
   const from=Math.max(0,start-cursor),to=Math.min(run.text.length,end-cursor);
   if(to>from)out.push({...run,text:run.text.slice(from,to)});
   cursor+=run.text.length;
  }
  return out;
 }
 function plain(runs){return runs.map(r=>r.text).join('');}
 function render(node,runs){
  node.replaceChildren();
  const frag=document.createDocumentFragment();
  for(const r of runs){
   let child=document.createTextNode(r.text);
   for(const [flag,tag] of [['underline','u'],['italic','em'],['bold','strong']]){
    if(r[flag]){const wrapper=document.createElement(tag);wrapper.append(child);child=wrapper;}
   }
   frag.append(child);
  }
  node.append(frag);
 }
 function wrapSelection(textarea,key){
  const mark={bold:'**',italic:'*',underline:'++'}[key];
  if(!mark)return false;
  const a=textarea.selectionStart,b=textarea.selectionEnd;
  if(a===b)return false;
  const original=textarea.value;
  textarea.value=original.slice(0,a)+mark+original.slice(a,b)+mark+original.slice(b);
  textarea.focus();textarea.setSelectionRange(a+mark.length,b+mark.length);
  textarea.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
 }
 return {parse,length,segment,plain,render,wrapSelection};
})();

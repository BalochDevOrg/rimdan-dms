import sharp from 'sharp';
export function fail(status,message){throw Object.assign(new Error(message),{status,publicMessage:message});}
export const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5a-f0-9][a-f0-9]{3}-[89ab0-9][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const text=(value,max=1000)=>typeof value==='string'&&value.length<=max?value:fail(400,'Invalid text');
export function validateDocument(value){
 const d=value||{};const language=['fa','en'].includes(d.language)?d.language:fail(400,'Invalid document language');
 const type=['letter','invoice','receipt','delivery','transaction','custom'].includes(d.type)?d.type:'custom';
 const f=d.format||{};
 const result={title:text(d.title,300).trim(),recipient:text(d.recipient||'',500),number:text(d.number||'',100),body:text(d.body||'',200000),type,language,
  date:/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')&&!isNaN(Date.parse(d.date))?d.date:fail(400,'Invalid date'),
  format:{font:["Vazirmatn","Estedad","Noto Naskh Arabic","Noto Sans Arabic","IBM Plex Sans Arabic","Amiri","Cairo","Tajawal","Markazi Text","Lateef","Tahoma","Arial","Georgia","Times New Roman","Inter","Source Serif 4"].includes(f.font)?f.font:'Vazirmatn',size:[10,11,12,14,16,18,20,24].includes(f.size)?f.size:12,align:['start','center','end','justify'].includes(f.align)?f.align:'start',spacing:[1.5,1.95,2.3].includes(f.spacing)?f.spacing:1.95,bold:f.bold===true,italic:f.italic===true,underline:f.underline===true},
  letterhead:d.letterhead==='custom'?'custom':`official-${language}`,marks:{signature:null,stamp:null}};
 if(!result.title)fail(400,'Document title required');
 if(result.letterhead==='custom'){if(!uuid(d.letterheadAsset))fail(400,'Private letterhead asset required');result.letterheadAsset=d.letterheadAsset;}
 for(const kind of ['signature','stamp'])if(d.marks?.[kind]){
  const m=d.marks[kind];if(!uuid(m.assetId)||![m.x,m.y,m.width,m.ratio].every(Number.isFinite))fail(400,'Invalid mark');
  const ratio=m.ratio,w=m.width;if(ratio<.2||ratio>12||w<12||w>Math.min(80,60*ratio)||m.x<18||m.x+w>192.001||m.y<100||m.y+w/ratio>242.001)fail(400,'Mark outside safe A4 region');
  result.marks[kind]={assetId:m.assetId,x:m.x,y:m.y,width:w,ratio};
 }
 return result;
}
export async function verifyAssets(c,d,actor,oldDoc){
 const items=Object.entries(d.marks).filter(([,m])=>m).map(([kind,m])=>({id:m.assetId,kind}));
 if(d.letterheadAsset)items.push({id:d.letterheadAsset,kind:'letterhead'});
 for(const item of items){
  const {rows:[asset]}=await c.query(`SELECT a.id,a.kind,a.width,a.height FROM assets a WHERE a.id=$1 AND (admin() OR a.owner_id=$2 OR EXISTS(SELECT 1 FROM asset_grants g WHERE g.asset_id=a.id AND g.account_id=$2) OR EXISTS(SELECT 1 FROM document_assets l WHERE l.document_id=$3 AND l.asset_id=a.id))`,[item.id,actor,oldDoc||null]);
  if(!asset||asset.kind!==item.kind)fail(403,'Asset not authorized for this document');
  const mark=d.marks[item.kind];if(mark&&Math.abs(mark.ratio-asset.width/asset.height)>.02)fail(400,'Asset ratio does not match');
 }
 return items.map(i=>i.id);
}
export async function linkAssets(c,id,assets){await c.query('DELETE FROM document_assets WHERE document_id=$1 AND NOT(asset_id=ANY($2::uuid[]))',[id,assets]);for(const asset of new Set(assets)){const exists=await c.query('SELECT 1 FROM document_assets WHERE document_id=$1 AND asset_id=$2',[id,asset]);if(!exists.rowCount)await c.query('INSERT INTO document_assets(document_id,asset_id) VALUES($1,$2)',[id,asset]);}}
export async function normalizeAsset(value){
 const {kind,dataUrl}=value||{};
 if(!['signature','stamp','letterhead'].includes(kind)||typeof dataUrl!=='string'||dataUrl.length>2900000)fail(400,'Invalid asset');
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);if(!match)fail(400,'Raster image required');
 const bytes=Buffer.from(match[2],'base64');if(bytes.length>2097152)fail(413,'Image exceeds 2 MB');
 try{
  const image=sharp(bytes,{limitInputPixels:12000000,failOn:'warning'});const info=await image.metadata();
  if(!['png','jpeg','webp'].includes(info.format)||info.format!==match[1]||info.width>4096||info.height>4096||info.pages>1)fail(400,'Invalid raster dimensions or type');
  if(kind!=='letterhead'&&(info.width/info.height<.2||info.width/info.height>12))fail(400,'Unsupported mark ratio');
  const result=await image.rotate().png().toBuffer({resolveWithObject:true});if(result.data.length>2097152)fail(413,'Converted image exceeds 2 MB');
  return {kind,bytes:result.data,width:result.info.width,height:result.info.height};
 }catch(e){if(e.status)throw e;fail(400,'Image decoding failed');}
}
export function wire(row){return {...row.content,id:row.id,status:row.status,version:row.version,updated:row.updated_at,createdBy:row.created_by,importKey:row.import_key};}

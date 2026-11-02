import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import handler from './api.js';
const files=new Set(['index.html','styles.css','mobile.css','script.js','document-marks.js','letterheads.js','mobile-ux.js','server-client.js','server-client.css']);
const root=fileURLToPath(new URL('..',import.meta.url));
http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/v1/'))return handler(req,res);
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
  if(!(files.has(path)||/^assets\/[a-zA-Z0-9_./-]+$/.test(path))||path.includes('..'))throw Error('Not public');
  let data=await readFile(resolve(root,path));if(path==='index.html')data=Buffer.from(data.toString().replace('name="rimdan-mode" content="prototype"','name="rimdan-mode" content="server"'));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[extname(path)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end('Not found');}
}).listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Rimdan development server listening'));

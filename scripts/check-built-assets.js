import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';

// Static output is the actual deployed Vercel surface; checked-in source is
// insufficient evidence that new UI assets are included in the deployment.
const html=await readFile('public/index.html','utf8');
const references=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)]
 .map(match=>match[1]).filter(path=>!/^https?:|^\/\//.test(path));
for(const path of references){
 if(path.includes('..')||path.startsWith('/'))throw Error('Unexpected root or traversal asset: '+path);
 await access(join('public',path));
}
for(const path of ['ux-premium.css','ux-premium.js','ui-icons.js','ux-compact.css']){
 if(!references.includes(path))throw Error('Phase 3 asset is not referenced: '+path);
 await access(join('public',path));
}
if(!html.includes('name="rimdan-mode" content="server"'))throw Error('Server-mode build required for release');
console.log('PASS: server-mode HTML and '+references.length+' local entry assets are packaged');

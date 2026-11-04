import {mkdir,copyFile,cp,rm,readFile,writeFile} from 'node:fs/promises';
await rm('public',{recursive:true,force:true});await mkdir('public');
for(const file of ['index.html','styles.css','mobile.css','script.js','document-marks.js','letterheads.js','mobile-ux.js','server-client.js','server-client.css','ux-premium.js','ux-premium.css'])await copyFile(file,'public/'+file);
await cp('assets','public/assets',{recursive:true});

const mode=process.env.RIMDAN_MODE==='prototype'?'prototype':'server';
await writeFile('public/index.html',(await readFile('public/index.html','utf8')).replace('name="rimdan-mode" content="prototype"','name="rimdan-mode" content="'+mode+'"'));

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const code=fs.readFileSync(path.join(root,'cloud/cloud.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/application\/json|src=/.test(m[1]))new vm.Script(m[2]);
assert(!html.includes('const RAW='));assert(!html.includes('海底捞'));
const data=JSON.parse(fs.readFileSync(process.argv[2]||'/Users/yuhan/Downloads/清美.json','utf8'));
const validation=code.slice(code.indexOf('  function validate('),code.indexOf('  function access('));
const vc=vm.createContext({normalizeState:s=>s});vm.runInContext(validation,vc);vc.validate(data);
assert.throws(()=>vc.validate({...data,categories:[{id:'bad"id',color:'#000000'}]}));
const settle=()=>new Promise(r=>setImmediate(r));
async function test(admin,outcome){
 const nodes=new Map(),events={};const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,files:[]});return nodes.get(id)};
 let calls=0;
 const client={auth:{getSession:async()=>({data:{session:admin?{user:{id:'test'}}:null}}),onAuthStateChange(){}},from:table=>({select:()=>({eq:()=>({limit:async()=>({data:[{user_id:'test'}]}),single:async()=>({data:{data:structuredClone(data),revision:1}})})})}),rpc:async()=>{calls++;return outcome==='ok'?{data:2}:{error:{code:outcome==='conflict'?'40001':'network'}}}};
 const ctx={document:{querySelector:node,querySelectorAll:()=>[],body:{classList:{toggle(){}}},addEventListener:(n,f)=>events[n]=f},window:{supabase:{createClient:()=>client}},GE_CONFIG:{},MutationObserver:class{observe(){}},localStorage:{setItem(){},getItem(){return null}},setTimeout:()=>0,clearTimeout(){},addEventListener(){},structuredClone,console,location:{origin:'https://example.com',pathname:'/ge/'},normalizeState:s=>s,blank:()=>structuredClone(data),state:structuredClone(data),selected:null,hidden:new Set(),focusIds:null,render(){},confirm:()=>true,exportFile(){}};
 vm.createContext(ctx);vm.runInContext(code,ctx);await settle();await settle();
 ctx.state.tracks[0].notes='edited';ctx.window.geCloudChanged();await node('#cloudRetry').onclick();
 assert.equal(calls,admin?1:0);
 if(admin)assert.match(node('#cloudStatus').textContent,outcome==='ok'?/已同步/:outcome==='conflict'?/其他人已更新/:/保存失败/);
 if(outcome==='conflict'){await node('#cloudRetry').onclick();assert.equal(calls,1)}
}
await test(false,'ok');await test(true,'ok');await test(true,'conflict');await test(true,'network');
console.log('PASS: inline syntax, no published research template, JSON validation, guest no-write, admin save, conflict stop, network failure.');

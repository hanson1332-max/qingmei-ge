import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let html=fs.readFileSync(path.join(root,'清美GE矩阵搭建器.html'),'utf8');
const ganttPath=[path.resolve(root,'../project-gantt/index.html'),path.resolve(root,'../../project-gantt/index.html')].find(p=>fs.existsSync(p));
if(!ganttPath)throw Error('找不到甘特图公开客户端配置，请检查 project-gantt 所在目录');
const gantt=fs.readFileSync(ganttPath,'utf8');
const url=gantt.match(/const SUPABASE_URL = '([^']+)'/)[1];
const key=gantt.match(/const SUPABASE_KEY = '([^']+)'/)[1];
if(!key.startsWith('sb_publishable_')){
 const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));
 if(payload.role!=='anon')throw Error('Refusing privileged key in public frontend');
}
// Build artifact contains no embedded research template or browser state.
html=html.replace(/const CAT=[\s\S]*?function blank\(\)/,'function template(){return blank()}\nfunction blank()');
html=html.replace(/const STORAGE_KEY=[^;]+;/,"const STORAGE_KEY='qingmei-ge-cloud-draft-v1';");
html=html.replace(/function load\(\)\{[\s\S]*?function cat\(id\)/,'function load(){return blank()}function save(){window.geCloudChanged?.(state)}function cat(id)');
html=html.replace('所有修改自动保存在本机浏览器。JSON 用于完整备份和迁移；CSV 用于进一步分析。','访客只读；管理员修改同步云端。JSON 用于完整备份。离线版与云端版的数据不会自动合并。');
html=html.replace('<main class="app">','<main class="app"><section class="cloud-bar"><strong id="cloudStatus" role="status">正在连接云端…</strong><button class="btn" id="cloudLogin">管理员登录</button><button class="btn" id="cloudReload">重新载入云端</button><button class="btn" id="cloudRetry">重试保存</button><button class="btn" id="cloudDraft">导出未同步草稿</button></section>');
html=html.replace('</head>','<link rel="stylesheet" href="cloud.css"></head>');
html=html.replace('</body>',`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script>window.GE_CONFIG=${JSON.stringify({url,key})};</script><script src="cloud.js"></script></body>`);
fs.mkdirSync(path.join(root,'public'),{recursive:true});
fs.writeFileSync(path.join(root,'public/index.html'),html);
for(const n of ['cloud.js','cloud.css'])fs.copyFileSync(path.join(root,'cloud',n),path.join(root,'public',n));
fs.writeFileSync(path.join(root,'public/.nojekyll'),'');
console.log('Built public/; research template excluded; only public Supabase key included.');

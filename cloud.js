/* Cloud state is authoritative. UI permissions supplement database RLS, never replace it. */
(() => {
  'use strict';
  const status=document.querySelector('#cloudStatus');
  const project='qingmei-ge', draftKey='qingmei-ge-unsynced-v1';
  let client,admin=false,ready=false,revision=0,baseline='',pending=false,busy=false,conflict=false,timer;
  const mutators='#openStructure,#editCategories,#addTrack,#addTrack2,#newBlank,#restoreTemplate,#importFile,#deleteChecked,#structureDialog input,#structureDialog select,#structureDialog button:not([data-close]),#tbody input,#tbody select,#tbody [data-delete],#tbody .quick-delete';
  const message=t=>status.textContent=t;
  const serialize=s=>JSON.stringify(s);
  function validate(s){
    if(!s||typeof s!=='object'||!s.meta||!s.view||!['categories','dimensions','tracks'].every(k=>Array.isArray(s[k])))throw Error('矩阵 JSON 结构不完整');
    const id=v=>typeof v==='string'&&/^[\w-]{1,120}$/.test(v);
    for(const list of [s.categories,s.dimensions,s.tracks,s.detailFields||[]]){
      const ids=new Set();for(const r of list){if(!id(r.id)||ids.has(r.id))throw Error('存在无效或重复编号');ids.add(r.id);}
    }
    for(const c of s.categories)if(!/^#[a-f\d]{6}$/i.test(c.color))throw Error('分类颜色格式无效');
    for(const d of s.dimensions)if(!['x','y'].includes(d.axis)||!Number.isFinite(d.weight)||d.weight<0)throw Error('评分维度无效');
    for(const t of s.tracks){
      if(!s.categories.some(c=>c.id===t.categoryId)||!t.scores||!Number.isFinite(t.market)||t.market<0)throw Error('赛道归属或行业空间无效');
      for(const d of s.dimensions)if(!Number.isFinite(t.scores[d.id])||t.scores[d.id]<1||t.scores[d.id]>5)throw Error('评分须在 1–5 之间');
    }
    if(!['formula','manual'].includes(s.view.positionMode)||!Number.isFinite(+s.view.bubbleMax)||!Number.isFinite(+s.view.bubbleContrast))throw Error('绘图设置无效');
    return normalizeState(s);
  }
  function access(){
    document.body.classList.toggle('cloud-admin',admin&&ready&&!conflict);
    document.body.classList.toggle('cloud-ready',ready);
    document.querySelectorAll(mutators).forEach(el=>el.disabled=!(admin&&ready&&!conflict));
    document.querySelector('#cloudLogin').textContent=admin?'退出管理':'管理员登录';
    document.querySelector('#cloudRetry').hidden=!admin||!pending||conflict;
    document.querySelector('#cloudDraft').hidden=!admin;
    document.querySelector('#exportShare').hidden=true;
    document.querySelector('#newBlank').hidden=true;
    document.querySelector('#restoreTemplate').hidden=true;
    document.querySelector('#positionMode').disabled=!(admin&&ready&&!conflict);
  }
  for(const type of ['click','input','change','dblclick','pointerdown'])document.addEventListener(type,e=>{
    if(admin&&ready&&!conflict)return;
    const el=e.target;
    if(el.closest(mutators)||(type==='dblclick'&&el.closest('#legend'))||(type==='pointerdown'&&el.closest('#chart g[data-id]')&&state.view.positionMode==='manual')){
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  new MutationObserver(access).observe(document.querySelector('#tbody'),{childList:true,subtree:true});
  function draft(){try{localStorage.setItem(draftKey,serialize({revision,data:state,savedAt:new Date().toISOString()}));return true}catch{message('本机草稿保存失败，请立即导出 JSON');return false}}
  window.geCloudChanged=()=>{
    if(!admin||!ready||conflict||serialize(state)===baseline)return;
    pending=true;draft();clearTimeout(timer);timer=setTimeout(flush,650);access();
  };
  async function flush(){
    if(!admin||!ready||busy||!pending||conflict)return;
    let snapshot;try{snapshot=validate(structuredClone(state))}catch(e){message(e.message);return}
    busy=true;message('正在保存到云端…');
    try{
      const {data,error}=await client.rpc('save_ge_matrix',{p_data:snapshot,p_revision:revision});
      if(error)throw error;
      revision=Number(data);baseline=serialize(snapshot);pending=serialize(state)!==baseline;
      message(pending?'正在保存后续修改…':'云端已同步｜管理员');
      // Keep the last local draft as a recovery copy; never silently restore it on load.
    }catch(e){
      pending=true;conflict=e.code==='40001';
      message(conflict?'其他人已更新：请导出草稿，再重新载入云端；不会覆盖他人修改。':'保存失败，草稿仍在本机；请重试或导出 JSON。');
    }finally{busy=false;access();if(pending&&!conflict&&baseline===serialize(snapshot)&&serialize(state)!==baseline)timer=setTimeout(flush,650)}
  }
  async function session(){
    admin=false;
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(data.session){const r=await client.from('ge_matrix_admins').select('user_id').eq('user_id',data.session.user.id).limit(1);if(r.error)throw r.error;admin=!!r.data?.length;}
    access();
  }
  async function load(){
    if(busy){message('正在保存，请稍后再载入');return}
    if(pending&&!confirm('有未同步修改。请先导出草稿；仍要载入云端并替换当前画面？'))return;
    ready=false;clearTimeout(timer);access();
    try{
      await session();
      const {data,error}=await client.from('ge_matrices').select('data,revision').eq('id',project).single();if(error)throw error;
      state=data.data?validate(data.data):normalizeState(blank());
      revision=Number(data.revision);baseline=serialize(state);pending=false;conflict=false;selected=null;hidden.clear();focusIds=null;
      render();ready=true;access();
      message(data.data?(admin?'云端已载入｜管理员':'云端已载入｜访客只读'):'尚未发布正式数据：管理员登录后导入最新 JSON');
    }catch(e){admin=false;ready=false;access();message('云端连接或配置未完成，未载入数据。请联系管理员或重试。')}
  }
  document.querySelector('#cloudLogin').onclick=async()=>{
    if(!client)return;
    if(admin){if(busy||pending){message('请先完成保存或导出草稿，再退出管理');return}const r=await client.auth.signOut();if(r.error){message('退出失败，请重试');return}admin=false;access();message('访客只读');return}
    const email=prompt('管理员邮箱（将发送登录链接）');if(!email)return;
    const {error}=await client.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});
    message(error?'登录链接发送失败，请检查邮箱与登录配置。':'登录链接已发送，请查收邮箱。');
  };
  document.querySelector('#cloudReload').onclick=load;
  document.querySelector('#cloudRetry').onclick=flush;
  document.querySelector('#cloudDraft').onclick=()=>{
    if(!admin)return;
    if(pending){exportFile('清美GE矩阵-未同步草稿.json','application/json',JSON.stringify(state,null,2));return}
    try{const s=JSON.parse(localStorage.getItem(draftKey));if(!s?.data){message('没有本机恢复草稿');return}exportFile('清美GE矩阵-本机恢复草稿.json','application/json',JSON.stringify(s.data,null,2))}catch{message('草稿不可读取')}
  };
  document.querySelector('#importFile').onchange=async e=>{
    if(!admin||!ready||conflict)return;
    const f=e.target.files[0];if(!f)return;
    try{const incoming=validate(JSON.parse(await f.text()));if(!confirm('以该 JSON 替换云端矩阵？原版本保留在云端历史表。'))return;state=incoming;selected=null;hidden.clear();focusIds=null;render();await flush()}catch(err){message('导入失败：'+err.message)}finally{e.target.value=''}
  };
  addEventListener('beforeunload',e=>{if(pending||busy){e.preventDefault();e.returnValue=''}});
  access();
  if(!window.supabase){message('云端组件加载失败，请检查网络后刷新。');return}
  client=window.supabase.createClient(GE_CONFIG.url,GE_CONFIG.key,{auth:{storageKey:'qingmei-ge-auth-v1'}});
  client.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT'){admin=false;clearTimeout(timer);access();message(pending?'登录已退出；未同步草稿仍保留在本机':'访客只读');}
    if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')setTimeout(async()=>{try{await session()}catch{admin=false;access()}},0);
  });
  load();
})();

const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const source = fs.readFileSync("app.js", "utf8");
const start = source.indexOf('  const RECOVERY_KEY =');
const end = source.indexOf('  function selectProject(', start);
const syncCode = source.slice(start, end);
let server = {revision:0, library:null};
const wait = () => new Promise(resolve => setTimeout(resolve, 10));
function makeClient(old = null) {
  const map = new Map();
  if (old) map.set("s", JSON.stringify(old));
  const storage = {getItem:k=>map.get(k)||null, setItem:(k,v)=>map.set(k,String(v)), removeItem:k=>map.delete(k)};
  const defaultProject = {id:"demo", title:"示例", root:{id:"root",routes:[]}, nodes:{}, pinnedAssets:[]};
  const state = {projects:old?.projects||[defaultProject],project:old?.projects?.[0]||defaultProject,activeNodeId:"root",pinnedAssets:[],aiEval:null,freshCreation:false,aiBusy:null};
  let banner = {classList:{add(){},remove(){}},innerHTML:""};
  const context = {state, library:old, localStorage:storage, STORAGE_KEY:"s", document:{hidden:false}, $:()=>banner,
    esc:x=>x, migrateTitles:()=>{},migrateBrief:()=>{},getNode:id=>id==="root"?state.project.root:state.project.nodes[id],
    renderAll:()=>{},setupTreeZoomGestures:()=>{},detectAI:()=>{},console,
    fetch:async (url,options={})=>{
      if (!options.method) return {ok:true,json:async()=>JSON.parse(JSON.stringify(server))};
      const payload=JSON.parse(options.body);
      if (payload.revision!==server.revision) return {ok:false,status:409,json:async()=>({revision:server.revision})};
      server={revision:server.revision+1,library:payload.library};
      return {ok:true,status:200,json:async()=>({revision:server.revision})};
    }
  };
  vm.createContext(context); vm.runInContext(syncCode,context); return {context,state,map,banner};
}
(async()=>{
  const old={projects:[{id:"old",title:"旧作品",root:{id:"root",routes:[]},nodes:{a:{content:["旧正文"]}},pinnedAssets:[]}],activeProjectId:"old"};
  const a=makeClient(old); await vm.runInContext('initializeLibrary()',a.context); await wait();
  assert.equal(server.library.projects[0].nodes.a.content[0],"旧正文");
  const b=makeClient(); await vm.runInContext('initializeLibrary()',b.context);
  assert.equal(b.state.project.id,"old");
  a.state.project.nodes.b={content:["设备 A 修改"]}; vm.runInContext('persist()',a.context); await wait();
  b.state.project.nodes.c={content:["设备 B 修改"]}; vm.runInContext('persist()',b.context); await wait();
  assert.ok(b.banner.innerHTML.includes("另一设备已更新"));
  assert.ok(b.map.get("s-unsynced").includes("设备 B 修改"));
  assert.ok(server.library.projects[0].nodes.b); assert.ok(!server.library.projects[0].nodes.c);
  const c=makeClient(); await vm.runInContext('initializeLibrary()',c.context); assert.ok(c.state.project.nodes.b);
  console.log("library migration, cross-client load, conflict and local recovery: passed");
})().catch(e=>{console.error(e);process.exitCode=1});

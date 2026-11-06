const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
global.window = global; global.location = {protocol:"http:"};
global.localStorage = { getItem: () => null, setItem: () => {} };
const requests = [];
let bad = false;
const perspectives = [
 {character:"平儿", observed:"看见账册", interpretation:"怕有人受冤", unspoken:"平儿独有的假设"},
 {character:"王熙凤", observed:"看见沉默", interpretation:"疑心账目", unspoken:"凤姐独有的假设"}
];
const routes = ["A","B","C"].map(key => ({key,title:key,summary:"后续",axes:{}}));
global.fetch = async (url, options = {}) => {
 if (url === "api/health") return {ok:true,json:async()=>({ok:true,model:"deepseek-flash"})};
 const body = JSON.parse(options.body); requests.push(body);
 let value;
 if (body.messages[0].content.includes("负责为文学续写选取")) value = {selected:[]};
 else if (body.messages[0].content.includes("文学创作实验助手")) value = {perspectives: bad ? [perspectives[0],perspectives[0]] : perspectives};
 else value = {title:"问账",content:["凤姐看了平儿一眼。"],axes:{},routes,story_state:{facts:[],characters:[],openThreads:[]}};
 return {ok:true,json:async()=>({content:JSON.stringify(value)})};
};
for (const f of ["worlds/honglou/data.js","worlds/honglou/data-lore.js","worlds/honglou/data-world.js","worlds/honglou/data-deep.js","worlds/honglou/data-relations.js","worlds/honglou/studio-data.js","ai.js"]) vm.runInThisContext(fs.readFileSync(f,"utf8"),{filename:f});
(async () => {
 await HL_AI.detect();
 const project={protagonist:"平儿",title:"测试",prompt:"平儿理账",brief:HL_AI.normalizeBrief({})};
 const root={id:"root",summary:"银钱短缺",assets:[]};
 const parent={id:"a",title:"查账",content:["平儿翻账。"],storyState:{facts:["本分支账册"],characters:[],openThreads:[]}};
 const progress=[];
 const result=await HL_AI.explorePerspectives({project,path:[root,parent],event:"凤姐问账",characters:["平儿","王熙凤"],onProgress:e=>progress.push(e.stage)});
 assert.deepEqual(progress,["selecting","selected","exploring","validating"]);
 assert.equal(result.perspectives.length,2);
 assert.ok(result.retrieval.detail.some(x=>x.title==="王熙凤"));
 assert.ok(requests[1].messages[1].content.includes("本分支账册"));
 requests.length=0;
 await HL_AI.continueBranch({project,path:[root,parent],instruction:"凤姐问账",brief:project.brief,perspective:result.perspectives[1]});
 const prompt=requests[1].messages.map(x=>x.content).join("\n");
 assert.ok(prompt.includes("凤姐独有的假设"));
 assert.ok(!prompt.includes("平儿独有的假设"));
 assert.ok(prompt.includes("以王熙凤为限知感知中心"));
 assert.equal(project.protagonist,"平儿");
 bad=true; await assert.rejects(HL_AI.explorePerspectives({project,path:[root,parent],event:"问账",characters:["平儿","王熙凤"]}),/不匹配或重复/);
 console.log("perspective generation, branch context, validation and selected-viewpoint isolation: passed");
})().catch(error => {console.error(error); process.exitCode=1;});

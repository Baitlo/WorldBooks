const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const app = fs.readFileSync("app.js", "utf8");
const source = app.slice(app.indexOf("  let perspectiveLab = null;"), app.indexOf("  function briefChips() {"));
const elements = new Map();
function element(selector) { if (!elements.has(selector)) elements.set(selector, {innerHTML:"",textContent:"",disabled:false,classList:{add(){},toggle(){}},scrollIntoView(){},remove(){},insertAdjacentHTML(){},querySelector:()=>null,nextElementSibling:null}); return elements.get(selector); }
const characters = [{id:"C16",title:"平儿",identity:"丫鬟",keywords:["平儿"]},{id:"C04",title:"王熙凤",identity:"管家",keywords:["凤姐"]},{id:"C05",title:"贾探春",identity:"三姑娘",keywords:["探春"]}];
const root = {id:"root",summary:"平儿核对账册",routes:[]};
const node = {id:"n",summary:"账册短缺",content:["凤姐问平儿账目。", "平儿低头不答。"],storyState:{facts:["账目有差错"]},routes:[{title:"追问",summary:"凤姐继续追问账册"}]};
const state = {project:{id:"p",title:"测试",protagonist:"平儿",root,nodes:{n:node}},activeNodeId:"n",aiStatus:{},pinnedAssets:[]};
let request, fail=false, continued;
const context = {DATA:{characters},state,GRAPH_ALIASES:{"凤姐":"王熙凤","探春":"贾探春"},asArray:v=>Array.isArray(v)?v:v?[v]:[],clampText:(v,n)=>String(v).slice(0,n),esc:v=>String(v),
 $:element,document:{querySelector:element}, activeNode:()=>node,getNode:id=>id==="root"?root:state.project.nodes[id],getPath:()=>[root,node], openModal:()=>{},closeModals:()=>{},showToast:()=>{}, startBusy:()=>{},stopBusy:()=>{},aiErrorMessage:e=>e.message, aiContinue:(...args)=>continued=args, renderReasoningDelta:()=>{},
 AI:{canUse:()=>true,explorePerspectives:async options=>{request=options;options.onProgress({stage:"selecting",candidateCount:5});options.onReasoning?.("推理片段");options.onProgress({stage:"selected",retrieval:{detail:[{kind:"场景",title:"夹道"}]}});if(fail)throw new Error("测试失败");return {retrieval:{detail:[]},perspectives:[{character:"平儿",observed:"所见",interpretation:"所想",unspoken:"未说"},{character:"王熙凤",observed:"所见",interpretation:"所想",unspoken:"未说"}]};}}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
 vm.runInContext("openPerspectiveLab()",context);
 await vm.runInContext("generatePerspectives()",context);
 assert.match(element("#perspectiveStatus").textContent,/请先选择/);
 vm.runInContext("selectPerspectiveEvent(0)",context);
 assert.match(element("#perspectiveCharacters").innerHTML,/王熙凤/);
 vm.runInContext("togglePerspectiveCharacter('C16'); togglePerspectiveCharacter('C04')",context);
 await vm.runInContext("generatePerspectives()",context);
 assert.deepEqual(Array.from(request.characters),["平儿","王熙凤"]);
 assert.match(element("#perspectiveResults").innerHTML,/用这个视角续写/);
 vm.runInContext("usePerspective(1)",context);
 assert.match(continued[0],/从当前章节之后继续推进/); assert.equal(continued[2].character,"王熙凤");
 fail=true; await vm.runInContext("generatePerspectives()",context);
 assert.match(element("#perspectiveStatus").textContent,/生成失败/); assert.equal(element('[data-action="generate-perspectives"]').disabled,false);
 console.log("event picker, related character selection, submit, errors and continuation: passed");
})().catch(e=>{console.error(e);process.exitCode=1});

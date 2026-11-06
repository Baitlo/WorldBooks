/* 跨界创作测试。
 *
 * 覆盖六层：
 *   1. 注册表与 ID 命名空间（主世界裸 ID、外书带前缀、同名不串）
 *   2. 力量档与仲裁条款（纯函数，不需要模型）
 *   3. 跨书检索（外书卡能命中，但门槛高于主世界）
 *   4. 选卡阶段的提示词（外书只给索引、固定法则不进候选）
 *   5. 正文阶段的提示词（仲裁注入、外书卡带出处、法则不串味）
 *   6. 门禁（没有通达方式时不得生成跨界内容）
 *
 * 运行：node tests/cross_world.test.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const ROOT = process.cwd();
const read = path => fs.readFileSync(`${ROOT}/${path}`, "utf8");

// ── 装载：模拟服务端注入的两段元数据 + 两本书的数据 ──────────────────
const index = JSON.parse(read("worlds/index.json"));
const metas = {};
for (const id of index.worlds) metas[id] = JSON.parse(read(`worlds/${id}/world.json`));

let requests = [];
let selectHandler = () => ({ selected: [] });
let writeHandler = () => ({
  title: "石影",
  content: ["黛玉先看见山石上的浅影，紫鹃顺着她的目光望去。"],
  axes: {},
  routes: ["A", "B", "C"].map(key => ({ key, title: key, summary: "后续", axes: {} })),
  story_state: { facts: ["石影出现"], characters: ["黛玉"], openThreads: ["影从何来"] }
});

function boot(activeWorld = "honglou") {
  const store = {};
  const ctx = {
    console, setTimeout, clearTimeout,
    URLSearchParams, encodeURIComponent, decodeURIComponent, JSON, Math, Date, Number, String, Array, Object, Set, Map, RegExp, Error,
    location: { search: `?world=${activeWorld}`, protocol: "http:" },
    localStorage: {
      getItem: key => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: key => { delete store[key]; }
    },
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, body: { classList: { add() {}, remove() {}, toggle() {} } } },
    fetch: async (url, options = {}) => {
      if (String(url).includes("api/health")) {
        return { ok: true, json: async () => ({ ok: true, model: "deepseek-flash", effort: "low" }) };
      }
      const body = JSON.parse(options.body);
      requests.push(body);
      const system = body.messages?.[0]?.content || "";
      const value = system.includes("选取世界书卡片") ? selectHandler(body) : writeHandler(body);
      return { ok: true, json: async () => ({ content: JSON.stringify(value) }) };
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.WB_WORLD_INDEX = { worlds: index.worlds, assets: index.assets };
  ctx.WB_WORLD_META_MAP = metas;
  vm.createContext(ctx);

  const files = [];
  for (const id of index.worlds) for (const name of metas[id].scripts) files.push(`worlds/${id}/${name}`);
  files.push("registry.js", "ai.js", "bridge.js");
  for (const name of files) vm.runInContext(read(name), ctx, { filename: name });
  return ctx;
}

const ctx = boot("honglou");
const AI = ctx.HL_AI;
const BRIDGE = ctx.HL_BRIDGE;

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}
/* 每条异步用例前复位两个 handler。
 * 它们是有状态的桩：上一条用例改了 writeHandler，下一条就会拿到错的主角正文，
 * 报错信息还指向视角校验，非常难查。复位一次比事后调试便宜。 */
const defaultWrite = writeHandler;
async function testAsync(name, fn) {
  try {
    selectHandler = () => ({ selected: [] });
    writeHandler = defaultWrite;
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

/* ── 1. 注册表与 ID 命名空间 ───────────────────────────────────── */
test("注册表同时装载两本书，主世界为红楼梦", () => {
  assert.deepEqual(Object.keys(ctx.WB_REGISTRY).sort(), ["honglou", "xiyou"]);
  assert.equal(ctx.WB_WORLD, "honglou");
  assert.equal(ctx.WORLDBOOK_DATA.metadata.title.includes("红楼"), true);
});

test("两本书的资产规模与清单一致", () => {
  const h = ctx.WB_REGISTRY.honglou.stats;
  const x = ctx.WB_REGISTRY.xiyou.stats;
  assert.equal(h.assets, 249);
  assert.equal(h.characters, 42);
  assert.equal(x.assets, 191);
  assert.equal(x.characters, 33);
});

test("同名 ID 在不同世界指向不同人物，不会串号", () => {
  // C01 在两本书里都是第一号角色，但绝不是同一个人
  assert.equal(AI.entryOf("C01").item.title, "贾宝玉");
  assert.equal(AI.entryOf("honglou:C01").item.title, "贾宝玉");
  assert.equal(AI.entryOf("xiyou:C01").item.title, "孙悟空");
});

test("主世界裸 ID 归一化后仍是裸 ID，外书必须带前缀", () => {
  assert.equal(AI.normalize("C01"), "C01");
  assert.equal(AI.normalize("honglou:C01"), "C01");
  assert.equal(AI.normalize("xiyou:C01"), "xiyou:C01");
  assert.equal(AI.qualify("C01"), "honglou:C01");
});

test("worldOfId 能分辨资产归属", () => {
  assert.equal(AI.worldOfId("C01"), "honglou");
  assert.equal(AI.worldOfId("xiyou:C01"), "xiyou");
  assert.equal(AI.entryOf("不存在的编号"), null);
});

test("主角解析跨世界可用", () => {
  assert.equal(AI.resolveCharacter("平儿"), "honglou:C16");
  assert.equal(AI.resolveCharacter("孙悟空"), "xiyou:C01");
  assert.equal(AI.resolveCharacter("不存在的人"), "");
});

test("外书条目能取到全量，且每个都带前缀", () => {
  const foreign = AI.entriesOfWorld("xiyou");
  const stats = ctx.WB_REGISTRY.xiyou.stats;
  assert.equal(foreign.length, stats.assets, "应覆盖该书全部资产");
  assert.ok(foreign.every(item => item.id.startsWith("xiyou:")));
  assert.ok(foreign.every(item => item.bare && !item.bare.includes(":")));
  assert.ok(foreign.some(item => item.item.title === "孙悟空"));
  // 主世界条目不在这份列表里
  assert.ok(!foreign.some(item => item.item.title === "贾宝玉"));
});

/* ── 2. 力量档与仲裁条款 ──────────────────────────────────────── */
test("三个力量档齐全且有固定顺序", () => {
  // 来自另一个 vm realm 的数组，原型不同，先转成本 realm 的数组再比
  assert.deepEqual(Array.from(BRIDGE.POWER_ORDER), ["observer", "limited", "open"]);
  for (const id of BRIDGE.POWER_ORDER) {
    assert.ok(BRIDGE.POWER_LEVELS[id].detail.length > 20, `${id} 缺少约束描述`);
  }
});

test("未知力量档回落到受限，而不是放开", () => {
  assert.equal(BRIDGE.powerLevel("不存在").id, "limited");
  assert.equal(BRIDGE.powerLevel(undefined).id, "limited");
});

test("仲裁条款包含六条，且明确主世界优先", () => {
  const text = BRIDGE.arbitration({ primaryName: "红楼梦", foreignNames: ["西游记"], power: "limited" });
  const clauses = text.split("\n").filter(line => /^[一二三四五六]、/.test(line));
  assert.equal(clauses.length, 6, "一至六共六条");
  assert.ok(text.includes("主世界的物理、社会与礼法规则优先"));
  assert.ok(text.includes("核心矛盾必须由主世界"));
  assert.ok(text.includes("不得凭空出现"));
});

test("放开档的仲裁会写明冲突可能失效", () => {
  const text = BRIDGE.arbitration({ primaryName: "红楼梦", foreignNames: ["西游记"], power: "open" });
  assert.ok(text.includes("能力约束（放开）"));
  assert.ok(text.includes("任意施展"));
});

test("没有通达方式时仲裁仍给出条款，但 bridgeBlock 为空", () => {
  assert.equal(BRIDGE.bridgeBlock(null, "limited"), "");
  assert.equal(BRIDGE.bridgeBlock({}, "limited"), "");
  const block = BRIDGE.bridgeBlock({ title: "毫毛石影", mechanism: "悟空拔毫毛化石桥", cost: "燃去一根毫毛" }, "limited");
  assert.ok(block.includes("毫毛石影"));
  assert.ok(block.includes("燃去一根毫毛"));
  assert.ok(block.includes("能力档位：受限"));
});

/* ── 3. 跨书检索 ─────────────────────────────────────────────── */
test("不开跨界时，外书卡不进检索结果", () => {
  const result = AI.retrieveAssets({
    project: { protagonist: "林黛玉" },
    path: [{ id: "root", summary: "潇湘馆" }],
    query: "黛玉想起孙悟空说过的花果山",
    pinned: [],
    crossWorld: false
  });
  assert.ok(result.ids.every(id => !id.startsWith("xiyou:")), "不应出现外书卡");
});

test("开跨界且明确提到外书人物时，外书卡进结果", () => {
  const result = AI.retrieveAssets({
    project: { protagonist: "林黛玉" },
    path: [{ id: "root", summary: "潇湘馆" }],
    query: "黛玉想起孙悟空说过的花果山",
    pinned: [],
    crossWorld: true,
    foreignWorlds: ["xiyou"]
  });
  assert.ok(result.ids.includes("xiyou:C01"), "应命中孙悟空");
  const hit = result.detail.find(item => item.id === "xiyou:C01");
  assert.equal(hit.world, "xiyou");
  assert.ok(hit.reasons.some(reason => reason.includes("跨书")));
});

test("开跨界但没提到外书内容时，不硬塞外书卡", () => {
  const result = AI.retrieveAssets({
    project: { protagonist: "林黛玉" },
    path: [{ id: "root", summary: "潇湘馆" }],
    query: "黛玉在灯下改诗",
    pinned: [],
    crossWorld: true,
    foreignWorlds: ["xiyou"]
  });
  assert.ok(result.ids.every(id => !id.startsWith("xiyou:")), "无关时不应引入外书");
});

test("主世界卡排在外书卡前面，预算先给主世界", () => {
  const result = AI.retrieveAssets({
    project: { protagonist: "林黛玉" },
    path: [{ id: "root", summary: "潇湘馆" }],
    query: "黛玉与孙悟空同在大观园，宝玉也在",
    pinned: [],
    crossWorld: true,
    foreignWorlds: ["xiyou"],
    limit: 10,
    budgetChars: 2600
  });
  const firstForeign = result.ids.findIndex(id => id.startsWith("xiyou:"));
  const lastMain = result.ids.map((id, i) => (id.startsWith("xiyou:") ? -1 : i)).filter(i => i >= 0).pop();
  if (firstForeign >= 0 && lastMain >= 0) assert.ok(lastMain < firstForeign, "主世界应排在前面");
});

test("外书卡注入时带「引自」出处标记", () => {
  const text = AI.worldContext(["C16", "xiyou:C01"], { budgetChars: Infinity }).assetText;
  assert.ok(text.includes("【C16 人物·平儿】"), "主世界卡不加前缀");
  assert.ok(text.includes("【xiyou:C01 人物·孙悟空｜引自《西游记》】"), "外书卡必须标出处");
});

test("固定法则只注入主世界的，不混入外书法则", () => {
  const { ruleText } = AI.worldContext(["C16"], { budgetChars: Infinity });
  assert.ok(ruleText.includes("荣宁二府") || ruleText.includes("礼法"), "应含红楼梦法则");
  assert.ok(!ruleText.includes("三界秩序与神阶"), "不应含西游法则");
  assert.ok(!ruleText.includes("天庭以玉皇大帝为尊"));
});

/* ── 4. 选卡阶段 ─────────────────────────────────────────────── */
async function run() {
  await AI.detect();

  selectHandler = () => ({ selected: [{ id: "xiyou:C01", reason: "悟空经石桥到场" }] });

  await testAsync("选卡提示：跨书时给出外书索引，且外书无摘要", async () => {
    requests = [];
    const project = { protagonist: "林黛玉", title: "木石成隙", prompt: "黛玉察觉园中异样", brief: AI.normalizeBrief({}) };
    const cross = { worlds: ["xiyou"], power: "limited", bridge: { id: "b1", title: "毫毛石影", mechanism: "悟空拔毫毛化石桥" }, bridges: [] };
    await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆", assets: ["S03"] }],
      chosenRoute: null, instruction: "黛玉发现山石上的影子", pinned: [],
      brief: project.brief, cross, onProgress: () => {}
    });
    const system = requests[0].messages[0].content;
    const user = requests[0].messages[1].content;
    assert.ok(system.includes("允许跨界引用"), "system 应声明跨界许可");
    assert.ok(user.includes("xiyou:C01=孙悟空"), "应给出外书人物索引");
    assert.ok(user.includes("跨书引用"), "应有跨书分节");
    assert.ok(user.includes("C01=贾宝玉"), "主世界索引也要在");
    // 外书只给索引，不给摘要：摘要形如「【xiyou:C01 人物·孙悟空】」
    assert.ok(!/【xiyou:C01 人物/.test(user), "外书不应展开摘要");
  });

  await testAsync("选卡提示：不开跨界时不含任何外书内容", async () => {
    requests = [];
    selectHandler = () => ({ selected: [] });
    const project = { protagonist: "林黛玉", title: "木石成隙", prompt: "黛玉察觉园中异样", brief: AI.normalizeBrief({}) };
    await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆", assets: ["S03"] }],
      chosenRoute: null, instruction: "黛玉在灯下改诗", pinned: [], brief: project.brief,
      cross: null, onProgress: () => {}
    });
    const all = requests[0].messages.map(m => m.content).join("\n");
    assert.ok(!all.includes("xiyou:"), "不应出现外书索引");
    assert.ok(!all.includes("允许跨界引用"));
  });

  await testAsync("外书固定卡可以钉住，并带世界标记", async () => {
    requests = [];
    selectHandler = () => ({ selected: [] });
    const project = { protagonist: "林黛玉", title: "木石成隙", prompt: "写一段", brief: AI.normalizeBrief({}) };
    const result = await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆" }],
      chosenRoute: null, instruction: "黛玉独坐", pinned: ["xiyou:C01"],
      brief: project.brief,
      cross: { worlds: ["xiyou"], power: "limited", bridge: { id: "b", title: "毫毛石影", mechanism: "石桥" }, bridges: [] },
      onProgress: () => {}
    });
    const pinned = result.retrieval.detail.find(item => item.id === "xiyou:C01");
    assert.ok(pinned, "固定卡应出现在结果里");
    assert.equal(pinned.world, "xiyou");
    assert.ok(pinned.reasons.some(reason => reason.includes("用户固定") && reason.includes("xiyou")));
  });

  await testAsync("不存在的固定卡会报错，不会静默忽略", async () => {
    const project = { protagonist: "林黛玉", title: "t", prompt: "p", brief: AI.normalizeBrief({}) };
    await assert.rejects(
      () => AI.continueBranch({
        project, path: [{ id: "root", summary: "s" }], chosenRoute: null,
        instruction: "i", pinned: ["xiyou:不存在"], brief: project.brief, onProgress: () => {}
      }),
      /固定卡不存在/
    );
  });

  await testAsync("选卡返回不存在的 ID 时会被拒绝", async () => {
    requests = [];
    // 注意：外书索引会把该书的全部资产列进候选，所以 xiyou:C17 是合法的；
    // 这里必须用一个真正不存在的编号。
    selectHandler = () => ({ selected: [{ id: "xiyou:C99", reason: "不存在的卡" }] });
    const project = { protagonist: "林黛玉", title: "t", prompt: "黛玉改诗", brief: AI.normalizeBrief({}) };
    await assert.rejects(
      () => AI.continueBranch({
        project, path: [{ id: "root", summary: "潇湘馆" }], chosenRoute: null,
        instruction: "黛玉改诗", pinned: [], brief: project.brief,
        cross: { worlds: ["xiyou"], power: "limited", bridge: { id: "b", title: "x", mechanism: "y" }, bridges: [] },
        onProgress: () => {}
      }),
      /选卡 ID 或理由无效/
    );
  });

  /* ── 5. 正文阶段 ──────────────────────────────────────────── */
  await testAsync("正文提示：注入通达设定与六条仲裁", async () => {
    requests = [];
    selectHandler = () => ({ selected: [] });
    writeHandler = () => ({
      title: "石影",
      content: ["黛玉先看见山石上的浅影，紫鹃顺着她的目光望去。"],
      axes: {}, routes: ["A", "B", "C"].map(k => ({ key: k, title: k, summary: "后续", axes: {} })),
      story_state: { facts: ["石影"], characters: ["黛玉"], openThreads: [] }
    });
    const project = { protagonist: "林黛玉", title: "木石成隙", prompt: "写一段", brief: AI.normalizeBrief({}) };
    await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆" }], chosenRoute: null,
      instruction: "黛玉发现影子", pinned: [], brief: project.brief,
      cross: {
        worlds: ["xiyou"], power: "limited",
        bridge: { id: "b1", title: "毫毛石影", mechanism: "悟空拔毫毛化石桥，桥影落进大观园。", opener: "孙悟空", cost: "燃去一根毫毛", visibility: "园中人只觉山石多影" },
        bridges: []
      },
      onProgress: () => {}
    });
    const writePrompt = requests[1].messages[1].content;
    assert.ok(writePrompt.includes("跨界通达设定"), "应有通达设定");
    assert.ok(writePrompt.includes("毫毛石影"));
    assert.ok(writePrompt.includes("燃去一根毫毛"), "代价必须注入");
    assert.ok(writePrompt.includes("跨界仲裁 · 固定规则"), "应有仲裁");
    assert.ok(writePrompt.includes("本作属于《红楼梦》"), "法则归属应是书名而非展示名");
    assert.ok(writePrompt.includes("能力约束（受限）"));
    assert.ok(!writePrompt.includes("三界秩序与神阶"), "西游法则不得串入");
  });

  await testAsync("没有通达方式时，正文提示不注入仲裁（门禁在调用方）", async () => {
    requests = [];
    selectHandler = () => ({ selected: [] });
    const project = { protagonist: "林黛玉", title: "t", prompt: "p", brief: AI.normalizeBrief({}) };
    await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆" }], chosenRoute: null,
      instruction: "黛玉改诗", pinned: [], brief: project.brief,
      cross: { worlds: ["xiyou"], power: "limited", bridge: null, bridges: [] },
      onProgress: () => {}
    });
    const writePrompt = requests[1].messages[1].content;
    assert.ok(!writePrompt.includes("跨界仲裁"), "无通达方式时不应出现仲裁");
    assert.ok(!writePrompt.includes("跨界通达设定"));
  });

  await testAsync("跨界 + 视角实验：视角人物可以是外书人物", async () => {
    requests = [];
    selectHandler = () => ({ selected: [] });
    writeHandler = () => ({
      title: "石影",
      content: ["孙悟空站在山石边，看见园子里的人都低着头走路。他认得这种低头。"],
      axes: {}, routes: ["A", "B", "C"].map(k => ({ key: k, title: k, summary: "后续", axes: {} })),
      story_state: { facts: [], characters: ["悟空"], openThreads: [] }
    });
    const project = { protagonist: "林黛玉", title: "木石成隙", prompt: "写一段", brief: AI.normalizeBrief({}) };
    const result = await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆" }], chosenRoute: null,
      instruction: "从悟空眼里看园子", pinned: [], brief: project.brief,
      perspective: { character: "孙悟空", observed: "园中人低头走路", interpretation: "这府里的人不敢抬头", unspoken: "这地方压人" },
      cross: { worlds: ["xiyou"], power: "limited", bridge: { id: "b", title: "毫毛石影", mechanism: "石桥" }, bridges: [] },
      onProgress: () => {}
    });
    const required = result.retrieval.detail.find(item => item.id === "xiyou:C01");
    assert.ok(required, "视角人物应被强制带入上下文");
    assert.equal(required.world, "xiyou");
  });

  await testAsync("模型重复选中主角时不会重复注入（主世界裸 ID 与带前缀 ID 同一张卡）", async () => {
    requests = [];
    // 上一条用例把 writeHandler 改成了「悟空视角」，这里必须复位，否则会撞视角校验
    writeHandler = () => ({
      title: "夜坐",
      content: ["黛玉独坐在灯下，听见窗外竹叶响，没有起身。"],
      axes: {}, routes: ["A", "B", "C"].map(k => ({ key: k, title: k, summary: "后续", axes: {} })),
      story_state: { facts: [], characters: ["黛玉"], openThreads: [] }
    });
    // 主角 C02 由程序强制带入；模型又选一次，返回的是带世界前缀的写法
    selectHandler = () => ({ selected: [{ id: "honglou:C02", reason: "黛玉本人在场" }] });
    const project = { protagonist: "林黛玉", title: "木石成隙", prompt: "写一段", brief: AI.normalizeBrief({}) };
    const result = await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆" }], chosenRoute: null,
      instruction: "黛玉独坐", pinned: [], brief: project.brief, onProgress: () => {}
    });
    const ids = result.retrieval.detail.map(item => item.id);
    assert.equal(new Set(ids).size, ids.length, `不应有重复卡：${ids.join("、")}`);
    const protagonistHits = result.retrieval.detail.filter(item => item.id === "C02");
    assert.equal(protagonistHits.length, 1, "主角只应出现一次");
  });

  /* ── 5b. 引用既有作品 ─────────────────────────────────────── */
  await testAsync("引用作品的事实会写进正文提示，并声明优先于原著", async () => {
    requests = [];
    writeHandler = () => ({
      title: "旧账",
      content: ["黛玉听紫鹃说起悟空当年来过，只当他又是玩笑。"],
      axes: {}, routes: ["A", "B", "C"].map(k => ({ key: k, title: k, summary: "后续", axes: {} })),
      story_state: { facts: [], characters: [], openThreads: [] }
    });
    const project = { protagonist: "林黛玉", title: "木石成隙", prompt: "写一段", brief: AI.normalizeBrief({}) };
    await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆" }], chosenRoute: null,
      instruction: "黛玉听人说起旧事", pinned: [], brief: project.brief,
      cross: {
        worlds: ["xiyou"], power: "limited",
        bridge: { id: "b1", title: "毫毛石影", mechanism: "悟空拔毫毛化石桥" },
        bridges: [],
        works: [{
          id: "w1", world: "xiyou", title: "悟空的一笔旧账", protagonist: "孙悟空", book: "《西游记》",
          premise: "花果山老猴来报旧部被围。",
          facts: ["悟空讨到半日假", "老猴是有人派来的"],
          characters: ["唐僧已知此事"],
          openThreads: ["黄纸是谁的"],
          assets: ["C01", "C02"]
        }]
      },
      onProgress: () => {}
    });
    const prompt = requests[1].messages[1].content;
    assert.ok(prompt.includes("引用的既有作品"), "应有引用作品段");
    assert.ok(prompt.includes("《悟空的一笔旧账》"), "作品标题要出现");
    assert.ok(prompt.includes("悟空讨到半日假"), "已发生事实要出现");
    assert.ok(prompt.includes("黄纸是谁的"), "未解决线索要出现");
    assert.ok(prompt.includes("不是任何一本书的原著"), "必须声明这是作者自己的设定");
    assert.ok(prompt.includes("与本作当前事实冲突时，以本作为准"), "优先级要写清");
  });

  await testAsync("没有引用作品时不出现该段", async () => {
    requests = [];
    const project = { protagonist: "林黛玉", title: "t", prompt: "p", brief: AI.normalizeBrief({}) };
    await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆" }], chosenRoute: null,
      instruction: "黛玉改诗", pinned: [], brief: project.brief,
      cross: { worlds: ["xiyou"], power: "limited", bridge: { id: "b", title: "x", mechanism: "y" }, bridges: [], works: [] },
      onProgress: () => {}
    });
    assert.ok(!requests[1].messages[1].content.includes("引用的既有作品"));
  });

  await testAsync("引用作品用过的卡进候选池并获得加成", async () => {
    requests = [];
    selectHandler = () => ({ selected: [] });
    // 先单独验检索层：boost 应把这几张卡顶上来，并带「引用作品用过」的理由
    const local = AI.retrieveAssets({
      project: { protagonist: "林黛玉" },
      path: [{ id: "root", summary: "潇湘馆" }],
      query: "黛玉独坐", pinned: [], limit: 26,
      crossWorld: true, foreignWorlds: ["xiyou"],
      boost: ["xiyou:C01", "xiyou:C02"]
    });
    const boosted = local.detail.filter(item => item.reasons.some(r => r.includes("引用作品用过")));
    assert.ok(boosted.length > 0, `检索层应给引用加成：${local.ids.join("、")}`);
    assert.ok(boosted.every(item => item.id.startsWith("xiyou:")));

    // 再验选卡提示：这些卡必须以摘要形式出现在候选里，模型才选得到
    const project = { protagonist: "林黛玉", title: "t", prompt: "p", brief: AI.normalizeBrief({}) };
    await AI.continueBranch({
      project, path: [{ id: "root", summary: "潇湘馆" }], chosenRoute: null,
      instruction: "黛玉独坐", pinned: [], brief: project.brief,
      cross: {
        worlds: ["xiyou"], power: "limited", bridge: { id: "b", title: "x", mechanism: "y" }, bridges: [],
        works: [{ id: "w1", world: "xiyou", title: "旧账", facts: [], assets: ["C01", "C02"] }]
      },
      onProgress: () => {}
    });
    const prompt = requests[0].messages[1].content;
    assert.ok(prompt.includes("引自既有作品"), "应有引用作品分节");
    assert.ok(/【xiyou:C0[12] /.test(prompt), "引用作品的卡应以摘要形式给到模型");
  });

  /* ── 6. 三层披露的成本断言 ─────────────────────────────────── */
  test("L0 索引显著小于全摘要池", () => {
    const single = AI.indexCatalog({ worlds: ["honglou"], chars: 2600 });
    const D = ctx.WORLDBOOK_DATA;
    const S = ctx.STUDIO_DATA;
    const full = [...D.rules.filter(r => !S.coreRules.includes(r.id)), ...D.worldbuilding,
      ...D.canon_timeline, ...D.quests, ...D.relationship_edges, ...D.locations, ...D.styles]
      .reduce((sum, x) => sum + String(x.summary || x.content || x.description || x.hook || x.identity || "").slice(0, 120).length, 0);
    assert.ok(single.chars < full * 0.3, `索引 ${single.chars} 应低于全摘要 ${full} 的 30%`);
  });

  test("索引里不含固定法则（避免每节重复噪音）", () => {
    const single = AI.indexCatalog({ worlds: ["honglou"], chars: 4000 });
    const text = single.groups.map(g => g.text).join("、");
    for (const id of ctx.STUDIO_DATA.coreRules) {
      assert.ok(!text.includes(`${id}=`), `固定法则 ${id} 不应进索引`);
    }
  });

/* ── 7. 反向跨界：西游记做主世界，红楼梦做外书 ────────────────────
 * 上面的用例都是红楼梦为主。如果不测反向，很容易漏掉「主世界假设写死在代码里」的问题。 */
  const reverse = boot("xiyou");
  const RAI = reverse.HL_AI;
  const RBRIDGE = reverse.HL_BRIDGE;

  await testAsync("反向：主世界切换为西游记，红楼梦成为外书", async () => {
    assert.equal(reverse.WB_WORLD, "xiyou");
    assert.equal(RAI.entryOf("C01").item.title, "孙悟空", "裸 ID 应指向西游记");
    assert.equal(RAI.entryOf("honglou:C01").item.title, "贾宝玉", "带前缀应指向红楼梦");
    assert.equal(RAI.resolveCharacter("平儿"), "honglou:C16");
    assert.equal(RAI.resolveCharacter("孙悟空"), "xiyou:C01");
  });

  await testAsync("反向：固定法则取西游记的，不混红楼梦", async () => {
    const { ruleText } = RAI.worldContext(["C01"], { budgetChars: Infinity });
    assert.ok(ruleText.includes("三界") || ruleText.includes("天庭"), "应含西游法则");
    assert.ok(!ruleText.includes("荣宁二府"), "不应含红楼梦法则");
  });

  await testAsync("反向：仲裁的法则归属是《西游记》", async () => {
    const text = RBRIDGE.arbitration({ primaryName: "西游记", foreignNames: ["红楼梦"], power: "observer" });
    assert.ok(text.includes("本作属于《西游记》"));
    assert.ok(text.includes("《红楼梦》的人物与物件"));
    assert.ok(text.includes("能力约束（旁观）"));
  });

  await testAsync("反向：红楼梦卡注入时带引自《红楼梦》", async () => {
    const text = RAI.worldContext(["C01", "honglou:C01"], { budgetChars: Infinity }).assetText;
    assert.ok(text.includes("【C01 人物·孙悟空】"), "主世界裸 ID 不加前缀");
    assert.ok(text.includes("【honglou:C01 人物·贾宝玉｜引自《红楼梦》】"));
  });

  await testAsync("反向：跨书检索能命中红楼梦人物", async () => {
    const result = RAI.retrieveAssets({
      project: { protagonist: "孙悟空" },
      path: [{ id: "root", summary: "取经路上" }],
      query: "悟空想起平儿说过荣国府的事",
      pinned: [], crossWorld: true, foreignWorlds: ["honglou"]
    });
    assert.ok(result.ids.includes("honglou:C16"), "应命中平儿");
    assert.ok(result.ids.includes("C01"), "主世界主角仍应在场");
  });

  /* ── 8. 多外书与边界 ──────────────────────────────────────── */
  test("只邀请一本外书时，另一本不会混入", () => {
    const result = AI.retrieveAssets({
      project: { protagonist: "林黛玉" },
      path: [{ id: "root", summary: "潇湘馆" }],
      query: "黛玉与孙悟空、平儿同席",
      pinned: [], crossWorld: true, foreignWorlds: ["xiyou"]
    });
    // 平儿属于主世界，应出现；但若世上还有第三本书，也不该出现
    assert.ok(result.ids.every(id => !id.startsWith("honglou:")), "主世界不应带前缀");
    assert.ok(!result.ids.some(id => id.startsWith("sanguo:")), "未邀请的世界不得出现");
  });

  test("外书 ID 大小写与前缀格式错误不会崩", () => {
    assert.equal(AI.entryOf("XIYOU:C01"), null, "世界名区分大小写");
    assert.equal(AI.entryOf("xiyou:"), null);
    assert.equal(AI.entryOf(":C01"), null);
    assert.equal(AI.worldOfId(":C01"), "");
  });

  test("空跨界配置等同于不跨界", () => {
    const result = AI.retrieveAssets({
      project: { protagonist: "林黛玉" },
      path: [{ id: "root", summary: "潇湘馆" }],
      query: "孙悟空",
      pinned: [], crossWorld: false, foreignWorlds: []
    });
    assert.ok(result.ids.every(id => !id.includes(":")));
  });


  /* ── 汇总 ─────────────────────────────────────────────────── */
  const failed = results.filter(item => !item.ok);
  for (const item of results) {
    console.log(`${item.ok ? "  ok  " : " FAIL "} ${item.name}`);
    if (!item.ok) console.log(`        ${item.error.message}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

run().catch(error => {
  console.error("测试运行失败：", error);
  process.exitCode = 1;
});


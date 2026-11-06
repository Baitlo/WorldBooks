(() => {
  "use strict";

  const DATA = window.WORLDBOOK_DATA;
  const STUDIO = window.STUDIO_DATA;
  const AI = window.HL_AI;
  if (!DATA || !STUDIO) return;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const icon = (name, className = "") => `<svg class="icon ${className}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
  const clampText = (value, length = 80) => String(value || "").length > length ? `${String(value).slice(0, length)}…` : String(value || "");
  const STORAGE_KEY = window.WB_WORLD_META?.storageKey || "honglou-worldbook-studio-v2";
  const ASSET_BASE = window.WB_ASSET_BASE || "assets/";
  const THEME_KEY = `worldbook-theme-${window.WB_WORLD || "honglou"}`;
  // 当前世界书的界面文案；缺字段时回落到红楼梦的措辞，避免旧版本数据崩坏。
  const UI = { ...(window.WB_WORLDS?.honglou ? {} : {}), ...(STUDIO.ui || {}) };
  const WORLD_META = window.WB_WORLD_META || { name: "红楼梦", book: "《红楼梦》", seal: "梦", cover: "红" };
  const AXES = ["view", "conflict", "cast", "tone", "development"];

  function buildEntries() {
    const entries = [];
    DATA.rules.forEach(item => entries.push({ ...item, category: "rule", categoryName: "创作法则", sourceLabel: "写作约束" }));
    (DATA.worldbuilding || []).forEach(item => entries.push({
      ...item,
      category: "world",
      categoryName: "世界设定",
      sourceLabel: "世界事实",
      isDerivative: false,
      content: `${item.summary} ${item.content}`
    }));
    DATA.canon_timeline.forEach(item => entries.push({ ...item, category: "event", categoryName: "剧情事件", sourceLabel: "原著事件", isDerivative: false }));
    DATA.quests.forEach(item => entries.push({
      ...item,
      category: "event",
      categoryName: "剧情事件",
      sourceLabel: "二创素材",
      isDerivative: true,
      content: `${item.hook} ${item.outcome}`,
      keywords: [item.title, item.type, "原创事件"]
    }));
    DATA.characters.forEach(item => entries.push({ ...item, category: "character", categoryName: "角色档案", sourceLabel: "原著人物" }));
    DATA.relationship_edges.forEach(edge => entries.push({ ...edge, id: `REL_${edge.source}_${edge.target}`, title: `${edge.source} · ${edge.target}`, category: "relation", categoryName: "人物关系", sourceLabel: "人物关系", content: `${edge.relationship}；边界：${edge.constraint}`, keywords: [edge.source, edge.target] }));
    DATA.locations.forEach(item => entries.push({ ...item, category: "location", categoryName: "场景档案", sourceLabel: "原著场景" }));
    DATA.styles.forEach(item => entries.push({ ...item, category: "style", categoryName: "文学风格", sourceLabel: "写作约束", priority: "high" }));
    return entries;
  }

  const ENTRIES = buildEntries();
  const ENTRY_MAP = new Map(ENTRIES.map(item => [item.id, item]));
  const GRAPH_ALIASES = STUDIO.graphAliases || {};
  const GENERIC = STUDIO.generic || {};

  function genericProfile(name, prompt) {
    const character = DATA.characters.find(item => item.title === name) || DATA.characters[0];
    const displayName = character.title;
    const fill = value => String(value || "").replaceAll("{name}", displayName).replaceAll("{prompt}", prompt);
    const makeRoute = (id, type, title, summary, core, axes, content) => ({ id, key: id, type, title, summary, core, axes, content: [content] });
    const routes = asArray(GENERIC.routes);
    if (routes.length === 3) {
      return {
        id: character.id,
        projectTitle: `${displayName}${GENERIC.projectSuffix || "的别章"}`,
        title: GENERIC.title || "一段未写下的事",
        viewpoint: fill(GENERIC.viewpoint || "{name}限知视角"),
        conflict: GENERIC.conflict || "本心与世故",
        premise: fill(GENERIC.premise || "以{name}为感知中心，从一件不改动原著主线的小事切入。创作需求：{prompt}。"),
        assets: [character.id, "R02", "L01", "L03"],
        routes: routes.map((route, index) => makeRoute(["A", "B", "C"][index], route.type, route.title, fill(route.summary), asArray(route.core), Object.fromEntries(Object.entries(route.axes || {}).map(([key, value]) => [key, fill(value)])), fill(route.content)))
      };
    }
    return {
      id: character.id,
      projectTitle: `${displayName}的别章`,
      title: "一件未曾写下的小事",
      viewpoint: `${displayName}限知视角`,
      conflict: "本心与世故",
      premise: `以${displayName}为感知中心，从一件不改动原著主线的日常小事切入。创作需求：${prompt}。先让人物的身份、动机和知情范围决定故事能走向何处。`,
      assets: [character.id, "R02", "L01", "L03"],
      routes: [
        makeRoute("A", "人物心理", "灯下独白", `贴近${displayName}的内心，以一件旧物唤起不愿明说的顾虑。`, ["限知内心", "旧物意象", "情感克制"], { view: `${displayName}内心`, conflict: "本心与克制", cast: `${displayName}独处`, tone: "含蓄低回", development: "辨认真实动机" }, `夜里很静，${displayName}还没有睡。手边那件旧物并不起眼，却叫白日里的一句话重新有了分量。${displayName}伸手想将它收起，停了停，仍留在原处。有些心思一旦说破，便连回避的余地也没有了。`),
        makeRoute("B", "人物关系", "一席未尽之言", `让${displayName}与一位关系密切的人物交锋，以潜台词呈现亲近中的距离。`, ["双人对话", "潜台词", "关系变化"], { view: "双人对手戏", conflict: "亲近与分寸", cast: `${displayName}与旧识`, tone: "机锋含蓄", development: "关系出现新理解" }, `茶已经换过一回，两人仍没有说到正题。${displayName}只听对方谈近来的风、旧日的事，句句都像无关，句句又都绕着那件事。末了，${displayName}道：“今日的话倒比茶还淡。”对方也笑，却没有再接。`),
        makeRoute("C", "群像叙事", "众人各说一词", `同一件小事由不同位置的人分别讲述，让${displayName}在不同版本之间作出判断。`, ["多方证词", "世态", "有限知情"], { view: "多人轮转", conflict: "事实与立场", cast: `${displayName}与众人`, tone: "复调微讽", development: "发现信息传播链" }, `事情传到第三个人嘴里，已经换了一副模样。一个人只说亲眼所见，另一个添了两分猜测，到了上位者那里，猜测竟成了凭据。${displayName}没有急着辨明，只问每句话究竟是谁先说起的。`)
      ]
    };
  }

  function detectProfile(prompt) {
    const protagonists = STUDIO.protagonists || {};
    const specialized = Object.keys(protagonists).find(name => prompt.includes(name));
    if (specialized) return protagonists[specialized];
    const character = DATA.characters.find(item => item.title && prompt.includes(item.title)) || DATA.characters.find(item => asArray(item.keywords).some(keyword => keyword.length > 1 && prompt.includes(keyword)));
    return character ? genericProfile(character.title, prompt) : protagonists[Object.keys(protagonists)[0]] || genericProfile(DATA.characters[0].title, prompt);
  }

  function createProject(prompt = STUDIO.defaultPrompt, material = null, generated = null) {
    const profile = generated ? {
      id: (DATA.characters.find(item => prompt.includes(item.title)) || {}).id || "AI",
      projectTitle: generated.projectTitle,
      title: generated.premise.slice(0, 12).replace(/[。，、；：]$/, ""),
      viewpoint: generated.viewpoint,
      conflict: generated.routes[0]?.axes.conflict || "本心与世故",
      premise: generated.premise,
      assets: generated.assets.length ? generated.assets : ["R02", "L01"],
      routes: generated.routes.map(route => ({ ...route, content: null, next: null }))
    } : detectProfile(prompt);
    const now = new Date().toISOString();
    return {
      id: `bk_${now.replace(/[-:.TZ]/g, "")}_${Math.random().toString(36).slice(2, 6)}`,
      title: profile.projectTitle,
      prompt,
      protagonist: generated ? generated.protagonist : Object.keys(STUDIO.protagonists || {}).find(name => STUDIO.protagonists[name] === profile) || profile.projectTitle.replace(GENERIC.projectSuffix || "的别章", ""),
      profile,
      boundary: generated?.boundary || "不改动原著主要剧情",
      brief: AI.normalizeBrief(generated?.brief, {
        ...AI.DEFAULT_BRIEF,
        pov: generated?.viewpoint ? "第三人称限知" : AI.DEFAULT_BRIEF.pov
      }),
      generatedBy: generated ? aiStatusText() : "本地预设",
      material,
      root: {
        id: "root", parentId: null, routeId: "root", key: "序", title: profile.title,
        type: "创作起点", summary: profile.premise, content: null, routes: profile.routes,
        assets: [...profile.assets], depth: 0, status: "已保存", createdAt: now
      },
      nodes: {},
      createdAt: now,
      updatedAt: now,
      lastNodeId: "root",
      aiEval: null
    };
  }

  /* 作品架：本机可同时保存多部作品。旧版只存单部 project，启动时无损迁移。 */
  function loadLibrary() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.projects?.length) {
        const projects = saved.projects.filter(item => item?.root?.routes && item.nodes);
        if (projects.length) return { projects, activeProjectId: saved.activeProjectId, pinnedAssets: saved.pinnedAssets || [], aiEval: saved.aiEval || null };
      }
      if (saved?.project?.root?.routes && saved.project.nodes) {
        // 旧版单项目结构：整体迁入作品架，读到的节点与 AI 评审记录跟随作品。
        saved.project.lastNodeId = saved.activeNodeId || "root";
        saved.project.aiEval = saved.aiEval || null;
        return { projects: [saved.project], activeProjectId: null, pinnedAssets: saved.pinnedAssets || [], aiEval: null };
      }
    } catch (_) { /* A fresh demo is used when local storage is unavailable or invalid. */ }
    return null;
  }

  const library = loadLibrary();
  const state = {
    view: "world",
    category: "all",
    assetSearch: "",
    graphFilter: "all",
    graphFocus: null,
    theme: localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light",
    assistantMode: "create",
    freshCreation: false,
    chat: null,
    projects: library?.projects || [createProject()],
    project: null,
    activeNodeId: "root",
    // pinned：用户显式固定的卡，每次续写必带
    pinnedAssets: library?.pinnedAssets || [],
    // auto：上一次检索命中的卡，仅用于界面展示"本次自动引用"
    lastRetrieval: null,
    // 刚生成完的节点做一次流式渐显，过期后常规渲染，避免切换节点时反复播动画。
    revealNode: null,
    treeZoom: 1,
    attachedMaterial: null,
    currentDocId: null,
    evalTab: "quality",
    qualityResults: null,
    benchmarkA: null,
    benchmarkB: null,
    compareVisible: false,
    aiStatus: { ready: false, mode: "demo", model: "", models: [], reason: "正在检测", keyHint: "" },
    aiBusy: null,
    // 跨界设置：worlds 为引入的外书 ID，power 为力量档，bridge 为已选通达方式
    cross: null,
    crossDraft: null,
    aiError: null,
    aiEval: null,
    lastGeneration: null
  };

  // 每部作品补齐新字段并迁移旧数据，再定位上次读到的作品与节点。
  state.projects.forEach(project => {
    project.id = project.id || `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    // 旧作品没有 cross 字段：补成「未启用跨界」，不改变既有行为。
    if (project.cross === undefined) project.cross = null;
    project.lastNodeId = project.lastNodeId || "root";
    if (project.aiEval === undefined) project.aiEval = null;
    if (!Array.isArray(project.pinnedAssets)) project.pinnedAssets = project.id === library?.activeProjectId || state.projects.length === 1 ? [...(library?.pinnedAssets || [])] : [];
    migrateTitles(project);
    migrateBrief(project);
    Object.values(project.nodes).forEach(node => { node.parentId = node.parentId ?? "root"; });
  });
  state.project = state.projects.find(item => item.id === library?.activeProjectId) || state.projects[0];
  state.pinnedAssets = [...state.project.pinnedAssets];
  state.activeNodeId = state.project.lastNodeId;
  if (state.activeNodeId !== "root" && !getNode(state.activeNodeId)) state.activeNodeId = "root";
  state.attachedMaterial = state.project.material || null;
  state.aiEval = state.project.aiEval || null;


  function migrateTitles(project) {
    Object.values(project.nodes).forEach(node => {
      if (node.customPrompt && (!node.title || node.title.endsWith("…"))) node.title = customTitle(node.customPrompt);
    });
  }

  // 旧项目没有 brief 字段，补一份默认任务卡，避免界面空白。
  function migrateBrief(project) {
    project.brief = AI.normalizeBrief(project.brief);
  }

  const RECOVERY_KEY = `${STORAGE_KEY}-unsynced`;
  // 世界书 ID 跟着每个作品库请求走，服务端按世界分表。
  const WORLD_ID = (typeof window !== "undefined" && window.WB_WORLD) || "honglou";
  const LIBRARY_URL = `api/library?world=${encodeURIComponent(WORLD_ID)}`;
  const MIGRATED_KEY = `${STORAGE_KEY}-server-migrated`;
  let syncRevision = null, syncPending = null, syncSending = false, syncConflict = false;
  let syncSequence = 0, syncNetworkError = false;

  function librarySnapshot() {
    return { projects: state.projects, activeProjectId: state.project.id, pinnedAssets: state.pinnedAssets, aiEval: state.aiEval };
  }

  function showSync(message, mode = "") {
    const banner = $("#librarySync");
    if (!banner) return;
    if (!message) { banner.classList.add("hidden"); return; }
    banner.classList.remove("hidden");
    banner.innerHTML = `<span>${esc(message)}</span>${mode === "offline" ? '<button data-action="retry-library-sync">重试同步</button>' : ""}${mode === "conflict" ? '<button data-action="export-unsynced-library">导出本机备份</button><button data-action="reload-library">刷新共享作品架</button>' : ""}`;
  }

  function applyLibrary(saved) {
    const projects = saved.projects.filter(item => item?.root?.routes && item.nodes);
    if (!projects.length) throw new Error("服务器作品库格式无效");
    state.projects = projects;
    state.projects.forEach(project => {
      project.lastNodeId = project.lastNodeId || "root";
      if (!Array.isArray(project.pinnedAssets)) project.pinnedAssets = [];
      migrateTitles(project); migrateBrief(project);
      Object.values(project.nodes).forEach(node => { node.parentId = node.parentId ?? "root"; });
    });
    state.project = projects.find(item => item.id === saved.activeProjectId) || projects[0];
    state.pinnedAssets = [...state.project.pinnedAssets];
    state.activeNodeId = state.project.lastNodeId !== "root" && getNode(state.project.lastNodeId) ? state.project.lastNodeId : "root";
    state.aiEval = state.project.aiEval || null;
    state.attachedMaterial = state.project.material || null;
  }

  function persist() {
    state.project.updatedAt = new Date().toISOString();
    state.project.lastNodeId = state.activeNodeId;
    state.project.aiEval = state.aiEval;
    if (!state.freshCreation) state.project.pinnedAssets = [...state.pinnedAssets];
    const snapshot = JSON.stringify(librarySnapshot());
    syncPending = { snapshot, sequence: ++syncSequence };
    try {
      localStorage.setItem(STORAGE_KEY, snapshot);
      localStorage.setItem(RECOVERY_KEY, snapshot);
    } catch (_) { showSync("浏览器本地备份失败；请等待服务器保存成功，勿关闭页面。", "offline"); }
    if (syncRevision !== null && !syncConflict) flushLibrary();
  }

  async function flushLibrary() {
    if (syncSending || !syncPending || syncRevision === null || syncConflict) return;
    syncSending = true;
    const pending = syncPending;
    try {
      const response = await fetch(LIBRARY_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ world: WORLD_ID, revision: syncRevision, library: JSON.parse(pending.snapshot) }) });
      const result = await response.json();
      if (response.status === 409) {
        syncConflict = true;
        showSync("另一设备已更新作品架，本机修改尚未同步。请先导出本机备份，再刷新查看共享作品架。", "conflict");
        return;
      }
      if (!response.ok) throw new Error(result.message || "保存失败");
      syncRevision = result.revision;
      syncNetworkError = false;
      if (syncPending?.sequence === pending.sequence) {
        syncPending = null;
        try { localStorage.removeItem(RECOVERY_KEY); localStorage.setItem(MIGRATED_KEY, "1"); } catch (_) {}
        showSync("");
      }
    } catch (_) {
      syncNetworkError = true;
      showSync("无法保存到服务器；修改暂存在此浏览器，请保持页面打开并重试。", "offline");
    } finally {
      syncSending = false;
      if (syncPending && !syncConflict && !syncNetworkError) flushLibrary();
    }
  }

  async function initializeLibrary() {
    try {
      const response = await fetch(LIBRARY_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("无法读取服务器作品库");
      const remote = await response.json();
      syncRevision = remote.revision;
      const migrated = localStorage.getItem(MIGRATED_KEY) === "1";
      const recovery = localStorage.getItem(RECOVERY_KEY);
      if (remote.library) {
        const serverLibrary = remote.library;
        if (!migrated && library?.projects?.length) {
          // 相同 ID 的内容有分歧时保留两份，不猜测哪台设备的版本更重要。
          for (const oldProject of library.projects) {
            const existing = serverLibrary.projects.find(item => item.id === oldProject.id);
            if (!existing) serverLibrary.projects.push(oldProject);
            else if (JSON.stringify(existing) !== JSON.stringify(oldProject)) {
              const copy = JSON.parse(JSON.stringify(oldProject));
              copy.id = `${copy.id}-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              copy.title = `${copy.title}（本机导入副本）`;
              serverLibrary.projects.push(copy);
            }
          }
          applyLibrary(serverLibrary);
          persist();
        } else {
          applyLibrary(serverLibrary);
          if (recovery) {
            syncPending = { snapshot: recovery, sequence: ++syncSequence };
            syncConflict = true;
            showSync("发现上次未同步的本机修改；请先导出备份，再刷新共享作品架。", "conflict");
          } else {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serverLibrary)); localStorage.setItem(MIGRATED_KEY, "1"); } catch (_) {}
          }
        }
      } else {
        persist();
      }
    } catch (_) {
      syncNetworkError = true;
      showSync("无法连接共享作品库；当前显示本机缓存，修改尚未同步。", "offline");
    }
    renderAll();
    setupTreeZoomGestures();
    detectAI();
  }

  async function retryLibrarySync() {
    if (syncRevision === null) {
      // 先拉取服务器版本；不能用离线数据盲目覆盖服务器。
      syncConflict = true;
      showSync("连接恢复后请先导出本机备份，再刷新以读取共享作品架。", "conflict");
      return;
    }
    syncNetworkError = false;
    if (syncPending) await flushLibrary();
    else showSync("");
  }

  async function checkLibraryUpdates() {
    if (syncRevision === null || syncSending || syncPending || syncConflict || state.aiBusy || document.hidden) return;
    try {
      const response = await fetch(LIBRARY_URL, { cache: "no-store" });
      if (!response.ok) return;
      const remote = await response.json();
      if (remote.revision !== syncRevision) {
        syncConflict = true;
        showSync("另一设备已更新共享作品架。请刷新以查看最新内容。", "conflict");
      }
    } catch (_) { /* 下一次保存时明确提示网络错误 */ }
  }

  function selectProject(id) {
    const target = state.projects.find(item => item.id === id);
    if (!target || target === state.project) return;
    persist(); // 先把当前作品的落点写进存档
    state.project = target;
    state.pinnedAssets = [...(target.pinnedAssets || [])];
    state.activeNodeId = target.lastNodeId !== "root" && getNode(target.lastNodeId) ? target.lastNodeId : "root";
    state.aiEval = target.aiEval || null;
    state.attachedMaterial = target.material || null;
    state.qualityResults = null;
    state.benchmarkA = null;
    state.benchmarkB = null;
    state.compareVisible = false;
    state.lastRetrieval = null;
    state.freshCreation = false;
    persist();
    renderAssistant();
    renderComposerContext();
    renderEvaluation();
    renderProject();
    showToast(`已切换到《${target.title}》`);
  }

  function deleteProject(id) {
    const target = state.projects.find(item => item.id === id);
    if (!target) return;
    if (!window.confirm(`确定删除《${target.title}》？该作品在共享作品架中的全部分支与正文都会被清除。`)) return;
    state.projects = state.projects.filter(item => item !== target);
    if (state.project === target) {
      if (!state.projects.length) state.projects = [createProject()];
      state.project = state.projects[0];
      state.pinnedAssets = [...(state.project.pinnedAssets || [])];
      state.activeNodeId = state.project.lastNodeId !== "root" && getNode(state.project.lastNodeId) ? state.project.lastNodeId : "root";
      state.aiEval = state.project.aiEval || null;
      state.attachedMaterial = state.project.material || null;
      state.qualityResults = null;
      state.benchmarkA = null;
      state.benchmarkB = null;
      state.compareVisible = false;
      state.lastRetrieval = null;
      state.freshCreation = false;
      renderAssistant();
      renderComposerContext();
      renderEvaluation();
    }
    persist();
    renderProject();
    showToast(`已删除《${target.title}》`);
  }

  function getNode(id = state.activeNodeId) {
    return id === "root" ? state.project.root : state.project.nodes[id];
  }

  /* 生成失败或切换到新项目后，activeNodeId 可能指向并不存在的节点。
     这里统一回退到创作起点，避免整个助手因为一个悬空 id 而渲染失败。 */
  function activeNode() {
    const node = getNode();
    if (node) return node;
    state.activeNodeId = "root";
    return state.project.root;
  }

  function getPath(id = state.activeNodeId) {
    const path = [];
    let node = getNode(id);
    const guard = new Set();
    while (node && !guard.has(node.id)) {
      path.unshift(node);
      guard.add(node.id);
      node = node.parentId ? getNode(node.parentId) : null;
    }
    return path;
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `${icon(type === "success" ? "check" : "info")}<span>${esc(message)}</span>`;
    $("#toastRegion").appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  function downloadFile(name, content, type = "application/json;charset=utf-8") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      showToast(copied ? successMessage : "复制失败，请手动选择文本", copied ? "success" : "info");
    }
  }

  /* ---------- DeepSeek integration ---------- */
  // AI 必须在 migrateBrief / createProject 之前就可用，否则会撞上暂时性死区。

  function aiStatusText() {
    // 界面只显示"DeepSeek"；模型、思考强度等细节留在设置面板里。
    return state.aiStatus.ready ? "DeepSeek" : "离线演示模式";
  }

  function aiStatusBadge() {
    const status = state.aiStatus;
    if (status.ready) return { cls: "ai-status-live", dot: "", badge: status.mode === "server" ? "本站代理" : "直连" };
    return { cls: "ai-status-demo", dot: "", badge: "演示" };
  }

  function renderAiStatus() {
    const line = $("#aiStatusLine");
    const meta = aiStatusBadge();
    line.className = meta.cls;
    line.innerHTML = `<span class="online-dot"></span>${esc(aiStatusText())}<span class="demo-badge">${meta.badge}</span>`;
    const sidebar = $("#sidebarAiStatus");
    if (sidebar) sidebar.textContent = state.aiStatus.ready ? "DeepSeek" : "离线演示";
    const disclaimer = $("#composerDisclaimer");
    if (state.aiStatus.ready) {
      disclaimer.textContent = state.aiStatus.mode === "server"
        ? "DeepSeek 真实生成 · 密钥保留在本地代理"
        : "DeepSeek 真实生成 · 密钥保存在本机浏览器";
    } else {
      disclaimer.textContent = state.aiStatus.reason || "离线演示模式：在设置中接入 DeepSeek 后改为真实生成";
    }
  }

  async function detectAI() {
    try {
      state.aiStatus = await AI.detect();
    } catch (_) {
      state.aiStatus = { ready: false, mode: "demo", model: "", models: [], reason: "AI 通道检测失败", keyHint: "" };
    }
    if (state.aiStatus.ready) state.aiError = null;
    renderAiStatus();
    renderAssistant();
    if (!$("#aiSettingsModal").classList.contains("hidden")) {
      const status = state.aiStatus;
      const box = $("#aiSettingsStatus");
      box.className = `settings-status ${status.ready ? "" : "warn"}`;
      box.innerHTML = status.ready
        ? `<strong>${icon("check")}已连接 ${esc(status.model)}</strong><p>${status.mode === "server" ? `通过本地代理调用，密钥 ${esc(status.keyHint || "保存在服务端")}。` : "浏览器直连 DeepSeek，密钥只存在本机 localStorage。"}</p>`
        : `<strong>${icon("info")}当前为离线演示</strong><p>${esc(status.reason || "尚未检测到可用通道。")}</p>`;
    }
  }

  function aiErrorMessage(error) {
    if (!error) return "未知错误";
    if (error instanceof AI.AIError) return error.message;
    return error.message || "请求失败";
  }

  function renderAiBusy() {
    if (!state.aiBusy) return "";
    const busy = state.aiBusy;
    const cards = busy.cards || [];
    return `<div class="ai-busy-card" role="status" aria-live="polite"><div class="ai-busy-head">${icon("spark")}<span>《${esc(state.project.title)}》 · ${esc(busy.label)}</span></div>
      <div class="busy-flow"><span class="busy-flow-text">${esc(busy.phases[busy.phaseIndex] || busy.detail || "正在请求 DeepSeek…")}</span></div>
      ${cards.length ? `<div class="busy-card-label">${esc(busy.cardsLabel || "相关资料")}</div><div class="busy-cards">${cards.map((card, index) => `<span class="busy-chip" style="animation-delay:${(index * 90).toString()}ms"><span class="chip-kind">${esc(card.kind)}</span><strong>${esc(card.title)}</strong>${(card.reasons || []).length ? `<small>${esc(card.reasons[0].replace(/^模型选择：/, ""))}</small>` : ""}</span>`).join("")}</div>` : ""}
      ${busy.coreRules?.length ? `<p class="busy-budget-note">另有 ${busy.coreRules.length} 条固定创作法则始终生效：${esc(busy.coreRules.map(item => item.title).join("、"))}。</p>` : ""}
      ${busy.omitted?.length ? `<p class="busy-budget-note">有 ${busy.omitted.length} 张候选因篇幅预算未加载，完成后可查看明细。</p>` : ""}
      <div class="ai-busy-meter"><i></i><span>${esc(busy.elapsed || "0.0")}s</span></div></div>`;
  }

  function renderAiError() {
    if (!state.aiError) return "";
    return `<div class="ai-error-card"><strong>${icon("info")}${esc(state.aiError.title || "生成失败")}</strong><p>${esc(state.aiError.message)}</p><div class="ai-error-actions"><button class="button secondary compact" data-action="open-ai-settings">检查设置</button>${state.aiError.retryAction ? `<button class="button primary compact" data-action="${esc(state.aiError.retryAction)}" ${state.aiError.retryPayload ? `data-payload="${esc(state.aiError.retryPayload)}"` : ""}>重试</button>` : ""}</div></div>`;
  }

  function startBusy(label, detail, { cards = [], phases, manual = false } = {}) {
    const started = performance.now();
    state.aiBusy = {
      label,
      detail,
      phases: phases && phases.length ? phases : [detail || "正在请求 DeepSeek 并按世界书约束校验结果…"],
      phaseIndex: 0,
      manual,
      cards,
      elapsed: "0.0"
    };
    clearInterval(state.busyTimer);
    state.busyTimer = setInterval(() => {
      if (!state.aiBusy) return clearInterval(state.busyTimer);
      const busy = state.aiBusy;
      busy.elapsed = ((performance.now() - started) / 1000).toFixed(1);
      const meter = $("#assistantBody .ai-busy-meter span");
      if (meter) meter.textContent = `${busy.elapsed}s`;
      /* 阶段文字每 2.6s 前进一步；走完后在最后一步持续 shimmer。 */
      const nextIndex = busy.manual ? busy.phaseIndex : Math.min(busy.phases.length - 1, Math.floor(Number(busy.elapsed) / 2.6));
      if (nextIndex !== busy.phaseIndex) {
        busy.phaseIndex = nextIndex;
        const flow = $("#assistantBody .busy-flow-text");
        if (flow) {
          flow.classList.remove("swap");
          void flow.offsetWidth;
          flow.textContent = busy.phases[nextIndex];
          flow.classList.add("swap");
        }
      }
    }, 200);
  }

  function writingProgress(event) {
    const busy = state.aiBusy;
    if (!busy?.manual) return;
    const labels = {
      selecting: `已找到 ${event.candidateCount} 张候选卡，正在选择适合本节的资料…`,
      selected: "选卡完成，正在准备写作上下文…",
      writing: "资料已就绪，正在续写正文…",
      validating: "正文已返回，正在检查结果…",
      retrying: "部分结果未通过检查，正在重新生成…"
    };
    if (event.stage === "selected") {
      busy.cards = event.retrieval.detail;
      busy.cardsLabel = `本节将参考 ${busy.cards.length} 张卡`;
      busy.omitted = event.retrieval.omitted;
      busy.coreRules = event.retrieval.coreRules;
    }
    /* 重试会整段重来：把已流出的段落与思考带清掉，避免和新一轮叠在一起。 */
    if (event.stage === "retrying" && (busy.stream || busy.reasoning)) {
      busy.stream = null;
      busy.reasoning = null;
      $("#assistantBody .stream-prose")?.remove();
      $("#assistantBody .reasoning-line")?.remove();
    }
    /* 选卡与续写是两次独立调用，各有各的思考：进入写作阶段就把
       选卡的思考带撤下，让续写的推理从干净的窗口开始流。 */
    if (event.stage === "writing" && busy.reasoning) {
      busy.reasoning = null;
      $("#assistantBody .reasoning-line")?.remove();
    }
    busy.phases = [labels[event.stage] || busy.detail];
    busy.phaseIndex = 0;
    const card = $("#assistantBody .ai-busy-card");
    if (card && event.stage === "selected") card.outerHTML = renderAiBusy();
    else {
      const flow = $("#assistantBody .busy-flow-text");
      if (flow) flow.textContent = busy.phases[0];
    }
  }

  /* 思考带的落点：实验台弹窗打开时建在弹窗状态行后面（弹窗盖住主
     面板，建在后面看不见）；否则建在 busy 卡里。"选卡完成"会用
     outerHTML 重渲染 busy 卡，所以每次都做惰性重建检查。 */
  function ensureReasoningLine() {
    const labStatus = document.querySelector("#perspectiveModal:not(.hidden) #perspectiveStatus");
    const LINE = '<div class="reasoning-line" aria-live="off"><span class="reasoning-tick"></span><div class="reasoning-text"></div></div>';
    if (labStatus) {
      /* 选卡 chips 也插在状态行后面，会把思考带挤位：modal 内永远只留
         一条思考带，已存在就归位到状态行后，否则清理时会有漏网之鱼。 */
      const existing = labStatus.closest(".modal")?.querySelector(".reasoning-line");
      if (existing) {
        if (existing !== labStatus.nextElementSibling) labStatus.after(existing);
        return existing;
      }
      labStatus.insertAdjacentHTML("afterend", LINE);
      return labStatus.nextElementSibling;
    }
    const card = $("#assistantBody .ai-busy-card");
    if (card && !card.querySelector(".reasoning-line")) {
      card.querySelector(".busy-flow")?.insertAdjacentHTML("afterend", LINE);
    }
    return $("#assistantBody .reasoning-line");
  }

  /* 思考过程带：把模型真实的 reasoning CoT 增量塞进一行尾随窗口——
     文本不断向上推，永远露出最新想的内容。选卡与写作两阶段的思考
     都在这里流过；正文开始落笔后整体淡化为背景。 */
  function renderReasoningDelta(fullText) {
    const busy = state.aiBusy;
    if (!busy || typeof fullText !== "string") return;
    if (!busy.reasoning) {
      busy.reasoning = { chars: 0 };
      const flow = $("#assistantBody .busy-flow-text");
      if (flow && flow.textContent.includes("正在续写正文")) flow.textContent = "模型正在思考，以下是其真实推理过程…";
    }
    busy.reasoning.chars = fullText.length;
    const line = ensureReasoningLine();
    const el = line?.querySelector(".reasoning-text");
    if (!el) return;
    el.textContent = fullText;
    line.scrollTop = line.scrollHeight;
  }

  /* 续写的流式增量：continueBranch 边收边回调，
     从未写完的 JSON 里摘出的段落逐段渐显，半截内容以浅色跟进。
     最终结果仍以完整返回的解析校验为准，这里只负责"看得见正在写"。 */
  function renderStreamDelta(update) {
    const busy = state.aiBusy;
    if (!busy || !update) return;
    if (!busy.stream) {
      busy.stream = { count: 0 };
      const card = $("#assistantBody .ai-busy-card");
      if (card && !card.querySelector(".stream-prose")) {
        card.querySelector(".busy-flow")?.insertAdjacentHTML("afterend", '<div class="stream-prose" aria-live="polite"></div>');
      }
      // 正文开始落笔，思考让位：在这里淡化，而不是等下一次 reasoning 增量
      //（思考结束后不再有增量，dim 逻辑挂在那边永远不会触发）。
      $("#assistantBody .reasoning-line")?.classList.add("reasoning-dim");
      const flow = $("#assistantBody .busy-flow-text");
      if (flow) flow.textContent = "正在落笔，边写边显…";
    }
    const box = $("#assistantBody .stream-prose");
    if (!box) return;
    const done = Array.isArray(update.paragraphs) ? update.paragraphs : [];
    const partialEl = box.querySelector(".stream-para-partial");
    while (busy.stream.count < done.length) {
      // 已完成的段落替换掉此前的半截预览，避免同一句话出现两遍。
      partialEl?.remove();
      box.insertAdjacentHTML("beforeend", `<p class="stream-para">${esc(done[busy.stream.count])}</p>`);
      busy.stream.count += 1;
    }
    const partial = update.partial || "";
    if (partial) {
      if (partialEl) partialEl.textContent = partial;
      else box.insertAdjacentHTML("beforeend", '<p class="stream-para stream-para-partial"></p>');
      box.scrollTop = box.scrollHeight;
    } else {
      partialEl?.remove();
    }
  }

  function stopBusy() {
    clearInterval(state.busyTimer);
    state.aiBusy = null;
  }

  function setAiError(title, error, retryAction = "", retryPayload = "") {
    state.aiError = { title, message: aiErrorMessage(error), retryAction, retryPayload };
    renderAssistant();
    const toast = error?.message || "AI 请求失败";
    showToast(clampText(toast, 60), "info");
    // 网络类失败往往意味着代理或网络已不可用，重新探测状态，避免顶部仍显示“已连接”。
    if (["network", "not_ready"].includes(error?.code)) detectAI();
  }

  function openAiSettings() {
    const config = AI.readConfig();
    const status = state.aiStatus;
    const models = status.models?.length ? status.models : AI.FALLBACK_MODELS;
    $("#aiModeSelect").value = config.mode || "auto";
    $("#aiKeyInput").value = config.apiKey || "";
    $("#aiBaseInput").value = config.baseUrl || AI.DEFAULT_BASE;
    $("#aiModelSelect").innerHTML = models.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
    if (!models.includes(config.model)) $("#aiModelSelect").insertAdjacentHTML("beforeend", `<option value="${esc(config.model)}">${esc(config.model)}</option>`);
    $("#aiModelSelect").value = config.model || models[0];
    $("#aiEffortSelect").value = AI.EFFORT_LEVELS.includes(config.effort) ? config.effort : AI.DEFAULT_EFFORT;
    $("#aiSettingsStatus").className = `settings-status ${status.ready ? "" : "warn"}`;
    $("#aiSettingsStatus").innerHTML = status.ready
      ? `<strong>${icon("check")}已连接 ${esc(status.model)}</strong><p>${status.mode === "server" ? `通过本地代理调用，密钥 ${esc(status.keyHint || "保存在服务端")}。` : "浏览器直连 DeepSeek，密钥只存在本机 localStorage。"}</p>`
      : `<strong>${icon("info")}当前为离线演示</strong><p>${esc(status.reason || "尚未检测到可用通道。")}</p>`;
    $("#aiTestResult").textContent = "";
    $("#aiTestResult").className = "settings-hint";
    syncDirectFields();
    openModal("aiSettingsModal");
  }

  function syncDirectFields() {
    const mode = $("#aiModeSelect").value;
    const needsKey = mode === "direct" || (mode === "auto" && !state.aiStatus.server);
    $("#directFields").classList.toggle("hidden", !needsKey);
  }

  async function saveAiSettings() {
    const mode = $("#aiModeSelect").value;
    const apiKey = $("#aiKeyInput").value.trim();
    const baseUrl = $("#aiBaseInput").value.trim() || AI.DEFAULT_BASE;
    const model = $("#aiModelSelect").value || AI.DEFAULT_MODEL;
    if (mode === "direct" && !apiKey) {
      const hint = $("#aiTestResult");
      hint.textContent = "浏览器直连需要填写 API Key";
      hint.className = "settings-hint bad";
      return;
    }
    const effort = $("#aiEffortSelect").value;
    AI.saveConfig({ mode, apiKey, baseUrl, model, effort });
    $("#aiTestResult").textContent = "正在重新检测…";
    $("#aiTestResult").className = "settings-hint";
    await detectAI();
    const ok = state.aiStatus.ready;
    $("#aiTestResult").textContent = ok ? `已连接 ${state.aiStatus.model}` : (state.aiStatus.reason || "未能连接，请检查配置");
    $("#aiTestResult").className = `settings-hint ${ok ? "ok" : "bad"}`;
    if (ok) showToast(`AI 已切换为 ${aiStatusText()}`);
  }

  async function testAiConnection() {
    const hint = $("#aiTestResult");
    hint.textContent = "正在测试，通常需要 3–10 秒…";
    hint.className = "settings-hint";
    try {
      const mode = $("#aiModeSelect").value;
      const apiKey = $("#aiKeyInput").value.trim();
      const baseUrl = $("#aiBaseInput").value.trim() || AI.DEFAULT_BASE;
      const model = $("#aiModelSelect").value || AI.DEFAULT_MODEL;
      AI.saveConfig({ mode, apiKey, baseUrl, model, effort: $("#aiEffortSelect").value });
      const status = await AI.detect();
      if (!status.ready) throw new Error(status.reason || "没有可用的 AI 通道");
      hint.textContent = `连接成功：${status.model}（${status.mode === "server" ? "本地代理" : "浏览器直连"}）`;
      hint.className = "settings-hint ok";
      renderAiStatus();
      renderAssistant();
    } catch (error) {
      hint.textContent = aiErrorMessage(error);
      hint.className = "settings-hint bad";
    }
  }

  /* 品牌与首页文案由当前世界书决定。所有元素都做了存在性判断，
     这样同一个 app.js 在两本书下都能安全渲染。 */
  function applyWorldBrand() {
    const set = (selector, value, html = false) => {
      const node = $(selector);
      if (!node || value === undefined || value === null) return;
      if (html) node.innerHTML = value;
      else node.textContent = value;
    };
    const meta = window.WB_WORLD_META || {};
    set("#brandSeal", UI.heroSeal || meta.seal);
    set("#brandTitle", UI.navBrand || meta.title);
    set("#breadcrumbBrand", UI.navBrand || meta.title);
    set("#worldCover", meta.cover);
    set("#worldName", meta.name);
    set("#worldSub", meta.subtitle);
    set("#heroEyebrow", UI.heroEyebrow ? `<span class="canon-dot"></span>${esc(UI.heroEyebrow).replace(" · ", '<span class="eyebrow-divider"></span>')}` : null, true);
    set("#heroTitle", UI.heroTitle, true);
    set("#heroSub", UI.heroSub);
    set("#heroArtLabel", UI.heroArtLabel);
    set("#worldSectionTitle", UI.worldSectionTitle);
    set("#worldSectionDesc", UI.worldSectionDesc);
    set("#projectWorldLabel", UI.worldLabel);
    set("#projectTag", UI.projectTag);
    set("#assistantTitle", UI.assistantTitle);
    set("#relationTotal", DATA.relationship_edges.length);
    set("#promptVersionLabel", `Worldbook Studio · ${STUDIO.metadata?.version || "v2.0"}`);
    set("#promptNoteText", UI.promptNote);
    set("#sidebarNoteTitle", UI.sidebarNoteTitle);
    set("#sidebarNoteText", UI.sidebarNoteText);
    document.title = `${UI.navBrand || meta.title} · Worldbook Studio`;
  }

  function openWorldPicker() {
    const list = $("#worldPickerList");
    if (!list) return;
    const catalog = window.WORLDBOOK_CATALOG || [];
    list.innerHTML = catalog.map(world => {
      const stats = world.available
        ? `${world.assets} 项资产 · ${world.characters} 位人物 · ${world.relations} 组关系`
        : "数据尚未就绪";
      return `<a class="world-option ${world.active ? "active" : ""} ${world.available ? "" : "disabled"}"
        href="${world.available ? esc(world.href) : "#"}"
        ${world.active ? 'aria-current="true"' : ""}>
        <span class="world-option-cover">${esc(world.cover)}</span>
        <span class="world-option-copy"><strong>${esc(world.name)}<small>${esc(world.book)}</small></strong><span>${esc(stats)}</span></span>
        ${world.active ? '<span class="world-option-current">正在使用</span>' : '<svg class="icon"><use href="#icon-arrow"/></svg>'}
      </a>`;
    }).join("");
    openModal("worldModal");
  }

  /* ── 跨界创作 ────────────────────────────────────────────────
     三段式：选书 → 选力量档 → 选通达方式。通达方式是必填的门禁，
     没有它就不允许生成跨界内容，否则模型只能硬凑两界关系。 */

  function crossBridgeLib() {
    return window.HL_BRIDGE || null;
  }

  function foreignWorlds() {
    return (window.WORLDBOOK_CATALOG || []).filter(world => world.id !== window.WB_WORLD && world.available);
  }

  function openCrossPanel() {
    const project = state.project;
    state.crossDraft = {
      worlds: [...(project.cross?.worlds || [])],
      // works：从外书作品架里挑的作品快照。空数组 = 只用整本素材。
      works: [...(project.cross?.works || [])],
      power: project.cross?.power || "limited",
      bridge: project.cross?.bridge || null,
      bridges: project.cross?.bridges || []
    };
    state.crossWorkCache = {};
    loadCrossWorks();
    renderCrossPanel();
    openModal("crossModal");
  }

  function renderCrossPanel() {
    const draft = state.crossDraft;
    const lib = crossBridgeLib();
    if (!draft || !lib) return;
    const options = foreignWorlds();

    $("#crossWorldList").innerHTML = options.length ? options.map(world => `
      <button class="cross-world ${draft.worlds.includes(world.id) ? "selected" : ""}"
        data-action="toggle-cross-world" data-world="${esc(world.id)}" aria-pressed="${draft.worlds.includes(world.id)}">
        <span class="cross-world-cover" style="--world-color:${esc(world.palette || "#8a8f98")}">${esc(world.cover)}</span>
        <span class="cross-world-copy"><strong>${esc(world.name)}</strong><small>${world.assets} 项资产 · ${world.characters} 位人物</small></span>
        <span class="cross-check">${icon("check")}</span>
      </button>`).join("") : `<p class="settings-hint">目录里没有其他世界书可引入。</p>`;

    renderCrossWorks();

    $("#crossPowerList").innerHTML = lib.POWER_ORDER.map(id => {
      const level = lib.POWER_LEVELS[id];
      return `<button class="cross-power ${draft.power === id ? "selected" : ""} ${id === "open" ? "risky" : ""}"
        data-action="select-cross-power" data-power="${id}" aria-pressed="${draft.power === id}">
        <span class="cross-power-head"><strong>${esc(level.label)}</strong><small>${esc(level.summary)}</small></span>
        <span class="cross-power-detail">${esc(level.detail)}</span>
        <span class="cross-power-risk">${esc(level.risk)}</span>
      </button>`;
    }).join("");

    const list = $("#crossBridgeList");
    if (!draft.worlds.length) {
      list.innerHTML = `<p class="settings-hint">先选一本要引入的世界书。</p>`;
      $("#generateBridgesBtn").disabled = true;
    } else if (!draft.bridges.length) {
      list.innerHTML = `<p class="settings-hint">还没有通达方式。点下面的按钮，让 AI 给三个选项。</p>`;
      $("#generateBridgesBtn").disabled = false;
    } else {
      list.innerHTML = draft.bridges.map((bridge, index) => `
        <button class="cross-bridge ${draft.bridge?.id === bridge.id ? "selected" : ""}"
          data-action="select-cross-bridge" data-index="${index}" aria-pressed="${draft.bridge?.id === bridge.id}">
          <span class="cross-bridge-head"><strong>${esc(bridge.title)}</strong><small>${esc(bridge.tone)}</small></span>
          <span class="cross-bridge-mechanism">${esc(bridge.mechanism)}</span>
          <span class="cross-bridge-meta">
            ${bridge.opener ? `<span>开启：${esc(bridge.opener)}</span>` : ""}
            ${bridge.cost ? `<span>代价：${esc(bridge.cost)}</span>` : ""}
            ${bridge.visibility ? `<span>知情：${esc(bridge.visibility)}</span>` : ""}
          </span>
        </button>`).join("");
      $("#generateBridgesBtn").disabled = false;
    }

    renderCrossPanelSummary();
  }

  /* 读外书的作品架。跨世界取作品只能走服务端，本机 localStorage 里只有当前那本。 */
  async function loadCrossWorks() {
    const draft = state.crossDraft;
    if (!draft || !draft.worlds.length) {
      renderCrossWorks();
      return;
    }
    const pending = draft.worlds.filter(id => !state.crossWorkCache?.[id]);
    if (!pending.length) {
      renderCrossWorks();
      return;
    }
    renderCrossWorks("正在读取作品架…");
    await Promise.all(pending.map(async worldId => {
      try {
        const response = await fetch(`api/library?world=${encodeURIComponent(worldId)}`, { cache: "no-store" });
        const data = await response.json();
        const projects = data?.library?.projects || [];
        state.crossWorkCache = state.crossWorkCache || {};
        state.crossWorkCache[worldId] = projects.map(project => summarizeWork(project, worldId));
      } catch (_) {
        state.crossWorkCache = state.crossWorkCache || {};
        state.crossWorkCache[worldId] = [];
      }
    }));
    renderCrossWorks();
  }

  /* 把一部作品压成可注入的快照。
   * 取的是「当前路径末端节点的故事状态」——那是这部作品已经确立的事实。
   * 作品还没有正文时退回到它的创作前提。 */
  function summarizeWork(project, worldId) {
    const meta = window.WB_REGISTRY?.[worldId]?.meta || {};
    const nodes = project.nodes || {};
    const last = nodes[project.lastNodeId] || nodes[Object.keys(nodes)[Object.keys(nodes).length - 1]] || null;
    const state = last?.storyState || {};
    const assets = new Set(project.root?.assets || []);
    Object.values(nodes).forEach(node => asArray(node.assets).forEach(id => assets.add(id)));
    return {
      id: project.id,
      world: worldId,
      title: project.title,
      book: meta.book || "",
      protagonist: project.protagonist || "",
      premise: project.profile?.premise || project.prompt || "",
      facts: asArray(state.facts),
      characters: asArray(state.characters),
      openThreads: asArray(state.openThreads),
      assets: [...assets].filter(Boolean),
      nodes: Object.keys(nodes).length,
      sourceUpdatedAt: project.updatedAt || ""
    };
  }

  function renderCrossWorks(status) {
    const list = $("#crossWorkList");
    if (!list) return;
    const draft = state.crossDraft;
    if (!draft) return;
    if (!draft.worlds.length) {
      list.innerHTML = `<p class="settings-hint">先选一本要引入的世界书。</p>`;
      return;
    }
    if (status) {
      list.innerHTML = `<p class="settings-hint">${esc(status)}</p>`;
      return;
    }
    const picked = new Set(draft.works.map(work => `${work.world}:${work.id}`));
    const groups = draft.worlds.map(worldId => {
      const works = state.crossWorkCache?.[worldId];
      const name = window.WB_REGISTRY?.[worldId]?.meta?.name || worldId;
      if (!works) return `<p class="settings-hint">正在读取《${esc(name)}》的作品架…</p>`;
      if (!works.length) {
        return `<p class="settings-hint">《${esc(name)}》的作品架是空的。可以先去那本书里写一部，或者不选作品、直接用整本素材。</p>`;
      }
      return `<div class="cross-work-group">
        <span class="cross-work-group-label">${esc(name)}</span>
        ${works.map(work => {
          const key = `${work.world}:${work.id}`;
          const on = picked.has(key);
          const stale = on && draft.works.find(item => `${item.world}:${item.id}` === key)?.sourceUpdatedAt
            && draft.works.find(item => `${item.world}:${item.id}` === key).sourceUpdatedAt !== work.sourceUpdatedAt;
          return `<button class="cross-work ${on ? "selected" : ""}" data-action="toggle-cross-work"
            data-world="${esc(work.world)}" data-id="${esc(work.id)}" aria-pressed="${on}">
            <span class="cross-work-head">
              <strong>${esc(work.title)}</strong>
              <small>${esc(work.protagonist || "—")} · ${work.nodes} 节${work.facts.length ? ` · ${work.facts.length} 条事实` : ""}</small>
            </span>
            <span class="cross-work-premise">${esc(clampText(work.premise, 90))}</span>
            ${stale ? `<span class="cross-work-stale">源作品已更新，重新勾选可取到最新事实</span>` : ""}
            <span class="cross-check">${icon("check")}</span>
          </button>`;
        }).join("")}
      </div>`;
    });
    list.innerHTML = groups.join("");
  }

  function toggleCrossWork(worldId, projectId) {
    const draft = state.crossDraft;
    if (!draft) return;
    const work = (state.crossWorkCache?.[worldId] || []).find(item => item.id === projectId);
    if (!work) return;
    const exists = draft.works.some(item => item.world === worldId && item.id === projectId);
    draft.works = exists
      ? draft.works.filter(item => !(item.world === worldId && item.id === projectId))
      : [...draft.works, work];
    renderCrossWorks();
    renderCrossPanelSummary();
  }

  /* 只刷新底部摘要，避免整块重绘把用户滚动位置打回去。 */
  function renderCrossPanelSummary() {
    const draft = state.crossDraft;
    const lib = crossBridgeLib();
    const summary = $("#crossSummary");
    if (!draft || !lib || !summary) return;
    const parts = [];
    if (draft.worlds.length) parts.push(draft.worlds.map(id => window.WB_REGISTRY?.[id]?.meta?.name || id).join("、"));
    if (draft.works.length) parts.push(`引用 ${draft.works.length} 部作品`);
    if (draft.worlds.length && draft.bridge) parts.push(lib.powerLevel(draft.power).label);
    summary.textContent = parts.length
      ? (draft.worlds.length && !draft.bridge ? "还差一个通达方式" : `已引入 ${parts.join(" · ")}`)
      : "尚未启用跨界";
  }

  function toggleCrossWorld(id) {
    const draft = state.crossDraft;
    if (!draft) return;
    draft.worlds = draft.worlds.includes(id) ? draft.worlds.filter(item => item !== id) : [...draft.worlds, id];
    // 换了引入的书，之前的桥接与作品引用都不再适用
    draft.bridges = [];
    draft.bridge = null;
    draft.works = draft.works.filter(work => draft.worlds.includes(work.world));
    renderCrossPanel();
    loadCrossWorks();
  }

  function selectCrossPower(id) {
    if (!state.crossDraft) return;
    state.crossDraft.power = id;
    renderCrossPanel();
  }

  function selectCrossBridge(index) {
    const draft = state.crossDraft;
    if (!draft) return;
    draft.bridge = draft.bridges[index] || null;
    renderCrossPanel();
  }

  async function generateBridges() {
    const draft = state.crossDraft;
    const lib = crossBridgeLib();
    if (!draft?.worlds.length || !lib) return;
    if (!AI.canUse()) {
      $("#crossStatus").textContent = "需要先连接 AI 服务。";
      $("#crossStatus").className = "settings-hint bad";
      return;
    }
    const primaryId = window.WB_WORLD;
    const primary = window.WB_REGISTRY?.[primaryId];
    const foreignId = draft.worlds[0];
    const foreign = window.WB_REGISTRY?.[foreignId];
    if (!primary || !foreign) return;

    const status = $("#crossStatus");
    const button = $("#generateBridgesBtn");
    status.textContent = "正在生成三个通达选项…";
    status.className = "settings-hint";
    button.disabled = true;
    try {
      const bridges = await lib.proposeBridges({
        primary: { meta: primary.meta },
        foreign: { meta: foreign.meta },
        prompt: state.project?.prompt || "",
        power: draft.power
      });
      draft.bridges = bridges;
      draft.bridge = null;
      status.textContent = `已生成 ${bridges.length} 个选项，选一个再保存。`;
      status.className = "settings-hint ok";
    } catch (error) {
      status.textContent = `生成失败：${aiErrorMessage(error)}`;
      status.className = "settings-hint bad";
    } finally {
      button.disabled = false;
      renderCrossPanel();
    }
  }

  function saveCross() {
    const draft = state.crossDraft;
    const lib = crossBridgeLib();
    if (!draft) return;
    if (draft.worlds.length && !draft.bridge) {
      $("#crossStatus").textContent = "请先选一个通达方式，跨界内容才能生成。";
      $("#crossStatus").className = "settings-hint bad";
      return;
    }
    state.project.cross = draft.worlds.length
      ? { worlds: [...draft.worlds], works: [...draft.works], power: draft.power, bridge: draft.bridge, bridges: draft.bridges }
      : null;
    persist();
    closeModals();
    renderCrossIndicator();
    renderAssistant();
    showToast(state.project.cross
      ? `已引入 ${draft.worlds.map(id => window.WB_REGISTRY?.[id]?.meta?.name || id).join("、")}${draft.works.length ? ` 与 ${draft.works.length} 部作品` : ""}（${lib.powerLevel(draft.power).label}）`
      : "已取消跨界");
  }

  function clearCross() {
    state.project.cross = null;
    state.crossDraft = null;
    persist();
    closeModals();
    renderCrossIndicator();
    renderAssistant();
    showToast("已取消跨界");
  }

  function renderCrossIndicator() {
    const dot = $("#crossNavDot");
    const label = $("#crossNavLabel");
    const cross = state.project?.cross;
    if (dot) dot.classList.toggle("hidden", !cross);
    if (label) label.textContent = "跨界引用";
  }

  function applyTheme() {
    document.body.classList.toggle("theme-dark", state.theme === "dark");
    $(".theme-icon use").setAttribute("href", state.theme === "dark" ? "#icon-sun" : "#icon-moon");
  }

  function switchView(view) {
    state.view = view;
    $$(".view").forEach(section => section.classList.toggle("hidden", section.id !== `view-${view}`));
    $$(".nav-item[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    const labels = { world: "世界书", creations: "我的创作", evaluation: "评测实验室", prompt: "创作核心指令" };
    $("#currentViewLabel").textContent = labels[view];
    $("#workspaceScroll").scrollTop = 0;
    document.body.classList.remove("sidebar-visible");
    if (view === "creations") renderProject();
    if (view === "evaluation") renderEvaluation();
  }

  function sourceTag(item) {
    const className = item.category === "style" ? "style" : item.isDerivative || item.sourceLabel === "二创素材" ? "original" : "canon";
    return `<span class="tag ${className}">${esc(item.sourceLabel)}</span>`;
  }

  function categoryCount(category) {
    if (category === "all") return ENTRIES.length;
    if (category === "relation") return DATA.relationship_edges.length;
    return ENTRIES.filter(item => item.category === category).length;
  }

  function renderCategoryTabs() {
    $("#assetCategoryTabs").innerHTML = STUDIO.categories.map(category => `
      <button class="${state.category === category.id ? "active" : ""}" data-action="asset-category" data-category="${category.id}" role="tab" aria-selected="${state.category === category.id}">
        ${esc(category.name)}<span>${categoryCount(category.id)}</span>
      </button>`).join("");
  }

  function renderAssets() {
    renderCategoryTabs();
    const isRelation = state.category === "relation";
    $("#assetGrid").classList.toggle("hidden", isRelation);
    $("#relationView").classList.toggle("hidden", !isRelation);
    $(".asset-search").classList.toggle("hidden", isRelation);    if (isRelation) {
      renderRelationGraph();
      return;
    }

    const query = state.assetSearch.trim().toLowerCase();
    const matches = item => {
      if (state.category !== "all" && item.category !== state.category) return false;
      if (!query) return true;
      return [item.title, item.content, item.id, ...asArray(item.keywords)].join(" ").toLowerCase().includes(query);
    };
    /* 标题命中排最前（搜"藕香榭"本尊卡应在首位），关键词次之，正文最后；
       同分保持原序（sort 稳定）。 */
    const rank = item => {
      const title = item.title.toLowerCase();
      if (title === query) return 0;
      if (title.includes(query)) return 1;
      if (asArray(item.keywords).some(k => k.toLowerCase().includes(query))) return 2;
      return 3;
    };
    const filtered = ENTRIES.filter(matches).sort((a, b) => (query ? rank(a) - rank(b) : 0));

    if (!filtered.length) {
      $("#assetGrid").innerHTML = `<div class="empty-state">${icon("search")}<h3>没有找到相关创作资料</h3><p>试试人物名、场景名，或切换到“全部资产”。</p></div>`;
      return;
    }

    $("#assetGrid").innerHTML = filtered.map(item => `
      <button class="asset-card" data-action="open-doc" data-id="${esc(item.id)}">
        <div class="asset-card-top"><span class="asset-id">${esc(item.id)} · ${esc(item.categoryName)}</span>${sourceTag(item)}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.content)}</p>
        <div class="asset-card-footer"><div class="keyword-list">${asArray(item.keywords).slice(0, 3).map(keyword => `<span>#${esc(keyword)}</span>`).join("")}</div>${icon("plus")}</div>
      </button>`).join("");
  }

  function openDoc(id) {
    const item = ENTRY_MAP.get(id);
    if (!item) return;
    state.currentDocId = id;
    $("#docModalCategory").textContent = `${item.categoryName} · ${item.id}`;
    $("#docModalTitle").textContent = item.title;
    $("#docModalSource").textContent = item.sourceLabel;

    let detail = `${item.image ? `<figure class="doc-image"><img src="${esc(item.image.startsWith("assets/") ? ASSET_BASE + item.image.slice(7) : item.image)}" alt="${esc(item.title)} 配图" loading="lazy"><figcaption>${esc(STUDIO.imageCredit || "公有领域配图")}</figcaption></figure>` : ""}<p class="doc-summary">${esc(item.content)}</p><div class="doc-keywords">${asArray(item.keywords).map(keyword => `<span class="tag">#${esc(keyword)}</span>`).join("")}</div>`;
    const details = [];
    if (item.category === "character") {
      details.push(["身份与处境", item.identity], ["内在动机", item.desire], ["语言风格", item.voice], ["行为边界", item.boundary]);
    } else if (item.category === "location") {
      details.push(["场景功能", item.uses], ["通行约束", item.access], ["常见人物", asArray(item.npcs).join("、")]);
    } else if (item.category === "world") {
      details.push(["一句话概括", item.summary], ["写作运用", item.usage], ["使用边界", item.constraint]);
    } else if (item.category === "style") {
      details.push(["适用创作", item.usage], ["使用边界", item.constraint]);
    } else if (item.isDerivative) {
      details.push(["故事钩子", item.hook], ["分支可能", asArray(item.branches).join("；")], ["创作结果", item.outcome]);
    } else if (item.category === "event") {
      details.push(["原著位置", item.canon_position], ["事件状态", item.initial_status], ["触发条件", item.trigger_conditions], ["改编边界", item.divergence_rule]);
    }
    if (details.length) {
      detail += `<div class="doc-detail-grid">${details.filter(([, value]) => value).map(([label, value], index) => `<div class="doc-detail ${index === details.length - 1 && details.length % 2 ? "wide" : ""}"><strong>${esc(label)}</strong><p>${esc(value)}</p></div>`).join("")}</div>`;
    }

    if (item.category === "character") {
      const extra = [];
      if (item.judgement) extra.push(`<div class="doc-judgement"><strong>判词／依据</strong><p>${esc(item.judgement)}</p></div>`);
      if (item.firstAppearance) extra.push(`<div class="doc-detail wide"><strong>首次出场</strong><p>${esc(item.firstAppearance)}</p></div>`);
      if (item.fate) extra.push(`<div class="doc-detail wide"><strong>结局线索</strong><p>${esc(item.fate)}</p></div>`);
      if (extra.length) {
        detail += `<div class="doc-detail-grid" style="margin-top:12px">${extra.join("")}</div>`;
      }
      if (item.deep?.speech) {
        detail += `<div class="doc-related"><h3>语言特征与例句</h3><div class="doc-speech">${esc(item.deep.speech)}</div></div>`;
      }
      if (asArray(item.deep?.scenes).length) {
        detail += `<div class="doc-related"><h3>名场面</h3><ul class="canon-events">${item.deep.scenes.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
      }
      if (asArray(item.canonEvents).length) {
        detail += `<div class="doc-related"><h3>原著关键事件</h3><ul class="canon-events">${item.canonEvents.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
      }
      if (item.deep?.caution) {
        detail += `<div class="doc-related"><h3>写作注意</h3><div class="doc-caution">${esc(item.deep.caution)}</div></div>`;
      }
      const related = DATA.relationship_edges.filter(edge => (GRAPH_ALIASES[edge.source] || edge.source) === item.title || (GRAPH_ALIASES[edge.target] || edge.target) === item.title);
      if (related.length) {
        detail += `<div class="doc-related"><h3>关系约束</h3><div class="citation-list">${related.map(edge => `<div class="citation-item"><strong>${esc(edge.source)} — ${esc(edge.target)}</strong><span>${esc(edge.relationship)}；${esc(edge.constraint)}</span></div>`).join("")}</div></div>`;
      }
    }
    $("#docModalBody").innerHTML = detail;
    openModal("docModal");
  }

  function openModal(id) {
    $$(".modal").forEach(modal => modal.classList.add("hidden"));
    $(`#${id}`).classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeModals() {
    $$(".modal").forEach(modal => modal.classList.add("hidden"));
    document.body.style.overflow = "";
  }

  function renderAssetPicker() {
    const query = $("#assetPickerSearch").value.trim().toLowerCase();
    const list = ENTRIES.filter(item => !query || [item.title, item.id, ...asArray(item.keywords)].join(" ").toLowerCase().includes(query));
    $("#assetPickerList").innerHTML = list.length ? list.map(item => `
      <button class="picker-item ${state.pinnedAssets.includes(item.id) ? "selected" : ""}" data-action="toggle-asset" data-id="${esc(item.id)}">
        <span class="picker-check">${icon("check")}</span>
        <span><strong>${esc(item.title)}</strong><small>${esc(item.id)} · ${esc(item.categoryName)} · ${esc(clampText(item.content, 55))}</small></span>
        ${sourceTag(item)}
      </button>`).join("") : `<div class="empty-state"><h3>没有匹配词条</h3><p>换一个关键词试试。</p></div>`;
    $("#selectedAssetCount").textContent = `已固定引用 ${state.pinnedAssets.length} 项`;
  }

  function openAssetPicker() {
    $("#assetPickerSearch").value = "";
    renderAssetPicker();
    openModal("assetPickerModal");
  }

  function toggleAsset(id) {
    if (!ENTRY_MAP.has(id)) return;
    if (state.pinnedAssets.includes(id)) state.pinnedAssets = state.pinnedAssets.filter(item => item !== id);
    else {
      state.pinnedAssets.push(id);
      if (!state.freshCreation) state.project.excludedAssets = (state.project.excludedAssets || []).filter(item => item !== id);
    }
    renderAssetPicker();
    renderComposerContext();
    persist();
    showToast(state.pinnedAssets.includes(id) ? `已固定《${ENTRY_MAP.get(id).title}》，每次续写必带` : `已取消固定《${ENTRY_MAP.get(id).title}》`);
  }

  function citeCurrentDoc() {
    const id = state.currentDocId;
    if (!id) return;
    if (!state.pinnedAssets.includes(id)) state.pinnedAssets.push(id);
    state.assistantMode = "create";
    closeModals();
    renderAssistant();
    openAssistantOnMobile();
    persist();
    showToast(`已引用《${ENTRY_MAP.get(id).title}》`);
  }

  /* 关系图分组：同族同院/同阵营的人聚在一簇，簇内密、簇间疏，
     既容纳数十个节点，也让"谁和谁是一伙"一眼可见。
     分组表由当前世界书的 STUDIO.relationGroups 提供，center 标记的簇固定在圆心。 */
  const RELATION_GROUPS = asArray(STUDIO.relationGroups);
  const CENTER_GROUP = RELATION_GROUPS.find(group => group.center) || RELATION_GROUPS[0];

  const EDGE_TYPES = {
    kin: { label: "亲属", color: "#a8874f" },
    serve: { label: "主仆", color: "#88729a" },
    love: { label: "情感", color: "#913b3b" },
    peer: { label: "同侪", color: "#49675d" },
    power: { label: "权力", color: "#7a4a6b" },
    feud: { label: "对立", color: "#b4602f" }
  };
  const EDGE_TYPE_IDS = Object.keys(EDGE_TYPES);

  function renderRelationGraph() {
    const width = 1320;
    const height = 920;
    const centerX = width / 2;
    const centerY = height / 2;

    const degree = new Map();
    DATA.relationship_edges.forEach(e => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });

    /* 数十人、数十条边同屏必然拥挤。默认只画核心人物；点某人则展开其一度关系。
       state.graphFocus 为空 = 总览；为某人姓名 = 该人 + 直接相关者。 */
    const focus = state.graphFocus || null;
    const focusSet = focus
      ? new Set([focus, ...DATA.relationship_edges
          .filter(e => e.source === focus || e.target === focus)
          .map(e => (e.source === focus ? e.target : e.source))])
      : null;

    // 兜底：没有写进任何分组的角色统一成簇，避免新增人物在图上凭空消失。
    const grouped = new Set(RELATION_GROUPS.flatMap(group => group.members));
    const orphans = DATA.characters.map(item => item.title).filter(name => !grouped.has(name));
    const allGroups = orphans.length
      ? [...RELATION_GROUPS, { id: "other", label: "其他人物", color: "#8a8f98", members: orphans }]
      : RELATION_GROUPS;

    // 分组圆心：中心簇固定居中，其余按人数加权排在椭圆上，簇大占地大。
    const OUTER = allGroups.filter(group => group !== CENTER_GROUP);
    const outerWeight = OUTER.reduce((sum, group) => sum + Math.max(group.members.length, 3), 0) || 1;
    const groups = allGroups.map(group => {
      if (group === CENTER_GROUP) return { ...group, cx: centerX, cy: centerY };
      // 按累计人数分配角度，让「妖王」这种大簇拿到更大的扇区。
      let before = 0;
      for (const other of OUTER) {
        if (other === group) break;
        before += Math.max(other.members.length, 3);
      }
      const middle = (before + Math.max(group.members.length, 3) / 2) / outerWeight;
      const angle = middle * Math.PI * 2 - Math.PI / 2;
      return { ...group, cx: centerX + 430 * Math.cos(angle), cy: centerY + 320 * Math.sin(angle) };
    });

    /* 一簇人越多，环越大、点越小；否则像「妖王与洞府」13 人挤在一圈上，
       名字会互相压住。环半径按人数线性放大并设上限，节点半径反向收缩。 */
    function ringGeometry(count) {
      if (count === 1) return { ring: 0, dot: 46 };
      if (count === 2) return { ring: 52, dot: 44 };
      const ring = Math.min(258, 46 + count * 16);
      const dot = Math.max(22, Math.min(40, 44 - count * 1.9));
      // 大簇里的人名要缩字号，否则五字长的名字会压到邻居。
      const font = count >= 9 ? 13 : count >= 6 ? 14 : 16;
      return { ring, dot, font };
    }

    const nodes = [];
    groups.forEach(group => {
      const visibleMembers = focusSet ? group.members.filter(n => focusSet.has(n)) : group.members;
      const count = visibleMembers.length;
      if (count === 0) return;   // 聚焦时该簇无人，整簇不画
      const { ring, dot, font } = ringGeometry(count);
      // 起始角偏移半格，避免第一个节点正好落在簇名正下方，与标题重叠。
      const offset = count > 1 ? Math.PI / count : 0;
      visibleMembers.forEach((name, index) => {
        const char = DATA.characters.find(item => item.title === name);
        if (!char) return;
        const angle = index * Math.PI * 2 / count - Math.PI / 2 + offset;
        const x = count === 1 ? group.cx : group.cx + ring * Math.cos(angle);
        const y = count === 1 ? group.cy : group.cy + ring * Math.sin(angle);
        nodes.push({
          id: char.id, name, group: group.id, color: group.color,
          radius: count <= 2 ? dot : Math.min(dot, 20 + (degree.get(name) || 0) * 0.9),
          font, x, y
        });
      });
    });

    // 簇的底衬椭圆与簇名位置都由环半径推出，随人数一起放大。
    const clusterBox = group => {
      const visible = focusSet ? group.members.filter(n => focusSet.has(n)) : group.members;
      const { ring, dot } = ringGeometry(Math.max(visible.length, 1));
      return { rx: Math.min(260, ring + dot + 18), ry: Math.min(260, ring + dot + 18) };
    };

    /* 环状排布只保证「同一簇内不重叠」，簇与簇之间仍会撞在一起，
       大簇尤其明显。这里做一次迭代式排斥松弛：重叠的节点沿连线互相推开，
       只挪少量，整体簇形不变。名字越长占位越宽，横向的排斥距离也相应放大。 */
    (function relax() {
      const PAD = 26;
      const widthOf = node => node.name.length * (node.font || 16) * 0.62;
      for (let pass = 0; pass < 90; pass += 1) {
        let moved = false;
        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = nodes[i], b = nodes[j];
            const minX = (widthOf(a) + widthOf(b)) / 2 + PAD * 0.5;
            const minY = a.radius + b.radius + PAD * 0.5;
            const dx = b.x - a.x, dy = b.y - a.y;
            if (Math.abs(dx) >= minX || Math.abs(dy) >= minY) continue;
            const pushX = (minX - Math.abs(dx)) / 2 * (dx < 0 ? -1 : 1);
            const pushY = (minY - Math.abs(dy)) / 2 * (dy < 0 ? -1 : 1);
            a.x -= pushX; b.x += pushX;
            a.y -= pushY; b.y += pushY;
            moved = true;
          }
        }
        if (!moved) break;
      }
      // 收进画布，留出簇名与描边的位置。
      nodes.forEach(node => {
        const halfW = (node.name.length * (node.font || 16) * 0.62) / 2;
        node.x = Math.min(width - halfW - 14, Math.max(halfW + 14, node.x));
        node.y = Math.min(height - node.radius - 14, Math.max(node.radius + 30, node.y));
      });
    })();

    const positions = new Map(nodes.map(node => [node.name, node]));
    const edges = DATA.relationship_edges
      .map(edge => ({
        ...edge,
        sourceNode: positions.get(edge.source),
        targetNode: positions.get(edge.target)
      }))
      .filter(edge => edge.sourceNode && edge.targetNode)
      .filter(edge => !focusSet || (focusSet.has(edge.source) && focusSet.has(edge.target)))
      .filter(edge => state.graphFilter === "all" ? true
        : EDGE_TYPE_IDS.includes(state.graphFilter)
          ? edge.type === state.graphFilter
          : edge.source === state.graphFilter || edge.target === state.graphFilter);

    /* 「全部」与关系类型都不是人名，必须置空；否则 activeName 会拿到 "all"，
       整张图被当成"只高亮 all 这个人"，所有节点都变灰。 */
    const activeName = state.graphFilter === "all" || EDGE_TYPE_IDS.includes(state.graphFilter) ? null : state.graphFilter;

    $("#relationGraph").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(WORLD_META.book)}的 ${nodes.length} 位人物关系网络">
      <defs>
        ${Object.entries(EDGE_TYPES).map(([type, meta]) =>
          `<marker id="arrow-${type}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${meta.color}" opacity=".55"/></marker>`).join("")}
      </defs>
      ${groups.filter(group => !focusSet || group.members.some(n => focusSet.has(n))).map(group => `<g class="graph-cluster">
        <ellipse cx="${group.cx}" cy="${group.cy}" rx="${clusterBox(group).rx}" ry="${clusterBox(group).ry}" fill="${group.color}" opacity=".05"/>
        <text class="cluster-label" x="${group.cx}" y="${group.cy - clusterBox(group).ry - 12}" text-anchor="middle" style="fill:${group.color}">${esc(group.label)}</text>
      </g>`).join("")}
      ${edges.map(edge => {
        const related = !activeName || edge.source === activeName || edge.target === activeName;
        return `<line class="graph-edge" x1="${edge.sourceNode.x}" y1="${edge.sourceNode.y}" x2="${edge.targetNode.x}" y2="${edge.targetNode.y}"
          stroke="${EDGE_TYPES[edge.type]?.color || "var(--line)"}"
          stroke-opacity="${related ? (activeName ? .85 : .45) : .06}"
          stroke-width="${related ? (activeName ? 2 : 1 + edge.intensity * .22) : .7}"
          ${related && activeName ? `marker-end="url(#arrow-${edge.type})"` : ""}>
          <title>${esc(edge.source)} — ${esc(edge.target)}｜${esc(EDGE_TYPES[edge.type]?.label || "")}：${esc(edge.relationship)}</title>
        </line>`;
      }).join("")}
      ${nodes.map(node => {
        const dimmed = activeName && node.name !== activeName
          && !DATA.relationship_edges.some(e => (e.source === activeName && e.target === node.name) || (e.target === activeName && e.source === node.name));
        const isFocus = focus === node.name;
        return `<g class="graph-node ${dimmed ? "dimmed" : ""} ${isFocus ? "focused" : ""}" style="--node-color:${node.color}" data-action="graph-focus" data-name="${esc(node.name)}" data-id="${node.id}" tabindex="0" role="button" aria-label="聚焦${esc(node.name)}的关系；再次点击查看档案">
          <circle cx="${node.x}" cy="${node.y}" r="${node.radius}"/>
          <text x="${node.x}" y="${node.y}"${node.font && node.font !== 16 ? ` style="font-size:${node.font}px"` : ""}>${esc(node.name)}</text>
        </g>`;
      }).join("")}
    </svg>`;

    $$("#relationFilters button").forEach(button => button.classList.toggle("active", button.dataset.filter === state.graphFilter));
    const chip = $("#graphFocusChip");
    if (chip) {
      chip.classList.toggle("hidden", !state.graphFocus);
      if (state.graphFocus) chip.textContent = `聚焦：${state.graphFocus} ✕`;
    }
  }

  function createNextRoutes(node) {
    const set = STUDIO.continuationSets[Math.max(0, node.depth - 1) % STUDIO.continuationSets.length];
    return set.map((item, index) => {
      const key = `D${node.depth + 1}${["A", "B", "C"][index]}`;
      return {
        id: key, key, type: item.type, title: item.title, summary: item.summary,
        core: [item.view, item.conflict, item.tone],
        axes: { view: item.view, conflict: item.conflict, cast: item.cast, tone: item.tone, development: item.development },
        content: null
      };
    });
  }

  function routesFor(node) {
    if (!node.routes?.length) node.routes = createNextRoutes(node);
    return node.routes;
  }

  function buildRouteContent(route, parent) {
    const name = state.project.protagonist;
    return [
      `${parent.title}之后，${name}没有立刻把眼前的事说破。${route.summary}此刻真正要紧的，并不是尽快得到一个答案，而是看清每个人愿意说到哪一步。`,
      `廊外有人走过，脚步声在门前略停，又慢慢远去。${name}将方才听见的话重新想了一遍，只拣最寻常的一句应下。事情似乎仍停在原处，人与人的心却已各自挪动了一寸。`
    ];
  }


  function planRetrieval(parentId, route, instruction = "") {
    const path = getPath(parentId);
    const query = [route?.summary, route?.title, route?.axes?.cast, route?.axes?.conflict, instruction]
      .filter(Boolean).join(" ");
    return AI.retrieveAssets({
      project: state.project,
      path,
      query,
      pinned: state.pinnedAssets
    });
  }

  async function selectRoute(parentId, routeId) {
    const parent = getNode(parentId);
    if (parent?.stateStale) { setAiError("分支需要更新", { message: "上游章节已重写，请先从最早受影响的章节开始逐节重新生成，再继续续写。" }); return; }
    const route = routesFor(parent).find(item => item.id === routeId);
    if (!parent || !route) return;
    const id = `${parentId}.${routeId}`;
    const existing = state.project.nodes[id];
    if (existing?.content?.length && existing.generatedBy) {
      state.activeNodeId = id;
      state.assistantMode = "create";
      state.freshCreation = false;
      state.chat = null;
      state.aiError = null;
      persist();
      renderAssistant();
      if (state.view === "creations") renderProject();
      return;
    }

    if (!AI.canUse()) {
      setAiError("未连接 AI 服务", { message: state.aiStatus.reason || "请先在设置中接入 DeepSeek，再选择路线。" }, "open-ai-settings");
      return;
    }

    state.aiError = null;
    const path = getPath(parentId);
    const retrieval = planRetrieval(parentId, route);
    startBusy(`正在沿「${route.title}」续写`, "先由模型选择相关卡片，再生成正文与分支状态…", {
      manual: true, phases: ["正在整理候选卡和分支状态…"]
    });
    renderAssistant();
    try {
      const result = await AI.continueBranch({
        project: state.project, path,
        chosenRoute: route,
        assets: retrieval.ids,
        pinned: state.pinnedAssets,
        brief: state.project.brief, cross: state.project.cross || null, onProgress: writingProgress, onDelta: renderStreamDelta, onReasoning: renderReasoningDelta
      });
      state.lastRetrieval = result.retrieval;
      state.project.nodes[id] = {
        id, parentId, routeId, key: route.key,
        title: result.title, type: result.type,
        summary: result.axes.development, core: [result.axes.view, result.axes.conflict, result.axes.tone],
        axes: result.axes, content: result.content,
        routes: result.routes.map(item => ({ ...item, content: null, next: null })),
        assets: result.retrieval.ids, retrieval: result.retrieval, storyState: result.storyState,
        briefCheck: result.briefCheck,
        chronicleCount: AI.pathContext(path).chronicleCount,
        depth: parent.depth + 1,
        status: "续写中", generatedBy: aiStatusText(), createdAt: new Date().toISOString()
      };
      state.activeNodeId = id;
      state.freshCreation = false;
      state.chat = null;
      state.assistantMode = "create";
      state.qualityResults = null;
      state.aiEval = null;
      // 流式草稿归流式草稿：正文正式落位时仍按字墨雾渐显，像誊清一遍。
      state.revealNode = { id, until: Date.now() + 13000 };
      persist();
    } catch (error) {
      stopBusy();
      // 节点并未生成成功，保持停留在父节点，避免 activeNodeId 指向空节点。
      state.activeNodeId = parent.id;
      setAiError("这一节没有生成成功", error, "retry-route", JSON.stringify({ parentId, routeId }));
      return;
    }
    stopBusy();
    renderAssistant();
    renderComposerContext();
    if (state.view === "creations") renderProject();
    showToast(`已续写《${state.project.nodes[id].title}》`);
  }

  function selectNode(id) {
    if (!getNode(id)) return;
    state.activeNodeId = id;
    state.assistantMode = "create";
    state.freshCreation = false;
    state.chat = null;
    persist();
    renderAssistant();
    if (state.view === "creations") renderProject();
  }

  /* 自由续写时按关键词给新节点起标题。关键词表由当前世界书提供，
     避免在另一本书里冒出「账册」「诗社」这类不属于它的意象。 */
  function customTitle(text) {
    const cues = asArray(STUDIO.titleCues);
    const fallback = STUDIO.titleFallback || "一程另记";
    const hit = cues.find(([pattern]) => new RegExp(pattern).test(text));
    return hit ? hit[1] : fallback;
  }

  async function createCustomContinuation(text) {
    const parent = activeNode();
    if (!parent) return;
    if (parent.stateStale) { setAiError("分支需要更新", { message: "上游章节已重写，请先从最早受影响的章节开始逐节重新生成，再继续续写。" }); return; }
    if (!AI.canUse()) {
      setAiError("未连接 AI 服务", { message: state.aiStatus.reason || "请先在设置中接入 DeepSeek，再提交续写想法。" }, "open-ai-settings");
      return;
    }
    await aiContinue(text, parent);
  }

  async function aiContinue(text, parent, perspective = null) {
    state.aiError = null;
    const path = getPath(parent.id);
    const retrieval = planRetrieval(parent.id, null, text);
    startBusy("正在按你的方向续写", "先由模型选择相关卡片，再生成正文与分支状态…", {
      manual: true, phases: ["正在整理候选卡和分支状态…"]
    });
    renderAssistant();
    try {
      const id = `${parent.id}.custom-${Date.now()}`;
      const directionText = text.replace(/[。！？；\s]+$/, "");
      const result = await AI.continueBranch({
        project: state.project, path,
        chosenRoute: null, instruction: directionText,
        assets: retrieval.ids, pinned: state.pinnedAssets,
        brief: state.project.brief, perspective, cross: state.project.cross || null, onProgress: writingProgress, onDelta: renderStreamDelta, onReasoning: renderReasoningDelta
      });
      state.lastRetrieval = result.retrieval;
      state.project.nodes[id] = {
        id, parentId: parent.id, routeId: id.slice(parent.id.length + 1), key: "自",
        title: result.title, type: result.type || "自由创作",
        summary: `沿当前分支采纳你的创作想法：“${directionText}”。`,
        core: [result.axes.view, result.axes.conflict, result.axes.tone],
        axes: result.axes, content: result.content,
        routes: result.routes.map(item => ({ ...item, content: null, next: null })),
        assets: result.retrieval.ids, retrieval: result.retrieval, storyState: result.storyState,
        briefCheck: result.briefCheck,
        chronicleCount: AI.pathContext(path).chronicleCount,
        depth: parent.depth + 1,
        status: "续写中", customPrompt: text, perspective, generatedBy: aiStatusText(),
        createdAt: new Date().toISOString()
      };
      state.activeNodeId = id;
      state.qualityResults = null;
      state.aiEval = null;
      // 流式草稿归流式草稿：正文正式落位时仍按字墨雾渐显，像誊清一遍。
      state.revealNode = { id, until: Date.now() + 13000 };
      persist();
      stopBusy();
      renderAssistant();
      if (state.view === "creations") renderProject();
      showToast(`已写入《${result.title}》`);
    } catch (error) {
      stopBusy();
      setAiError("自由续写没有生成成功", error, perspective ? "retry-perspective" : "retry-custom", perspective ? JSON.stringify({ text, parentId: parent.id, projectId: state.project.id, perspective }) : text);
    }
  }

  function assetChips(ids) {
    return ids.map(id => ENTRY_MAP.get(id)).filter(Boolean).map(item => `<button class="asset-chip" data-action="open-doc" data-id="${item.id}">${icon("book")}${esc(item.title)}</button>`).join("");
  }

  /* 刚生成的节点在有效期内做流式渐显；过期或普通切换都走静态渲染。 */
  function nodeReveal(id) {
    return state.revealNode?.id === id && Date.now() < state.revealNode.until;
  }

  /* 按字匀速的"墨雾"渐显：正文拆成字符 span，rAF 恒定字速逐字点亮。
     每个字自带 0.7s 的 blur→清晰过渡，整段读起来像一团缓慢推进的雾。 */
  function startInkReveal(container) {
    if (!container) return;
    const paras = [...container.querySelectorAll("p")];
    if (!paras.length) return;
    const spans = [];
    paras.forEach(p => {
      const text = p.textContent;
      p.textContent = "";
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        const span = document.createElement("span");
        span.className = "ink-char";
        span.textContent = ch;
        frag.appendChild(span);
        spans.push(span);
      }
      p.appendChild(frag);
    });
    const total = spans.length;
    if (!total) return;
    // 匀速：每字耗时恒定；全文时长随字数线性伸缩，短文不匆忙、长文不拖沓。
    const duration = Math.min(11000, Math.max(3500, total * 9));
    const started = performance.now();
    let shown = 0;
    const tick = now => {
      if (!container.isConnected) return; // 渲染被替换，动画随之作废
      const progress = Math.min(1, (now - started) / duration);
      const target = Math.floor(progress * total);
      while (shown < target) spans[shown++].classList.add("on");
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function routeCards(node, reveal = false, revealBase = 0) {
    const routes = routesFor(node);
    return `<div class="direction-heading"><strong>接下来，你想怎么写？</strong><span>三条路线 · 实质差异</span></div>${routes.map((route, index) => `
      <article class="route-card${reveal ? " route-reveal" : ""}"${reveal ? ` style="animation-delay:${revealBase + index * 130}ms"` : ""}>
        <div class="route-card-main">
          <div class="route-card-label"><span class="route-key">${esc(route.key)}</span><span class="route-type">${esc(route.type)}</span><span class="route-difference">${esc(route.axes?.view || "独立视角")}</span></div>
          <h3>《${esc(route.title)}》</h3>
          <p>${esc(route.summary)}</p>
          <div class="route-core">核心：${asArray(route.core).map(esc).join("、")}</div>
        </div>
        <div class="route-card-footer"><span>${esc(route.axes?.tone || "独立基调")} · ${esc(route.axes?.development || "新的发展")}</span><button class="route-select" data-action="select-route" data-parent="${esc(node.id)}" data-route="${esc(route.id)}">选择这条路线${icon("arrow")}</button></div>
      </article>`).join("")}`;
  }

  function renderCreateAssistant() {
    const busy = renderAiBusy();
    const error = renderAiError();
    if (state.freshCreation) {
      return `${error}${busy}<div class="assistant-welcome"><div class="assistant-welcome-icon">${icon("pen")}</div><h3>下一个故事，<br>从谁开始？</h3><p>告诉我主角、叙事视角和不能改变的边界。我会先调用世界书资料，给出三条真正不同的创作路线，而不是直接写完整小说。</p><div class="suggestion-chips">${asArray(STUDIO.welcomeChips).map(chip => `<button data-action="use-prompt" data-prompt="${esc(chip.prompt)}">${esc(chip.label)}</button>`).join("")}</div><div class="originality-note" style="margin-top:18px">${icon("info")}新作品会同步到共享作品架，已有故事不受影响；当前正在写的作品随时可从“我的创作”切回。</div></div>`;
    }

    const node = activeNode();
    if (node.id === "root") {
      const profile = state.project.profile;
      const reveal = nodeReveal("root");
      return `${error}${busy}<div class="message-label">你的创作需求</div><div class="user-message">${esc(state.project.prompt)}</div>
        ${state.project.material ? `<div class="originality-note" style="margin-top:10px">${icon("file")}已读取素材“${esc(state.project.material.name)}”，作为本次创作上下文。</div>` : ""}
        <section class="ai-message"><div class="ai-message-heading${reveal ? " ink-reveal-head" : ""}">${icon("spark")}<strong>先理解，再创作</strong><span>${esc(state.project.generatedBy || "文学创作模式")}</span></div>
          <div class="intent-card"><strong>创作意图已理解</strong><div class="intent-grid"><span>主角<strong>${esc(state.project.protagonist)}</strong></span><span>叙事<strong>${esc(profile.viewpoint)}</strong></span><span>边界<strong>${esc(state.project.boundary || "不改原著主线")}</strong></span></div></div>
          <div class="asset-used"><span>规划建议卡</span>${assetChips(node.assets)}</div>
          <div class="ai-prose${reveal ? " ink-reveal" : ""}"><p>${esc(node.summary)}</p><p>这段故事可以从三个不同方向展开：</p></div>
          ${briefChips()}
          ${perspectiveLabButton()}
        </section>${routeCards(node, reveal, 900)}<div class="originality-note" style="margin-top:13px">${icon("info")}以上路线为 ${esc(state.project.generatedBy || "原创")} 规划，不是原著已有情节。也可以直接在下方提出自己的想法。</div>`;
    }

    const parent = getNode(node.parentId);
    const reveal = nodeReveal(node.id);
    return `${error}${busy}<div class="story-message-head${reveal ? " ink-reveal-head" : ""}"><div class="story-breadcrumb"><button data-action="select-node" data-id="root">${esc(state.project.title)}</button>${icon("chevron")}<span>第 ${node.depth} 节</span></div><h3>${esc(node.title)}</h3><p>${esc(node.type)} · ${esc(node.axes?.view || "当前分支")} · 作品架自动同步</p></div>
      <div class="story-prose${reveal ? " ink-reveal" : ""}">${node.content.map(paragraph => `<p>${esc(paragraph)}</p>`).join("")}</div>
      ${node.stateStale ? `<div class="brief-warn">上游章节已重写，本节和故事状态可能不再一致；请从最早受影响的章节开始逐节重新生成。</div>` : ""}
      ${renderRetrievalTrace(node)}${renderStoryState(node)}
      ${parent ? `<div class="suggestion-chips"><button data-action="select-node" data-id="${esc(parent.id)}">${icon("undo")} 回到上一节点，重选方向</button><button data-action="regenerate-node" data-id="${esc(node.id)}">${icon("spark")} 重新生成这一节</button></div>` : ""}
      ${briefChips()}
      ${perspectiveLabButton()}
      ${routeCards(node, reveal, 1400)}`;
  }

  function renderWorldAssistant() {
    return `<div class="assistant-welcome"><div class="assistant-welcome-icon">${icon("book")}</div><h3>先读懂世界，<br>再写新的故事。</h3><p>${esc(UI.assistantIntro || "基于原著的世界观、人物和故事背景，帮你查资料、理关系，持续创作新的文学支线。")}</p>
      <div class="assistant-entry-list">
        <button class="assistant-entry" data-action="assistant-mode" data-mode="world">${icon("compass")}<span><strong>认识这个世界</strong><small>了解人物、背景、关系和原著情节</small></span>${icon("chevron")}</button>
        <button class="assistant-entry" data-action="assistant-mode" data-mode="research">${icon("search")}<span><strong>查询与考据</strong><small>查询人物经历、时间线、细节和关系</small></span>${icon("chevron")}</button>
        <button class="assistant-entry" data-action="assistant-mode" data-mode="create">${icon("pen")}<span><strong>开始文学创作</strong><small>创作番外、平行故事、人物支线</small></span>${icon("chevron")}</button>
      </div>
      <div class="world-mini-grid">${STUDIO.categories.filter(item => !["all", "relation"].includes(item.id)).map(category => `<button data-action="world-category" data-category="${category.id}"><strong>${esc(category.name)}</strong><span>${categoryCount(category.id)} 项资产</span></button>`).join("")}</div></div>`;
  }

  function researchEntries(query) {
    const names = DATA.characters.map(item => item.title).filter(name => query.includes(name));
    const aliases = Object.keys(GRAPH_ALIASES).filter(name => query.includes(name)).map(name => GRAPH_ALIASES[name]);
    const focusNames = [...new Set([...names, ...aliases])];
    // 事件与场景按标题命中（如“宝玉挨打”“抄检大观园”）；全部词条的用户标签
    // （keywords）只要出现在问句里也算检索词，标题里“与/和”等措辞差异不再漏召回。
    const eventNames = DATA.canon_timeline.map(item => item.title).filter(title => title.length >= 3 && query.includes(title));
    const locationNames = DATA.locations.map(item => item.title).filter(title => title.length >= 3 && query.includes(title));
    const keywordTerms = [...new Set(ENTRIES.flatMap(item => asArray(item.keywords)).filter(k => k.length >= 2 && query.includes(k)))];
    // 通用词表：不再写死某一本书的专名，改由当前世界的别名与建议问题派生。
    const suggestionTerms = asArray(STUDIO.researchSuggestions)
      .flatMap(item => String(item.label || "").split(/[·与和s／/]+/))
      .filter(word => word.length >= 2);
    const genericTerms = ["时间线", "关系", "原著", "文风", "礼法", ...Object.keys(GRAPH_ALIASES), ...suggestionTerms];
    const terms = [...focusNames, ...eventNames, ...locationNames, ...keywordTerms, ...new Set(genericTerms)].filter(term => query.includes(term));
    return ENTRIES.map(item => {
      let score = 0;
      if (query && (item.title.includes(query) || item.content.includes(query))) score += 10;
      terms.forEach(term => {
        if (item.title.includes(term)) score += 5;
        if (asArray(item.keywords).some(keyword => keyword.includes(term))) score += 3;
        if (item.content.includes(term)) score += 1;
      });
      return { item, score };
    }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(result => result.item);
  }

  function renderResearchAssistant() {
    const busy = renderAiBusy();
    const error = renderAiError();
    if (!state.chat) {
      return `${error}<div class="assistant-welcome"><div class="assistant-welcome-icon">${icon("search")}</div><h3>考据不只给答案，<br>也给你依据。</h3><p>输入人物、事件或细节问题。我会在当前世界书中检索相关词条，再由 AI 给出结论，并标明原著事实、二创素材与不确定之处。</p><div class="suggestion-chips">${asArray(STUDIO.researchSuggestions).map(item => `<button data-action="research-query" data-query="${esc(item.query)}">${esc(item.label)}</button>`).join("")}</div></div>`;
    }
    const results = state.chat.results || [];
    const answer = state.chat.answer;
    const citations = state.chat.citations || [];
    return `${error}${busy}<div class="message-label">你的考据问题</div><div class="user-message">${esc(state.chat.query)}</div><section class="ai-message"><div class="ai-message-heading">${icon("search")}<strong>${answer ? "考据结论" : "世界书检索结果"}</strong><span>${results.length} 项相关资料</span></div>
      ${answer ? `<div class="research-answer"><p>${esc(answer)}</p></div>${state.chat.uncertainty ? `<div class="originality-note" style="margin-top:11px">${icon("info")}仍需核对：${esc(state.chat.uncertainty)}</div>` : ""}` : `<div class="research-answer"><p>${results.length ? "已检索到相关资料，正在等待 AI 归纳。" : "当前世界书没有检索到足够相关的资料。可以换用人物全名、场景名或事件名继续查询。"}</p></div>`}
      <div class="citation-list">${results.map(item => `<button class="citation-item ${citations.includes(item.id) ? "cited" : ""}" data-action="open-doc" data-id="${item.id}"><strong>${esc(item.title)} · ${esc(item.sourceLabel)}${citations.includes(item.id) ? " · 本次依据" : ""}</strong><span>${esc(clampText(item.content, 100))}</span></button>`).join("")}</div>
      ${answer ? `<div class="asset-used"><span>快捷操作</span>${results.length ? `<button class="asset-chip" data-action="cite-research-results">引用全部检索结果</button>` : ""}<button class="asset-chip" data-action="write-from-research">据此写一段</button></div>` : ""}</section>`;
  }

  function renderAssistant() {
    $$(".assistant-modes button").forEach(button => button.classList.toggle("active", button.dataset.mode === state.assistantMode));
    const body = $("#assistantBody");
    body.innerHTML = state.assistantMode === "world" ? renderWorldAssistant() : state.assistantMode === "research" ? renderResearchAssistant() : renderCreateAssistant();
    body.scrollTop = 0;
    // 刚生成的正文按字匀速渐显；其余渲染保持静态。
    if (state.assistantMode === "create" && !state.aiBusy) {
      const node = activeNode();
      if (nodeReveal(node.id)) startInkReveal($("#assistantBody .story-prose") || $("#assistantBody .ai-prose"));
    }
    const placeholders = {
      world: "问问这个世界，或描述你想了解的设定…",
      research: "输入人物、时间线、场景或关系问题…",
      create: state.freshCreation || state.activeNodeId === "root" ? "描述你想写的人物、视角与故事边界…" : "也可以直接写下你的续写想法…"
    };
    $("#composerInput").placeholder = placeholders[state.assistantMode];
    renderComposerContext();
  }

  function renderComposerContext() {
    const container = $("#composerContext");
    /* 写入落点常显：切书失败时最容易被忽略的就是"在写哪本"。 */
    const bookTag = `<span class="context-label book">正在写</span><button class="context-chip book-name" data-action="goto-creations" title="当前作品与落点，点击前往书架核对">《${esc(state.project.title)}》${state.freshCreation ? " · 新故事待规划" : state.activeNodeId !== "root" ? ` · 落点：${esc(getNode(state.activeNodeId)?.title || "最新节点")}` : " · 待选路线"}</button>`;
    if (state.assistantMode !== "create") {
      container.innerHTML = `${bookTag}${state.attachedMaterial ? `<span class="context-label">素材</span><button class="context-chip" data-action="remove-material">${icon("file")}${esc(state.attachedMaterial.name)}${icon("x")}</button>` : ""}`;
      return;
    }
    const pinned = state.pinnedAssets.map(id => ENTRY_MAP.get(id)).filter(Boolean)
      .map(item => `<button class="context-chip pinned" data-action="toggle-asset" data-id="${item.id}" title="已固定，点击取消">${esc(item.title)}${icon("x")}</button>`).join("");
    const material = state.attachedMaterial ? `<button class="context-chip" data-action="remove-material">${icon("file")}${esc(state.attachedMaterial.name)}${icon("x")}</button>` : "";
    const auto = (state.lastRetrieval?.detail || []).filter(item => !state.pinnedAssets.includes(item.id)).slice(0, 5)
      .map(item => `<button class="context-chip auto" data-action="toggle-asset" data-id="${item.id}" title="${esc(item.reasons.join("、"))}，点击固定">${esc(item.title)}</button>`).join("");
    const parts = [bookTag];
    if (pinned) parts.push(`<span class="context-label">固定</span>${pinned}`);
    if (auto) parts.push(`<span class="context-label">${state.lastRetrieval?.method === "model" ? "上次注入" : "候选"}</span>${auto}`);
    const excluded = (state.freshCreation ? [] : (state.project.excludedAssets || [])).map(id => ENTRY_MAP.get(id)).filter(Boolean)
      .map(item => `<button class="context-chip" data-action="restore-asset" data-id="${esc(item.id)}" title="点击恢复自动选卡">${esc(item.title)} · 恢复</button>`).join("");
    if (excluded) parts.push(`<span class="context-label">已排除</span>${excluded}`);
    if (material) parts.push(material);
    container.innerHTML = parts.join("");
  }

  function renderRetrievalTrace(node) {
    const detail = node.retrieval?.detail;
    if (!detail?.length) return "";
    const check = node.briefCheck;
    const warn = check?.issues?.length
      ? `<div class="brief-warn">${icon("info")}<span>与任务卡不符：${esc(check.issues.join("；"))}</span></div>`
      : check?.chars
        ? `<div class="brief-warn" style="background:var(--jade-soft)">${icon("check")}<span>任务卡检查通过（${check.chars} 字）${check.droppedMeta ? `，已剔除 ${check.droppedMeta} 段元信息` : ""}</span></div>`
        : "";
    const coreRules = node.retrieval.coreRules || [];
    return `<details class="retrieval-trace"><summary>本次注入 ${detail.length} 张卡${coreRules.length ? ` + ${coreRules.length} 条固定法则` : ""} · ${node.retrieval.chars} 字${node.chronicleCount ? ` · 前情压缩 ${node.chronicleCount} 节` : ""}</summary><div class="trace-list">${detail.map(item => `<div class="trace-row"><span class="trace-id">${esc(item.id)}</span><span class="trace-name">${esc(item.title)}</span><span class="trace-reason">${esc(item.reasons.join("、"))}</span>${node.retrieval.method === "model" && !item.reasons.some(reason => reason.includes("必带") || reason.includes("固定")) ? `<button class="button secondary compact" data-action="exclude-asset" data-id="${esc(item.id)}">后续排除</button>` : ""}</div>`).join("")}${coreRules.length ? `<p>固定创作法则（每节注入，字数不计入卡片预算）：${esc(coreRules.map(rule => `${rule.id} ${rule.title}`).join("、"))}</p>` : ""}${node.retrieval.omitted?.length ? `<p>因预算未注入模型选中的卡：${esc(node.retrieval.omitted.join("、"))}</p>` : ""}</div></details>${warn}`;
  }

  function renderStoryState(node) {
    const s = node.storyState;
    if (!s) return `<div class="originality-note">旧节点暂无独立故事状态，续写时依据当前路径正文。</div>`;
    const groups = [["已发生", s.facts], ["人物与知情", s.characters], ["未解决线索", s.openThreads]];
    return `<details class="retrieval-trace"><summary>本分支故事状态 · 模型整理，建议核对</summary><div class="trace-list">${groups.map(([label, items]) => `<p><strong>${esc(label)}：</strong>${esc((items || []).join("；") || "暂无")}</p>`).join("")}</div></details>`;
  }

  function openBriefEditor() {
    const brief = AI.normalizeBrief(state.project.brief);
    $("#briefGenre").value = brief.genre;
    $("#briefPov").value = brief.pov;
    $("#briefChars").value = brief.sectionChars;
    $("#briefAudience").value = brief.audience;
    $("#briefTone").value = brief.tone;
    $("#briefMustKeep").value = brief.mustKeep.join("\n");
    $("#briefForbidden").value = brief.forbidden.join("\n");
    $("#briefHint").textContent = "";
    $("#briefHint").className = "settings-hint";
    if (![...$("#briefPov").options].some(option => option.value === brief.pov)) {
      $("#briefPov").insertAdjacentHTML("beforeend", `<option>${esc(brief.pov)}</option>`);
    }
    $("#briefPov").value = brief.pov;
    openModal("briefModal");
  }

  function saveBrief() {
    const brief = AI.normalizeBrief({
      genre: $("#briefGenre").value,
      pov: $("#briefPov").value,
      sectionChars: $("#briefChars").value,
      audience: $("#briefAudience").value,
      tone: $("#briefTone").value,
      mustKeep: $("#briefMustKeep").value.split("\n").map(item => item.trim()).filter(Boolean),
      forbidden: $("#briefForbidden").value.split("\n").map(item => item.trim()).filter(Boolean)
    });
    state.project.brief = brief;
    persist();
    const hint = $("#briefHint");
    hint.textContent = `已保存：${brief.genre} · ${brief.pov} · 约 ${brief.sectionChars} 字/节`;
    hint.className = "settings-hint ok";
    renderAssistant();
    showToast("任务卡已更新，下次续写生效");
  }

  let perspectiveLab = null;

  function perspectiveLabButton() {
    return `<div class="perspective-entry"><div><strong>同事异见</strong><span>让同一件事，在不同人物心里生出不同的故事。</span></div><button class="button secondary compact" data-action="open-perspective-lab">打开创作实验台</button></div>`;
  }

  // 候选只来自当前路径；后续路线明确标为设想，不伪装成已经发生的事实。
  function perspectiveEvents(node) {
    const events = [], seen = new Set();
    const add = (value, kind, label) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (text.length < 5 || seen.has(text)) return;
      seen.add(text); events.push({ text, kind, label });
    };
    if (node.id !== "root") {
      asArray(node.content).forEach(paragraph => add(paragraph, "past", "本节片段"));
      asArray(node.storyState?.facts).slice(-3).forEach(fact => add(fact, "past", "故事状态 · 待核对"));
    } else add(node.summary, "premise", "故事起点");
    asArray(node.routes).slice(0, 3).forEach(route => add(route.summary, "future", `后续设想 · ${route.title || "新方向"}`));
    if (!events.length) add(node.summary || state.project.prompt, "premise", "故事起点");
    return events.slice(0, 8);
  }

  function rankPerspectiveCharacters(event, node) {
    const chosenText = event?.text || "";
    const recentText = [node.summary, ...asArray(node.content), node.axes?.cast].filter(Boolean).join(" ");
    return DATA.characters.map((character, index) => {
      const aliases = [character.title, ...Object.keys(GRAPH_ALIASES).filter(alias => GRAPH_ALIASES[alias] === character.title), ...asArray(character.keywords).filter(word => word.length >= 2 && (word === character.title || GRAPH_ALIASES[word] === character.title))];
      const matches = source => aliases.some(name => source.includes(name));
      const score = (matches(chosenText) ? 100 : 0) + (matches(recentText) ? 30 : 0) + (aliases.includes(state.project.protagonist) ? 20 : 0);
      return { character, score, index };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
  }

  function renderPerspectiveEvents() {
    const lab = perspectiveLab;
    $("#perspectiveEvents").innerHTML = lab.events.map((item, index) => `<button class="perspective-option ${lab.selectedEvent === index ? "selected" : ""}" data-action="select-perspective-event" data-index="${index}" aria-pressed="${lab.selectedEvent === index}"><span>${esc(item.label)}</span><strong>${esc(clampText(item.text, 135))}</strong></button>`).join("");
  }

  function renderPerspectiveCharacters() {
    const lab = perspectiveLab;
    $("#perspectiveCharacterCount").textContent = `${lab.selectedCharacters.length} / 4`;
    if (lab.selectedEvent === null) {
      $("#perspectiveCharacters").innerHTML = "";
      $("#perspectiveMore").classList.add("hidden");
      $("#perspectiveCharacterHint").textContent = "选定事件后，为你推荐相关人物。";
      return;
    }
    const ranked = rankPerspectiveCharacters(lab.events[lab.selectedEvent], getNode(lab.nodeId));
    const shown = lab.showAll ? ranked : ranked.filter((item, index) => index < 8 || lab.selectedCharacters.includes(item.character.title));
    $("#perspectiveCharacterHint").textContent = "可多选 2–4 人；优先展示事件和当前章节提及的人物。";
    $("#perspectiveCharacters").innerHTML = shown.map(({ character }) => `<button class="perspective-person ${lab.selectedCharacters.includes(character.title) ? "selected" : ""}" data-action="toggle-perspective-character" data-id="${esc(character.id)}" aria-pressed="${lab.selectedCharacters.includes(character.title)}"><strong>${esc(character.title)}</strong><span>${esc(clampText(character.identity || character.traits || "世界书人物", 32))}</span></button>`).join("");
    const more = $("#perspectiveMore");
    more.classList.toggle("hidden", ranked.length <= 8);
    more.textContent = lab.showAll ? "收起人物" : `查看全部 ${ranked.length} 个人物`;
  }

  function clearPerspectiveResults(message) {
    perspectiveLab.results = null;
    $("#perspectiveResults").innerHTML = "";
    $("#perspectiveStatus").textContent = message;
  }

  function openPerspectiveLab() {
    const node = activeNode();
    if (!node) return;
    perspectiveLab = { projectId: state.project.id, nodeId: node.id, events: perspectiveEvents(node), selectedEvent: null, selectedCharacters: [], showAll: false, results: null };
    $("#perspectiveContext").textContent = `当前分支：${state.project.title} · ${node.id === "root" ? "故事起点" : node.title}`;
    clearPerspectiveResults("先选择一件事，再选择 2–4 个人物。");
    renderPerspectiveEvents(); renderPerspectiveCharacters();
    openModal("perspectiveModal");
  }

  function selectPerspectiveEvent(index) {
    if (!perspectiveLab?.events[index]) return;
    perspectiveLab.selectedEvent = index;
    perspectiveLab.selectedCharacters = [];
    perspectiveLab.showAll = false;
    clearPerspectiveResults("已选择事件，请选择 2–4 个人物。");
    renderPerspectiveEvents(); renderPerspectiveCharacters();
    $("#perspectiveCharacterHint").scrollIntoView?.({ block: "nearest" });
  }

  function togglePerspectiveCharacter(id) {
    const lab = perspectiveLab;
    if (!lab || lab.selectedEvent === null) return;
    const character = DATA.characters.find(item => item.id === id);
    if (!character) return;
    if (lab.selectedCharacters.includes(character.title)) lab.selectedCharacters = lab.selectedCharacters.filter(name => name !== character.title);
    else if (lab.selectedCharacters.length < 4) lab.selectedCharacters.push(character.title);
    else { $("#perspectiveStatus").textContent = "最多选择 4 个人物，请先取消一位。"; return; }
    clearPerspectiveResults(lab.selectedCharacters.length < 2 ? "请至少选择 2 个人物。" : `已选 ${lab.selectedCharacters.length} 人，可以生成不同看法。`);
    renderPerspectiveCharacters();
  }

  async function generatePerspectives() {
    const lab = perspectiveLab;
    const status = $("#perspectiveStatus");
    const notify = message => { status.textContent = message; status.scrollIntoView?.({ block: "nearest" }); };
    if (!lab || lab.selectedEvent === null || !lab.events[lab.selectedEvent]) { notify("请先选择一件事。"); return; }
    const selectedEvent = lab.events[lab.selectedEvent];
    const event = selectedEvent.text;
    const characters = [...lab.selectedCharacters];
    if (characters.length < 2 || characters.length > 4) { notify("请选择 2–4 个人物，再生成不同看法。"); return; }
    if (!AI.canUse()) { notify(state.aiStatus.reason || "未连接 AI 服务，请先在设置中接入。"); return; }
    const node = getNode(lab.nodeId);
    if (!node || node.stateStale || state.project.id !== lab.projectId || activeNode()?.id !== lab.nodeId) { notify("当前分支需要更新，请关闭后重新打开实验台。"); return; }
    lab.results = null;
    $("#perspectiveResults").innerHTML = "";
    const generateButton = document.querySelector('[data-action="generate-perspectives"]');
    generateButton.disabled = true;
    startBusy("正在探索不同视角", "正在准备世界书和当前分支…", { manual: true });
    notify("正在整理候选卡和当前分支…");
    try {
      const result = await AI.explorePerspectives({ project: state.project, path: getPath(node.id), event: `${selectedEvent.label}：${event}`, characters, pinned: state.pinnedAssets, onReasoning: renderReasoningDelta, onProgress: progress => {
        const messages = { selecting: `正在从 ${progress.candidateCount} 张候选卡中选择资料…`, selected: `已选好 ${progress.retrieval?.detail?.length || 0} 张相关卡，正在准备人物视角…`, exploring: "资料已就绪，正在设想人物各自的看法…", validating: "正在检查人物视角…", retrying: "正在调整结果，请稍候…" };
        status.textContent = messages[progress.stage] || "正在生成…";
        /* 选卡完成：把选中的卡以思考卡片的形式亮在状态行下方 */
        if (progress.stage === "selected" && progress.retrieval?.detail?.length) {
          $("#perspectiveModal .perspective-think-chips")?.remove();
          status.insertAdjacentHTML("afterend", `<div class="busy-cards perspective-think-chips">${progress.retrieval.detail.slice(0, 6).map((card, index) => `<span class="busy-chip" style="animation-delay:${index * 90}ms"><span class="chip-kind">${esc(card.kind)}</span><strong>${esc(card.title)}</strong></span>`).join("")}</div>`);
        }
      } });
      lab.event = event;
      lab.eventKind = selectedEvent.kind;
      lab.results = result.perspectives;
      status.textContent = `已参考 ${result.retrieval.detail.length} 张世界书卡片。下面是可供挑选的创作假设。`;
      $("#perspectiveResults").innerHTML = result.perspectives.map((item, index) => `<article class="perspective-card"><h3>${esc(item.character)}</h3><p><strong>可能的所见</strong>${esc(item.observed)}</p><p><strong>可能的理解或误解</strong>${esc(item.interpretation)}</p><p><strong>未说出口的话</strong>${esc(item.unspoken)}</p><button class="button secondary compact" data-action="use-perspective" data-index="${index}">用这个视角续写</button></article>`).join("");
      $("#perspectiveResults").scrollIntoView?.({ block: "nearest" });
    } catch (error) {
      notify(`生成失败：${aiErrorMessage(error)}。请检查连接后重试。`);
    } finally {
      generateButton.disabled = false;
      stopBusy();
      // 思考带和选卡 chips 是生成过程的临时展示，结束后一律撤下
      $("#perspectiveModal .reasoning-line")?.remove();
      $("#perspectiveModal .perspective-think-chips")?.remove();
    }
  }

  function usePerspective(index) {
    const lab = perspectiveLab;
    const item = lab?.results?.[index];
    const parent = lab && getNode(lab.nodeId);
    if (!item || !parent || parent.stateStale || state.project.id !== lab.projectId || activeNode()?.id !== lab.nodeId) { showToast("分支已变化，请重新打开实验台", "info"); return; }
    closeModals();
    const direction = lab.eventKind === "past" ? `参考已发生的这一段，从当前章节之后继续推进，不将已发生的事重新发生：${lab.event}` : `围绕这一故事设想续写：${lab.event}`;
    aiContinue(direction, parent, { ...item });
  }

  function briefChips() {
    const brief = state.project.brief;
    if (!brief) return "";
    const items = [brief.genre, brief.pov, `约 ${brief.sectionChars} 字/节`, brief.tone];
    return `<div class="brief-chip-row"><span class="context-label">任务卡</span>${items.map(item => `<span class="brief-chip">${esc(item)}</span>`).join("")}<button class="brief-chip" data-action="open-brief">${icon("settings")}调整</button></div>`;
  }

  function switchAssistantMode(mode) {
    state.assistantMode = mode;
    state.chat = null;
    state.freshCreation = false;
    renderAssistant();
  }

  function openAssistantOnMobile() {
    if (window.innerWidth <= 1120) document.body.classList.add("assistant-visible");
  }

  function startNewCreation() {
    state.freshCreation = true;
    state.assistantMode = "create";
    state.chat = null;
    state.pinnedAssets = [];
    state.attachedMaterial = null;
    $("#composerInput").value = "";
    renderAssistant();
    openAssistantOnMobile();
    setTimeout(() => $("#composerInput").focus(), 50);
  }

  function submitComposer(forcedText = null) {
    const input = $("#composerInput");
    if (state.aiBusy) { showToast("请等待当前请求完成", "info"); return; }
    const text = (forcedText ?? input.value).trim();
    if (!text) {
      showToast("先写下你的问题或创作想法", "info");
      input.focus();
      return;
    }
    if (!AI.canUse()) {
      setAiError("未连接 AI 服务", { message: state.aiStatus.reason || "请先在设置中接入 DeepSeek。" }, "open-ai-settings");
      return;
    }
    if (state.assistantMode === "create" && !state.freshCreation && activeNode()?.stateStale) {
      setAiError("分支需要更新", { message: "上游章节已重写，请先从最早受影响的章节开始逐节重新生成，再继续续写。" });
      return;
    }
    input.value = "";
    if (state.assistantMode === "research") {
      runResearch(text);
      return;
    }
    if (state.assistantMode === "world") {
      state.assistantMode = "research";
      runResearch(text);
      return;
    }
    if (state.freshCreation) {
      runNewProject(text);
      return;
    }
    createCustomContinuation(text);
  }

  async function runNewProject(text) {
    if (!AI.canUse()) {
      setAiError("未连接 AI 服务", { message: state.aiStatus.reason || "请先在设置中接入 DeepSeek。" }, "open-ai-settings");
      return;
    }
    state.aiError = null;
    startBusy("正在理解创作需求", "检索世界书资产，准备三条差异化路线…", {
      cards: state.pinnedAssets.map(id => ENTRY_MAP.get(id)).filter(Boolean).map(item => ({ kind: "固定引用", title: item.title, reasons: ["每次生成都带上"] })),
      phases: ["正在解析你的创作需求", "正在从世界书目录挑选资产", "DeepSeek 正在拟定主角、视角与边界", "正在规划三条差异化路线", "正在校验路线的结构差异"]
    });
    renderAssistant();
    try {
      const assets = [...new Set([...state.pinnedAssets])];
      const generated = await AI.generateStory({ prompt: text, material: state.attachedMaterial, assets });
      // 新作品加入作品架，不覆盖已有故事。
      const next = createProject(text, state.attachedMaterial, generated);
      next.pinnedAssets = [...state.pinnedAssets];
      state.projects.push(next);
      state.project = next;
      state.activeNodeId = "root";
      // 用户为新作品固定的卡继续保留，后续续写仍会注入。
      state.lastRetrieval = AI.retrieveAssets({
        project: state.project, path: [state.project.root],
        query: `${state.project.prompt} ${state.project.profile.viewpoint}`, pinned: []
      });
      state.freshCreation = false;
      state.qualityResults = null;
      state.benchmarkB = null;
      state.aiEval = null;
      state.revealNode = { id: "root", until: Date.now() + 13000 };
      persist();
      stopBusy();
      renderAssistant();
      renderComposerContext();
      if (state.view === "creations") renderProject();
      showToast(`《${state.project.title}》已加入作品架，共 ${state.projects.length} 部作品`);
    } catch (error) {
      stopBusy();
      setAiError("创作规划没有生成成功", error, "retry-project", text);
    }
  }

  async function runResearch(text) {
    const results = researchEntries(text);
    state.chat = { query: text, results, answer: "", citations: [] };
    if (!AI.canUse()) {
      state.aiError = { title: "未连接 AI 服务", message: state.aiStatus.reason || "已完成世界书检索，但需要接入 DeepSeek 才能生成考据结论。", retryAction: "open-ai-settings" };
      renderAssistant();
      return;
    }
    state.aiError = null;
    startBusy("正在归纳考据结论", "依据检索到的词条作答，区分原著与二创…", {
      cards: results.map(item => ({ kind: "词条", title: item.title, reasons: [`本地检索命中 · ${item.sourceLabel}`] })),
      phases: ["正在比对检索到的词条", "正在区分原著事实与二创素材", "DeepSeek 正在归纳考据结论", "正在核对引用编号与不确定之处"]
    });
    renderAssistant();
    try {
      const answer = await AI.research({ query: text, entries: results });
      state.chat = { query: text, results, answer: answer.answer, citations: answer.citations, uncertainty: answer.uncertainty };
      stopBusy();
      renderAssistant();
    } catch (error) {
      stopBusy();
      state.aiError = { title: "考据结论没有生成成功", message: aiErrorMessage(error), retryAction: "retry-research", retryPayload: text };
      renderAssistant();
    }
  }

  function visibleTree() {
    const actualChildren = parentId => Object.values(state.project.nodes).filter(node => node.parentId === parentId);
    const build = (node, isPlaceholder = false) => {
      const display = { node, isPlaceholder, children: [] };
      if (isPlaceholder) return display;
      /* 每个已写节点都展开全部路线：已写过的接实际节点，没写过的保留为
         "待选择"占位，让任何中间节点都能看到并从当年未选的分支继续。 */
      const routes = routesFor(node);
      const children = actualChildren(node.id);
      display.children = routes.map(route => {
        const actual = children.find(child => child.routeId === route.id);
        return actual ? build(actual) : build(route, true);
      });
      children.filter(child => !routes.some(route => route.id === child.routeId)).forEach(child => display.children.push(build(child)));
      return display;
    };
    return build(state.project.root);
  }

  function renderProjectShelf() {
    const shelf = $("#projectShelf");
    if (!shelf) return;
    const formatDay = iso => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
    };
    shelf.innerHTML = `<div class="section-heading"><div><h2>作品架</h2><p>${state.projects.length} 部作品位于共享作品架；新建创作不会覆盖它们。</p></div></div><div class="shelf-grid">${state.projects.map(project => {
      const nodeCount = Object.keys(project.nodes).length;
      const isActive = project === state.project;
      return `<article class="shelf-card ${isActive ? "active" : ""}">
        <button class="shelf-main" data-action="switch-project" data-id="${esc(project.id)}" ${isActive ? 'aria-current="true"' : ""}>
          <span class="shelf-mark">${esc((project.protagonist || "作").slice(0, 1))}</span>
          <span class="shelf-copy"><strong>${esc(project.title)}</strong><small>${esc(project.protagonist)} · ${nodeCount} 节${project.updatedAt ? ` · ${formatDay(project.updatedAt)} 更新` : ""}</small></span>
          ${isActive ? `<span class="shelf-current">正在写</span>` : ""}
        </button>
        <button class="shelf-delete" data-action="delete-project" data-id="${esc(project.id)}" title="删除这部作品" aria-label="删除《${esc(project.title)}》">${icon("trash")}</button>
      </article>`;
    }).join("")}</div>`;
  }

  function renderProject() {
    renderProjectShelf();
    const project = state.project;
    const nodes = Object.values(project.nodes);
    const charCount = nodes.reduce((sum, node) => sum + node.content.join("").length, 0);
    $("#projectTitle").textContent = project.title;
    $("#projectPrompt").textContent = project.prompt;
    $(".project-mark").textContent = project.protagonist.slice(0, 1);
    $("#projectNodeCount").textContent = nodes.length;
    $("#projectBranchCount").textContent = routesFor(project.root).length;
    $("#projectCharCount").textContent = charCount;
    $("#projectUpdated").textContent = nodes.length ? "作品架自动同步" : "等待选择第一条路线";
    renderBranchTree();
    renderNodePreview();
    renderVersionPath();
  }

  /* 分支树缩放：双指捏合（touch）、Mac 触控板捏合 / Ctrl+滚轮（wheel+ctrl），
     以及 +/- 按钮。zoom 属性会让外层滚动区域随缩放自然扩展，节点点击不受影响。 */
  const TREE_ZOOM_MIN = 0.4;
  const TREE_ZOOM_MAX = 2.5;

  function setTreeZoom(next) {
    state.treeZoom = Math.min(TREE_ZOOM_MAX, Math.max(TREE_ZOOM_MIN, Math.round(next * 100) / 100));
    applyTreeZoom();
  }

  function applyTreeZoom() {
    const container = $("#branchTree");
    if (container) container.style.zoom = state.treeZoom;
    const label = $("#treeZoomLabel");
    if (label) label.textContent = `${Math.round(state.treeZoom * 100)}%`;
  }

  function setupTreeZoomGestures() {
    const scroller = document.querySelector(".branch-tree-scroll");
    if (!scroller || scroller.dataset.zoomBound) return;
    scroller.dataset.zoomBound = "1";
    const touchDist = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    let pinch = null;
    scroller.addEventListener("touchstart", event => {
      if (event.touches.length === 2) pinch = { startDist: touchDist(event.touches), startZoom: state.treeZoom };
    }, { passive: true });
    scroller.addEventListener("touchmove", event => {
      if (pinch && event.touches.length === 2) {
        event.preventDefault();
        setTreeZoom(pinch.startZoom * touchDist(event.touches) / pinch.startDist);
      }
    }, { passive: false });
    scroller.addEventListener("touchend", () => { pinch = null; });
    scroller.addEventListener("touchcancel", () => { pinch = null; });
    scroller.addEventListener("wheel", event => {
      if (!event.ctrlKey && !event.metaKey) return; // 普通滚轮保持滚动
      event.preventDefault();
      setTreeZoom(state.treeZoom * (1 - event.deltaY * 0.0015));
    }, { passive: false });
  }

  function renderBranchTree() {
    const tree = visibleTree();
    let leafCursor = 0;
    let maxDepth = 0;
    const activePath = new Set(getPath().map(node => node.id));
    const layout = (display, depth, parentId = null) => {
      display.depth = depth;
      display.parentId = parentId;
      display.x = 35 + depth * 215;
      maxDepth = Math.max(maxDepth, depth);
      if (!display.children.length) {
        display.y = 35 + leafCursor * 92;
        leafCursor += 1;
      } else {
        display.children.forEach(child => layout(child, depth + 1, display.node.id));
        display.y = (display.children[0].y + display.children[display.children.length - 1].y) / 2;
      }
    };
    layout(tree, 0);
    const displays = [];
    const edges = [];
    const flatten = display => {
      displays.push(display);
      display.children.forEach(child => {
        edges.push({ from: display, to: child });
        flatten(child);
      });
    };
    flatten(tree);
    const width = Math.max(760, (maxDepth + 1) * 215 + 40);
    const height = Math.max(350, leafCursor * 92 + 35);
    const container = $("#branchTree");
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.innerHTML = `<svg class="tree-connectors" viewBox="0 0 ${width} ${height}">${edges.map(edge => {
      const x1 = edge.from.x + 176;
      const y1 = edge.from.y + 32;
      const x2 = edge.to.x;
      const y2 = edge.to.y + 32;
      const middle = (x1 + x2) / 2;
      const active = activePath.has(edge.from.node.id) && activePath.has(edge.to.node.id) && !edge.to.isPlaceholder;
      return `<path class="${active ? "active-path" : ""}" d="M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}"/>`;
    }).join("")}</svg>${displays.map(display => {
      const node = display.node;
      const isActive = !display.isPlaceholder && node.id === state.activeNodeId;
      const action = display.isPlaceholder ? `data-action="select-route" data-parent="${esc(display.parentId)}" data-route="${esc(node.id)}"` : `data-action="select-node" data-id="${esc(node.id)}"`;
      const status = display.isPlaceholder ? `待选择 · ${esc(node.type)}` : node.id === "root" ? "创作起点" : isActive ? "当前分支" : "已保存";
      return `<button class="tree-node ${display.isPlaceholder ? "planned" : ""} ${isActive ? "active" : ""} ${node.id === "root" ? "root-node" : ""}" style="left:${display.x}px;top:${display.y}px" ${action}><span class="tree-node-key">${esc(node.key)}</span><span class="tree-node-copy"><strong>${esc(node.title)}</strong><small>${status}</small></span></button>`;
    }).join("")}`;
    applyTreeZoom();
  }

  function renderNodePreview() {
    const node = activeNode();
    const parent = node.parentId ? getNode(node.parentId) : null;
    const reveal = nodeReveal(node.id);
    $("#nodePreview").innerHTML = `<div class="node-preview-header"><div><p>${esc(node.type)} · 第 ${node.depth} 节</p><h3>${node.id === "root" ? "创作起点：" : "《"}${esc(node.title)}${node.id === "root" ? "" : "》"}</h3></div><div class="node-actions">${parent ? `<button class="button secondary compact" data-action="select-node" data-id="${esc(parent.id)}">${icon("undo")}回到上一节点</button>` : ""}<button class="button primary compact" data-action="focus-assistant">${icon("pen")}${node.id === "root" ? "选择路线" : "继续此分支"}</button></div></div><div class="node-prose${reveal && node.content ? " ink-reveal" : ""}">${node.content ? node.content.map(paragraph => `<p>${esc(paragraph)}</p>`).join("") : `<p class="node-summary">${esc(node.summary)}</p><p class="node-summary">尚未选择路线。A、B、C 三个待选节点分别代表不同叙事视角与冲突，可任选其一，也可自由输入。</p>`}</div>`;
    if (reveal && node.content) startInkReveal($("#nodePreview .node-prose"));
  }

  function renderVersionPath() {
    const path = getPath(activeNode().id);
    $("#pathDepth").textContent = `${path.length - 1} 次续写`;
    $("#versionPath").innerHTML = path.map(node => `<button class="version-item ${node.id === state.activeNodeId ? "active" : ""}" data-action="select-node" data-id="${esc(node.id)}"><i>${esc(node.key)}</i><span><strong>${esc(node.title)}</strong><small>${node.id === "root" ? "创作起点" : esc(node.type)}</small></span></button>`).join("");
  }

  function exportStory() {
    const project = state.project;
    const lines = [`# ${project.title}`, "", `> 基于${UI.bookName || "原著"}世界观的原创番外，不是${STUDIO.canonAuthor || "原著作者"}原文；由 ${project.generatedBy || "Worldbook Studio"} 辅助生成。`, "", `## 初始创作需求`, "", project.prompt, ""];
    if (project.material) lines.push(`## 引用素材`, "", project.material.name, "");
    const appendChildren = parentId => {
      Object.values(project.nodes).filter(node => node.parentId === parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(node => {
        lines.push(`${"#".repeat(Math.min(6, node.depth + 2))} ${node.key} · ${node.title}`, "", `*${node.type}｜${node.summary}*`, "", ...node.content.flatMap(paragraph => [paragraph, ""]));
        appendChildren(node.id);
      });
    };
    lines.push("## 创作起点", "", project.root.summary, "");
    appendChildren("root");
    if (!Object.keys(project.nodes).length) {
      lines.push("## 待选路线", "", ...project.root.routes.map(route => `### ${route.key} · ${route.title}\n\n${route.summary}\n`));
    }
    downloadFile(`${project.title}_分支故事.md`, lines.join("\n"), "text/markdown;charset=utf-8");
    showToast("故事分支已导出为 Markdown");
  }

  async function regenerateNode(id) {
    const node = getNode(id);
    if (!node || node.id === "root") return;
    if (!AI.canUse()) {
      setAiError("未连接 AI 服务", { message: state.aiStatus.reason || "请先在设置中接入 DeepSeek。" }, "open-ai-settings");
      return;
    }
    const parent = getNode(node.parentId);
    if (parent?.stateStale) { setAiError("分支需要更新", { message: "请先重新生成本节之前已受影响的章节。" }); return; }
    const routeLike = node.customPrompt ? null : node;
    state.aiError = null;
    const retrieval = planRetrieval(parent.id, routeLike, node.customPrompt || node.summary);
    startBusy(`正在重写《${node.title}》`, "先由模型选择相关卡片，再重写本节…", {
      manual: true, phases: ["正在整理候选卡和分支状态…"]
    });
    renderAssistant();
    try {
      const path = getPath(parent.id);
      const result = await AI.continueBranch({
        project: state.project, path,
        chosenRoute: routeLike ? { ...node, axes: node.axes } : null,
        instruction: node.customPrompt || node.summary,
        assets: retrieval.ids, pinned: state.pinnedAssets,
        brief: state.project.brief, perspective: node.perspective || null, cross: state.project.cross || null, onProgress: writingProgress, onDelta: renderStreamDelta, onReasoning: renderReasoningDelta
      });
      node.title = result.title;
      node.type = result.type;
      node.axes = result.axes;
      node.content = result.content;
      node.routes = result.routes.map(item => ({ ...item, content: null, next: null }));
      state.lastRetrieval = result.retrieval;
      node.assets = result.retrieval.ids;
      node.retrieval = result.retrieval;
      node.storyState = result.storyState;
      node.stateStale = false;
      const pending = [node.id];
      while (pending.length) {
        const parentId = pending.shift();
        Object.values(state.project.nodes).filter(child => child.parentId === parentId).forEach(child => {
          child.stateStale = true;
          pending.push(child.id);
        });
      }
      node.briefCheck = result.briefCheck;
      node.chronicleCount = AI.pathContext(path).chronicleCount;
      node.generatedBy = aiStatusText();
      node.updatedAt = new Date().toISOString();
      state.qualityResults = null;
      state.aiEval = null;
      // 流式草稿归流式草稿：正文正式落位时仍按字墨雾渐显，像誊清一遍。
      state.revealNode = { id: node.id, until: Date.now() + 13000 };
      persist();
      stopBusy();
      renderAssistant();
      if (state.view === "creations") renderProject();
      showToast("已重新生成当前节点");
    } catch (error) {
      stopBusy();
      setAiError("重新生成失败", error, "retry-regenerate", id);
    }
  }

  function writeFromResearch() {
    if (!state.chat?.answer) return;
    state.pinnedAssets = [...new Set([...state.pinnedAssets, ...(state.chat.citations?.length ? state.chat.citations : (state.chat.results || []).slice(0, 3).map(item => item.id))])];
    state.assistantMode = "create";
    state.freshCreation = true;
    const topic = state.chat.query.replace(/[？?。\s]+$/, "");
    $("#composerInput").value = `基于刚才的考据（${topic}），写一段不改动原著主线的场景，重点写人物的处境与潜台词。`;
    state.chat = null;
    persist();
    renderAssistant();
    setTimeout(() => $("#composerInput").focus(), 50);
  }

  function ngrams(text, size = 8) {
    const normalized = String(text).replace(/[\s\p{P}\p{S}]/gu, "");
    const result = new Set();
    for (let index = 0; index <= normalized.length - size; index += 1) result.add(normalized.slice(index, index + size));
    return result;
  }

  function maxTextSimilarity(texts, references, size = 8) {
    const referenceSets = references.map(text => ngrams(text, size));
    let maximum = 0;
    texts.forEach(text => {
      const grams = ngrams(text, size);
      if (!grams.size) return;
      referenceSets.forEach(reference => {
        if (!reference.size) return;
        let intersection = 0;
        grams.forEach(gram => { if (reference.has(gram)) intersection += 1; });
        maximum = Math.max(maximum, intersection / grams.size);
      });
    });
    return maximum;
  }

  function runQualityChecks() {
    const nodes = Object.values(state.project.nodes);
    const texts = nodes.flatMap(node => node.content);
    const modernTerms = ["手机", "微信", "互联网", "汽车", "电脑", "霓虹灯", "社交媒体"];
    const modernHits = modernTerms.filter(term => texts.some(text => text.includes(term)));
    const characterBound = state.project.root.assets.includes(state.project.profile.id);
    const plotValid = nodes.filter(node => node.summary && node.content.length && routesFor(node).length === 3 && getNode(node.parentId)).length;
    const canonReferences = DATA.canon_timeline.map(item => item.content);
    const similarity = texts.length ? maxTextSimilarity(texts, canonReferences) : null;
    const routes = routesFor(state.project.root);
    const changedAxes = AXES.filter(axis => new Set(routes.map(route => route.axes?.[axis])).size > 1).length;
    const path = getPath();
    const linksValid = path.every((node, index) => index === 0 ? node.id === "root" : node.parentId === path[index - 1].id);
    const titles = path.map(node => node.title);
    const uniqueTitles = new Set(titles).size === titles.length;

    state.qualityResults = {
      world: { status: modernHits.length ? "warn" : "pass", evidence: texts.length ? `检查 ${texts.length} 段正文；现代物件与制度词命中 ${modernHits.length} 项${modernHits.length ? `：${modernHits.join("、")}` : "。"}` : "尚无正文；当前仅检查路线规划，需续写后复检。" },
      character: { status: characterBound ? "pass" : "warn", evidence: characterBound ? `已绑定 ${state.project.protagonist} 角色卡（${state.project.profile.id}）；性格、动机、口吻、行为边界字段均存在。` : "未绑定主角角色卡，请回到世界书引用后再写。" },
      plot: { status: nodes.length && plotValid === nodes.length ? "pass" : "warn", evidence: nodes.length ? `${plotValid} / ${nodes.length} 个已写节点具备切入点、正文、三个后续方向与完整父链接。` : "当前有 0 个正文节点；先选择一条路线，再检查因果结构。" },
      innovation: { status: similarity === null ? "warn" : similarity < .25 ? "pass" : "warn", evidence: similarity === null ? "尚无可比对正文。" : `正文与 ${DATA.canon_timeline.length} 条原著事件词条的 8 字片段最高重合率为 ${(similarity * 100).toFixed(1)}%；该数值只用于发现复述线索。` },
      difference: { status: routes.length === 3 && changedAxes >= 4 ? "pass" : "warn", evidence: `${routes.length} 条首轮路线在 ${changedAxes} / 5 个结构字段上存在差异；路线规划已逐项记录。` },
      continuity: { status: path.length > 1 && linksValid && uniqueTitles ? "pass" : "warn", evidence: `当前路径含 ${path.length - 1} 次续写；父子链接${linksValid ? "完整" : "断裂"}，节点标题${uniqueTitles ? "无重复" : "存在重复"}。` }
    };
    renderEvaluation();
    showToast("六维本地结构检查已完成");
  }

  function qualityContent() {
    const ai = state.aiEval;
    const hasStory = Object.keys(state.project.nodes).length > 0;
    return `<div class="eval-intro"><div><h2>六维创作检查</h2><p>基于当前项目“${esc(state.project.title)}”。结构检查可离线复算；文学质量评审由 DeepSeek 依据正文给出，并标注证据。</p></div><div class="heading-actions"><button class="button secondary" data-action="run-quality">${icon("flask")}结构检查</button><button class="button primary" data-action="run-ai-eval" ${hasStory ? "" : "disabled title=\"先写出至少一节正文\""}>${icon("spark")}AI 文学评审</button></div></div>
      ${ai ? `<div class="ai-eval-note"><strong>DeepSeek 评审 · ${esc(ai.model || "")}</strong>　总评：${esc(ai.overallNote)}</div>` : ""}
      ${state.aiEvalBusy ? `<div class="ai-busy-card"><div class="ai-busy-head">${icon("spark")}正在评审全部正文</div><p>按世界观、人物、情节、创新、分支差异、长程连贯六个维度打分并引用原文依据…</p><div class="ai-busy-meter"><i></i><span>请求中</span></div></div>` : ""}
      ${state.aiEvalError ? `<div class="ai-error-card"><strong>${icon("info")}AI 评审失败</strong><p>${esc(state.aiEvalError)}</p></div>` : ""}
      <div class="quality-grid">${STUDIO.dimensions.map((dimension, index) => {
        const result = state.qualityResults?.[dimension.id];
        const score = ai?.scores?.find(item => item.id === dimension.id);
        return `<article class="quality-card"><div class="quality-card-head"><div class="quality-name"><span class="quality-index">${index + 1}</span><h3>${esc(dimension.name)}</h3></div><span class="quality-status ${score ? "pass" : result?.status || ""}">${score ? `${score.score} / 5` : result ? result.status === "pass" ? "结构通过" : "需要复核" : "待检查"}</span></div><p>${esc(dimension.description)}</p>
          ${score ? `<div class="ai-score-verdict">${esc(score.verdict)}</div><div class="ai-score-evidence">依据：${esc(score.evidence)}</div>` : ""}
          ${result ? `<div class="quality-evidence">${esc(result.evidence)}</div>` : ""}</article>`;
      }).join("")}</div>
      <div class="eval-method">${icon("info")}<p>结构检查只回答可复算的问题（父子链接、字段差异、现代词命中等）。AI 评审给出 1–5 分量表与原文依据，仍可能误判，重要作品建议人工复核。“结构通过”不等于文学性达标。</p></div>`;
  }

  async function runAiEvaluation() {
    if (!AI.canUse()) {
      showToast("尚未连接 AI 服务，请在助手设置中接入", "info");
      return;
    }
    const path = getPath();
    if (path.length < 2) {
      showToast("先写出至少一节正文再评审", "info");
      return;
    }
    state.aiEvalBusy = true;
    renderEvaluation();
    try {
      const result = await AI.evaluate({ project: state.project, path });
      state.aiEval = { ...result, model: aiStatusText(), at: new Date().toISOString() };
      state.aiEvalBusy = false;
      persist();
      renderEvaluation();
      showToast("DeepSeek 六维评审已完成");
    } catch (error) {
      state.aiEvalBusy = false;
      state.aiEvalError = aiErrorMessage(error);
      renderEvaluation();
      showToast(clampText(aiErrorMessage(error), 60), "info");
    }
  }

  // Benchmark 的样本人物、共享法则与提示词均来自当前世界书，切换世界即切换评测集。
  function benchmarkConfig() {
    const config = STUDIO.benchmark || {};
    const names = asArray(config.names).filter(name => STUDIO.protagonists?.[name]);
    return {
      names: names.length ? names : Object.keys(STUDIO.protagonists || {}).slice(0, 3),
      sharedRules: asArray(config.sharedRules).length ? asArray(config.sharedRules) : (STUDIO.coreRules || []).slice(0, 3),
      prompts: config.prompts || {}
    };
  }

  function runBenchmarkA() {
    const { names, sharedRules, prompts } = benchmarkConfig();
    const samples = names.map(name => {
      const profile = STUDIO.protagonists[name];
      return { name, profile, contextAssets: [...new Set([...profile.assets, ...sharedRules])] };
    });
    state.benchmarkA = {
      samples, sharedRules, source: "本地预设",
      routeCount: samples.reduce((sum, sample) => sum + sample.profile.routes.length, 0),
      allDistinct: samples.every(sample => AXES.filter(axis => new Set(sample.profile.routes.map(route => route.axes?.[axis])).size > 1).length >= 4),
      sharedCoverage: samples.every(sample => sharedRules.every(rule => sample.contextAssets.includes(rule)))
    };
    renderEvaluation();
    showToast("已载入三组预设规划");
  }

  async function runBenchmarkALive() {
    if (!AI.canUse()) {
      showToast("尚未连接 AI 服务，无法运行真实 Benchmark", "info");
      return;
    }
    const { names, sharedRules, prompts } = benchmarkConfig();
    state.benchmarkABusy = { done: 0, total: names.length };
    state.benchmarkAError = null;
    renderEvaluation();
    const samples = [];
    try {
      for (const name of names) {
        const profile = STUDIO.protagonists[name];
        const generated = await AI.generateStory({ prompt: prompts[name], assets: [...new Set([...profile.assets, ...sharedRules])] });
        samples.push({
          name,
          profile: { ...profile, projectTitle: generated.projectTitle, viewpoint: generated.viewpoint, conflict: generated.routes[0]?.axes.conflict, premise: generated.premise, routes: generated.routes },
          contextAssets: [...new Set([...generated.assets, ...sharedRules])],
          generatedBy: aiStatusText()
        });
        state.benchmarkABusy = { done: samples.length, total: names.length };
        renderEvaluation();
      }
      state.benchmarkA = {
        samples, sharedRules, source: aiStatusText(),
        routeCount: samples.reduce((sum, sample) => sum + sample.profile.routes.length, 0),
        allDistinct: samples.every(sample => AXES.filter(axis => new Set(sample.profile.routes.map(route => route.axes?.[axis])).size > 1).length >= 4),
        sharedCoverage: samples.every(sample => sharedRules.every(rule => sample.contextAssets.includes(rule)))
      };
      state.benchmarkABusy = null;
      renderEvaluation();
      showToast("DeepSeek 已生成三组真实样本");
    } catch (error) {
      state.benchmarkABusy = null;
      state.benchmarkAError = aiErrorMessage(error);
      state.benchmarkA = samples.length ? { ...state.benchmarkA, samples, partial: true } : state.benchmarkA;
      renderEvaluation();
    }
  }

  function benchmarkAContent() {
    const result = state.benchmarkA;
    const busy = state.benchmarkABusy;
    return `<div class="eval-intro"><div><h2>Benchmark A · 同一世界观下的多故事线生成</h2><p>使用相同的世界规则，分别为${asArray(STUDIO.benchmark?.names).map(esc).join("、") || "三位人物"}生成独立番外规划，检查叙事差异与共享约束覆盖。</p></div><div class="heading-actions"><button class="button secondary" data-action="run-benchmark-a">${icon("flask")}载入预设样本</button><button class="button primary" data-action="run-benchmark-a-live" ${busy ? "disabled" : ""}>${icon("spark")}${busy ? `生成中 ${busy.done}/${busy.total}` : "DeepSeek 真实生成"}</button></div></div>
      ${state.benchmarkAError ? `<div class="ai-error-card"><strong>${icon("info")}Benchmark 中断</strong><p>${esc(state.benchmarkAError)}</p></div>` : ""}
      ${result ? `<div class="benchmark-summary"><div class="benchmark-stat"><strong>${result.samples.length}</strong><span>独立主角样本</span></div><div class="benchmark-stat"><strong>${result.routeCount}</strong><span>实际生成路线</span></div><div class="benchmark-stat"><strong>${result.sharedRules.length}</strong><span>共同世界规则</span></div></div><div class="benchmark-grid">${result.samples.map(sample => `<article class="benchmark-card"><div class="benchmark-card-head"><span class="benchmark-avatar">${esc(sample.name.slice(0, 1))}</span><div><h3>${esc(sample.profile.projectTitle)}</h3><p>${esc(sample.profile.viewpoint)} · ${esc(sample.profile.conflict)}</p></div></div>${sample.profile.routes.map(route => `<div class="benchmark-route"><strong>${esc(route.key)} · ${esc(route.title)}</strong><span>${esc(route.type)}｜${esc(route.axes.conflict)}</span></div>`).join("")}<button class="button secondary compact" data-action="show-benchmark-sample" data-name="${esc(sample.name)}">查看完整样本</button></article>`).join("")}</div><div class="check-list"><div class="check-item ${result.allDistinct ? "" : "warn"}">${icon(result.allDistinct ? "check" : "info")}<div><strong>三组路线均具备实质结构差异</strong><p>逐组比较视角、冲突、人物、基调和后续发展五类字段。</p></div></div><div class="check-item ${result.sharedCoverage ? "" : "warn"}">${icon(result.sharedCoverage ? "check" : "info")}<div><strong>共同世界约束已注入全部样本</strong><p>${result.sharedRules.join("、")}：时代背景、人物一致性、原著与二创标识。</p></div></div><div class="check-item">${icon("check")}<div><strong>故事资产相互独立</strong><p>三位主角分别调用 ${result.samples.map(sample => `${sample.name} ${sample.contextAssets.length} 项`).join("，")} 上下文资产。</p></div></div></div><div class="eval-method">${icon("info")}<p>样本来源：${esc(result.source)}。真实生成会消耗 token；中途失败时保留已完成样本，便于对照。</p></div>` : `<div class="empty-state">${icon("branch")}<h3>尚未运行 Benchmark A</h3><p>可以载入预设样本查看结构，也可以用 DeepSeek 真实生成三组规划。</p></div>`}`;
  }

  function runBenchmarkB() {
    const profile = STUDIO.protagonists?.[benchmarkConfig().names[0]] || Object.values(STUDIO.protagonists || {})[0];
    let current = { id: "root", depth: 0, title: profile.title, routes: profile.routes };
    const rounds = [];
    const chosenTitles = [];
    for (let round = 0; round < 5; round += 1) {
      const options = routesFor(current);
      const selected = options[round % 3];
      const next = {
        id: `${current.id}.${selected.id}`, parentId: current.id, depth: current.depth + 1,
        title: selected.title, routes: selected.next?.length ? selected.next : null
      };
      rounds.push({
        round: round + 1,
        options: options.map(option => ({ title: option.title, type: option.type, axes: option.axes })),
        selectedTitle: selected.title,
        selectedType: selected.type,
        distinctTitles: new Set(options.map(option => option.title)).size === options.length,
        repeated: options.filter(option => chosenTitles.includes(option.title)).map(option => option.title),
        parentId: current.id,
        childId: next.id
      });
      routesFor(next);
      chosenTitles.push(selected.title);
      current = next;
    }
    state.benchmarkB = {
      rounds,
      optionCount: rounds.reduce((sum, round) => sum + round.options.length, 0),
      allDistinct: rounds.every(round => round.distinctTitles && new Set(round.options.map(option => option.axes.view)).size > 1),
      repeatCount: rounds.reduce((sum, round) => sum + round.repeated.length, 0),
      linked: rounds.every((round, index) => index === 0 ? round.parentId === "root" : round.parentId === rounds[index - 1].childId)
    };
    renderEvaluation();
    showToast("五轮方向推荐模拟已完成");
  }

  function benchmarkBContent() {
    const result = state.benchmarkB;
    return `<div class="eval-intro"><div><h2>Benchmark B · 多轮创作方向推荐</h2><p>连续五轮按 A → B → C → A → B 选择推荐方向，检查选项差异、已写情节重复、路径继承与分支独立性。</p></div><button class="button primary" data-action="run-benchmark-b">${icon("flask")}运行五轮模拟</button></div>${result ? `<div class="benchmark-summary"><div class="benchmark-stat"><strong>${result.rounds.length}</strong><span>实际模拟轮次</span></div><div class="benchmark-stat"><strong>${result.optionCount}</strong><span>实际推荐方向</span></div><div class="benchmark-stat"><strong>${result.repeatCount}</strong><span>重复推荐已写标题</span></div></div><div class="check-list"><div class="check-item ${result.allDistinct ? "" : "warn"}">${icon(result.allDistinct ? "check" : "info")}<div><strong>每轮三个方向具有不同标题与叙事视角</strong><p>对 ${result.optionCount} 条实际生成推荐逐项检查。</p></div></div><div class="check-item ${result.repeatCount ? "warn" : ""}">${icon(result.repeatCount ? "info" : "check")}<div><strong>已写情节标题重复：${result.repeatCount} 次</strong><p>只计算明确标题重复，主题与意象的语义重复仍需进一步评审。</p></div></div><div class="check-item ${result.linked ? "" : "warn"}">${icon(result.linked ? "check" : "info")}<div><strong>五轮选择均保留父节点路径</strong><p>模拟选择序列 A → B → C → A → B，每轮只从当前节点继续。</p></div></div></div><div class="round-timeline"><h3>五轮实际选择记录</h3>${result.rounds.map(round => `<div class="round-row"><span>第 ${round.round} 轮</span><div><strong>${esc(round.selectedType)} · 《${esc(round.selectedTitle)}》</strong><p>当轮备选：${round.options.map(option => `《${esc(option.title)}》`).join("、")}</p></div></div>`).join("")}</div><div class="eval-method">${icon("info")}<p>本项使用本地预设路线结构运行，不消耗模型调用。它检验的是“推荐结构是否始终给出差异化选项”，不测量模型真实的推荐能力；模型侧的五轮表现建议在接入环境单独抽样。</p></div>` : `<div class="empty-state">${icon("clock")}<h3>尚未运行 Benchmark B</h3><p>运行后将在此展示五轮选择路径与每轮的三条备选方向。</p></div>`}`;
  }

  function compareContent() {
    const sample = STUDIO.compareSample;
    const body = state.compareVisible
      ? `<div class="originality-note" style="margin-bottom:13px">${icon("info")}<span><strong>固定输入：</strong>${esc(sample.prompt)}</span></div>
        <div class="compare-grid">${[["withWorld", "A · 启用世界书", "canon"], ["withoutWorld", "B · 无世界书", "original"]].map(([key, title, tagClass]) => {
          const item = sample[key];
          return `<article class="compare-column"><header><h3>${title}</h3><span class="tag ${tagClass}">${key === "withWorld" ? "资产驱动" : "通用生成"}</span></header><div class="compare-content"><p>${esc(item.text)}</p><div class="compare-routes">${item.routes.map(route => `<span>${esc(route)}</span>`).join("")}</div><div class="compare-metrics"><div><strong>${item.assets.length}</strong><span>世界书资产引用</span></div><div><strong>${item.routes.length}</strong><span>后续创作方向</span></div><div><strong>${key === "withWorld" ? 1 : 0}</strong><span>原著边界声明</span></div></div>${item.assets.length ? `<div class="asset-used"><span>实际引用</span>${assetChips(item.assets)}</div>` : ""}</div></article>`;
        }).join("")}</div>
        <div class="eval-method">${icon("info")}<p>可复算差异：A 样本引用 ${sample.withWorld.assets.length} 项资产，B 样本引用 0 项；A 明确主角、主仆关系与账房场景，B 仅保留通用角色与事件。文学质量仍需另行评审。</p></div>`
      : `<div class="empty-state">${icon("book")}<h3>尚未生成 A/B 对照</h3><p>点击上方按钮，查看同一需求在两种上下文条件下的固定样本。</p></div>`;
    return `<div class="eval-intro"><div><h2>A/B 对照 · 世界书是否真正参与创作</h2><p>同一创作需求，对照“绑定世界书资产”和“无世界书上下文”的固定样本。该对照展示评测交互，不冒充线上模型实验。</p></div><button class="button primary" data-action="run-compare">${icon("flask")}生成对照样本</button></div>${body}`;
  }

  function renderEvaluation() {
    $$("#evaluationTabs button").forEach(button => button.classList.toggle("active", button.dataset.tab === state.evalTab));
    const disclosure = $("#evalDisclosure");
    if (disclosure) {
      disclosure.innerHTML = state.aiStatus.ready
        ? `${icon("info")}AI 评审与 Benchmark 可用 · ${esc(state.aiStatus.model)}`
        : `${icon("info")}结构检查可离线复算 · 接入 AI 后可做文学评审`;
    }
    $("#evaluationContent").innerHTML = state.evalTab === "quality" ? qualityContent() : state.evalTab === "benchmark-a" ? benchmarkAContent() : state.evalTab === "benchmark-b" ? benchmarkBContent() : compareContent();
  }

  function showBenchmarkSample(name) {
    const sample = state.benchmarkA?.samples?.find(item => item.name === name);
    const profile = sample?.profile || STUDIO.protagonists[name];
    if (!profile) return;
    $("#sampleModalTitle").textContent = profile.projectTitle;
    $("#sampleModalBody").innerHTML = `<p class="doc-summary">${esc(profile.premise)}</p><div class="asset-used"><span>调用资产</span>${assetChips(sample?.contextAssets || profile.assets)}</div><div style="margin-top:17px">${profile.routes.map(route => `<article class="sample-route"><span class="tag canon">${esc(route.type)} · ${esc(route.axes.view)}</span><h3>《${esc(route.title)}》</h3><p>${esc(route.summary)}</p><div class="route-core">核心：${asArray(route.core).map(esc).join("、")}</div></article>`).join("")}</div>${sample?.generatedBy ? `<div class="eval-method">${icon("info")}<p>来源：${esc(sample.generatedBy)}</p></div>` : ""}`;
    openModal("sampleModal");
  }

  function renderPrompt() {
    $("#systemPromptText").textContent = STUDIO.systemPrompt;
    $("#promptPrinciples").innerHTML = STUDIO.principles.map((principle, index) => `<div class="principle"><span>${index + 1}</span><div><strong>${esc(principle.title)}</strong><p>${esc(principle.text)}</p></div></div>`).join("");
  }

  function exportWorldbook() {
    const output = {
      schema_note: "Worldbook Studio 演示中间格式，非特定平台官方导入 schema。",
      metadata: DATA.metadata,
      system_prompt: STUDIO.systemPrompt,
      rules: DATA.rules,
      characters: DATA.characters,
      relationship_edges: DATA.relationship_edges,
      locations: DATA.locations,
      canon_timeline: DATA.canon_timeline,
      original_story_seeds: DATA.quests,
      literary_styles: DATA.styles
    };
    downloadFile(UI.exportFile || `${WORLD_META.title}_Worldbook_Studio.json`, JSON.stringify(output, null, 2));
    showToast("创作版世界书已导出");
  }

  function resetDemo() {
    if (!window.confirm(`重置会清除共享作品架的全部 ${state.projects.length} 部作品，所有设备都会受到影响。是否继续？`)) return;
    localStorage.removeItem(STORAGE_KEY);
    state.projects = [createProject()];
    state.project = state.projects[0];
    state.activeNodeId = "root";
    state.aiEval = null;
    state.pinnedAssets = [];
    state.attachedMaterial = null;
    state.qualityResults = null;
    state.benchmarkA = null;
    state.benchmarkB = null;
    state.compareVisible = false;
    state.freshCreation = false;
    state.assistantMode = "create";
    persist();
    renderAll();
    showToast(`已恢复初始${UI.defaultProtagonist || "创作"}示例`);
  }

  function handleAction(button, event) {
    const action = button.dataset.action;
    if (state.aiBusy && !["toggle-assistant", "toggle-sidebar", "close-drawers", "tree-zoom-in", "tree-zoom-out", "tree-zoom-reset", "open-cross", "close-modal", "toggle-cross-world", "toggle-cross-work", "select-cross-power", "select-cross-bridge"].includes(action)) {
      showToast("请等待当前请求完成", "info");
      event.stopPropagation();
      return;
    }
    switch (action) {
      case "retry-library-sync": retryLibrarySync(); break;
      case "export-unsynced-library": {
        const backup = syncPending?.snapshot || localStorage.getItem(RECOVERY_KEY);
        if (backup) downloadFile(`${WORLD_META.title}_未同步作品备份.json`, backup);
        else showToast("本机没有未同步修改", "info");
        break;
      }
      case "reload-library": {
        if (syncPending && !window.confirm("请确认已经导出本机未同步备份。刷新会显示服务器版本，并保留本机备份文件。")) break;
        try { localStorage.removeItem(RECOVERY_KEY); } catch (_) {}
        location.reload();
        break;
      }
      case "switch-view": switchView(button.dataset.view); break;
      case "open-world-picker": openWorldPicker(); break;
      case "open-cross": openCrossPanel(); break;
      case "goto-creations": switchView("creations"); break;
      case "toggle-cross-world": toggleCrossWorld(button.dataset.world); break;
      case "toggle-cross-work": toggleCrossWork(button.dataset.world, button.dataset.id); break;
      case "select-cross-power": selectCrossPower(button.dataset.power); break;
      case "select-cross-bridge": selectCrossBridge(Number(button.dataset.index)); break;
      case "generate-bridges": generateBridges(); break;
      case "save-cross": saveCross(); break;
      case "clear-cross": clearCross(); break;
      case "open-relations": state.category = "relation"; switchView("world"); renderAssets(); break;
      case "asset-category": state.category = button.dataset.category; state.assetSearch = ""; $("#assetSearchInput").value = ""; renderAssets(); break;
      case "world-category": state.category = button.dataset.category; switchView("world"); renderAssets(); document.body.classList.remove("assistant-visible"); break;
      case "global-search": state.category = "all"; switchView("world"); renderAssets(); setTimeout(() => $("#assetSearchInput").focus(), 50); break;
      case "open-doc": openDoc(button.dataset.id); break;
      case "close-modal": closeModals(); break;
      case "open-perspective-lab": openPerspectiveLab(); break;
      case "select-perspective-event": selectPerspectiveEvent(Number(button.dataset.index)); break;
      case "toggle-perspective-character": togglePerspectiveCharacter(button.dataset.id); break;
      case "show-perspective-characters": perspectiveLab.showAll = !perspectiveLab.showAll; renderPerspectiveCharacters(); break;
      case "generate-perspectives": generatePerspectives(); break;
      case "use-perspective": usePerspective(Number(button.dataset.index)); break;
      case "retry-perspective": { const payload = JSON.parse(button.dataset.payload || "{}"); const parent = getNode(payload.parentId); if (parent && !parent.stateStale && state.project.id === payload.projectId) aiContinue(payload.text, parent, payload.perspective); else showToast("原分支不可用，请重新选择视角", "info"); break; }
      case "open-asset-picker": openAssetPicker(); break;
      case "toggle-asset": toggleAsset(button.dataset.id); break;
      case "exclude-asset": state.project.excludedAssets = [...new Set([...(state.project.excludedAssets || []), button.dataset.id])]; persist(); renderAssistant(); showToast("已在本作品后续选卡中排除"); break;
      case "restore-asset": state.project.excludedAssets = (state.project.excludedAssets || []).filter(id => id !== button.dataset.id); persist(); renderAssistant(); showToast("已恢复自动选卡"); break;
      case "cite-current-doc": citeCurrentDoc(); break;
      case "cite-research-results": (state.chat?.results || []).forEach(item => { if (!state.pinnedAssets.includes(item.id)) state.pinnedAssets.push(item.id); }); state.assistantMode = "create"; state.chat = null; renderAssistant(); persist(); showToast("检索结果已加入创作上下文"); break;
      case "graph-filter": state.graphFilter = button.dataset.filter; state.graphFocus = null; renderRelationGraph(); break;
      case "graph-focus": {
        const name = button.dataset.name;
        // 已是焦点则再点一次打开档案，否则聚焦
        if (state.graphFocus === name) { openDoc(button.dataset.id); break; }
        state.graphFocus = name;
        state.graphFilter = "all";
        renderRelationGraph();
        break;
      }
      case "graph-clear-focus": state.graphFocus = null; renderRelationGraph(); break;
      case "toggle-theme": state.theme = state.theme === "dark" ? "light" : "dark"; localStorage.setItem(THEME_KEY, state.theme); applyTheme(); break;
      case "toggle-sidebar": document.body.classList.toggle("sidebar-visible"); break;
      case "toggle-assistant": document.body.classList.toggle("assistant-visible"); break;
      case "close-drawers": document.body.classList.remove("sidebar-visible", "assistant-visible"); break;
      case "focus-assistant": state.assistantMode = "create"; state.freshCreation = false; renderAssistant(); openAssistantOnMobile(); break;
      case "assistant-mode": switchAssistantMode(button.dataset.mode); break;
      case "start-writing": startNewCreation(); break;
      case "new-creation": startNewCreation(); break;
      case "select-route": selectRoute(button.dataset.parent, button.dataset.route); break;
      case "retry-route": {
        const payload = JSON.parse(button.dataset.payload || "{}");
        selectRoute(payload.parentId, payload.routeId);
        break;
      }
      case "retry-custom": state.aiError = null; aiContinue(button.dataset.payload || "", getNode()); break;
      case "retry-project": state.aiError = null; runNewProject(button.dataset.payload || ""); break;
      case "retry-research": state.aiError = null; runResearch(button.dataset.payload || ""); break;
      case "regenerate-node": regenerateNode(button.dataset.id); break;
      case "retry-regenerate": state.aiError = null; regenerateNode(button.dataset.payload || ""); break;
      case "write-from-research": writeFromResearch(); break;
      case "open-ai-settings": openAiSettings(); break;
      case "open-brief": openBriefEditor(); break;
      case "save-brief": saveBrief(); break;
      case "reset-brief": {
        $("#briefGenre").value = AI.DEFAULT_BRIEF.genre;
        $("#briefPov").value = AI.DEFAULT_BRIEF.pov;
        $("#briefChars").value = AI.DEFAULT_BRIEF.sectionChars;
        $("#briefAudience").value = AI.DEFAULT_BRIEF.audience;
        $("#briefTone").value = AI.DEFAULT_BRIEF.tone;
        $("#briefMustKeep").value = "";
        $("#briefForbidden").value = AI.DEFAULT_BRIEF.forbidden.join("\n");
        showToast("已填入默认值，点保存生效", "info");
        break;
      }
      case "save-ai-settings": saveAiSettings(); break;
      case "test-ai": testAiConnection(); break;
      case "select-node": selectNode(button.dataset.id); break;
      case "switch-project": selectProject(button.dataset.id); break;
      case "delete-project": deleteProject(button.dataset.id); break;
      case "use-prompt": $("#composerInput").value = button.dataset.prompt; $("#composerInput").focus(); break;
      case "research-query": state.assistantMode = "research"; submitComposer(button.dataset.query); break;
      case "submit-composer": submitComposer(); break;
      case "upload-material": $("#materialFileInput").click(); break;
      case "remove-material": state.attachedMaterial = null; state.project.material = null; renderComposerContext(); persist(); showToast("已移除上传素材"); break;
      case "export-library-backup": downloadFile(`${WORLD_META.title}_作品架备份.json`, JSON.stringify(librarySnapshot(), null, 2)); break;
      case "import-library-backup": $("#libraryBackupInput").click(); break;
      case "export-story": exportStory(); break;
      case "export-worldbook": exportWorldbook(); break;
      case "copy-prompt": copyText(STUDIO.systemPrompt, "完整创作核心指令已复制"); break;
      case "eval-tab": state.evalTab = button.dataset.tab; renderEvaluation(); break;
      case "tree-zoom-in": setTreeZoom(state.treeZoom * 1.2); break;
      case "tree-zoom-out": setTreeZoom(state.treeZoom / 1.2); break;
      case "tree-zoom-reset": setTreeZoom(1); break;
      case "run-quality": runQualityChecks(); break;
      case "run-ai-eval": runAiEvaluation(); break;
      case "run-benchmark-a": runBenchmarkA(); break;
      case "run-benchmark-a-live": runBenchmarkALive(); break;
      case "run-benchmark-b": runBenchmarkB(); break;
      case "run-compare": state.compareVisible = true; renderEvaluation(); break;
      case "show-benchmark-sample": showBenchmarkSample(button.dataset.name); break;
      case "reset-demo": resetDemo(); break;
      default: break;
    }
    if (action !== "toggle-asset") event.stopPropagation();
  }

  function renderAll() {
    applyTheme();
    applyWorldBrand();
    $("#heroEntryCount").textContent = ENTRIES.length;
    $("#worldEntryNavCount").textContent = ENTRIES.length;
    const charStat = $("#heroCharCount");
    if (charStat) charStat.textContent = DATA.characters.length;
    const worldStat = $("#heroWorldCount");
    if (worldStat) worldStat.textContent = (DATA.worldbuilding || []).length;
    const relStat = $("#heroRelCount");
    if (relStat) relStat.textContent = DATA.relationship_edges.length;
    renderAiStatus();
    renderAssets();    renderAssistant();
    renderProject();
    renderEvaluation();
    renderPrompt();
    switchView(state.view);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (button) handleAction(button, event);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeModals();
      document.body.classList.remove("sidebar-visible", "assistant-visible");
    }
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      state.category = "all";
      switchView("world");
      renderAssets();
      $("#assetSearchInput").focus();
    }
    /* 输入框内 Enter 直接发送（Shift+Enter 才换行），⌘/Ctrl+Enter 保留为等效发送。 */
    if (event.key === "Enter" && document.activeElement === $("#composerInput")) {
      if (event.shiftKey) return;
      event.preventDefault();
      submitComposer();
    }
    if (event.key === "Enter" && document.activeElement?.classList.contains("graph-node")) {
      event.preventDefault();
      const name = document.activeElement.dataset.name;
      if (state.graphFocus === name) openDoc(document.activeElement.dataset.id);
      else { state.graphFocus = name; state.graphFilter = "all"; renderRelationGraph(); }
    }
  });

  $("#assetSearchInput").addEventListener("input", event => {
    state.assetSearch = event.target.value;
    renderAssets();
  });
  $("#libraryBackupInput").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error("备份超过 20 MB");
      const backup = JSON.parse(await file.text());
      if (!Array.isArray(backup.projects) || !backup.projects.length || backup.projects.some(p => !p?.id || !p.root?.routes || !p.nodes)) throw new Error("不是有效的作品架备份");
      const imported = [];
      for (const project of backup.projects) {
        const copy = JSON.parse(JSON.stringify(project));
        if (state.projects.some(item => item.id === copy.id)) {
          copy.id = `${copy.id}-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          copy.title = `${copy.title}（导入副本）`;
        }
        migrateTitles(copy); migrateBrief(copy);
        copy.pinnedAssets = Array.isArray(copy.pinnedAssets) ? copy.pinnedAssets : [];
        state.projects.push(copy); imported.push(copy);
      }
      state.project = imported[0]; state.activeNodeId = state.project.lastNodeId !== "root" && getNode(state.project.lastNodeId) ? state.project.lastNodeId : "root";
      state.pinnedAssets = [...state.project.pinnedAssets]; state.aiEval = state.project.aiEval || null; state.freshCreation = false;
      persist(); renderAll(); showToast(`已导入 ${imported.length} 部作品，正在同步`);
    } catch (error) { showToast(`导入失败：${error.message}`, "info"); }
    event.target.value = "";
  });
  $("#assetPickerSearch").addEventListener("input", renderAssetPicker);
  $("#materialFileInput").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      showToast("素材请控制在 200 KB 以内", "info");
      event.target.value = "";
      return;
    }
    try {
      const content = await file.text();
      state.attachedMaterial = { name: file.name, content: content.slice(0, 20000) };
      state.assistantMode = "create";
      state.freshCreation = true;
      renderAssistant();
      openAssistantOnMobile();
      showToast(`已读取素材：${file.name}`);
    } catch (_) {
      showToast("无法读取该文件，请使用 TXT、MD 或 JSON", "info");
    }
    event.target.value = "";
  });

  $("#aiModeSelect").addEventListener("change", syncDirectFields);

  initializeLibrary();
  setInterval(checkLibraryUpdates, 8000);

  window.addEventListener("error", event => {
    const banner = document.createElement("pre");
    banner.id = "runtimeErrorBanner";
    banner.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7a1f1f;color:#fff;font-size:11px;padding:8px;white-space:pre-wrap;max-height:40vh;overflow:auto";
    banner.textContent = `RUNTIME ${event.message}\n${event.filename}:${event.lineno}:${event.colno}\n${(event.error && event.error.stack) || ""}`;
    document.body.appendChild(banner);
  });
  window.addEventListener("unhandledrejection", event => {
    const banner = document.createElement("pre");
    banner.id = "runtimeErrorBanner";
    banner.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7a1f1f;color:#fff;font-size:11px;padding:8px;white-space:pre-wrap;max-height:40vh;overflow:auto";
    banner.textContent = `REJECTION ${event.reason?.message || event.reason}\n${(event.reason && event.reason.stack) || ""}`;
    document.body.appendChild(banner);
  });
})();

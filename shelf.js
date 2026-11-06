/* 书架页：注册表已在装载时算好每本书的资产规模，这里只补作品数与渲染。
 * 不复用工作台的 app.js——书架不需要分支树、作品库同步或 AI 客户端。
 */
(() => {
  "use strict";

  const grid = document.getElementById("shelfGrid");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const catalog = () => window.WORLDBOOK_CATALOG || [];

  function card(world, projects) {
    const color = world.palette || "#913b3b";
    const soft = window.WB_REGISTRY?.[world.id]?.meta?.paletteSoft || "var(--cinnabar-soft)";
    const stats = [
      [world.assets, "资产"],
      [world.characters, "人物"],
      [world.relations, "关系"],
      [projects, "作品"]
    ];
    return `<a class="shelf-book" href="?world=${encodeURIComponent(world.id)}"
      style="--book-color:${esc(color)};--book-soft:${esc(soft)}">
      <div class="shelf-book-cover">
        <span class="shelf-book-seal">${esc(world.seal || world.name?.slice(0, 1) || "书")}</span>
        <div>
          <h2>${esc(world.name)}</h2>
          <small>${esc(world.book || "")} · ${esc(world.subtitle || "")}</small>
        </div>
      </div>
      <div class="shelf-book-body">
        <p class="shelf-book-tagline">${esc(world.tagline || "")}</p>
        <div class="shelf-book-stats">
          ${stats.map(([value, label]) => `<div><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join("")}
        </div>
      </div>
      <div class="shelf-book-foot">
        <span>${projects ? `${projects} 部作品在架` : "尚无作品"}</span>
        <span class="enter">进入工作台<svg class="icon" aria-hidden="true"><use href="#icon-arrow"/></svg></span>
      </div>
    </a>`;
  }

  function padding() {
    return `<div class="shelf-add">
      <strong style="font:600 14px var(--serif);color:var(--ink)">新增一本世界书</strong>
      <span>在 <code>worlds/</code> 下建目录，放入 <code>world.json</code> 与数据文件<br>再在 <code>worlds/index.json</code> 里追加一项</span>
    </div>`;
  }

  async function load() {
    const worlds = catalog();
    if (!worlds.length) {
      grid.innerHTML = `<p style="color:var(--muted);font-size:13px">目录为空。请在 <code>worlds/index.json</code> 中登记世界书。</p>`;
      return;
    }
    let counts = {};
    try {
      const response = await fetch("api/shelf", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        counts = Object.fromEntries((data.worlds || []).map(item => [item.id, item.projects || 0]));
      }
    } catch (_) { counts = {}; }
    grid.innerHTML = worlds.map(world => card(world, counts[world.id] || 0)).join("") + padding();
    document.title = `世界书书架 · ${worlds.length} 本`;
  }

  load();
})();

/* 世界书注册表。
 * 取代原来的 worlds.js + world-select.js：不再把一本书的数据 swap 到全局变量上，
 * 而是把所有书同时保存在 WB_REGISTRY 里，主世界只是「当前默认」。
 * 跨书引用要求同时持有多本，所以必须走注册表。
 *
 * 本文件必须在各世界数据脚本之后、ai.js 之前执行。
 */
(() => {
  "use strict";

  const INDEX = window.WB_WORLD_INDEX || { worlds: [] };
  const ASSET_BASE = INDEX.assets || "assets/";
  const params = new URLSearchParams(location.search);
  const requested = (params.get("world") || "").toLowerCase();
  let stored = null;
  try { stored = (localStorage.getItem("worldbook-world") || "").toLowerCase(); } catch (_) { stored = null; }

  const COUNT_KEYS = ["rules", "worldbuilding", "canon_timeline", "quests", "characters", "relationship_edges", "locations", "styles"];

  function countAssets(data) {
    if (!data) return 0;
    return COUNT_KEYS.reduce((sum, key) => sum + (Array.isArray(data[key]) ? data[key].length : 0), 0);
  }

  const registry = {};
  const order = [];

  INDEX.worlds.forEach(id => {
    const meta = (window.WB_WORLD_META_MAP || {})[id];
    if (!meta) return;
    const data = window[meta.globals?.data];
    const studio = window[meta.globals?.studio];
    if (!data || !studio) return;
    registry[id] = {
      id,
      meta,
      data,
      studio,
      stats: {
        assets: countAssets(data),
        characters: data.characters?.length || 0,
        relations: data.relationship_edges?.length || 0,
        worldbuilding: data.worldbuilding?.length || 0,
        events: data.canon_timeline?.length || 0
      }
    };
    order.push(id);
  });

  // 未知或缺失的世界参数回落到清单里的第一本，避免分享链接打不开。
  const active = order.includes(requested) ? requested : order.includes(stored) ? stored : order[0];

  window.WB_REGISTRY = registry;
  window.WB_WORLD_ORDER = order;
  window.WB_ASSET_BASE = ASSET_BASE;
  window.WB_WORLD = active;
  window.WB_WORLD_META = active ? registry[active].meta : null;

  // 兼容层：旧代码仍读 WORLDBOOK_DATA / STUDIO_DATA，这里指向当前世界。
  if (active) {
    window.WORLDBOOK_DATA = registry[active].data;
    window.STUDIO_DATA = registry[active].studio;
  }

  window.WORLDBOOK_CATALOG = order.map(id => {
    const item = registry[id];
    return {
      id,
      name: item.meta.name,
      title: item.meta.title,
      book: item.meta.book,
      seal: item.meta.seal,
      cover: item.meta.cover,
      subtitle: item.meta.subtitle,
      tagline: item.meta.tagline,
      palette: item.meta.palette,
      href: `?world=${id}`,
      available: true,
      active: id === active,
      ...item.stats
    };
  });

  try { if (active) localStorage.setItem("worldbook-world", active); } catch (_) { /* 隐私模式下降级为仅本次会话 */ }
})();

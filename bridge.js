/* 跨界同台：桥接设定、力量档、仲裁规则。
 * 三件事分开：
 *   bridge   —— 两界如何通达。由 AI 生成 3 个选项让作者挑，不接受自由输入。
 *   power    —— 外书人物能出多大力。三档，写死在代码里，不交给模型。
 *   arbitrate—— 主世界法则优先的仲裁条款，同样是固定文案。
 * 生成过一次桥接后存进作品，此后每节都会带上。
 */
(() => {
  "use strict";

  const AI = window.HL_AI;

  /* 力量档：这是本方案的核心约束。
   * 没有它，孙悟空一个大招就能填平贾府的亏空，整套红楼梦的冲突结构当场作废。 */
  const POWER_LEVELS = {
    observer: {
      id: "observer",
      label: "旁观",
      summary: "外书人物只看、只说，不动手",
      detail: "外书人物不得以其能力改变主世界的任何事实。可以观察、发问、评论、传递消息，但不能战斗、施法、医治或解决困境。他们的作用是把主世界照得更清楚。",
      risk: "最安全，也最克制；适合以旁观者视角写主世界的荒诞。"
    },
    limited: {
      id: "limited",
      label: "受限",
      summary: "能出手，但每次都要付代价",
      detail: "外书人物可以施展能力，但须付出与效果相称的代价（耗损、暴露身份、欠下因果、触怒本界规则），且不得一次性解决主线冲突。每一次动用都要在后文兑现后果。",
      risk: "戏剧张力最好；代价写不好会显得刻意。"
    },
    open: {
      id: "open",
      label: "放开",
      summary: "不设限，但会破坏主世界冲突",
      detail: "外书人物可以任意施展能力。主世界的困境可能被迅速解决，冲突结构与人物处境会随之失效。",
      risk: "仅用于明确的喜剧或实验性写法；正剧不建议。"
    }
  };

  const POWER_ORDER = ["observer", "limited", "open"];

  function powerLevel(id) {
    return POWER_LEVELS[id] || POWER_LEVELS.limited;
  }

  /* 仲裁条款：固定在代码里，不由任何一本世界书提供。
   * 每本书的作者都会本能地维护自己那本书的规则，让它来写仲裁必然偏心。 */
  function arbitration({ primaryName, foreignNames, power }) {
    const level = powerLevel(power);
    return [
      `【跨界仲裁 · 固定规则】`,
      `一、法则归属：本作属于《${primaryName}》。主世界的物理、社会与礼法规则优先；外书只提供人物、场景与方法，不提供世界法则。`,
      foreignNames.length
        ? `二、出场来源：${foreignNames.map(name => `《${name}》`).join("、")}的人物与物件只能经由已声明的通达方式进入，不得凭空出现。`
        : `二、出场来源：本作暂未引入外书。`,
      `三、能力约束（${level.label}）：${level.detail}`,
      `四、身份与称谓：外书人物在主世界内按主世界的尊卑称谓，保留自身口吻与性格，但不得以原世界的身份要求主世界服从。`,
      `五、冲突归属：主世界的核心矛盾必须由主世界的人物与手段了结。外书人物可以推动、阻碍或见证，不能代替。`,
      `六、出处标注：凡引用外书内容，叙事中应让读者可辨（称谓、器物、见识的差异），不得混同为主世界原有之物。`
    ].join("\n");
  }

  /* 让模型一次生成三个桥接选项。
   * 关键约束：这三个选项必须给出不同的「代价结构」，而不是三种措辞。 */
  async function proposeBridges({ primary, foreign, prompt, power = "limited", count = 3 }) {
    if (!AI?.canUse()) throw new Error("需要连接 AI 才能生成通达设定");
    const level = powerLevel(power);
    const messages = [
      {
        role: "system",
        content: `你在为一个文学二创工作台设计「跨界通达方式」。作者要把《${foreign.meta.name}》的人物引入《${primary.meta.name}》的世界。

要求：
1. 只输出 JSON，不要任何解释。
2. 给出 ${count} 个彼此不同的通达方式。差异必须体现在「代价结构」上，不能是同一设定的三种措辞。
3. 每个方式都要说明：谁开启、如何通行、通行一次要付什么代价、外人是否知情。
4. 必须尊重两本书各自的既定事实：不得改写任何一本的结局、果位、人物立场。
5. 通达方式应当是可反复使用的通道，而不是一次性事件。
6. 语言简洁，每个字段一到两句，不写小说。`
      },
      {
        role: "user",
        content: `主世界：《${primary.meta.name}》——${primary.meta.tagline || ""}
外书：《${foreign.meta.name}》——${foreign.meta.tagline || ""}
作者的创作需求：${prompt || "（未填写）"}
外书人物的能力档位：${level.label}（${level.summary}）

输出 JSON：
{
  "bridges": [
    {
      "title": "名称，4–8 字",
      "mechanism": "如何通达，40–70 字",
      "opener": "谁开启或维持这条通道",
      "cost": "通行一次的代价，30–50 字",
      "visibility": "外人是否知情，20–40 字",
      "tone": "这个选项带来的叙事基调，4–6 字"
    }
  ]
}`
      }
    ];
    const { content } = AI?.callModel
      ? await AI.callModel({ messages, maxTokens: 8000, temperature: 0.9 })
      : await rawCall(messages);
    const parsed = parseJson(content);
    const bridges = Array.isArray(parsed?.bridges) ? parsed.bridges : [];
    const cleaned = bridges
      .filter(item => item && item.title && item.mechanism)
      .slice(0, count)
      .map((item, index) => ({
        id: `bridge-${index + 1}`,
        title: String(item.title).slice(0, 20),
        mechanism: String(item.mechanism).slice(0, 200),
        opener: String(item.opener || "").slice(0, 120),
        cost: String(item.cost || "").slice(0, 160),
        visibility: String(item.visibility || "").slice(0, 160),
        tone: String(item.tone || "").slice(0, 20)
      }));
    if (cleaned.length < 2) throw new Error("AI 没能给出足够的通达选项，请重试");
    return cleaned;
  }

  function parseJson(text) {
    const raw = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) { return null; }
  }

  /* 极端情况下的直连兜底（AI 模块未导出 callModel 时走这条路）。 */
  async function rawCall(messages) {
    const response = await fetch("api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, temperature: 0.9, max_tokens: 8000 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `AI 返回 ${response.status}`);
    return { content: data.content || "" };
  }

  /* 桥接写进提示词时的格式。为空则不注入，也不允许生成跨界内容。 */
  function bridgeBlock(bridge, power) {
    if (!bridge?.mechanism) return "";
    const level = powerLevel(power);
    return [
      `【跨界通达设定】`,
      `方式：${bridge.title}——${bridge.mechanism}`,
      bridge.opener ? `开启者：${bridge.opener}` : "",
      bridge.cost ? `代价：${bridge.cost}` : "",
      bridge.visibility ? `知情范围：${bridge.visibility}` : "",
      `外书人物能力档位：${level.label}。${level.detail}`
    ].filter(Boolean).join("\n");
  }

  window.HL_BRIDGE = {
    POWER_LEVELS,
    POWER_ORDER,
    powerLevel,
    arbitration,
    proposeBridges,
    bridgeBlock
  };
})();

/* 红楼梦世界书 · 人物关系层
 * 依据前八十回整理。type 用于筛选与配色，intensity 表示关系强度(1-5)。
 * 端点一律使用 D.characters 中的全名，避免别名导致悬空。
 */
(() => {
  "use strict";
  const D = window.WORLDBOOK_DATA;
  if (!D) return;

  /* type：
   * kin      血缘与姻亲
   * serve    主仆
   * love     情感（含单恋、婚约、知己）
   * peer     同侪、友朋、诗友
   * power    权力与利益
   * feud     对立与冲突
   */
  const EDGES = [
    /* —— 核心情感三角 —— */
    { source: "贾宝玉", target: "林黛玉", type: "love", intensity: 5, relationship: "木石前盟：自幼同住，情意相知而彼此试探", constraint: "不等于公开婚约；黛玉始终未得一句准话，猜疑与醋意是常态" },
    { source: "贾宝玉", target: "薛宝钗", type: "love", intensity: 4, relationship: "金玉之说：亲近敬重，而价值取向（仕途经济）相左", constraint: "不默认已成婚约；宝玉对她更多是敬与亲，而非痴" },
    { source: "林黛玉", target: "薛宝钗", type: "peer", intensity: 4, relationship: "由比较、介意，到第四十二回金兰契互剖金兰语", constraint: "起点不可写成生死知己；早期有明确醋意与机锋" },

    /* —— 贾母为中心 —— */
    { source: "贾母", target: "贾宝玉", type: "kin", intensity: 5, relationship: "祖孙：格外疼爱，视若命根", constraint: "并非对其所有行为都赞同；溺爱之下也有失望" },
    { source: "贾母", target: "林黛玉", type: "kin", intensity: 5, relationship: "外祖母与外孙女：怜其失怙，寝食起居一如宝玉", constraint: "疼爱有加，却未在其婚事上给出明确承诺" },
    { source: "贾母", target: "王熙凤", type: "power", intensity: 4, relationship: "祖婆与孙媳：信任其理事之才，也知其为人之辣", constraint: "信任有限度；凤姐不敢在贾母面前放肆" },
    { source: "贾母", target: "贾政", type: "kin", intensity: 3, relationship: "母子：贾政极孝顺，遇大事必请示", constraint: "贾母可一言压之（第三十三回护宝玉）" },
    { source: "贾母", target: "贾赦", type: "kin", intensity: 2, relationship: "母子：长子而不得母心，贾母厌其荒唐", constraint: "血缘仍在；贾母不会公开废长，只以冷淡待之" },
    { source: "贾母", target: "贾元春", type: "kin", intensity: 3, relationship: "祖孙：元春入宫后难得一见，省亲时执礼而情难掩", constraint: "君臣之礼压在祖孙之情上" },
    { source: "贾母", target: "贾探春", type: "kin", intensity: 3, relationship: "祖孙：贾母看重其才干与气度", constraint: "庶出身份不会因贾母的看重而消失" },
    { source: "贾母", target: "贾迎春", type: "kin", intensity: 2, relationship: "祖孙：怜其懦弱，却未能为其婚事出头", constraint: "贾母对贾赦嫁女一事不悦，但未强阻" },
    { source: "贾母", target: "贾惜春", type: "kin", intensity: 2, relationship: "祖孙：惜春养在贾母身边，性冷而少亲近", constraint: "贾母待之如亲孙女，惜春仍自觉是宁府人" },
    { source: "贾母", target: "史湘云", type: "kin", intensity: 3, relationship: "姑祖母与侄孙女：常接来住，疼其爽利", constraint: "湘云自有叔婶，不能长住园中" },
    { source: "贾母", target: "鸳鸯", type: "serve", intensity: 5, relationship: "主仆：鸳鸯是贾母身边第一得力人，掌其私房", constraint: "鸳鸯的抗婚全赖贾母庇护，失恃即无路" },
    { source: "贾母", target: "王夫人", type: "kin", intensity: 3, relationship: "婆媳：贾母倚重其持家，亦知其见识有限", constraint: "贾母对王夫人处置丫鬟的狠辣并不全然赞同" },

    /* —— 贾政一房 —— */
    { source: "贾政", target: "王夫人", type: "kin", intensity: 3, relationship: "夫妻：同心教子、维持体统，少有温情", constraint: "贾政有赵姨娘，王夫人隐忍不言" },
    { source: "贾政", target: "贾宝玉", type: "kin", intensity: 4, relationship: "父子：寄望功名，见其不肖则痛加笞挞", constraint: "打是真打，痛也是真痛；不是纯粹的暴虐" },
    { source: "贾政", target: "贾元春", type: "kin", intensity: 3, relationship: "父女：长女入宫，荣耀与隔阂同来", constraint: "省亲时父女亦须依国礼相见" },
    { source: "贾政", target: "贾探春", type: "kin", intensity: 3, relationship: "父女：庶出而才干出众，贾政对其颇为看重", constraint: "嫡庶之别仍在，探春须以加倍的自持换取认可" },
    { source: "贾政", target: "赵姨娘", type: "kin", intensity: 2, relationship: "夫妻（妾）：有宠而不予体面，赵姨娘常怀怨", constraint: "贾政不会为赵姨娘而驳王夫人" },
    { source: "贾政", target: "贾环", type: "kin", intensity: 2, relationship: "父子：视其猥琐而不喜，偶尔也有一句称许", constraint: "第七十五回中秋赏其诗，态度并非全然的厌弃" },
    { source: "王夫人", target: "贾宝玉", type: "kin", intensity: 5, relationship: "母子：护子至极，以清除“狐媚”来保护儿子", constraint: "她的保护造成了金钏之死、晴雯之逐" },
    { source: "王夫人", target: "贾元春", type: "kin", intensity: 3, relationship: "母女：以长女为荣，亦以长女为家族倚仗", constraint: "宫墙相隔，母女之情只能托于赐物与传话" },
    { source: "王夫人", target: "赵姨娘", type: "feud", intensity: 4, relationship: "嫡妾对立：赵姨娘屡次生事，王夫人以规矩压之", constraint: "王夫人不会自降身份与之争吵，多以处置其子女与下人行事" },
    { source: "王夫人", target: "王熙凤", type: "power", intensity: 4, relationship: "姑侄兼婆媳的上级：倚重其理事，也握其把柄", constraint: "凤姐的权势来自王夫人与贾母的双重授权" },
    { source: "王夫人", target: "薛姨妈", type: "kin", intensity: 4, relationship: "姐妹：往来密切，共谋“金玉”之说", constraint: "不会当众商议婚事；一切以体面为先" },
    { source: "王夫人", target: "袭人", type: "serve", intensity: 4, relationship: "主仆：视袭人为可靠耳目，月钱由自己私下拨给", constraint: "袭人的“进言”是双刃，既获信任也担了告密之名" },
    { source: "王夫人", target: "晴雯", type: "feud", intensity: 4, relationship: "主仆而相恶：认定其“狐媚惑主”，病中撵出", constraint: "王夫人的判断来自王善保家的谗言与自身偏见" },
    { source: "王夫人", target: "金钏", type: "serve", intensity: 3, relationship: "主仆：因一句玩笑而打骂撵出，致其投井", constraint: "王夫人事后亦悔，赏其家五十两并衣物" },
    { source: "王夫人", target: "玉钏", type: "serve", intensity: 3, relationship: "主仆：姐姐死后仍留其在身边，赏其双份月钱", constraint: "赏赐不能弥补，玉钏的冷淡始终未消" },

    /* —— 贾赦一房 —— */
    { source: "贾赦", target: "邢夫人", type: "kin", intensity: 2, relationship: "夫妻：邢夫人承顺其意，不敢阻拦其荒唐", constraint: "邢夫人为自保而助其行事（如说媒鸳鸯）" },
    { source: "贾赦", target: "贾琏", type: "kin", intensity: 2, relationship: "父子：不以儿子为意，动辄打骂", constraint: "贾琏办事仍需借父亲的名分" },
    { source: "贾赦", target: "贾迎春", type: "kin", intensity: 1, relationship: "父女：几近不闻不问，终以之抵债许配孙绍祖", constraint: "贾赦并非不知孙绍祖人品，只是不在意" },
    { source: "贾赦", target: "鸳鸯", type: "feud", intensity: 3, relationship: "欲纳为妾而遭死拒，遂迁怒", constraint: "贾赦此后仍怀恨，但碍于贾母不敢再提" },
    { source: "邢夫人", target: "贾迎春", type: "kin", intensity: 1, relationship: "嫡母与庶女：冷淡敷衍，不问其委屈", constraint: "邢夫人对迎春乳母聚赌一事置之不理" },
    { source: "邢夫人", target: "王熙凤", type: "feud", intensity: 3, relationship: "婆媳：面上过得去，内里相互轻视", constraint: "第七十一回借婆子事与凤姐当面为难" },

    /* —— 凤姐一房 —— */
    { source: "贾琏", target: "王熙凤", type: "kin", intensity: 4, relationship: "夫妻：相互利用又相互怨怼，家务与私情交织", constraint: "凤姐的权势凌驾于丈夫之上，贾琏只能暗中偷情" },
    { source: "贾琏", target: "平儿", type: "love", intensity: 3, relationship: "通房：有夫妻之实而无名分，敬其周全", constraint: "平儿始终保持距离，不肯为争宠与凤姐对立" },
    { source: "王熙凤", target: "平儿", type: "serve", intensity: 5, relationship: "主仆兼心腹：一府内务尽托其手，情分极深", constraint: "平儿知情不等于会替她遮掩一切；她也有自己的公道" },
    { source: "贾琏", target: "尤二姐", type: "love", intensity: 3, relationship: "偷娶于小花枝巷，一时情热", constraint: "贾琏护不住她，事发后即退缩" },
    { source: "王熙凤", target: "尤二姐", type: "feud", intensity: 5, relationship: "妒恨至极：赚入府中，借刀折磨至其吞金", constraint: "凤姐的手段以“贤良”为表，杀人不见血" },
    { source: "王熙凤", target: "巧姐", type: "kin", intensity: 3, relationship: "母女：忙于家务，疼女而少陪伴", constraint: "凤姐忙于争权，巧姐多由奶母丫鬟照看" },
    { source: "王熙凤", target: "刘姥姥", type: "power", intensity: 2, relationship: "施舍者与受济者：二十两银子结下善缘", constraint: "当初不过是随手打发，未料日后成救命之恩" },
    { source: "王熙凤", target: "鸳鸯", type: "power", intensity: 3, relationship: "同侍贾母，合作也提防；凤姐曾向其借当", constraint: "鸳鸯掌贾母私房，凤姐需借其手周转而不敢强逼" },
    { source: "王熙凤", target: "贾母", type: "power", intensity: 4, relationship: "孙媳：以奉承与办事能力换取最高授权", constraint: "凤姐的一切权势都止于贾母的一句话" },

    /* —— 宁国府 —— */
    { source: "贾珍", target: "尤氏", type: "kin", intensity: 2, relationship: "夫妻：尤氏温顺无能，明知其荒唐而不拦", constraint: "尤氏在宁府无实权，连妾室都管不住" },
    { source: "贾珍", target: "秦可卿", type: "feud", intensity: 4, relationship: "公媳：关系暧昧，未坐实于明文", constraint: "原著以曲笔带过，不写具体情节；判词“造衅开端实在宁”指向此处" },
    { source: "贾珍", target: "尤二姐", type: "power", intensity: 3, relationship: "姻亲而觊觎，与贾蓉一同周旋", constraint: "尤二姐后被贾琏偷娶，贾珍仍不避嫌" },
    { source: "贾珍", target: "尤三姐", type: "feud", intensity: 4, relationship: "觊觎而遭其当面羞辱，反被玩弄于股掌", constraint: "尤三姐的泼辣正是在这种处境中练出来的" },
    { source: "尤氏", target: "秦可卿", type: "kin", intensity: 3, relationship: "婆媳：尤氏待之亲厚，秦可卿死后她亦悲", constraint: "尤氏不敢深究秦可卿之死的隐情" },
    { source: "尤氏", target: "尤二姐", type: "kin", intensity: 3, relationship: "异母姐妹：有照拂之名，无救护之力", constraint: "尤二姐被赚入荣府时，尤氏未能阻拦" },
    { source: "尤氏", target: "尤三姐", type: "kin", intensity: 3, relationship: "异母姐妹：知其刚烈，劝其收敛而无效", constraint: "尤三姐自刎时，尤氏只能旁观" },
    { source: "秦可卿", target: "王熙凤", type: "peer", intensity: 4, relationship: "知己：宁荣两府中难得的知心人，托梦嘱其预留后路", constraint: "托梦之言是谶语，凤姐并未真懂" },
    { source: "秦可卿", target: "贾宝玉", type: "love", intensity: 2, relationship: "引其入太虚幻境；梦中“兼美”即其影", constraint: "这是神话层面的关联，不是现实中的私情" },
    { source: "尤二姐", target: "尤三姐", type: "kin", intensity: 4, relationship: "亲姐妹：三姐骂她糊涂，也护她到最后", constraint: "三姐自刎后，二姐失去唯一的撑腰人" },

    /* —— 薛家 —— */
    { source: "薛姨妈", target: "薛宝钗", type: "kin", intensity: 4, relationship: "母女：倚重女儿理事，也心疼其懂事", constraint: "宝钗的“懂事”本身就是被这个家逼出来的" },
    { source: "薛姨妈", target: "薛蟠", type: "kin", intensity: 3, relationship: "母子：溺爱而屡屡善后，明知其不成器", constraint: "溺爱不等于认同，她也会哭骂，但从不真正约束" },
    { source: "薛宝钗", target: "薛蟠", type: "kin", intensity: 3, relationship: "兄妹：劝其收敛，反被其以言语刺伤", constraint: "薛蟠第三十四回话说得极重，宝钗哭了一夜" },
    { source: "薛蟠", target: "香菱", type: "kin", intensity: 3, relationship: "夫妾：打死冯渊而强夺，初时宠爱，后渐冷落", constraint: "香菱在他眼里更像一件得来的物件" },
    { source: "夏金桂", target: "薛蟠", type: "kin", intensity: 3, relationship: "夫妻：以撒泼立威，薛蟠畏之", constraint: "薛蟠的“呆”在悍妻面前毫无用处" },
    { source: "夏金桂", target: "香菱", type: "feud", intensity: 5, relationship: "主母与妾：改其名为秋菱，设计陷害，百般折磨", constraint: "判词“自从两地生孤木”即指此" },
    { source: "薛宝钗", target: "香菱", type: "peer", intensity: 3, relationship: "主家姑娘与妾室：教其作诗，也劝其安分", constraint: "宝钗的善意始终带着身份的界限" },

    /* —— 大观园女儿 —— */
    { source: "林黛玉", target: "史湘云", type: "peer", intensity: 4, relationship: "诗友：互有讥诮，也互有真心；凹晶馆联诗最见情谊", constraint: "早期因金麒麟等事有过口角" },
    { source: "贾探春", target: "李纨", type: "peer", intensity: 4, relationship: "共理园务、同主诗社，敬其持重", constraint: "李纨重次序，探春重效率，偶有分歧" },
    { source: "贾探春", target: "薛宝钗", type: "peer", intensity: 4, relationship: "共理园务：一个锐意，一个周全，互补", constraint: "宝钗主张“小惠全大体”，与探春的严苛不同路" },
    { source: "贾探春", target: "赵姨娘", type: "feud", intensity: 4, relationship: "母女而不敢认：探春以公事折其私请，赵姨娘当众哭闹", constraint: "探春的冷淡是自保，赵姨娘的怨恨也非全无道理" },
    { source: "贾探春", target: "贾环", type: "kin", intensity: 2, relationship: "同母兄妹：她不肯认这个弟弟的行径", constraint: "血缘无法否认，体面却必须维持" },
    { source: "贾惜春", target: "尤氏", type: "feud", intensity: 3, relationship: "姑嫂：抄检后因入画之事争执，惜春要与宁府断绝", constraint: "惜春的决绝源于对宁府污浊的羞愤" },
    { source: "妙玉", target: "贾宝玉", type: "love", intensity: 2, relationship: "方外与公子：有微妙的知己之感，而始终以清规自守", constraint: "不写成世俗情爱；她的动心连自己都不肯承认" },
    { source: "妙玉", target: "林黛玉", type: "peer", intensity: 2, relationship: "同为才女，互有欣赏而少往来", constraint: "第七十六回与黛玉、湘云续诗，是她少见的亲近" },
    { source: "妙玉", target: "史湘云", type: "peer", intensity: 2, relationship: "第七十六回凹晶馆续诗的交集", constraint: "交集极短，不可放大" },

    /* —— 丫鬟层 —— */
    { source: "贾宝玉", target: "袭人", type: "serve", intensity: 5, relationship: "近侍：第六回初试云雨，日常照料与规劝并存", constraint: "袭人的忠心有现实考量，不是无条件顺从" },
    { source: "贾宝玉", target: "晴雯", type: "serve", intensity: 4, relationship: "近侍：性情相投，亲近而清白", constraint: "晴雯不是围绕宝玉的工具人，她有自己的骄傲" },
    { source: "贾宝玉", target: "麝月", type: "serve", intensity: 3, relationship: "近侍：稳妥可靠，不争而久在", constraint: "她的话不多，但在争执时一句话能压住场面" },
    { source: "贾宝玉", target: "芳官", type: "serve", intensity: 3, relationship: "近侍：宠爱有加，纵其任性", constraint: "宠爱反成祸根，终被王夫人撵出" },
    { source: "贾宝玉", target: "金钏", type: "love", intensity: 2, relationship: "主仆而戏语：一句玩笑，酿成一死", constraint: "不是情爱关系，是轻浮的亲近" },
    { source: "袭人", target: "晴雯", type: "feud", intensity: 3, relationship: "同侪而相争：一个守分，一个锋利，暗中较量", constraint: "晴雯被逐，袭人难辞其嫌，但无直接证据" },
    { source: "袭人", target: "麝月", type: "peer", intensity: 3, relationship: "同侪：性情相近，共守怡红院", constraint: "麝月比袭人更少心机" },
    { source: "晴雯", target: "麝月", type: "peer", intensity: 2, relationship: "同侪：性情相反，常有口角", constraint: "第二十回因篦头之事讥讽麝月" },
    { source: "林黛玉", target: "紫鹃", type: "serve", intensity: 5, relationship: "主仆兼知己：紫鹃是唯一能劝她、也敢试她的人", constraint: "紫鹃的试探出于忠心，不是挑拨" },
    { source: "薛宝钗", target: "莺儿", type: "serve", intensity: 3, relationship: "主仆：莺儿手巧话多，常在无心处泄露宝钗心事", constraint: "第八回“金玉”之说的曝光即出自她口" },
    { source: "贾迎春", target: "司棋", type: "serve", intensity: 3, relationship: "主仆：司棋气性盖过主子，迎春管不住她", constraint: "司棋被逐时，迎春无力回护，只能送些东西" },
    { source: "金钏", target: "玉钏", type: "kin", intensity: 4, relationship: "姐妹：同日为王夫人房中丫鬟，姐姐之死改变妹妹一生", constraint: "玉钏的冷淡里有对姐姐的念，也有对自己的护" },
    { source: "鸳鸯", target: "平儿", type: "peer", intensity: 3, relationship: "同为各房心腹，彼此知根底", constraint: "第四十六回鸳鸯当着她们铰发立誓，是极深的信任" },
    { source: "鸳鸯", target: "袭人", type: "peer", intensity: 3, relationship: "同侪：自小一同长大，情分不浅", constraint: "第四十六回三人同在场，鸳鸯只肯对她们说真话" },
    { source: "王熙凤", target: "林红玉", type: "power", intensity: 3, relationship: "提拔：赏识其口才，从怡红院要走", constraint: "小红的忠心是换来的，凤姐待她也以用处为先" },
    { source: "晴雯", target: "芳官", type: "peer", intensity: 2, relationship: "同被王夫人视为“狐媚”而撵出", constraint: "两人性情都锋利，未必亲近，命运却相同" },

    /* —— 外人 —— */
    { source: "刘姥姥", target: "巧姐", type: "power", intensity: 4, relationship: "取名者与被救者：第四十二回取名，日后救其出火坑", constraint: "前八十回尚无救人之事，只是伏笔" },
    { source: "刘姥姥", target: "王夫人", type: "power", intensity: 2, relationship: "远亲之名所系：其婿祖上与王夫人之父连过宗", constraint: "这层亲戚极远，王夫人本人並不认得她" },
    { source: "刘姥姥", target: "贾母", type: "peer", intensity: 2, relationship: "同龄老妇的短暂相交：贾母称其“老亲家”", constraint: "阶级悬殊，这份亲热是自上而下的" }
  ];

  /* 校验：端点必须在角色表中，否则视为数据错误 */
  const titles = new Set(D.characters.map(c => c.title));
  const bad = [];
  EDGES.forEach(e => {
    if (!titles.has(e.source)) bad.push(e.source);
    if (!titles.has(e.target)) bad.push(e.target);
  });

  D.relationship_edges = EDGES;
  window.__HL_RELATION_AUDIT = {
    edges: EDGES.length,
    danglingEndpoints: [...new Set(bad)],
    covered: new Set(EDGES.flatMap(e => [e.source, e.target])).size,
    characters: D.characters.length
  };
})();

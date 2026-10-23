/* ==========================================================================
   data.js · 站点内容（纯数据，不含 DOM 逻辑）
   所有页面通过全局常量读取内容，因此可以直接双击 HTML 打开，
   不需要本地服务器，也不会发起任何网络请求。
   ========================================================================== */

/* ------------------------------------------------------------------ 站点 */
const SITE = {
  name: "朱泽恩",
  latin: "Zhu Ze'en",
  initials: "ZZ",
  handle: "zhuezen",
  brandRole: "Frontend Dev",
  role: "前端 / 全栈开发者",
  tagline: "把想法做成能用的小工具",
  location: "杭州 · 中国",
  email: "hello@zhuezen.dev",
  availability: "可接受新的合作",
  github: "https://github.com/yaesakiarishiya",
  footerBio: "前端开发者。做浏览器扩展、数据看板和本地优先的小工具。",
  intro:
    "我写前端，也写一点点后端。近两年主要在做浏览器扩展、数据看板和本地优先的效率工具，习惯先把验收标准写清楚，再动手实现。",
  social: [
    { label: "GitHub", href: "https://github.com/yaesakiarishiya" },
    { label: "邮箱", href: "mailto:hello@zhuezen.dev" },
  ],
};

/* ---------------------------------------------------------------- 技能 */
const SKILLS = [
  {
    title: "前端",
    icon: "code",
    items: ["HTML / CSS", "JavaScript (ES2022)", "可访问性", "响应式布局", "Canvas / SVG"],
  },
  {
    title: "工程与工具",
    icon: "tool",
    items: ["Node.js", "Vite", "Git / GitHub Actions", "Chrome Extensions", "Playwright"],
  },
  {
    title: "数据与后端",
    icon: "chart",
    items: ["Python / Flask", "REST API", "SQLite", "数据可视化", "虚拟数据建模"],
  },
  {
    title: "协作方式",
    icon: "spark",
    items: ["AI 结对编程", "先写验收标准", "小步提交", "文档即产品"],
  },
];

/* ---------------------------------------------------------------- 项目 */
const PROJECTS = [
  {
    id: "imagegrab",
    title: "图提取 ImageGrab",
    subtitle: "一键提取电商详情页的全部商品图",
    category: "浏览器扩展",
    year: "2026",
    status: "已发布",
    role: "独立开发 · 设计 + 实现 + 官网",
    duration: "约 3 周（业余时间）",
    cover: "assets/shots/imagegrab-home.png",
    coverAlt: "图提取官网首页，深色背景上的产品介绍与界面示意图",
    demo: "https://yaesakiarishiya.github.io/AITraining/",
    source: "https://github.com/yaesakiarishiya/AITraining/tree/main/image-extractor",
    tags: ["Manifest V3", "OffscreenCanvas", "Chrome 扩展"],
    excerpt:
      "在淘宝、京东、拼多多的商品详情页点一下按钮，自动扫描主图、SKU 图、详情长图和背景图，集中勾选后统一导出为 PNG。",
    problem:
      "电商运营整理素材时只能右键另存为：图片散落在主图区、SKU 缩略图、详情长图和 CSS 背景里，懒加载的图还要先滚动到可见位置。一个详情页动辄几十张图，混着 jpg、webp、avif 三种格式，导入设计工具后还要逐张转换。",
    approach:
      "把「找图、筛图、看图、存图」压缩成一次点击。内容脚本负责注入悬浮按钮并扫描页面（包括 src、srcset、data-src 与计算样式里的 background-image），后台 Service Worker 负责在 OffscreenCanvas 上转码，图库页负责勾选与下载，整个过程不经过任何服务器。",
    features: [
      "扫描主图、SKU 图、详情长图与 CSS 背景图，覆盖懒加载属性",
      "按尺寸与地址规则过滤图标、占位图和 1×1 统计像素",
      "独立图库页集中预览，标注每张图的真实像素尺寸",
      "全选 / 反选 / 清空，勾选后实时预览将生成的文件名",
      "OffscreenCanvas 统一转码为 PNG，不依赖当前标签页",
      "逐张下载并给出成功、失败统计，失败项可单独重试",
    ],
    stack: ["Chrome MV3", "JavaScript", "OffscreenCanvas", "CSS Grid"],
    metrics: [
      { value: "3", label: "支持的电商平台" },
      { value: "0", label: "上传到服务器的图片" },
      { value: "PNG", label: "统一输出格式" },
    ],
    architecture: ["内容脚本扫描", "消息转发", "OffscreenCanvas 转码", "图库页下载"],
    shots: [
      {
        src: "assets/shots/imagegrab-gallery.png",
        alt: "扩展的图库页，网格中排列着扫描到的商品图",
        caption: "图库页：集中预览、勾选，右下角显示待下载数量。",
      },
      {
        src: "assets/shots/imagegrab-features.png",
        alt: "官网的功能介绍区块，列出六项核心能力",
        caption: "官网功能区：把采集、过滤、转码、命名的规则写清楚。",
      },
    ],
    learned:
      "第一次做 Manifest V3 扩展，最大的收获是理解了「权限边界」：内容脚本只读 DOM，转码必须放到 OffscreenCanvas，网络请求要显式声明。把每一步都放在最小的权限范围内，插件才容易被信任。",
  },
  {
    id: "dashboard",
    title: "云栖咖啡 · 门店看板",
    subtitle: "一天的经营数据，用一屏讲清楚",
    category: "数据可视化",
    year: "2026",
    status: "演示版",
    role: "独立开发 · 数据建模 + 可视化",
    duration: "约 2 周",
    cover: "assets/shots/dashboard-sales.png",
    coverAlt: "门店销售看板，包含指标卡、分时柱状图和支付方式环图",
    demo: "",
    source: "https://github.com/yaesakiarishiya/AITraining/tree/main/sales-dashboard",
    tags: ["Canvas", "虚拟数据", "响应式"],
    excerpt:
      "销售看板与员工工时两个栏目，覆盖指标卡、分时走势、支付方式、分类销售和逐人明细，全部数据由日期种子确定性生成。",
    problem:
      "给门店做经营演示时，最麻烦的不是图表，而是数据：手写一份 JSON 用两天就过期，随机生成又每次刷新都不一样，没法截图、没法复现问题。",
    approach:
      "以「日期」和「员工 + 日期」为随机种子，写了一个可复现的伪随机数发生器，再按小时客流权重、品类偏好和班次规则生成一整天或一整个月的数据。渲染层与数据层完全分离，接后端时只需要替换数据函数的返回值。",
    features: [
      "五个核心指标，支持与昨日同时段或上月同期对比",
      "0–23 点分时走势，可切换销售额、订单量、客单价",
      "支付方式环图与分类销售占比，纯 Canvas 绘制",
      "员工维度：出勤天数、总工时、加班、迟到早退与每日明细",
      "开业日、未来日期、本月进行中等边界状态都有明确提示",
      "窄屏自动单列并收起次要列，指标卡保持可读",
    ],
    stack: ["JavaScript", "Canvas", "确定性随机", "CSS Grid"],
    metrics: [
      { value: "2", label: "栏目：销售 / 工时" },
      { value: "0", label: "运行时依赖" },
      { value: "1", label: "天粒度数据可复现" },
    ],
    architecture: ["日期种子", "buildDay / getMonth", "渲染函数", "DOM"],
    shots: [
      {
        src: "assets/shots/dashboard-sales-2.png",
        alt: "销售看板下半部分，包含支付方式环图、分类销售和热销商品表",
        caption: "销售结构：支付方式、分类占比与热销商品明细。",
      },
      {
        src: "assets/shots/dashboard-staff.png",
        alt: "员工工时页面，包含月度指标、每日工时和员工汇总表",
        caption: "员工工时：月度汇总与逐日打卡明细联动。",
      },
    ],
    learned:
      "图表不是越花越好。把「环比对比的是哪一段时间」写进界面，比多加一种图表类型更能减少误解；而确定性数据让每一次演示、每一张截图都能被复现。",
  },
  {
    id: "portfolio",
    title: "这个作品集",
    subtitle: "零依赖、可离线打开的静态站点",
    category: "前端工程",
    year: "2026",
    status: "持续迭代",
    role: "独立开发 · 设计 + 实现 + 内容",
    duration: "约 1 周",
    cover: "",
    coverAlt: "",
    demo: "index.html",
    source: "https://github.com/yaesakiarishiya/AITraining/tree/main/portfolio",
    tags: ["原生 CSS", "可访问性", "无构建步骤"],
    excerpt:
      "你正在浏览的站点。没有框架、没有构建步骤、没有外部字体和 CDN，双击 index.html 就能完整运行，包括项目筛选、博客搜索和表单校验。",
    problem:
      "很多作品集本身就是一个反例：为了展示前端能力，引入了十几万行依赖，首屏要等三个 CDN，断网就白屏。我希望它能在任何一台电脑上双击打开，也能被屏幕阅读器完整读完。",
    approach:
      "设计令牌统一放在 :root，布局用 Grid 与三档断点，交互逻辑约五百行原生 JavaScript。内容与渲染分离：项目、文章都存放在 data.js 里，列表页和详情页共用同一份数据，靠查询参数区分。",
    features: [
      "三种断点：单列、两列、三列，任何宽度都不出现横向滚动",
      "键盘可达：跳过链接、可见焦点、方向键切换筛选",
      "表单本地校验，错误与成功状态通过 aria-live 播报",
      "尊重 prefers-reduced-motion，关闭动画后内容照常显示",
      "星空背景用 Canvas 绘制，标签页隐藏时暂停渲染",
      "无 JS 时导航、链接与正文仍然完整可读",
    ],
    stack: ["HTML", "CSS", "原生 JavaScript", "Canvas"],
    metrics: [
      { value: "0", label: "运行时依赖" },
      { value: "100%", label: "可离线访问" },
      { value: "3", label: "响应式断点" },
    ],
    architecture: ["data.js 内容层", "app.js 渲染层", "静态 HTML 骨架", "浏览器"],
    shots: [],
    learned:
      "不用框架时，重复的导航和页脚是最大的成本。这一次我选择接受重复：每个页面都是完整可读的 HTML，搜索引擎、屏幕阅读器和「另存为」都能正常工作，代价只是改导航时要多改几个文件。",
  },
];

/* ---------------------------------------------------------------- 文章 */
const POSTS = [
  {
    slug: "manifest-v3-image-grab",
    title: "从右键另存为到一键批量：图提取是怎么做出来的",
    excerpt:
      "一个电商图片提取扩展的完整拆解：内容脚本怎么扫图、为什么要用 OffscreenCanvas 转码、以及 MV3 里那些容易踩的权限坑。",
    date: "2026-09-18",
    minutes: 9,
    tags: ["Chrome 扩展", "工程实践"],
    featured: true,
    body: `
<p>做电商的朋友给我看过她的素材文件夹：一个商品一个文件夹，里面是 <code>1.jpg</code> 到 <code>37.jpg</code>，格式混着 jpg、webp、avif，还有几张是右键时不小心存下来的缩略图。她说整理一个详情页要十几分钟，一天要整理十几个。</p>
<p>这件事情听起来很适合自动化，但真做起来会发现三个难点：图片藏得深、格式不统一、权限边界严格。</p>

<h2 id="scan">一、图片到底藏在哪</h2>
<p>一个商品详情页的图片来源远比想象中多。除了最直观的 <code>&lt;img src&gt;</code>，还有：</p>
<ul>
  <li><code>srcset</code> 里的多分辨率地址，通常比 <code>src</code> 更清晰；</li>
  <li><code>data-src</code>、<code>data-lazy</code> 这类懒加载属性，滚动前根本不在 DOM 地址里；</li>
  <li>CSS <code>background-image</code>，详情长图经常是背景而不是 <code>img</code>；</li>
  <li><code>&lt;source&gt;</code>、<code>&lt;picture&gt;</code> 里的响应式候选图；</li>
  <li>canvas 或 style 内联样式里拼出来的地址。</li>
</ul>
<p>所以扫描不能只查一种属性，而是要把元素、属性和计算样式都过一遍，再去重。核心思路是：先建立一个 <code>Set</code> 收集候选地址，最后统一过滤。</p>

<pre><code>function collectUrls(root) {
  const urls = new Set();

  root.querySelectorAll("img, source").forEach((el) =&gt; {
    // src / srcset / 懒加载属性一次性收集
    for (const attr of ["src", "data-src", "data-original"]) {
      const v = el.getAttribute(attr);
      if (v) urls.add(new URL(v, location.href).href);
    }
    const srcset = el.getAttribute("srcset");
    if (srcset) {
      srcset.split(",").forEach((part) =&gt; {
        const url = part.trim().split(/\\s+/)[0];
        if (url) urls.add(new URL(url, location.href).href);
      });
    }
  });

  return urls;
}</code></pre>

<h3 id="filter">过滤比收集更难</h3>
<p>页面里真正有用的是商品图，剩下的是图标、logo、占位图、1×1 的统计像素、加载失败的地址。我的过滤规则很朴素，但有效：</p>
<ul>
  <li>宽或高小于 100px 的直接丢弃；</li>
  <li>地址里包含 <code>sprite</code>、<code>icon</code>、<code>logo</code> 的关键词降权；</li>
  <li>图片加载失败（<code>naturalWidth === 0</code>）的不进入结果；</li>
  <li>同一个地址按 pathname 去重，忽略 <code>?width=</code> 之类的参数差异。</li>
</ul>

<h2 id="offscreen">二、为什么转码要单独放到 OffscreenCanvas</h2>
<p>最初的版本在内容脚本里画 canvas 转码，结果页面一滚动就卡，而且淘宝的页面本身有很多 canvas 动画，抢主线程非常明显。</p>
<p>Manifest V3 提供了 <code>OffscreenCanvas</code>，可以在 Service Worker 里创建离屏画布。它不渲染到页面，也就不会和页面争抢同一帧。代价是 Service Worker 不能直接访问 DOM，所有图片数据都得通过消息传递。</p>

<pre><code>// background.js：在离屏文档里完成转码
async function toPng(url) {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);

  return canvas.convertToBlob({ type: "image/png" });
}</code></pre>

<div class="callout">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
  <p>跨域图片会被 canvas 污染，<code>convertedBlob</code> 会直接报错。所以要先 <code>fetch</code> 成 blob，再 <code>createImageBitmap</code>，同时把目标域加进 <code>host_permissions</code>。这一步没有捷径。</p>
</div>

<h2 id="permissions">三、MV3 的权限边界</h2>
<p>Manifest V3 把权限拆得比以前细，写扩展时最容易犯的错是「先全要了再说」。我最后用的权限是：</p>
<div class="table-wrap">
<table>
  <thead><tr><th>权限</th><th>用途</th><th>能不能省</th></tr></thead>
  <tbody>
    <tr><td><code>activeTab</code></td><td>用户点击图标时读取当前页</td><td>不能，替代方案是全站注入</td></tr>
    <tr><td><code>scripting</code></td><td>把内容脚本注入目标页</td><td>不能</td></tr>
    <tr><td><code>downloads</code></td><td>批量保存文件</td><td>可用 a[download] 替代，但大批量不稳定</td></tr>
    <tr><td><code>host_permissions</code></td><td>读取三家平台的商品图</td><td>必须限定到具体域名</td></tr>
  </tbody>
</table>
</div>
<p>权限越少，插件越容易通过审核，用户看到权限提示时也更愿意安装。这部分的收益比多写几十行代码高得多。</p>

<h2 id="lessons">四、做完之后的三点体会</h2>
<ol>
  <li><strong>先做最窄的路径</strong>：第一版只支持主图，能跑通再补 SKU 图和长图，出问题也容易定位。</li>
  <li><strong>把「失败」当正常状态</strong>：图片挂了、跨域被拦、文件名重复，都要有明确的提示，而不是静默跳过。</li>
  <li><strong>本地优先不是口号</strong>：不上传图片意味着没有后端成本，也意味着用户敢在你这里点「全选」。</li>
</ol>
<p>插件目前还只在本地加载使用。下一步想补的是详情长图的拼接预览——把一屏一屏裁开的长图重新接回去，这样设计师拿到素材就不用再自己拼了。</p>
`,
  },
  {
    slug: "deterministic-mock-data",
    title: "让演示数据每天都不一样，又永远可以复现",
    excerpt:
      "用日期做随机种子，生成一整天的门店经营数据和一整个月的考勤记录。同一天永远得到同一份数据，换一天又是全新的故事。",
    date: "2026-09-02",
    minutes: 7,
    tags: ["数据可视化", "JavaScript"],
    featured: false,
    body: `
<p>做数据看板时，虚拟数据是最容易被忽略的部分。一开始我用 <code>Math.random()</code>，效果很好玩：每次刷新，销售额、订单量、热销商品全在变。问题是它不能用来演示，也不能用来调试。</p>
<p>同一张截图发给客户，第二天打开数字完全对不上；发现一个图表 bug，刷新一下就复现不了了。所以我换了一个思路：<strong>让数据由日期唯一决定</strong>。</p>

<h2 id="seed">一、把日期变成种子</h2>
<p>最简单的做法是把日期字符串哈希成一个整数，再用它初始化伪随机数发生器（PRNG）。这里用经典的 mulberry32，代码不到十行，序列质量足够演示用：</p>

<pre><code>function mulberry32(seed) {
  let a = seed &gt;&gt;&gt; 0;
  return function random() {
    a = (a + 0x6d2b79f5) &gt;&gt;&gt; 0;
    let t = a;
    t = Math.imul(t ^ (t &gt;&gt;&gt; 15), t | 1);
    t ^= t + Math.imul(t ^ (t &gt;&gt;&gt; 7), t | 61);
    return ((t ^ (t &gt;&gt;&gt; 14)) &gt;&gt;&gt; 0) / 4294967296;
  };
}

// "2026-09-02" -&gt; 稳定整数种子
function seedOf(key) {
  let h = 2166136261;
  for (let i = 0; i &lt; key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h &gt;&gt;&gt; 0;
}</code></pre>

<p>这样一来，<code>buildDay("2026-09-02")</code> 每次调用都返回完全相同的对象。截图、回放、写测试都不再需要额外准备数据。</p>

<h2 id="structure">二、让数据「像真的」</h2>
<p>纯随机会得到一个每天中午都爆单、每天热销商品都一样的店，看起来就很假。可复现的基础上，还要加入业务规律：</p>
<ul>
  <li><strong>时段权重</strong>：早高峰、午高峰、下午茶、晚间依次衰减，周末整体上浮约 30%；</li>
  <li><strong>品类偏好</strong>：早上烘焙多，中午简餐多，饮品全天稳定；</li>
  <li><strong>支付方式</strong>：微信和支付宝占大头，会员储值、银行卡、现金各有固定比例；</li>
  <li><strong>退单</strong>：小概率出现，金额计入退款而不是直接抹掉。</li>
</ul>
<p>这些规则写成常量表，而不是散落在代码里的 <code>if</code>，调整比例时只改一处。</p>

<h3 id="compare">环比对比的时间口径</h3>
<p>看板里每个指标都有环比，但「比什么」经常被误解。我的处理是把它写进数据层：</p>
<div class="table-wrap">
<table>
  <thead><tr><th>查看的日期</th><th>对比对象</th><th>原因</th></tr></thead>
  <tbody>
    <tr><td>今天（进行中）</td><td>昨天同一时段</td><td>整天对半天没有意义</td></tr>
    <tr><td>历史某天</td><td>前一天整天</td><td>两边都是完整的一天</td></tr>
    <tr><td>开业首日</td><td>无</td><td>没有前一天，只给说明不给涨跌</td></tr>
  </tbody>
</table>
</div>

<div class="callout callout--warn">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
  <p>如果数据层不说明口径，界面层一定会各写一套。涨跌幅看起来只是一个百分比，背后是用户对「这个店今天怎么样」的判断。</p>
</div>

<h2 id="boundaries">三、边界状态才是演示的重点</h2>
<p>演示时最常被问到的问题不是「数字怎么算的」，而是「如果今天还没结束呢」「如果我选到开业之前呢」。所以我把这些状态都当成正式功能来做：</p>
<ul>
  <li>未来日期：提示「该日期尚未发生」，日期选择器仍然可用；</li>
  <li>开业日前：提示「店铺尚未开业」，不生成任何数据；</li>
  <li>进行中的月份：只统计到今天，参考工时按已过天数等比折算；</li>
  <li>正在上班的班次：按已工作时长计入，并标注「进行中」。</li>
</ul>
<p>把这些写清楚之后，看板才像一个真实的产品，而不是一张会动的截图。</p>

<h2 id="separate">四、数据层和渲染层分开</h2>
<p>最后的结构很简单：<code>data.js</code> 只负责生成数据，<code>app.js</code> 和 <code>staff.js</code> 只读不写。接后端时，把 <code>buildDay</code> 换成一次 <code>fetch</code>，返回同样形状的对象，渲染代码一行都不用改。</p>
<p>这也是我做这类演示项目最看重的一点：虚拟数据不是占位符，它是产品逻辑的一部分。它可复现、有口径、有边界，接上真实数据时才不会崩。</p>
`,
  },
  {
    slug: "responsive-breakpoints",
    title: "三档断点就够了：一次克制的响应式设计",
    excerpt:
      "不追设备型号，只追内容什么时候挤不下。记录这个站点从单列到三列的取舍，以及那些比断点更重要的细节。",
    date: "2026-08-21",
    minutes: 6,
    tags: ["CSS", "响应式"],
    featured: false,
    body: `
<p>刚学响应式的时候，我收藏过一份「几十个设备断点」的清单，照着写出来的 CSS 有上千行，维护起来像在解谜。后来发现，真正需要的断点数量，取决于内容在什么宽度下开始难受。</p>

<h2 id="how-many">一、先看内容，再看设备</h2>
<p>这个站点只有三档断点，分别对应三种阅读状态：</p>
<div class="table-wrap">
<table>
  <thead><tr><th>宽度</th><th>布局</th><th>为什么在这里切换</th></tr></thead>
  <tbody>
    <tr><td>&lt; 640px</td><td>单列</td><td>卡片低于 280px 时标题开始频繁换行</td></tr>
    <tr><td>640–1023px</td><td>两列</td><td>平板竖屏能同时放下两张卡且不挤压</td></tr>
    <tr><td>≥ 1024px</td><td>三列</td><td>容器 1200px，三列各自还有 340px 左右</td></tr>
  </tbody>
</table>
</div>
<p>手机 375px、平板 768px、桌面 1440px 只是验证用的样本，不是设计目标。只要在 360px 到 1920px 之间连续缩放都不出问题，断点就是合适的。</p>

<h2 id="fluid">二、能用流式解决的，不要用断点</h2>
<p>间距、字号这类连续变化的量，用 <code>clamp()</code> 比写三个 <code>@media</code> 更省事，也更平滑：</p>

<pre><code>--gutter: clamp(1.25rem, 4vw, 2.5rem);
--section-y: clamp(3.5rem, 8vw, 6.5rem);
font-size: clamp(2rem, 6vw, 3.4rem);</code></pre>

<p>断点只留给「结构真的变了」的地方：导航从下拉变成横排、网格从两列变成三列、文章目录从正文下方移到右侧。结构不变时改变数值，往往只是给自己添麻烦。</p>

<h3 id="sidebar">侧栏是唯一需要单独判断的地方</h3>
<p>文章页在 1000px 才把目录移到右侧，因为这个宽度以下，正文一旦被侧栏挤压，就会掉到 45 个字符以内，中文阅读体验明显变差。这个数字是从正文的最大宽度反推出来的，不是从设备尺寸抄的。</p>

<h2 id="overflow">三、横向滚动是响应式最常见的 bug</h2>
<p>调试时先问一个问题：到底是哪个元素撑破了页面？在控制台执行下面的代码，能快速定位：</p>

<pre><code>[...document.querySelectorAll("*")]
  .filter((el) =&gt; el.getBoundingClientRect().right &gt; document.documentElement.clientWidth + 1)
  .forEach((el) =&gt; console.log(el));</code></pre>

<p>这个站点里，最常见的三个原因是：</p>
<ul>
  <li>长串英文或 URL 不会换行 —— 用 <code>overflow-wrap: anywhere</code>；</li>
  <li>绝对定位的装饰元素超出视口 —— 在外层加 <code>overflow: hidden</code>；</li>
  <li>网格子项的最小宽度是内容宽度 —— 把 <code>1fr</code> 改成 <code>minmax(0, 1fr)</code>。</li>
</ul>

<div class="callout">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
  <p>第三点最隐蔽。代码块、表格、长标题都会把 <code>1fr</code> 的子项撑开，导致整页多出几像素的横向滚动，而肉眼几乎看不出来。</p>
</div>

<h2 id="more">四、比断点更重要的四件事</h2>
<ol>
  <li><strong>触控目标至少 44×44</strong>：导航链接、筛选按钮、表单关闭都在这个尺寸以上。</li>
  <li><strong>焦点顺序与视觉顺序一致</strong>：移动端导航面板从 DOM 顺序展开，键盘用户不会「跳」到页脚。</li>
  <li><strong>尊重系统偏好</strong>：<code>prefers-reduced-motion</code> 打开时，滚动动画和星空都停下来，内容照常显示。</li>
  <li><strong>在真机上看一次</strong>：模拟器不会告诉你 iOS 上 100vh 会被地址栏挡住，也不会告诉你字号设置会影响长标题。</li>
</ol>
<p>做到这些，三档断点完全够用。响应式不是把设备清单抄一遍，而是让内容在任何宽度下都保持可读、可点、可理解。</p>
`,
  },
  {
    slug: "ai-pair-programming",
    title: "和 AI 结对编程：先验收、再实现、后复盘",
    excerpt:
      "把 AI 当成一个记得多、但不会替你做判断的搭档。分享我完成四个项目后留下来的工作流程，以及几个反直觉的结论。",
    date: "2026-08-09",
    minutes: 5,
    tags: ["AI 工作流", "方法论"],
    featured: false,
    body: `
<p>这四个项目基本都是和 AI 一起完成的。用了一段时间之后，我的结论是：AI 最擅长的是「把已经想清楚的事情写完」，最不擅长的是「替你想清楚要什么」。所以流程的重心不在写代码，而在写清楚验收标准。</p>

<h2 id="acceptance">一、先写验收标准</h2>
<p>开工之前，我会先用三到五条句子写下「做完是什么样」。比如这个作品集的验收标准是：</p>
<ul>
  <li>在 375px、768px、1440px 三个宽度下都没有横向滚动，网格分别是 1、2、3 列；</li>
  <li>不按鼠标、只用键盘能走完导航、筛选和表单提交；</li>
  <li>断网、双击 <code>index.html</code> 也能完整使用，没有外部请求。</li>
</ul>
<p>这三条写下来之后，后续每一个决定都有依据：要不要引入框架？不引。要不要用 CDN 字体？不用。要不要给筛选加动画？可以，但要能被 <code>prefers-reduced-motion</code> 关掉。</p>

<h2 id="small-steps">二、把改动切小，每一步都能验证</h2>
<p>让 AI 一次生成十几个文件，结果通常是能跑但看不懂，出了问题也不知道从哪查。我的做法是：</p>
<ol>
  <li>先搭骨架：目录、样式令牌、导航和页脚，浏览器里能看到一个能点的空页面；</li>
  <li>再做一条完整路径：一个项目从数据到列表到详情，跑通之后再复制到其他项目；</li>
  <li>最后补边界：空状态、错误状态、键盘操作、减少动效。</li>
</ol>
<p>每一步都打开浏览器看一遍。看到的东西和描述不一致时，先怀疑自己的描述不够具体，而不是先改代码。</p>

<h2 id="prompts">三、描述里最值钱的是「不要什么」</h2>
<p>只说「做一个好看的作品集」，会得到大量渐变、阴影和无关的动效。加上约束之后，结果稳定得多：</p>

<pre><code>不要用框架，不要构建步骤
不要外部字体和 CDN，断网必须能看
不要自动播放的视频，不要视差滚动
不要超过三档断点
所有颜色集中在一处，方便换主题</code></pre>

<p>约束不是限制创造力，而是把审美判断从「猜」变成「选」。剩下真正需要我决定的事情，其实只有内容本身。</p>

<div class="callout callout--warn">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
  <p>AI 写的代码经常「看起来对」。表单能提交，但错误提示没有关联到输入框；动画很顺，但键盘用户按 Tab 时焦点丢了。这些只能靠实际走一遍来发现。</p>
</div>

<h2 id="review">四、复盘只记三件事</h2>
<p>每个项目结束后，我会写下：哪个决定是对的、哪个地方返工最多、下次提前做什么。图提取项目的复盘是：</p>
<ul>
  <li>对的：先只支持主图，跑通再扩展；</li>
  <li>返工最多：跨域图片转码，一开始没考虑 canvas 污染；</li>
  <li>下次提前做：先把权限列表写出来，再写功能。</li>
</ul>
<p>这些记录比代码更有价值。下一个项目开始时，它们就是现成的验收标准。</p>
`,
  },
  {
    slug: "local-first-tools",
    title: "本地优先：为什么我的小工具都不上传数据",
    excerpt:
      "不上传图片、不需要账号、断网可用——这些选择看起来是技术限制，其实是在换一种成本结构。",
    date: "2026-07-27",
    minutes: 4,
    tags: ["产品思考", "隐私"],
    featured: false,
    body: `
<p>图提取上线之后，被问得最多的两个问题是「要登录吗」和「图片会不会传到你们服务器」。答案都是不会。这不是因为技术上做不到，而是因为一旦上传，产品的成本结构就变了。</p>

<h2 id="cost">一、上传意味着什么</h2>
<p>一个「帮用户存图」的功能，接上后端之后会立刻多出这些东西：</p>
<ul>
  <li>存储费用和清理策略，用户不删就得一直付；</li>
  <li>账号体系、找回密码、注销与数据导出；</li>
  <li>传输加密、访问控制、日志脱敏；</li>
  <li>隐私政策和合规审查，以及随之而来的信任成本。</li>
</ul>
<p>对一个业余项目来说，这些成本远高于功能本身带来的价值。而用户得到的，只是「换一台电脑也能看到昨天存的图」。</p>

<h2 id="trust">二、本地优先换来了什么</h2>
<p>把处理全部放在浏览器里，最直接的好处是文案可以写得很短：<strong>图片不会离开你的电脑</strong>。这句话不需要解释，也不需要用户读三页隐私政策。</p>
<p>其次是可靠性：没有接口就不会 502，没有配额就不会在月末突然不可用，断网在地铁里也能用。这对一个工具类产品来说，比多一个云同步按钮重要得多。</p>

<h3 id="limits">代价也要说清楚</h3>
<p>本地优先不是免费的：</p>
<div class="table-wrap">
<table>
  <thead><tr><th>限制</th><th>实际影响</th><th>我的处理</th></tr></thead>
  <tbody>
    <tr><td>数据只在这台设备</td><td>换电脑看不到历史</td><td>提供导出为文件的入口</td></tr>
    <tr><td>浏览器存储有上限</td><td>大量图片占空间</td><td>只存索引，不存原图</td></tr>
    <tr><td>无法做服务端计算</td><td>复杂处理会慢</td><td>把重活放到 OffscreenCanvas</td></tr>
  </tbody>
</table>
</div>

<h2 id="fit">三、什么时候该上传</h2>
<p>本地优先适合「单人、单次、结果可以立刻拿走」的工具。一旦出现下面这些需求，就该老老实实做后端：</p>
<ul>
  <li>多人协作，需要共享同一份数据；</li>
  <li>需要在手机上继续电脑上的工作；</li>
  <li>需要长期保存并检索历史记录；</li>
  <li>需要服务端密钥或模型推理。</li>
</ul>
<p>判断标准很简单：如果用户的主要收益来自「数据留在我这里」，就别上传；如果收益来自「数据能被别人看到」，才值得付出后端的复杂度。</p>

<div class="callout">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
  <p>这个作品集的联系表单也是同样的思路：填写的内容只保存在浏览器的 localStorage 里，用来演示校验和状态反馈，不会提交到任何地方。</p>
</div>

<p>小工具最珍贵的资源是注意力，不是服务器。少一个后端，就少一整类以后要维护的问题。</p>
`,
  },
];

/* ---------------------------------------------------------------- 足迹 */
const TIMELINE = [
  {
    time: "2026 · 现在",
    title: "独立开发浏览器扩展与数据工具",
    desc: "完成图提取 ImageGrab 与门店经营看板，把「本地优先」作为默认选择。同时在系统学习可访问性与前端性能。",
  },
  {
    time: "2025",
    title: "从页面实现转向完整产品",
    desc: "开始独立负责从需求拆解、数据建模到部署的完整流程，习惯先写验收标准，再决定技术方案。",
  },
  {
    time: "2024",
    title: "进入前端开发",
    desc: "从 HTML、CSS 和原生 JavaScript 起步，做了大量小组件与静态页面，逐渐形成自己的样式组织方式。",
  },
];

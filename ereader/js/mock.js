/* ==========================================================================
   mock.js · 演示数据
   说明：这是界面原型，没有真实的 EPUB 解析。书籍、目录、正文与封面
   全部是模拟内容，只为让界面接近真实阅读体验。
   ========================================================================== */

(function () {
  "use strict";

  /* 三套段落池：小说、随笔、技术。演示时按种子轮转取用，保证每次打开一致。 */
  const NARRATIVE = [
    "天还没亮，楼下早点铺的灯先亮了。她把窗推开一条缝，冷气挤进来，像有人在外面轻轻推门。",
    "这座城醒得很早。送奶的三轮车碾过路面的接缝，铁皮碰响，一声一声，把夜里的梦敲成碎片。",
    "她想起很多年前的一个下午，也是这样的光，斜斜地铺在地板上，把人影拉得很长。",
    "“你走之后，那条街也换了模样。”他说这话时没有看她，只是把杯子里剩下的水喝完。",
    "修理铺的门帘被风吹起，露出里面一排排待修的旧钟，指针停在不同的时刻。",
    "雨停之后，城市像被人擦过一遍，玻璃和铁皮都在发亮。",
    "他把信纸折成三折，塞进外套内袋，动作熟练得像做过很多次。",
    "夜里两点，窗外的货车一辆接一辆，灯光在墙上划过去，又暗下来。",
    "她没有回答，只是把碗往他那边推了推。",
    "街角的树今年开得晚，花落在自行车筐里，第二天就蔫了。",
  ];

  const ESSAY = [
    "写作最难的部分从来不是开始，而是承认第一版是垃圾，然后继续改。",
    "一个系统复杂到什么程度，取决于你愿不愿意在早期多花两天把边界写清楚。",
    "我们常常把“没时间”当成理由，实际的情况是这件事还没有重要到要占掉别的事。",
    "好的工具应该让人忘记它的存在：打开、做事、关掉，中间不需要学习。",
    "删掉一半功能以后，剩下的那一半才开始变得好用。",
    "承诺要小，兑现要快。这句话对产品、对合作、对自己都成立。",
    "用户说的需求和他真正的痛点之间，往往隔着一次完整的观察。",
    "文档不是写给未来的自己，是写给三个月后已经忘记上下文的自己。",
    "很多时候不是方案不够好，而是方案太多，于是哪一个都没走到能用的那一步。",
    "判断一件事值不值得做，我通常只问两个问题：它解决了谁的什么麻烦，以及不做会怎样。",
  ];

  const TECH = [
    "把“打开一本书”拆成四步：拿到文件、解出目录、渲染一章、记住位置。每一步都可以单独验证，出了问题也容易定位。",
    "解压 EPUB 只是读 ZIP 的中央目录，再按偏移取出条目，不需要引入完整的压缩库。",
    "渲染容器用独立文档，是为了让原书的样式影响不到工具栏，反过来也一样。",
    "进度不能只记章节序号，否则每次打开都回到章节开头，用户会觉得“没保存”。",
    "性能问题多数不是算法慢，而是一次性渲染了整本书：八百页的 DOM 会让滚动变成幻灯片。",
    "错误提示要具体：“文件损坏”能指导用户换一本书，“出错了”不能。",
    "可访问性不是附加项。键盘能读完一本书，这个阅读器才算真的能读。",
    "测试优先覆盖边界：空目录、加密文件、超大图片，这三类占了大多数线上反馈。",
  ];

  const QUOTES = {
    narrative: "“灯亮之前，谁都不知道这一夜有多长。”",
    essay: "“删掉一半功能以后，剩下的那一半才开始变得好用。”",
    tech: "“先让一件事可以被验证，再让它变快。”",
  };

  const CODE = [
    "const entry = zip.entries.find((f) => f.name === \"META-INF/container.xml\");\nconst opf = await readXml(entry);",
    "if (!metadata.title) {\n  metadata.title = fileName.replace(/\\.epub$/i, \"\");\n}",
    "const max = scroller.scrollHeight - scroller.clientHeight;\nconst percent = max > 0 ? scroller.scrollTop / max : 0;",
  ];

  /* 按种子轮转取段落：同一天、同一章永远得到同样的内容 */
  function pick(pool, seed, count) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      out.push(pool[(seed * 5 + i * 3) % pool.length]);
    }
    return out;
  }

  function chapter(title, seed, pool, options) {
    const opts = options || {};
    const blocks = pick(pool, seed, 6).map((text) => ({ type: "p", text: text }));

    if (opts.quote) {
      blocks.splice(3, 0, { type: "quote", text: opts.quote });
    }
    if (opts.code) {
      blocks.splice(2, 0, { type: "code", text: opts.code });
    }
    return { title: title, blocks: blocks };
  }

  function build(meta, pool, quote, codeIndexes) {
    const chapters = meta.titles.map(function (title, index) {
      const hasCode = codeIndexes.indexOf(index) !== -1;
      return chapter(title, meta.seed + index, pool, {
        quote: index === 2 ? quote : "",
        code: hasCode ? CODE[index % CODE.length] : "",
      });
    });

    return {
      id: meta.id,
      title: meta.title,
      author: meta.author,
      genre: meta.genre,
      hue: meta.hue,
      seed: meta.seed,
      progress: meta.progress || null,
      addedHours: meta.addedHours || 0,
      chapters: meta.firstBlocks
        ? [{ title: meta.titles[0], blocks: meta.firstBlocks }].concat(chapters.slice(1))
        : chapters,
    };
  }

  /* ------------------------------------------------------------- 书架初始 */
  const night = build(
    {
      id: "night",
      title: "长夜将尽",
      author: "沈砚",
      genre: "小说",
      hue: 212,
      seed: 3,
      addedHours: 96,
      progress: { chapter: 2, percent: 0.38, hoursAgo: 3 },
      titles: [
        "灯亮之前",
        "桥",
        "修理铺",
        "一封没有寄出的信",
        "雨停之后",
        "夜车",
        "花开得晚",
        "长夜将尽",
      ],
      firstBlocks: [
        { type: "p", text: "天还没亮，楼下早点铺的灯先亮了。她把窗推开一条缝，冷气挤进来，像有人在外面轻轻推门。" },
        { type: "p", text: "这座城醒得很早。送奶的三轮车碾过路面的接缝，铁皮碰响，一声一声，把夜里的梦敲成碎片。" },
        { type: "p", text: "她坐在床沿穿鞋，忽然想起昨天没回的那条消息。手机屏幕亮着，光落在手背上，像一小块冰。" },
        { type: "p", text: "“你走之后，那条街也换了模样。”他在电话里这样说，语气很轻，像怕吵醒什么。" },
        { type: "p", text: "她把信纸折成三折，塞进外套内袋，动作熟练得像做过很多次。其实这是第一次。" },
        { type: "p", text: "出门的时候，天边刚刚翻出一点颜色。她回头看了一眼窗户，灯还亮着。" },
      ],
    },
    NARRATIVE,
    QUOTES.narrative,
    []
  );

  const buildBook = build(
    {
      id: "complex",
      title: "把复杂留给自己",
      author: "陈默",
      genre: "随笔",
      hue: 26,
      seed: 7,
      addedHours: 240,
      progress: { chapter: 0, percent: 0.18, hoursAgo: 27 },
      titles: [
        "先把问题写下来",
        "边界比功能重要",
        "删掉一半",
        "小承诺，快兑现",
        "文档写给三个月后",
        "慢一点，但一直往前",
      ],
    },
    ESSAY,
    QUOTES.essay,
    []
  );

  const city = build(
    {
      id: "city",
      title: "一座城的四季",
      author: "许南",
      genre: "散文",
      hue: 156,
      seed: 11,
      addedHours: 720,
      titles: ["春·桥头", "夏·午后", "秋·旧书市", "冬·末班车", "又一年"],
    },
    NARRATIVE,
    "“四季不等人，但每一季都会留一点东西在街角。”",
    []
  );

  /* --------------------------------------------------------- 导入用的书 */
  const screen = build(
    {
      id: "screen",
      title: "读屏时代",
      author: "周牧",
      genre: "技术随笔",
      hue: 268,
      seed: 17,
      addedHours: 0,
      titles: ["打开一本书的四步", "解压不等于解析", "容器的边界", "记住位置", "错误要具体"],
    },
    TECH,
    QUOTES.tech,
    [1, 3]
  );

  const sea = build(
    {
      id: "sea",
      title: "海边的房间",
      author: "顾青",
      genre: "小说",
      hue: 342,
      seed: 23,
      addedHours: 0,
      titles: ["潮水", "空房间", "电话", "灯", "退潮", "离开"],
    },
    NARRATIVE,
    "“海把说过的话都还了回来，只是顺序变了。”",
    []
  );

  window.YEJIAN_DATA = {
    books: [night, buildBook, city],
    extras: [screen, sea],
  };
})();

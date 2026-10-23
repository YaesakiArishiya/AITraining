/* ==========================================================================
   epub.js · EPUB / TXT 解析
   零依赖：ZIP 用 DecompressionStream 解压，XML 用 DOMParser。
   本期只提取文本层（段落、小标题、引用、代码块），图片与原始排版留到下一轮。
   ========================================================================== */

const MAX_CHAPTERS = 200;
const MAX_CHARS = 1_600_000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const XML = "application/xhtml+xml";

/* ------------------------------------------------------------- 通用工具 */
function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}

function normalize(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/* 章节内相对路径转成 ZIP 内的绝对路径，处理 ../ 与 %20 */
function resolvePath(base, href) {
  const clean = decodeURIComponent(String(href).split("#")[0]);
  if (!base) return clean.replace(/^\.?\//, "");
  const parts = base.split("/");
  parts.pop();
  clean.split("/").forEach(function (part) {
    if (!part || part === ".") return;
    if (part === "..") parts.pop();
    else parts.push(part);
  });
  return parts.join("/");
}

async function inflate(stream) {
  const response = new Response(stream);
  return new Uint8Array(await response.arrayBuffer());
}

/* ----------------------------------------------------------------- ZIP */
async function openZip(buffer) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("当前浏览器不支持解压，请使用桌面版 Chrome 或 Edge");
  }

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // EOCD 在文件尾部，最多再带 64KB 注释
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 65558);
  for (let i = bytes.length - 22; i >= floor; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("这个文件不是有效的 EPUB（找不到 ZIP 目录）");

  const count = view.getUint16(eocd + 10, true);
  const offset = view.getUint32(eocd + 16, true);
  if (offset === 0xffffffff) throw new Error("暂不支持 ZIP64 格式的 EPUB");

  const decoder = new TextDecoder();
  const entries = new Map();
  let pointer = offset;

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break;

    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    // 少数打包工具（含 Windows 的 Compress-Archive）会写反斜杠，统一成正斜杠，否则章节路径对不上
    const normalized = name.replace(/\\/g, "/");

    entries.set(normalized, { method: method, compressedSize: compressedSize, localOffset: localOffset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return {
    read: async function (name) {
      const entry = entries.get(name) || entries.get(decodeURIComponent(name));
      if (!entry) return null;
      if (entry.localOffset === 0xffffffff) throw new Error("暂不支持 ZIP64 格式的 EPUB");

      const nameLength = view.getUint16(entry.localOffset + 26, true);
      const extraLength = view.getUint16(entry.localOffset + 28, true);
      const start = entry.localOffset + 30 + nameLength + extraLength;
      const data = bytes.subarray(start, start + entry.compressedSize);

      if (entry.method === 0) return data;
      if (entry.method !== 8) throw new Error("EPUB 内使用了不支持的压缩方式");
      return inflate(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")));
    },
    readText: async function (name) {
      const data = await this.read(name);
      if (!data) return null;
      return new TextDecoder().decode(data);
    },
    has: function (name) {
      return entries.has(name);
    },
    names: function () {
      return Array.from(entries.keys());
    },
  };
}

/* ---------------------------------------------------------------- 文本层 */
function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  return doc;
}

function parseHtml(text) {
  const xml = parseXml(text);
  if (xml && xml.documentElement && xml.documentElement.localName !== "parsererror") return xml;
  return new DOMParser().parseFromString(text, "text/html");
}

function byLocalName(doc, name) {
  return Array.prototype.slice.call(doc.getElementsByTagNameNS("*", name));
}

function extractBlocks(doc) {
  const blocks = [];
  const BLOCK = ["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "LI", "TD", "FIGCAPTION", "DIV"];
  const SKIP = ["SCRIPT", "STYLE", "NAV", "HEAD", "TITLE", "SVG", "IMG"];
  const root = doc.body || doc.documentElement;

  function walk(node) {
    Array.prototype.forEach.call(node.children, function (child) {
      const tag = (child.tagName || "").toUpperCase();
      if (SKIP.indexOf(tag) !== -1) return;

      const hasBlockChild = Array.prototype.some.call(child.children, function (grand) {
        return BLOCK.indexOf((grand.tagName || "").toUpperCase()) !== -1;
      });
      if (hasBlockChild) {
        walk(child);
        return;
      }

      const isCode = tag === "PRE";
      const text = isCode
        ? child.textContent.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim()
        : normalize(child.textContent);
      if (!text) return;

      const type = tag.charAt(0) === "H" ? "h3" : tag === "BLOCKQUOTE" ? "quote" : isCode ? "code" : "p";
      if (blocks.length && blocks[blocks.length - 1].text === text) return;
      blocks.push({ type: type, text: text });
    });
  }

  walk(root);
  return blocks;
}

function firstHeading(doc) {
  const headings = byLocalName(doc, "h1").concat(byLocalName(doc, "h2"), byLocalName(doc, "h3"));
  for (let i = 0; i < headings.length; i += 1) {
    const text = normalize(headings[i].textContent);
    if (text) return text.slice(0, 40);
  }
  return "";
}

/* 目录：nav.xhtml 优先，退回 toc.ncx，都没有就交给 spine 顺序 */
function navFromDocument(doc) {
  const list = [];
  const navs = byLocalName(doc, "nav");

  for (let i = 0; i < navs.length; i += 1) {
    const type = navs[i].getAttribute("epub:type") || navs[i].getAttribute("type") || "";
    if (type && type.indexOf("toc") === -1) continue;

    byLocalName(navs[i], "a").forEach(function (link) {
      const href = link.getAttribute("href");
      const text = normalize(link.textContent);
      if (href && text) list.push({ href: href, title: text.slice(0, 40) });
    });
    if (list.length) break;
  }
  return list;
}

function navFromNcx(doc) {
  const list = [];
  byLocalName(doc, "navPoint").forEach(function (point) {
    const label = byLocalName(point, "text")[0];
    const content = byLocalName(point, "content")[0];
    const src = content ? content.getAttribute("src") : "";
    const title = label ? normalize(label.textContent) : "";
    if (src && title) list.push({ href: src, title: title.slice(0, 40) });
  });
  return list;
}

/* ----------------------------------------------------------------- EPUB */
export async function parseEpub(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("文件超过 100MB，演示版本暂不处理这么大的书");
  }

  const zip = await openZip(await file.arrayBuffer());

  if (zip.has("META-INF/encryption.xml")) {
    const encrypted = await zip.readText("META-INF/encryption.xml");
    if (encrypted && encrypted.indexOf("EncryptedData") !== -1) {
      throw new Error("这本书带加密保护（DRM），暂不支持");
    }
  }

  const containerXml = await zip.readText("META-INF/container.xml");
  let opfPath = "";

  if (containerXml) {
    const container = parseXml(containerXml);
    const rootfile = container ? byLocalName(container, "rootfile")[0] : null;
    if (rootfile) opfPath = rootfile.getAttribute("full-path") || "";
  }
  if (!opfPath) {
    opfPath = zip.names().filter(function (name) {
      return /\.opf$/i.test(name);
    })[0] || "";
  }
  if (!opfPath) throw new Error("解析不到书籍信息（缺少 OPF）");

  const opfText = await zip.readText(opfPath);
  const opf = opfText ? parseXml(opfText) : null;
  if (!opf) throw new Error("书籍信息损坏，无法解析");

  const manifest = new Map();
  byLocalName(opf, "item").forEach(function (item) {
    manifest.set(item.getAttribute("id"), {
      href: item.getAttribute("href") || "",
      type: item.getAttribute("media-type") || "",
      properties: item.getAttribute("properties") || "",
    });
  });

  const spine = [];
  byLocalName(opf, "itemref").forEach(function (itemref) {
    const id = itemref.getAttribute("idref");
    const item = manifest.get(id);
    if (!item) return;
    if (itemref.getAttribute("linear") === "no") return;
    spine.push(resolvePath(opfPath, item.href));
  });
  if (!spine.length) throw new Error("这本书没有可读的章节");

  const metaTitle = byLocalName(opf, "title")[0];
  const metaAuthor = byLocalName(opf, "creator")[0];
  const title = normalize(metaTitle ? metaTitle.textContent : "") || file.name.replace(/\.[^.]+$/, "");
  const author = normalize(metaAuthor ? metaAuthor.textContent : "") || "未知作者";

  // 目录标题按路径对齐到 spine，缺失的章节后面再用正文首标题补
  const navTitles = new Map();
  let navList = [];
  const navItem = Array.from(manifest.values()).find(function (item) {
    return item.properties.indexOf("nav") !== -1 || /nav\.x?html$/i.test(item.href);
  });

  if (navItem) {
    const navText = await zip.readText(resolvePath(opfPath, navItem.href));
    const navDoc = navText ? parseHtml(navText) : null;
    if (navDoc) navList = navFromDocument(navDoc);
  }
  if (!navList.length) {
    const ncxItem = Array.from(manifest.values()).find(function (item) {
      return item.type === "application/x-dtbncx+xml" || /\.ncx$/i.test(item.href);
    });
    if (ncxItem) {
      const ncxText = await zip.readText(resolvePath(opfPath, ncxItem.href));
      const ncxDoc = ncxText ? parseXml(ncxText) : null;
      if (ncxDoc) navList = navFromNcx(ncxDoc);
    }
  }
  navList.forEach(function (entry) {
    const path = resolvePath(opfPath, entry.href);
    if (!navTitles.has(path)) navTitles.set(path, entry.title);
  });

  const chapters = [];
  let chars = 0;

  for (let i = 0; i < spine.length; i += 1) {
    if (chapters.length >= MAX_CHAPTERS || chars >= MAX_CHARS) break;

    const path = spine[i];
    const html = await zip.readText(path);
    if (!html) continue;

    const doc = parseHtml(html);
    const blocks = extractBlocks(doc);
    if (!blocks.length) continue;

    const heading = firstHeading(doc);
    const chapterTitle = navTitles.get(path) || heading || "第 " + (chapters.length + 1) + " 节";

    // 正文开头的标题与章节名重复时去掉，避免标题出现两遍
    if (blocks[0] && blocks[0].type === "h3" && normalize(blocks[0].text) === normalize(chapterTitle)) {
      blocks.shift();
    }
    if (!blocks.length) continue;

    chars += blocks.reduce(function (sum, block) {
      return sum + block.text.length;
    }, 0);

    chapters.push({ title: chapterTitle.slice(0, 60), blocks: blocks });
  }

  if (!chapters.length) throw new Error("没有解析到正文，这本书可能是纯图片版");

  return {
    id: "epub-" + hash(title + "|" + author + "|" + file.size + "|" + file.lastModified),
    title: title.slice(0, 60),
    author: author.slice(0, 40),
    genre: "EPUB",
    hue: (parseInt(hash(title), 36) % 300) + 20,
    source: "local",
    fileName: file.name,
    size: file.size,
    chapters: chapters,
    truncated: chars >= MAX_CHARS || chapters.length >= MAX_CHAPTERS,
  };
}

/* ------------------------------------------------------------------ TXT */
const HEADING = /^\s*(?:第\s*[0-9０-９零〇一二三四五六七八九十百千两]+\s*[章节回卷部篇]|序章|序言|前言|楔子|引子|尾声|后记|番外|chapter\s+\d+|#{1,3}\s+).{0,40}$/i;

function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    // 中文 TXT 很多是 GBK，浏览器自带解码器可以直接用
    try {
      return new TextDecoder("gbk").decode(bytes);
    } catch (fallbackError) {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

function toParagraphs(text) {
  let parts = text.split(/\n\s*\n/);
  if (parts.length <= 2 && text.length > 800) parts = text.split(/\n/);
  return parts
    .map(function (line) {
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(function (line) {
      return line.length > 0;
    });
}

function cleanHeading(line) {
  return line.replace(/^#{1,3}\s+/, "").trim().slice(0, 60);
}

export async function parseTxt(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("文件超过 100MB，演示版本暂不处理这么大的文件");
  }

  const text = decodeText(await file.arrayBuffer()).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  if (!text.trim()) throw new Error("这个文件是空的");

  const rawLines = text.split("\n");
  let metaTitle = "";
  let metaAuthor = "";
  let inHead = true;
  const lines = [];

  // 很多 TXT 开头会写「书名：… / 作者：…」，当作元数据读掉，不混进正文
  rawLines.forEach(function (line) {
    const meta = line.match(/^\s*(书名|作者|作\s*者)\s*[：:]\s*(.+)$/);
    if (inHead && meta) {
      if (meta[1].indexOf("书") !== -1) metaTitle = meta[2].trim().slice(0, 60);
      else metaAuthor = meta[2].trim().slice(0, 40);
      return;
    }
    if (line.trim()) inHead = false;
    lines.push(line);
  });

  const sections = [];
  let current = { title: "", lines: [] };

  lines.forEach(function (line) {
    if (HEADING.test(line) && line.trim().length <= 40) {
      if (current.lines.join("").trim()) sections.push(current);
      current = { title: cleanHeading(line), lines: [] };
      return;
    }
    current.lines.push(line);
  });
  if (current.lines.join("").trim()) sections.push(current);

  const fallbackTitle = (metaTitle || file.name.replace(/\.[^.]+$/, "")).slice(0, 60) || "未命名文本";
  const chapters = [];
  let chars = 0;

  sections.forEach(function (section) {
    if (chapters.length >= MAX_CHAPTERS || chars >= MAX_CHARS) return;

    const paragraphs = toParagraphs(section.lines.join("\n"));
    if (!paragraphs.length) return;

    // 没有识别到章节标题时，按段落切块，避免整本书挤进一章
    if (sections.length === 1 && paragraphs.length > 60) {
      for (let i = 0; i < paragraphs.length; i += 40) {
        const part = paragraphs.slice(i, i + 40);
        chapters.push({
          title: "第 " + (chapters.length + 1) + " 节",
          blocks: part.map(function (text) {
            return { type: "p", text: text };
          }),
        });
      }
      return;
    }

    chars += paragraphs.reduce(function (sum, line) {
      return sum + line.length;
    }, 0);

    chapters.push({
      title: (section.title || (chapters.length === 0 ? fallbackTitle : "第 " + (chapters.length + 1) + " 节")).slice(0, 60),
      blocks: paragraphs.map(function (line) {
        return { type: "p", text: line };
      }),
    });
  });

  if (!chapters.length) throw new Error("没有读到正文内容");

  return {
    id: "txt-" + hash(file.name + "|" + file.size + "|" + file.lastModified),
    title: fallbackTitle,
    author: metaAuthor || "本地 TXT",
    genre: "TXT",
    hue: (parseInt(hash(fallbackTitle), 36) % 300) + 20,
    source: "local",
    fileName: file.name,
    size: file.size,
    chapters: chapters,
    truncated: chars >= MAX_CHARS || chapters.length >= MAX_CHAPTERS,
  };
}

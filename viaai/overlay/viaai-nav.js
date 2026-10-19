/*
 * viaai.si 站群统一导航（悬浮胶囊 + 下拉菜单）
 * 不改动上游 Vue 打包产物：独立脚本，由 scripts/patch-dist.mjs 注入 index.html。
 * 菜单顺序与主站（viaai.si）一致：首页 · 资讯 · 开源 · 导航 · 图床 · 文件 · 关于。
 */
(function () {
  if (window.__viaaiNav) return;
  window.__viaaiNav = true;

  var LANGS = ["zh", "en", "hi", "es", "fr", "pt", "ru", "ja"];
  var LABELS = {
    zh: { home: "首页", digest: "资讯", oss: "开源", links: "导航", images: "图床", files: "文件", about: "关于", brand: "AI之路", open: "站群导航" },
    en: { home: "Home", digest: "Digest", oss: "Open Source", links: "Links", images: "Images", files: "Files", about: "About", brand: "AI Road", open: "Sites" },
  };
  var SELF = "images";

  function lang() {
    var m = /(?:^|; )lang=([a-z]{2})/.exec(document.cookie);
    var l = m && m[1];
    if (!l) l = (navigator.language || "zh").slice(0, 2).toLowerCase();
    return LANGS.indexOf(l) >= 0 ? l : "zh";
  }

  var l = lang();
  var t = LABELS[l] || LABELS.en;
  // 主站与资讯/开源/导航站支持 8 种语言（<站点>/<lang>），图床、文件站不分语言
  var sfx = l === "zh" ? "" : "/" + l;
  var items = [
    ["home", "https://viaai.si" + sfx],
    ["digest", "https://digest.viaai.si" + sfx],
    ["oss", "https://soft.viaai.si" + sfx],
    ["links", "https://nav.viaai.si" + sfx],
    ["images", "https://imgbed.viaai.si"],
    ["files", "https://file.logang.com"],
    ["about", "https://viaai.si" + (l === "zh" ? "/about" : "/" + l + "/about")],
  ];

  function dark() {
    var m = /(?:^|; )viaai_theme=(light|dark)/.exec(document.cookie);
    if (m) return m[1] === "dark";
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  }

  var css =
    ".viaai-nav{position:fixed;left:12px;bottom:12px;z-index:2147483000;font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC',sans-serif}" +
    ".viaai-nav *{box-sizing:border-box}" +
    ".viaai-nav button{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:var(--vn-bg);color:var(--vn-fg);border:1px solid var(--vn-bd);box-shadow:0 2px 10px rgba(0,0,0,.12);font-weight:600}" +
    ".viaai-nav button:focus-visible,.viaai-nav a:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}" +
    ".viaai-nav ul{display:none;list-style:none;margin:0 0 8px;padding:6px;position:absolute;left:0;bottom:100%;min-width:140px;background:var(--vn-bg);border:1px solid var(--vn-bd);border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18)}" +
    ".viaai-nav.open ul{display:block}" +
    ".viaai-nav li a{display:block;padding:7px 12px;border-radius:8px;color:var(--vn-fg);text-decoration:none;white-space:nowrap}" +
    ".viaai-nav li a:hover{background:var(--vn-hv)}" +
    ".viaai-nav li a[aria-current]{font-weight:700;color:#3b82f6}" +
    ".viaai-nav{--vn-bg:#fff;--vn-fg:#1f2937;--vn-bd:#e5e7eb;--vn-hv:#f3f4f6}" +
    ".viaai-nav.dark{--vn-bg:#1f2937;--vn-fg:#f3f4f6;--vn-bd:#374151;--vn-hv:#374151}" +
    "@media print{.viaai-nav{display:none}}";

  function build() {
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    var box = document.createElement("nav");
    box.className = "viaai-nav" + (dark() ? " dark" : "");
    box.setAttribute("aria-label", t.open);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = t.brand + " ▴";

    var ul = document.createElement("ul");
    items.forEach(function (it) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = it[1];
      a.textContent = t[it[0]];
      if (it[0] === SELF) a.setAttribute("aria-current", "page");
      else if (it[0] !== "home") { a.target = "_blank"; a.rel = "noopener"; }
      li.appendChild(a);
      ul.appendChild(li);
    });

    function set(open) {
      box.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); set(!box.classList.contains("open")); });
    document.addEventListener("click", function () { set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });

    box.appendChild(btn);
    box.appendChild(ul);
    document.body.appendChild(box);
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();

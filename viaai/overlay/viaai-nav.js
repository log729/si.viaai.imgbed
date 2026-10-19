/*
 * viaai.si 站群统一导航（悬浮胶囊 + 下拉菜单）
 * 不改动上游 Vue 打包产物：独立脚本，由 scripts/patch-dist.mjs 注入 index.html。
 * 菜单顺序与主站（viaai.si）一致：首页 · 资讯 · 开源 · 导航 · 图床 · 文件 · 关于。
 */
(function () {
  if (window.__viaaiNav) return;
  window.__viaaiNav = true;

  var LABELS = {
    zh: { home: "首页", digest: "资讯", oss: "开源", links: "导航", images: "图床", files: "文件", about: "关于", brand: "AI之路", open: "站群导航" },
    en: { home: "Home", digest: "Digest", oss: "Open Source", links: "Links", images: "Images", files: "Files", about: "About", brand: "AI Road", open: "Sites" },
  };
  var SELF = "images";
  var root = document.documentElement;

  // 菜单文字跟随图床当前显示的语言（zh/en）。显示语言由 viaai-init.js 按共享 cookie 同步；用户在图床右上角切换时
  // 应用写 localStorage["app-locale"] 并更新 <html lang>。本脚本只读 cookie，不写。
  function lang() {
    var v = null;
    try { v = localStorage.getItem("app-locale"); } catch (e) {}
    if (!v) v = root.lang || "zh-CN";
    return /^en/i.test(v) ? "en" : "zh";
  }

  // 主站与资讯/开源/导航站按 <站点>/<lang> 区分语言，图床、文件站不分语言。
  // 图床只有中/英：共享 cookie viaai_lang（只读）是其他语言（如 ja）、且图床显示的正是它的回退语言（英文）时，
  // 链接仍带 cookie 的语言，让用户去到其他站时保持原来的语言；用户在图床里手动换了语言则按图床显示的为准。
  var SHARED = ["zh", "en", "hi", "es", "fr", "pt", "ru", "ja"];
  function siteLang(l) {
    var m = /(?:^|; )viaai_lang=([a-z]{2})/.exec(document.cookie);
    var c = m && SHARED.indexOf(m[1]) >= 0 ? m[1] : null;
    return c && (c === "zh" ? "zh" : "en") === l ? c : l;
  }
  function items(l) {
    var sfx = siteLang(l) === "zh" ? "" : "/" + siteLang(l);
    return [
      ["home", "https://viaai.si" + sfx],
      ["digest", "https://digest.viaai.si" + sfx],
      ["oss", "https://soft.viaai.si" + sfx],
      ["links", "https://nav.viaai.si" + sfx],
      ["images", "https://imgbed.viaai.si"],
      ["files", "https://file.logang.com"],
      ["about", "https://viaai.si" + sfx + "/about"],
    ];
  }

  // 深色模式跟随图床自身（<html class="dark">）
  function dark() {
    return root.classList.contains("dark");
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
    box.className = "viaai-nav";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");

    var ul = document.createElement("ul");

    var cur = "";
    function render() {
      box.classList.toggle("dark", dark());
      var l = lang();
      if (l === cur) return;
      cur = l;
      var t = LABELS[l];
      box.setAttribute("aria-label", t.open);
      btn.textContent = t.brand + " ▴";
      ul.textContent = "";
      items(l).forEach(function (it) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = it[1];
        a.textContent = t[it[0]];
        if (it[0] === SELF) a.setAttribute("aria-current", "page");
        else if (it[0] !== "home") { a.target = "_blank"; a.rel = "noopener"; }
        li.appendChild(a);
        ul.appendChild(li);
      });
    }

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
    render();

    // 应用切换语言 / 深浅色时改的是 <html> 的 lang 与 class；另一个标签页切换时触发 storage 事件
    new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ["lang", "class"] });
    window.addEventListener("storage", render);
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();

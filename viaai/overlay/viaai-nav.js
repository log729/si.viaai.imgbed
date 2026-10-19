/*
 * viaai.si 站群统一导航栏：右上角一排「菜单▾ 语言▾ 主题」，与左上角 logo 水平对齐，原有的右上角按钮整体下移。
 * 不改动上游 Vue 打包产物：独立脚本，由 scripts/patch-dist.mjs 注入 index.html。
 * 菜单顺序与主站（viaai.si）一致：首页 · 资讯 · 开源 · 导航 · 图床 · 文件 · 关于。
 * 同时隐藏上游自带的主题按钮（由本栏的主题按钮代替，浅 / 深二选一）和「⋮」下拉里的语言切换项。
 */
(function () {
  if (window.__viaaiNav) return;
  window.__viaaiNav = true;

  var LABELS = {
    zh: { menu: "菜单", language: "语言", theme: "主题", home: "首页", digest: "资讯", oss: "开源", links: "导航", images: "图床", files: "文件", about: "关于", brand: "AI之路", open: "站群导航" },
    en: { menu: "Menu", language: "Language", theme: "Theme", home: "Home", digest: "Digest", oss: "Open Source", links: "Links", images: "Images", files: "Files", about: "About", brand: "AI Road", open: "Sites" },
    hi: { menu: "मेन्यू", language: "भाषा", theme: "थीम", home: "होम", digest: "समाचार", oss: "ओपन सोर्स", links: "लिंक", images: "इमेज", files: "फ़ाइलें", about: "परिचय", brand: "AI Road", open: "साइटें" },
    fr: { menu: "Menu", language: "Langue", theme: "Thème", home: "Accueil", digest: "Actualités", oss: "Open source", links: "Liens", images: "Images", files: "Fichiers", about: "À propos", brand: "AI Road", open: "Sites" },
    pt: { menu: "Menu", language: "Idioma", theme: "Tema", home: "Início", digest: "Notícias", oss: "Open Source", links: "Links", images: "Imagens", files: "Arquivos", about: "Sobre", brand: "AI Road", open: "Sites" },
    ru: { menu: "Меню", language: "Язык", theme: "Тема", home: "Главная", digest: "Новости", oss: "Open Source", links: "Ссылки", images: "Картинки", files: "Файлы", about: "О сайте", brand: "AI Road", open: "Сайты" },
    ja: { menu: "メニュー", language: "言語", theme: "テーマ", home: "ホーム", digest: "ニュース", oss: "オープンソース", links: "リンク集", images: "画像", files: "ファイル", about: "概要", brand: "AI Road", open: "サイト一覧" },
    es: { menu: "Menú", language: "Idioma", theme: "Tema", home: "Inicio", digest: "Noticias", oss: "Código abierto", links: "Enlaces", images: "Imágenes", files: "Archivos", about: "Acerca de", brand: "AI Road", open: "Sitios" },
  };
  var NAMES = { zh: "中文", en: "English", hi: "हिन्दी", es: "Español", fr: "Français", pt: "Português", ru: "Русский", ja: "日本語" };
  var V = window.__viaai;
  var SELF = "images";
  var root = document.documentElement;

  // 菜单文字跟随图床当前显示的语言。显示语言由 viaai-init.js 按共享 cookie 同步（window.__viaai），
  // 用户在图床右上角（或本菜单底部）切换时只改本站 localStorage。本脚本只读 cookie，不写。
  function lang() {
    return V ? V.get() : "zh";
  }

  // 主站与资讯/开源/导航站按 <站点>/<lang> 区分语言，图床、文件站不分语言。
  // 共享 cookie viaai_lang（只读）的语言图床没有（如 fr）、图床显示的是它的回退语言（英文）时，
  // 链接仍带 cookie 的语言，让用户去到其他站时保持原来的语言；用户在图床里手动换了语言则按图床显示的为准。
  var SHARED = ["zh", "en", "hi", "es", "fr", "pt", "ru", "ja"];
  function siteLang(l) {
    var m = /(?:^|; )viaai_lang=([a-z]{2})/.exec(document.cookie);
    var c = m && SHARED.indexOf(m[1]) >= 0 ? m[1] : null;
    return c && V && V.effective(c) === l ? c : l;
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

  var MOON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SUN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>';

  var css =
    // 上游自带的主题按钮和「⋮」里的语言项由本栏代替
    ".toggle-dark-button,.language-switcher,.el-dropdown-menu__item:has(.language-switcher),.el-dropdown-menu__item:has(svg[data-icon=\"globe\"]),.viaai-hide{display:none!important}" +
    // 被下移的上游固定定位元素：top = 原 top + --vn-shift（见 reflow）
    ".viaai-shift{top:calc(var(--vn-top) + var(--vn-shift))!important}" +
    ".viaai-bar{position:fixed;top:41px;right:30px;z-index:200;display:flex;gap:8px;font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC',sans-serif;--vn-bg:rgba(255,255,255,.55);--vn-solid:#fff;--vn-fg:#1f2937;--vn-bd:rgba(255,255,255,.7);--vn-hv:rgba(0,0,0,.06)}" +
    ".viaai-bar.dark{--vn-bg:rgba(30,30,30,.55);--vn-solid:#1f2937;--vn-fg:#f3f4f6;--vn-bd:rgba(255,255,255,.15);--vn-hv:rgba(255,255,255,.1)}" +
    ".viaai-bar *{box-sizing:border-box}" +
    ".viaai-dd{position:relative}" +
    ".viaai-bar .vn-btn{all:unset;cursor:pointer;display:flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:10px;background:var(--vn-bg);color:var(--vn-fg);border:1px solid var(--vn-bd);backdrop-filter:blur(20px) saturate(1.4);-webkit-backdrop-filter:blur(20px) saturate(1.4);font-weight:600;white-space:nowrap}" +
    ".viaai-bar .vn-btn:hover{border-color:var(--vn-fg)}" +
    ".viaai-bar .vn-btn:focus-visible,.viaai-bar a:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}" +
    ".viaai-bar .vn-theme{padding:0;width:28px;justify-content:center}" +
    ".viaai-bar .vn-caret{font-size:10px;opacity:.7}" +
    ".viaai-bar ul{display:none;list-style:none;margin:6px 0 0;padding:6px;position:absolute;right:0;top:100%;min-width:140px;background:var(--vn-solid);border:1px solid var(--vn-bd);border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.2)}" +
    ".viaai-dd.open ul{display:block}" +
    ".viaai-bar li a{display:block;padding:7px 12px;border-radius:8px;color:var(--vn-fg);text-decoration:none;white-space:nowrap}" +
    ".viaai-bar li a:hover{background:var(--vn-hv)}" +
    ".viaai-bar li a[aria-current]{font-weight:700;color:#3b82f6}" +
    "@media (max-width:768px){.viaai-bar{top:35px;right:12px;gap:6px}.viaai-bar .vn-btn{padding:0 8px}}" +
    "@media print{.viaai-bar{display:none}}";

  // 原有的右上角按钮（固定定位、贴近顶部右半边）整体下移到本栏下面，本栏与左上角 logo 水平对齐
  var shifted = [];
  function reflow(bar) {
    shifted.forEach(function (el) { el.classList.remove("viaai-shift"); el.style.removeProperty("--vn-top"); });
    shifted = [];
    var barBottom = bar.getBoundingClientRect().bottom;
    var app = document.getElementById("app");
    if (!app) return;
    var cands = [];
    app.querySelectorAll("*").forEach(function (el) {
      var cs = getComputedStyle(el);
      if (cs.position !== "fixed") return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.width > 400 || r.top < 0 || r.top > 60 || r.left < window.innerWidth * 0.4) return;
      cands.push([el, r.top]);
    });
    if (!cands.length) return;
    var minTop = Math.min.apply(null, cands.map(function (c) { return c[1]; }));
    root.style.setProperty("--vn-shift", Math.max(0, Math.round(barBottom + 8 - minTop)) + "px");
    cands.forEach(function (c) {
      c[0].style.setProperty("--vn-top", c[1] + "px");
      c[0].classList.add("viaai-shift");
      shifted.push(c[0]);
    });
  }

  function build() {
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    var bar = document.createElement("nav");
    bar.className = "viaai-bar";

    function dropdown(key) {
      var wrap = document.createElement("div");
      wrap.className = "viaai-dd";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vn-btn";
      btn.setAttribute("aria-haspopup", "true");
      btn.setAttribute("aria-expanded", "false");
      var ul = document.createElement("ul");
      wrap.appendChild(btn);
      wrap.appendChild(ul);
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = !wrap.classList.contains("open");
        closeAll();
        wrap.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", String(open));
      });
      return { wrap: wrap, btn: btn, ul: ul, key: key };
    }
    var menu = dropdown("menu");
    var langDd = dropdown("language");
    var themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "vn-btn vn-theme";
    bar.appendChild(menu.wrap);
    bar.appendChild(langDd.wrap);
    bar.appendChild(themeBtn);

    function closeAll() {
      [menu, langDd].forEach(function (d) {
        d.wrap.classList.remove("open");
        d.btn.setAttribute("aria-expanded", "false");
      });
    }
    document.addEventListener("click", closeAll);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });

    // 主题：上游自己的主题按钮是「浅色 / 深色 / 自动」三态循环，这里是浅 / 深二选一（与站群共享 cookie 的取值一致），
    // 所以直接通过应用的 vuex store 设置（它的订阅会负责切换 <html class="dark"> 和图标）；取不到 store 时直接改 class 并写入持久化状态
    themeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeAll();
      var d = !dark();
      var el = document.getElementById("app");
      var vapp = el && el.__vue_app__;
      var store = vapp && vapp.config.globalProperties.$store;
      if (store) {
        store.commit("setCusDarkMode", true);
        store.commit("setUseDarkMode", d);
        return;
      }
      root.classList.toggle("dark", d);
      try {
        var st = JSON.parse(localStorage.getItem("vuex") || "{}") || {};
        st.useDarkMode = d;
        st.cusDarkMode = true;
        localStorage.setItem("vuex", JSON.stringify(st));
      } catch (err) {}
    });

    var cur = "";
    function render() {
      bar.classList.toggle("dark", dark());
      var l = lang();
      themeBtn.innerHTML = dark() ? SUN : MOON;
      if (l === cur) { return; }
      cur = l;
      var t = LABELS[l];
      bar.setAttribute("aria-label", t.open);
      menu.btn.innerHTML = "";
      menu.btn.appendChild(document.createTextNode(t.menu + " "));
      var c1 = document.createElement("span"); c1.className = "vn-caret"; c1.textContent = "▾"; menu.btn.appendChild(c1);
      langDd.btn.innerHTML = "";
      langDd.btn.appendChild(document.createTextNode(t.language + " "));
      var c2 = document.createElement("span"); c2.className = "vn-caret"; c2.textContent = "▾"; langDd.btn.appendChild(c2);
      themeBtn.setAttribute("aria-label", t.theme);
      themeBtn.title = t.theme;

      menu.ul.textContent = "";
      items(l).forEach(function (it) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = it[1];
        a.textContent = t[it[0]];
        if (it[0] === SELF) a.setAttribute("aria-current", "page");
        else if (it[0] !== "home") { a.target = "_blank"; a.rel = "noopener"; }
        li.appendChild(a);
        menu.ul.appendChild(li);
      });

      // 语言选择：只改图床自己的显示语言（不写共享 cookie）
      langDd.ul.textContent = "";
      (V ? V.langs : ["zh", "en"]).forEach(function (code) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#";
        a.textContent = NAMES[code];
        a.lang = code;
        if (code === l) a.setAttribute("aria-current", "true");
        a.addEventListener("click", function (e) {
          e.preventDefault();
          closeAll();
          if (V) V.set(code);
        });
        li.appendChild(a);
        langDd.ul.appendChild(li);
      });
    }

    document.body.appendChild(bar);
    render();

    // 应用切换语言 / 深浅色时改的是 <html> 的 lang 与 class；另一个标签页切换时触发 storage 事件
    new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ["lang", "class"] });
    window.addEventListener("storage", render);
    window.addEventListener("viaai-lang", render);

    // 下移上游的右上角按钮：应用异步渲染，DOM 变化 / 窗口尺寸变化后重新计算
    // 不支持 :has 的浏览器：「⋮」下拉（挂在 body 下）里带地球图标的语言项由脚本隐藏
    new MutationObserver(function () {
      document.querySelectorAll(".el-dropdown-menu__item svg[data-icon=globe]").forEach(function (svg) {
        var li = svg.closest(".el-dropdown-menu__item");
        if (li) li.classList.add("viaai-hide");
      });
    }).observe(document.body, { childList: true, subtree: true });
    var timer = null;
    var schedule = function () { clearTimeout(timer); timer = setTimeout(function () { reflow(bar); }, 150); };
    var app = document.getElementById("app");
    if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    schedule();
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();

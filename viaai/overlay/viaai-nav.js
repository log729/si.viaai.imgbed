/*
 * viaai.si 站群统一导航栏：右上角一排「菜单▾ 语言▾ 主题」，与左上角 logo 水平对齐，原有的右上角按钮整体下移。
 * 不改动上游 Vue 打包产物：独立脚本，由 scripts/patch-dist.mjs 注入 index.html。
 * 第一个按钮是「首页」（链接到主站首页，随语言），右边的小三角展开菜单：首页 · 资讯 · 开源 · 导航 · 图床 · 关于（顺序与主站一致，菜单里也有首页）。
 * 登录页标题（“登录”）：去掉手写体，用普通字体；文字本身由 viaai-i18n.js 覆盖语言包（应用自带 zh-CN / en）和 viaai/locales/*.json 提供。
 * 上传页中间大标题（“图床名称 ImgHub”，.upload-home .header h1.title）不显示但保留位置，logo 放在这里。
 * Logo：换成主站同一张（viaai-logo.png，400×80，图标 + “AI之路”），链接指向图床首页；首页（上传页）放在上传框上方正中间（桌面 240×48 / 手机 180×36），其余页面在左上角（桌面 200×40 / 手机 150×30，与右上角栏水平对齐）；深色模式用与主站相同的滤镜。
 * 页脚：把上游的「© 年份 Designed by … for You!」换成「© 年份 AI之路 · viaai.si」（随语言变化，viaai.si 链到主站对应语言），并去掉右边的传送门（飞机）图标和链接。
 * 后台页面（/dashboard、/systemConfig、/customerConfig）：不显示本栏，用后台工具栏自带的主题按钮和中英文切换；后台语言用独立的 cookie imgbed_admin_lang（不与前端共用 viaai_lang），主题仍共用 viaai_theme。
 * 主题：本栏自己的主题按钮，样式与行为和其他站点一致（同一个半实心圆图标、浅/深二选一）；上游自带的主题按钮（浅/深/自动三态）隐藏。和「⋮」下拉里的语言切换项。
 */
(function () {
  if (window.__viaaiNav) return;
  window.__viaaiNav = true;

  var LABELS = {
    zh: { menu: "菜单", language: "语言", theme: "主题", home: "首页", digest: "资讯", oss: "开源", tools: "工具", links: "导航", images: "图床", about: "关于", brand: "AI之路", open: "站群导航" },
    en: { menu: "Menu", language: "Language", theme: "Theme", home: "Home", digest: "Digest", oss: "Open Source", tools: "Tools", links: "Links", images: "Images", about: "About", brand: "AI Road", open: "Sites" },
    hi: { menu: "मेन्यू", language: "भाषा", theme: "थीम", home: "होम", digest: "समाचार", oss: "ओपन सोर्स", tools: "टूल्स", links: "लिंक", images: "इमेज", about: "परिचय", brand: "AI Road", open: "साइटें" },
    fr: { menu: "Menu", language: "Langue", theme: "Thème", home: "Accueil", digest: "Actualités", oss: "Open source", tools: "Outils", links: "Liens", images: "Images", about: "À propos", brand: "AI Road", open: "Sites" },
    pt: { menu: "Menu", language: "Idioma", theme: "Tema", home: "Início", digest: "Notícias", oss: "Open Source", tools: "Ferramentas", links: "Links", images: "Imagens", about: "Sobre", brand: "AI Road", open: "Sites" },
    ru: { menu: "Меню", language: "Язык", theme: "Тема", home: "Главная", digest: "Новости", oss: "Open Source", tools: "Инструменты", links: "Ссылки", images: "Картинки", about: "О сайте", brand: "AI Road", open: "Сайты" },
    ja: { menu: "メニュー", language: "言語", theme: "テーマ", home: "ホーム", digest: "ニュース", oss: "オープンソース", tools: "ツール", links: "リンク集", images: "画像", about: "概要", brand: "AI Road", open: "サイト一覧" },
    es: { menu: "Menú", language: "Idioma", theme: "Tema", home: "Inicio", digest: "Noticias", oss: "Código abierto", tools: "Herramientas", links: "Enlaces", images: "Imágenes", about: "Acerca de", brand: "AI Road", open: "Sitios" },
  };
  var NAMES = { zh: "中文", en: "English", hi: "हिन्दी", es: "Español", fr: "Français", pt: "Português", ru: "Русский", ja: "日本語" };
  var V = window.__viaai;
  var SELF = "images";
  var root = document.documentElement;

  // 菜单文字跟随图床当前显示的语言。显示语言由 viaai-init.js 按共享 cookie 同步（window.__viaai），
  // 用户在本栏的语言下拉里切换时，由 window.__viaai.set 同时写回共享 cookie viaai_lang（本脚本自己不直接写 cookie）。
  function lang() {
    return V ? V.display() : "zh";
  }

  // 主站与资讯/开源/导航站按 <站点>/<lang> 区分语言，图床不分语言。
  // 共享 cookie viaai_lang 的值不在图床的 8 种语言里（如 de）、图床显示的是它的回退语言（英文）时，
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
      ["tools", "https://tool.viaai.si" + sfx],
      ["links", "https://nav.viaai.si" + sfx],
      ["images", "https://imgbed.viaai.si"],
      ["about", "https://viaai.si" + sfx + "/about"],
    ];
  }

  // 深色模式跟随图床自身（<html class="dark">）
  function dark() {
    return root.classList.contains("dark");
  }

  // 主题图标与其他站点一致：外圈 + 右半实心（浅 / 深都用同一个）
  var THEME_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>';

  var css =
    // 上游自带的主题按钮和「⋮」里的语言项由本栏代替
    ".toggle-dark,.toggle-dark-button,html:not(.viaai-admin) .language-switcher,.page-footer .footer-name,.page-footer a:has(.footer-link-icon),.el-dropdown-menu__item:has(.language-switcher),.el-dropdown-menu__item:has(svg[data-icon=\"globe\"]),.viaai-hide{display:none!important}" +
    // 被下移的上游固定定位元素：top = 原 top + --vn-shift（见 reflow）
    ".viaai-shift{top:calc(var(--vn-top) + var(--vn-shift))!important;translate:var(--vn-dx,0px) 0}" +
    // Logo：固定在左上角的那个（登录页 / 上传页）用主站的 5:1 长条 logo，垂直中心与右上角栏对齐；其余位置（如管理后台小 logo）的方形框只显示图标部分
    "img.logo.logo--fixed{width:200px!important;height:40px!important;object-fit:contain;border-radius:0!important;top:35px!important;left:20px!important}" +
    "img.logo:not(.logo--fixed){object-fit:cover;object-position:left center}" +
    "html.dark img.logo{filter:invert(1) hue-rotate(180deg) brightness(1.15) saturate(1.1)}" +
    "@media (max-width:768px){img.logo.logo--fixed{width:150px!important;height:30px!important;top:35px!important;left:16px!important}}" +
    // 上传页中间的大标题不显示但保留它的位置（原来的版面间距不变），首页 logo 放在这个位置正中间
    ".upload-home .header h1.title{visibility:hidden}" +
    "html.viaai-home img.logo.logo--fixed{width:240px!important;height:48px!important;left:50%!important;top:100px!important;translate:-50% 0}" +
    "@media (max-width:768px){html.viaai-home img.logo.logo--fixed{width:180px!important;height:36px!important;left:50%!important;top:118px!important}}" +
    // 登录页标题：去掉手写体（Pacifico），改用与表单其余文字相同的普通字体，字号收小
    ".login-title{font-family:Avenir,Helvetica,Arial,'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif!important;font-size:1.75rem!important;font-weight:700!important;letter-spacing:1px!important;cursor:default!important}" +
    "@media (max-width:768px){.login-title{font-size:1.4rem!important}}" +
    // 后台页面：不显示本栏，用后台工具栏自带的主题 / 中英文切换；语言切换放到主题按钮前面
    ".admin-header-actions>.language-switcher{order:-1}" +
    // 后台自带的主题按钮（三态：浅 / 深 / 自动）换成与前端、主站一致的外观：34×34、1px 描边、8px 圆角、同一个半实心圆图标
    // （隐藏它按状态切换的太阳 / 月亮 / 半圆图标，用遮罩画一个固定的半实心圆）；点击行为仍是上游的
    ":root{--vn-line:#e1e8f2;--vn-navy:#0a1f44;--vn-primary:#1d7af3}html.dark{--vn-line:#25324a;--vn-navy:#e6edf7;--vn-primary:#4c97f6}" +
    ".admin-header-actions>div.admin-header-control{width:34px!important;height:34px!important;box-sizing:border-box;border:1px solid var(--vn-line)!important;border-radius:8px!important;color:var(--vn-navy)!important;background:none;display:flex;align-items:center;justify-content:center;cursor:pointer}" +
    ".admin-header-actions>div.admin-header-control:hover{border-color:var(--vn-primary)!important;color:var(--vn-primary)!important}" +
    ".admin-header-actions>div.admin-header-control svg{display:none!important}" +
    ".admin-header-actions>div.admin-header-control::before{content:'';width:18px;height:18px;background:currentColor;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M12 3a9 9 0 0 1 0 18z' fill='black'/%3E%3C/svg%3E\") center/contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M12 3a9 9 0 0 1 0 18z' fill='black'/%3E%3C/svg%3E\") center/contain no-repeat}" +
    "html.viaai-admin .viaai-bar{display:none!important}" +
    ".viaai-footer{margin:0}.viaai-footer a{color:inherit;font-weight:700;text-decoration:none}.viaai-footer a:hover{text-decoration:underline}" +
    ".viaai-bar{position:fixed;top:38px;right:30px;z-index:200;display:flex;gap:8px;font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC',sans-serif;--vn-bg:rgba(255,255,255,.55);--vn-solid:#fff;--vn-fg:#1f2937;--vn-bd:rgba(255,255,255,.7);--vn-hv:rgba(0,0,0,.06)}" +
    ".viaai-bar.dark{--vn-bg:rgba(30,30,30,.55);--vn-solid:#1f2937;--vn-fg:#f3f4f6;--vn-bd:rgba(255,255,255,.15);--vn-hv:rgba(255,255,255,.1)}" +
    ".viaai-bar *{box-sizing:border-box}" +
    ".viaai-dd{position:relative}" +
    ".viaai-bar .vn-btn{all:unset;cursor:pointer;display:flex;align-items:center;gap:5px;height:32px;padding:0 10px;border-radius:10px;background:var(--vn-bg);color:var(--vn-fg);border:1px solid var(--vn-bd);backdrop-filter:blur(20px) saturate(1.4);-webkit-backdrop-filter:blur(20px) saturate(1.4);font-weight:600;white-space:nowrap;box-sizing:border-box}" +
    ".viaai-bar .vn-btn:hover{border-color:var(--vn-fg)}" +
    ".viaai-bar .vn-btn:focus-visible,.viaai-bar a:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}" +
    // 主题按钮：与其他站点（主站 .theme-btn）一致：34×34、1px 描边、8px 圆角、同一个半实心圆图标，悬停时描边和图标变主色；
    // 图床背景是壁纸，所以底色用与栏内其他按钮相同的半透明玻璃
    ".viaai-bar .vn-btn.vn-theme{width:34px;height:34px;padding:0;justify-content:center;border-radius:8px;border:1px solid var(--vn-line);color:var(--vn-navy)}" +
    ".viaai-bar .vn-btn.vn-theme:hover{border-color:var(--vn-primary);color:var(--vn-primary)}" +
    ".viaai-bar{--vn-line:#e1e8f2;--vn-navy:#0a1f44;--vn-primary:#1d7af3}.viaai-bar.dark{--vn-line:#25324a;--vn-navy:#e6edf7;--vn-primary:#4c97f6}" +
    ".viaai-bar{pointer-events:none}.viaai-bar .viaai-dd,.viaai-bar .vn-theme{pointer-events:auto}" +
    // 登录状态（viaai-auth.js 插入的 .viaai-auth）：外观与栏内其他按钮一致
    ".viaai-bar .viaai-auth{pointer-events:auto;margin-right:0;gap:8px}.viaai-bar .viaai-auth a,.viaai-bar .viaai-auth button{height:32px;border-radius:10px;background:var(--vn-bg);color:var(--vn-fg);border:1px solid var(--vn-bd);font-weight:600;backdrop-filter:blur(20px) saturate(1.4);-webkit-backdrop-filter:blur(20px) saturate(1.4)}" +
    ".viaai-bar .viaai-auth .va-out{border-color:var(--vn-bd);padding:0 10px}" +
    ".viaai-bar .vn-caret{font-size:10px;opacity:.7}" +
    ".viaai-bar .vn-split{display:flex}.viaai-bar .vn-split .vn-home{border-radius:10px 0 0 10px;border-right-width:0}" +
    ".viaai-bar .vn-split .vn-drop{border-radius:0 10px 10px 0;padding:0 8px;font-size:10px;opacity:1}" +
    ".viaai-bar ul{display:none;list-style:none;margin:6px 0 0;padding:6px;position:absolute;right:0;top:100%;min-width:140px;background:var(--vn-solid);border:1px solid var(--vn-bd);border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.2)}" +
    ".viaai-dd.open ul{display:block}" +
    ".viaai-bar li a{display:block;padding:7px 12px;border-radius:8px;color:var(--vn-fg);text-decoration:none;white-space:nowrap}" +
    ".viaai-bar li a:hover{background:var(--vn-hv)}" +
    ".viaai-bar li a[aria-current]{font-weight:700;color:#3b82f6}" +
    "@media (max-width:768px){.viaai-bar{top:33px;right:12px;gap:6px}.viaai-bar .vn-btn{padding:0 8px}}" +
    "@media print{.viaai-bar{display:none}}";

  // 上游自己的主题按钮（上传页桌面端 .toggle-dark-button，登录等页 .toggle-dark，浅/深/自动三态）一律隐藏（见 css），
  // 由本栏的主题按钮代替：样式和行为与其他站点一致（浅 / 深二选一，写回共享 cookie）
  var THEME_SEL = ".toggle-dark,.toggle-dark-button";

  // 原有的右上角按钮（固定定位、贴近顶部右半边）整体下移到本栏下面，本栏与左上角 logo 水平对齐
  var shifted = [];
  function reflow(bar) {
    shifted.forEach(function (el) { el.classList.remove("viaai-shift"); el.style.removeProperty("--vn-top"); el.style.removeProperty("--vn-dx"); });
    shifted = [];
    var barBottom = bar.getBoundingClientRect().bottom;
    var app = document.getElementById("app");
    if (!app) return;
    var cands = [];
    app.querySelectorAll("*").forEach(function (el) {
      var cs = getComputedStyle(el);
      if (cs.position !== "fixed" || el.matches(THEME_SEL)) return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.width > 400 || r.top < 0 || r.top > 60 || r.left < window.innerWidth * 0.4) return;
      cands.push([el, r.top]);
    });
    if (!cands.length) return;
    var minTop = Math.min.apply(null, cands.map(function (c) { return c[1]; }));
    root.style.setProperty("--vn-shift", Math.max(0, Math.round(barBottom + 8 - minTop)) + "px");
    // 隐藏上游主题按钮后，它原来的位置会留一个空：把它左边的按钮整体右移补上（上游按钮之间的间距是 10px）。
    // 用独立的 translate 属性，不覆盖上游按钮自己 hover 时用的 transform
    var dx = 0;
    var byLeft = cands.map(function (c) { return c[0].getBoundingClientRect(); }).sort(function (a, b) { return a.left - b.left; });
    if (byLeft.length >= 3) {
      var hole = byLeft[byLeft.length - 1].left - byLeft[byLeft.length - 2].right;
      if (hole > 24) dx = Math.round(hole - 10);
    }
    var rightmost = byLeft.length ? byLeft[byLeft.length - 1].left : 0;
    cands.forEach(function (c) {
      if (dx && c[0].getBoundingClientRect().left < rightmost) c[0].style.setProperty("--vn-dx", dx + "px");
      c[0].style.setProperty("--vn-top", c[1] + "px");
      c[0].classList.add("viaai-shift");
      shifted.push(c[0]);
    });
  }

  // 页脚：上游 Footer.vue 渲染 <p>© 2024-2026 Designed by <a.footer-name>SanyueQi</a> for You! <a>传送门图标</a></p>。
  // 清空 <p> 直接子文本、隐藏 .footer-name（CSS），在传送门图标前插入自己的文案；幂等，上游页脚结构变了就什么都不做。
  // Logo：把上游 Logo 组件渲染的 <a.logo-link><img.logo></a> 的图片换成主站的 logo，链接指向主站（当前语言）。
  // Vue 在页面配置加载后可能把 src 改回后台配置的 logoUrl，所以监听 src / href 变化再改回来；幂等，没有 .logo 就什么都不做
  var LOGO_SRC = "/viaai-logo.png?v=1";
  var LOGO_HREF = "https://imgbed.viaai.si/"; // 图床自己的首页
  function renderLogo() {
    var l = lang();
    document.querySelectorAll("img.logo").forEach(function (img) {
      if (img.getAttribute("src") !== LOGO_SRC) img.setAttribute("src", LOGO_SRC);
      if (img.alt !== LABELS[l].brand) img.alt = LABELS[l].brand;
      var a = img.closest("a.logo-link");
      if (a && a.getAttribute("href") !== LOGO_HREF) a.setAttribute("href", LOGO_HREF);
      if (a && a.getAttribute("target") !== "_self") a.setAttribute("target", "_self");
    });
  }

  var footerKey = "";
  function renderFooter() {
    var p = document.querySelector(".page-footer p");
    if (!p) return;
    p.childNodes.forEach(function (n) { if (n.nodeType === 3 && n.nodeValue) n.nodeValue = ""; });
    // 传送门（飞机）图标和链接：CSS 的 :has 之外，不支持 :has 的浏览器由这里隐藏
    p.querySelectorAll("a").forEach(function (a) { if (a.querySelector(".footer-link-icon,svg[data-icon=paper-plane]")) a.classList.add("viaai-hide"); });
    var l = lang();
    var key = l + "|" + new Date().getFullYear();
    var span = p.querySelector(".viaai-footer");
    if (span && key === footerKey) return;
    footerKey = key;
    if (!span) {
      span = document.createElement("span");
      span.className = "viaai-footer";
      p.insertBefore(span, p.firstChild);
    }
    span.textContent = "© " + new Date().getFullYear() + " " + LABELS[l].brand + " · ";
    var a = document.createElement("a");
    a.href = items(l)[0][1];
    a.textContent = "viaai.si";
    span.appendChild(a);
  }

  // 下拉按钮：文字 + 小三角
  function fillBtn(btn, text, aria) {
    btn.textContent = "";
    btn.appendChild(document.createTextNode(text + " "));
    var c = document.createElement("span"); c.className = "vn-caret"; c.textContent = "▾"; btn.appendChild(c);
    btn.setAttribute("aria-label", aria || text);
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
    // 第一个按钮拆成「首页」链接（到主站首页）+ 小三角（展开菜单）两半，视觉上是一个整体
    var homeLink = document.createElement("a");
    homeLink.className = "vn-btn vn-home";
    menu.wrap.insertBefore(homeLink, menu.btn);
    menu.wrap.classList.add("vn-split");
    menu.btn.classList.add("vn-drop");
    var langDd = dropdown("language");
    var themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "vn-btn vn-theme";
    bar.appendChild(menu.wrap);
    langDd.wrap.classList.add("lang-menu");
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
      renderFooter();
      renderLogo();
      bar.classList.toggle("dark", dark());
      var l = lang();
      themeBtn.innerHTML = THEME_ICON;
      if (l === cur) { return; }
      cur = l;
      var t = LABELS[l];
      bar.setAttribute("aria-label", t.open);
      homeLink.textContent = t.home;
      homeLink.href = items(l)[0][1];
      menu.btn.textContent = "▾";
      menu.btn.setAttribute("aria-label", t.menu);
      // 与主站一致：按钮上直接显示当前语言自己的名字（中文 / English / 日本語 …），不写「语言」二字
      fillBtn(langDd.btn, NAMES[l], t.language + ": " + NAMES[l]);
      langDd.btn.lang = l;
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

      // 语言选择：切换图床显示语言，并写回共享 cookie（见 viaai-init.js 的 __viaai.set）
      langDd.ul.textContent = "";
      (V ? V.langs : ["zh", "en"]).forEach(function (code) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#";
        a.textContent = NAMES[code];
        a.lang = code;
        a.dataset.lang = code; // 登录状态脚本（viaai-auth.js）靠 a[data-lang] 找到语言菜单，把「登录 / 用户名」放在它前面
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
    // 统一通行证登录状态：与其他站点共用同一个脚本；此时语言菜单已在页面里，脚本能直接找到挂载位置
    var auth = document.createElement("script");
    auth.src = "/viaai-auth.js?v=1";
    auth.defer = true;
    document.head.appendChild(auth);
    render();

    // 应用切换语言 / 深浅色时改的是 <html> 的 lang 与 class；另一个标签页切换时触发 storage 事件
    new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ["lang", "class"] });
    window.addEventListener("storage", render);
    window.addEventListener("viaai-lang", render);
    window.addEventListener("viaai-route", function () { render(); schedule(); });

    // 下移上游的右上角按钮：应用异步渲染，DOM 变化 / 窗口尺寸变化后重新计算
    // 不支持 :has 的浏览器：「⋮」下拉（挂在 body 下）里带地球图标的语言项由脚本隐藏
    new MutationObserver(function () {
      document.querySelectorAll(".el-dropdown-menu__item svg[data-icon=globe]").forEach(function (svg) {
        var li = svg.closest(".el-dropdown-menu__item");
        if (li) li.classList.add("viaai-hide");
      });
    }).observe(document.body, { childList: true, subtree: true });
    var timer = null;
    var schedule = function () { renderFooter(); renderLogo(); clearTimeout(timer); timer = setTimeout(function () { reflow(bar); }, 150); };
    var app = document.getElementById("app");
    if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "href"] });
    window.addEventListener("resize", schedule);
    schedule();
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();

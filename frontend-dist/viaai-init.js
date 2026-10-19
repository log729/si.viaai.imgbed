/*
 * viaai.si 站群：把共享 cookie 的语言 / 主题同步给图床自身的设置。
 *
 * - 共享 cookie（Domain=.viaai.si，由主站等站点写入）：viaai_lang（zh|en|hi|es|fr|pt|ru|ja）、viaai_theme（light|dark）
 * - 图床目前有 zh / en / ja / es 四个语言版本（SUPPORTED）；cookie 里的其他语言（hi/fr/pt/ru）暂用英文
 * - 语言只读：图床右上角的语言切换只改本站 localStorage，不写 viaai_lang
 * - 主题双向：用户在图床里切换主题时，写回 viaai_theme（写法与主站一致），其他站随之变化；
 *   页面加载 / 跟随系统 / 定时深色造成的变化不是用户操作，不写
 * - 仅当共享 cookie 的值相对上次同步“变了”才覆盖本站设置，所以在图床里手动切换的选择会保留，直到别的站再次切换
 *
 * 必须在应用脚本（defer）之前同步执行，由 scripts/patch-dist.mjs 以非 defer 方式注入 <head>。
 */
(function () {
  // 图床已有语言包的语言（viaai/locales/<code>.json）；zh / en 是应用自带的。cookie 里其余的语言一律用英文。
  var SUPPORTED = ["zh", "en", "ja", "es"];
  function effective(c) {
    return SUPPORTED.indexOf(c) >= 0 ? c : c === "zh" ? "zh" : "en";
  }

  // 供 viaai-i18n.js / viaai-nav.js 使用：读取 / 设置图床当前语言（只改本站 localStorage，不写 cookie）
  window.__viaai = {
    langs: SUPPORTED,
    effective: effective,
    get: function () {
      try {
        var v = window.localStorage.getItem("viaai-locale");
        if (v && SUPPORTED.indexOf(v) >= 0) return v;
        var a = window.localStorage.getItem("app-locale");
        return a === "en" ? "en" : "zh";
      } catch (e) { return "zh"; }
    },
    set: function (code) {
      if (SUPPORTED.indexOf(code) < 0) return;
      try {
        window.localStorage.setItem("viaai-locale", code);
        window.localStorage.setItem("app-locale", code === "zh" ? "zh-CN" : "en");
      } catch (e) {}
      window.dispatchEvent(new Event("viaai-lang"));
    },
  };

  try {
    var ls = window.localStorage;
    function cookie(re) {
      var m = re.exec(document.cookie);
      return m ? m[1] : null;
    }

    // 语言：图床当前语言存在 localStorage["viaai-locale"]（zh | en | ja | es …）。
    // 应用本身只认 localStorage["app-locale"]（zh-CN | en）；ja / es 等由 viaai-i18n.js 在应用启动后注入语言包再切换，
    // 所以这里先让应用以 zh-CN / en 启动（非中文的语言先用英文）。
    var cur = ls.getItem("viaai-locale");
    var lang = cookie(/(?:^|; )viaai_lang=([a-z]{2})/);
    if (lang && ls.getItem("viaai-seen-lang") !== lang) {
      cur = effective(lang);
      ls.setItem("viaai-locale", cur);
      ls.setItem("viaai-seen-lang", lang);
    } else if (!cur) {
      var app = ls.getItem("app-locale");
      if (app) cur = app === "zh-CN" ? "zh" : "en";
    }
    if (cur) ls.setItem("app-locale", cur === "zh" ? "zh-CN" : "en");

    // 主题：应用把 useDarkMode / cusDarkMode 持久化在 localStorage["vuex"]
    var theme = cookie(/(?:^|; )viaai_theme=(light|dark)/);
    if (theme && ls.getItem("viaai-seen-theme") !== theme) {
      var state = {};
      try { state = JSON.parse(ls.getItem("vuex") || "{}") || {}; } catch (e) {}
      state.useDarkMode = theme === "dark";
      state.cusDarkMode = true;
      ls.setItem("vuex", JSON.stringify(state));
      ls.setItem("viaai-seen-theme", theme);
    }
  } catch (e) { /* localStorage / cookie 不可用就保持图床自己的设置 */ }

  // ---- 主题写回共享 cookie（仅用户在图床里切换时）----
  // 应用切换主题时改的是 <html class="dark">；加载时的初始化、跟随系统等也会改它，
  // 所以只在刚发生过用户手势（点击 / 按键，1 秒内）时才写，其余变化一律不写。
  try {
    var lastGesture = 0;
    var mark = function () { lastGesture = Date.now(); };
    document.addEventListener("pointerdown", mark, true);
    document.addEventListener("keydown", mark, true);
    document.addEventListener("click", mark, true);

    var root = document.documentElement;
    var last = root.classList.contains("dark");
    new MutationObserver(function () {
      var dark = root.classList.contains("dark");
      if (dark === last) return;
      last = dark;
      if (Date.now() - lastGesture > 1000) return;
      var v = dark ? "dark" : "light";
      // 与主站一致：*.viaai.si 共享，保留 30 天
      var domain = /(^|\.)viaai\.si$/.test(location.hostname) ? "; Domain=.viaai.si" : "";
      document.cookie = "viaai_theme=" + v + domain + "; Path=/; Max-Age=2592000; SameSite=Lax; Secure";
      try { window.localStorage.setItem("viaai-seen-theme", v); } catch (e) {}
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
  } catch (e) {}
})();

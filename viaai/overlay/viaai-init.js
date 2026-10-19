/*
 * viaai.si 站群：把共享 cookie 的语言 / 主题同步给图床自身的设置。
 *
 * - 共享 cookie（Domain=.viaai.si，由主站等站点写入）：viaai_lang（zh|en|hi|es|fr|pt|ru|ja）、viaai_theme（light|dark）
 * - 图床只有中文 / 英文两个版本：zh → 中文，其余任何语言 → 英文
 * - 语言只读：图床右上角的语言切换只改本站 localStorage，不写 viaai_lang
 * - 主题双向：用户在图床里切换主题时，写回 viaai_theme（写法与主站一致），其他站随之变化；
 *   页面加载 / 跟随系统 / 定时深色造成的变化不是用户操作，不写
 * - 仅当共享 cookie 的值相对上次同步“变了”才覆盖本站设置，所以在图床里手动切换的选择会保留，直到别的站再次切换
 *
 * 必须在应用脚本（defer）之前同步执行，由 scripts/patch-dist.mjs 以非 defer 方式注入 <head>。
 */
(function () {
  try {
    var ls = window.localStorage;
    function cookie(re) {
      var m = re.exec(document.cookie);
      return m ? m[1] : null;
    }

    // 语言：应用读取 localStorage["app-locale"]（zh-CN | en）
    var lang = cookie(/(?:^|; )viaai_lang=([a-z]{2})/);
    if (lang && ls.getItem("viaai-seen-lang") !== lang) {
      ls.setItem("app-locale", lang === "zh" ? "zh-CN" : "en");
      ls.setItem("viaai-seen-lang", lang);
    }

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

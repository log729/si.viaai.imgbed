/*
 * viaai.si 站群：把共享 cookie 的语言 / 主题同步给图床自身的设置。
 *
 * - 共享 cookie（Domain=.viaai.si，由主站等站点写入）：viaai_lang（zh|en|hi|es|fr|pt|ru|ja）、viaai_theme（light|dark）
 * - 图床只有中文 / 英文两个版本：zh → 中文，其余任何语言 → 英文
 * - 只读：本脚本和 viaai-nav.js 都不写、不续期任何 cookie；图床右上角的切换只改本站 localStorage
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
})();

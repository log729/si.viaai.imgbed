/*
 * viaai.si 站群：给图床补充 zh-CN / en 之外的界面语言（viaai/locales/<code>.json，只覆盖用户能看到的上传页、登录页等）。
 *
 * 不改上游打包产物：等应用挂载后，取出它的 vue-i18n 实例（#app.__vue_app__），用 setLocaleMessage 注册语言包并切换。
 * 当前语言由 viaai-init.js 按共享 cookie 同步（window.__viaai）；用户切换语言时由 window.__viaai.set 写回共享 cookie viaai_lang；
 * 用户用右上角的中/英按钮切换时，应用自己改 <html lang>，这里据此同步回 viaai-locale。
 * 语言包里没有的文案（如管理后台）回退到英文。
 */
(function () {
  var V = window.__viaai;
  if (!V) return;
  var root = document.documentElement;
  var APP = { zh: "zh-CN", en: "en" }; // 应用自带的两种
  var packs = {};
  var i18n = null;
  var ready = false;
  var seq = 0;

  function load(code) {
    if (!packs[code]) {
      packs[code] = fetch("/viaai-locales/" + code + ".json?v=3").then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
    }
    return packs[code];
  }

  function apply() {
    if (!i18n) return;
    var code = V.display(); // 前端：共享语言；后台：zh / en（后台自己的 cookie）
    var token = ++seq;
    if (APP[code]) {
      if (i18n.locale !== APP[code]) i18n.locale = APP[code];
      if (root.lang !== APP[code]) root.lang = APP[code];
      return;
    }
    load(code).then(function (msgs) {
      if (token !== seq) return; // 期间又切换了语言
      i18n.setLocaleMessage(code, msgs);
      i18n.fallbackLocale = "en";
      i18n.locale = code;
      root.lang = code;
    }).catch(function () {
      delete packs[code]; // 加载失败就保持应用当前（英文）界面，下次再试
    });
  }

  // vue-i18n（legacy 模式）通过 provide 注入，实例在 app._context.provides 的某个 Symbol 键下，其 .global 即全局 VueI18n
  function findI18n(app) {
    var provides = app._context && app._context.provides;
    if (!provides) return null;
    var syms = Object.getOwnPropertySymbols(provides);
    for (var i = 0; i < syms.length; i++) {
      var v = provides[syms[i]];
      var g = v && v.global;
      if (g && typeof g.setLocaleMessage === "function" && "locale" in g) return g;
    }
    return null;
  }

  // 应用自带的 zh-CN / en 里登录页标题是「登录到 {owner} 图床」/「Login to {owner} ImgHub」，站群里改成简单的「登录」/「Login」；
  // 其余语言的语言包里已经是对应的「登录」。mergeLocaleMessage 只覆盖这一条
  var OVERRIDES = { "zh-CN": { login: { title: "登录" } }, en: { login: { title: "Login" } } };
  function start() {
    var el = document.getElementById("app");
    var app = el && el.__vue_app__;
    i18n = app && findI18n(app);
    if (!i18n) return false;
    Object.keys(OVERRIDES).forEach(function (l) { i18n.mergeLocaleMessage(l, OVERRIDES[l]); });
    apply();
    ready = true;
    return true;
  }

  // 应用在取完页面配置后才挂载，轮询等它（最多 30 秒）
  var tries = 0;
  var timer = setInterval(function () {
    if (start() || ++tries > 300) clearInterval(timer);
  }, 100);

  window.addEventListener("viaai-lang", apply);
  window.addEventListener("viaai-route", apply); // 前端 ↔ 后台页面之间切换，显示语言不同

  // 用户点击右上角中/英按钮：应用把 <html lang> 改成 zh-CN / en。若与当前语言不一致（例如当前是 ja），记下新的选择（V.set 会同时写回共享 cookie）。
  new MutationObserver(function () {
    if (!ready) return;
    var l = root.lang === "zh-CN" ? "zh" : root.lang === "en" ? "en" : null;
    if (l && l !== V.display()) V.set(l);
  }).observe(root, { attributes: true, attributeFilter: ["lang"] });
})();

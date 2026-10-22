/* viaai-login.js — 图床网页端登录改由统一通行证（id.viaai.si）承担。
 * 上游前端（Vue 单页应用，不改压缩后的 JS）的路由守卫：访问 / 时调 GET /api/auth/sessionCheck，
 * userRequired 且未登录 → 路由跳到 /login（输入访问码的「用户登录页」）；管理员登录页是另一条路由 /adminLogin，本脚本不碰。
 * 这里：当前页是 /login（直接打开，或单页应用 pushState 跳过来）时，先确认后端开着通行证登录（sessionCheck 的 passportLogin），
 * 再 location.replace 到 https://id.viaai.si/<lang>/login?return=<图床首页>；已登录则回首页；后端没开（PASSPORT_LOGIN=off 回滚）就什么都不做，保留上游访问码登录页。
 * 另：viaai-auth.js 点「退出」调的是通行证统一退出，它只重绘页头；这里在退出成功后刷新页面，让路由守卫重新检查，回到未登录状态。 */
(function () {
  if (window.__viaaiLogin) return;
  window.__viaaiLogin = true;
  var ID = 'https://id.viaai.si';
  var SUPPORTED = ['zh', 'en', 'hi', 'es', 'fr', 'pt', 'ru', 'ja'];
  var PENDING = 'viaai-login-pending';
  var root = document.documentElement;
  var seq = 0;

  // 判断期间先藏起应用，避免闪一下访问码登录页
  var st = document.createElement('style');
  st.textContent = 'html.' + PENDING + ' #app{visibility:hidden!important}';
  (document.head || root).appendChild(st);

  function isLoginPage() { return location.pathname.replace(/\/+$/, '') === '/login'; }

  function lang() {
    var m = /(?:^|;\s*)viaai_lang=([a-z]{2})(?:;|$)/.exec(document.cookie);
    var l = m && m[1];
    if (SUPPORTED.indexOf(l) < 0) l = String(root.lang || 'zh').slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(l) < 0 ? 'zh' : l;
  }

  function release() { root.classList.remove(PENDING); }

  function check() {
    if (!isLoginPage()) { release(); return; }
    root.classList.add(PENDING);
    var n = ++seq;
    var timer = setTimeout(function () { if (n === seq) release(); }, 4000);
    fetch('/api/auth/sessionCheck', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        clearTimeout(timer);
        if (n !== seq || !isLoginPage()) return;
        if (j && j.passportLogin === true) {
          if (j.valid) location.replace('/');
          else {
            var l = lang();
            location.replace(ID + (l === 'zh' ? '' : '/' + l) + '/login?return=' + encodeURIComponent(location.origin + '/'));
          }
        } else release();
      })
      .catch(function () { clearTimeout(timer); if (n === seq) release(); });
  }

  // 通行证统一退出成功后刷新，路由守卫会重新问后端
  try {
    var orig = window.fetch;
    window.fetch = function (input) {
      var p = orig.apply(this, arguments);
      try {
        var u = typeof input === 'string' ? input : (input && input.url) || '';
        if (u.indexOf(ID + '/api/v1/logout') === 0) {
          p.then(function () { setTimeout(function () { location.reload(); }, 50); }, function () {});
        }
      } catch (e) {}
      return p;
    };
  } catch (e) {}

  check();
  window.addEventListener('viaai-route', check); // viaai-init.js 在 pushState / replaceState / popstate 时发出
})();

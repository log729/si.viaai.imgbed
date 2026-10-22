/* viaai-auth.js — 站群页头的登录状态（统一通行证 id.viaai.si）。
 * 这份文件在所有接入的站点里内容完全一致（主站、资讯站以外的站点各放一份副本）：改这里，再同步到各仓库的 public/ 或内联资源。
 * 行为：登录用的会话 cookie 在 *.viaai.si 共享；本脚本只在存在标记 cookie viaai_in 时才向 id.viaai.si 查会话（匿名访客零请求）。
 * 未登录显示「登录」（带 ?return=当前页），已登录显示用户名（链到账号页）+「退出」（调通行证统一退出）。
 * 挂载位置：语言菜单（含 a[data-lang] 的 .lang-menu）之前；找不到语言菜单就什么也不做。 */
(function () {
  if (window.__viaaiAuth) return;
  window.__viaaiAuth = true;
  var ID = 'https://id.viaai.si';
  var T = {
    zh: ['登录', '退出', '我的账号'], en: ['Log in', 'Log out', 'My account'], hi: ['लॉग इन', 'लॉग आउट', 'मेरा खाता'], es: ['Iniciar sesión', 'Cerrar sesión', 'Mi cuenta'],
    fr: ['Connexion', 'Déconnexion', 'Mon compte'], pt: ['Entrar', 'Sair', 'Minha conta'], ru: ['Войти', 'Выйти', 'Мой аккаунт'], ja: ['ログイン', 'ログアウト', 'マイアカウント'],
  };
  var t, prefix, rerender;
  // 语言：优先页面自己的语言切换接口（图床这类单页应用切换语言时不刷新页面、也不改 <html lang>），否则取 <html lang>
  function curLang() {
    var v = window.__viaai, c = '';
    try { c = v && typeof v.display === 'function' ? v.display() : ''; } catch (e) {}
    c = String(c || document.documentElement.lang || 'zh').slice(0, 2).toLowerCase();
    return T[c] ? c : 'zh';
  }
  function setLang() { var l = curLang(); t = T[l]; prefix = l === 'zh' ? '' : '/' + l; }
  setLang();

  function init() {
    var a = document.querySelector('a[data-lang]');
    var anchor = a && a.closest('.lang-menu');
    if (!anchor || !anchor.parentNode) return;
    var st = document.createElement('style');
    st.textContent = '.viaai-auth{display:inline-flex;align-items:center;gap:4px;margin-right:8px;font-size:14px;white-space:nowrap;flex:none}' +
      '.viaai-auth a,.viaai-auth button{display:inline-flex;align-items:center;height:34px;padding:0 10px;border:1px solid rgba(127,127,127,.4);border-radius:8px;background:none;color:inherit;font:inherit;cursor:pointer;text-decoration:none}' +
      '.viaai-auth a:hover,.viaai-auth button:hover{border-color:currentColor}.viaai-auth .va-user{max-width:9em;overflow:hidden;text-overflow:ellipsis}' +
      '.viaai-auth .va-out{border-color:transparent;padding:0 6px;opacity:.75}@media(max-width:640px){.viaai-auth{margin-right:4px}.viaai-auth .va-user{max-width:5em}}' +
      // 手机宽度：页头放不下「用户名 + 退出」，只留用户名（点进账号页可退出），免得整页横向溢出
      '@media(max-width:480px){.viaai-auth .va-out{display:none}.viaai-auth .va-user{max-width:4.5em;padding:0 8px}.viaai-auth .va-in{padding:0 8px}}';
    document.head.appendChild(st);
    var box = document.createElement('span');
    box.className = 'viaai-auth';
    box.hidden = true; // 已登录时，查到结果前不显示，避免先闪一下「登录」
    anchor.parentNode.insertBefore(box, anchor);

    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
    var shown;
    function render(me) {
      shown = me;
      box.textContent = '';
      if (!me) {
        var l = el('a', 'va-in', t[0]);
        l.href = ID + prefix + '/login';
        l.rel = 'nofollow';
        l.addEventListener('click', function () { l.href = ID + prefix + '/login?return=' + encodeURIComponent(location.href); });
        box.appendChild(l);
      } else {
        var u = el('a', 'va-user', me);
        u.href = ID + prefix + '/account';
        u.title = t[2];
        var o = el('button', 'va-out', t[1]);
        o.type = 'button';
        o.addEventListener('click', function () {
          fetch(ID + '/api/v1/logout', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' })
            .catch(function () {}).then(function () { render(null); });
        });
        box.appendChild(u);
        box.appendChild(o);
      }
      box.hidden = false;
    }
    rerender = function () { setLang(); if (shown !== undefined) render(shown); };
    if (!/(?:^|; )viaai_in=1/.test(document.cookie)) return render(null);
    fetch(ID + '/api/v1/session', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (j) { render(j && j.authenticated && j.user ? j.user.username : null); })
      .catch(function () { render(null); });
  }
  // 语言切换后重画文字与链接前缀（页面按语言整页加载的站点不会触发，无影响）
  function relang() { if (rerender) rerender(); }
  window.addEventListener('viaai-lang', relang);
  new MutationObserver(relang).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

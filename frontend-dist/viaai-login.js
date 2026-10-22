/* viaai-login.js — 图床网页端登录改由统一通行证（id.viaai.si）承担；未登录 / 无上传权限时显示「过渡页」。
 *
 * 上游前端（Vue 单页应用，不改压缩后的 JS）的路由守卫：访问 / 时调 GET /api/auth/sessionCheck，
 * userRequired 且未登录 → 路由跳到 /login（输入访问码的「用户登录页」；管理员登录是另一条路由 /adminLogin，本脚本不碰）。
 * 这里在 / 和 /login 上问一次 sessionCheck，然后：
 *   - passportLogin 没开（后端 PASSPORT_LOGIN=off，回滚）→ 什么都不做，保留上游访问码登录页；
 *   - 未登录 / 请求失败（仅 /login）→ 在 /login 上显示「登录后你可以……」过渡页（遮住访问码输入框），按钮才去通行证，不自动跳转；
 *   - 已登录但 uploadAllowed:false（不在上传白名单）→ 在上传页上盖一层「当前账号没有上传权限」提示；
 *   - 已登录且可上传 → 不显示任何东西（在 /login 则回首页）。
 * 页头右上角的站群导航栏（viaai-nav.js）和 viaai-auth.js 的「登录 / 退出」保持原样。
 * 通行证统一退出（viaai-auth.js 触发）成功后刷新页面，让路由守卫重新检查。
 *
 * 纯函数（语言 / 链接 / 视图判定 / 词典）挂在 window.__viaaiGate 上，test/viaai/gate.test.mjs 直接测。
 */
(function () {
  if (window.__viaaiLogin) return;
  window.__viaaiLogin = true;

  var ID = 'https://id.viaai.si';
  var MAIN = 'https://viaai.si';
  var SUPPORTED = ['zh', 'en', 'hi', 'es', 'fr', 'pt', 'ru', 'ja'];

  // 文案（8 种语言；非中日语言里不夹汉字）。{name} 是当前登录账号的用户名
  var TEXT = {
    zh: {
      title: '登录后使用图床',
      lead: '图床使用 viaai.si 统一账号登录，一个账号通行全站。',
      head: '登录后你可以：',
      feats: ['拖拽、点击或粘贴上传图片和文件，支持批量上传，获得稳定外链', '粘贴外部图片链接，一键转存到图床', '一键复制外链，可选择链接格式', '上传前自动压缩、转换为 WebP，并选择保存目录和命名方式', '查看上传历史，随时找回链接'],
      login: '登录', register: '没有账号？注册',
      dTitle: '当前账号没有上传权限', dBody: '仅限白名单使用。当前登录账号：{name}', dHint: '想换其他账号？先退出，再用其他账号登录。', dHome: '返回主站', dOut: '退出并换账号',
    },
    en: {
      title: 'Sign in to use the image host',
      lead: 'Sign-in uses your viaai.si account: one account for the whole site network.',
      head: 'After signing in you can:',
      feats: ['Upload images and files by dragging, clicking or pasting, in batches, and get stable links', 'Paste external image links to save them to the host in one step', 'Copy links in one click, in the link format you choose', 'Compress and convert to WebP before upload, and pick the folder and file naming', 'Browse your upload history to find links again'],
      login: 'Log in', register: 'No account? Sign up',
      dTitle: 'This account cannot upload', dBody: 'Uploading is limited to whitelisted accounts. Signed in as: {name}', dHint: 'Want to use another account? Log out first, then sign in with it.', dHome: 'Back to viaai.si', dOut: 'Log out and switch account',
    },
    hi: {
      title: 'इमेज होस्टिंग इस्तेमाल करने के लिए लॉग इन करें',
      lead: 'लॉग इन आपके viaai.si खाते से होता है: पूरे साइट समूह के लिए एक ही खाता।',
      head: 'लॉग इन करने के बाद आप कर सकते हैं:',
      feats: ['खींचकर, क्लिक करके या पेस्ट करके तस्वीरें और फ़ाइलें एक साथ अपलोड करें और स्थायी लिंक पाएँ', 'बाहरी तस्वीरों के लिंक पेस्ट करके उन्हें होस्टिंग में सहेजें', 'एक क्लिक में लिंक कॉपी करें, अपनी पसंद के लिंक फ़ॉर्मैट में', 'अपलोड से पहले कंप्रेस और WebP में बदलें, और फ़ोल्डर व फ़ाइल नाम चुनें', 'अपलोड इतिहास देखकर लिंक दोबारा पाएँ'],
      login: 'लॉग इन', register: 'खाता नहीं है? साइन अप करें',
      dTitle: 'इस खाते से अपलोड नहीं हो सकता', dBody: 'केवल व्हाइटलिस्ट वाले खातों के लिए। इस खाते से लॉग इन: {name}', dHint: 'दूसरा खाता इस्तेमाल करना चाहते हैं? पहले लॉग आउट करें, फिर उस खाते से लॉग इन करें।', dHome: 'viaai.si पर वापस जाएँ', dOut: 'लॉग आउट करके खाता बदलें',
    },
    es: {
      title: 'Inicia sesión para usar el alojamiento de imágenes',
      lead: 'El acceso usa tu cuenta de viaai.si: una sola cuenta para todos los sitios.',
      head: 'Al iniciar sesión podrás:',
      feats: ['Subir imágenes y archivos arrastrando, haciendo clic o pegando, en lote, y obtener enlaces estables', 'Pegar enlaces de imágenes externas para guardarlas en el alojamiento', 'Copiar enlaces con un clic, en el formato que elijas', 'Comprimir y convertir a WebP antes de subir, y elegir carpeta y nombre de archivo', 'Consultar tu historial de subidas para recuperar enlaces'],
      login: 'Iniciar sesión', register: '¿No tienes cuenta? Regístrate',
      dTitle: 'Esta cuenta no puede subir archivos', dBody: 'Solo pueden subir archivos las cuentas de la lista blanca. Sesión iniciada como: {name}', dHint: '¿Quieres usar otra cuenta? Cierra sesión primero y entra con la otra.', dHome: 'Volver a viaai.si', dOut: 'Cerrar sesión y cambiar de cuenta',
    },
    fr: {
      title: "Connectez-vous pour utiliser l'hébergeur d'images",
      lead: 'La connexion utilise votre compte viaai.si : un seul compte pour tout le réseau de sites.',
      head: 'Une fois connecté, vous pourrez :',
      feats: ["Téléverser images et fichiers par glisser-déposer, clic ou collage, en lot, et obtenir des liens stables", "Coller des liens d'images externes pour les enregistrer sur l'hébergeur", 'Copier les liens en un clic, au format de votre choix', "Compresser et convertir en WebP avant l'envoi, et choisir le dossier et le nom des fichiers", "Consulter l'historique de vos envois pour retrouver vos liens"],
      login: 'Se connecter', register: 'Pas de compte ? Inscrivez-vous',
      dTitle: 'Ce compte ne peut pas téléverser', dBody: "Réservé aux comptes de la liste blanche. Connecté en tant que : {name}", dHint: "Utiliser un autre compte ? Déconnectez-vous d'abord, puis reconnectez-vous avec l'autre.", dHome: 'Retour à viaai.si', dOut: 'Se déconnecter et changer de compte',
    },
    pt: {
      title: 'Entre para usar a hospedagem de imagens',
      lead: 'O acesso usa sua conta viaai.si: uma conta para toda a rede de sites.',
      head: 'Depois de entrar, você pode:',
      feats: ['Enviar imagens e arquivos arrastando, clicando ou colando, em lote, e obter links estáveis', 'Colar links de imagens externas para salvá-las na hospedagem', 'Copiar links com um clique, no formato que escolher', 'Comprimir e converter para WebP antes do envio, e escolher a pasta e o nome dos arquivos', 'Ver o histórico de envios para recuperar links'],
      login: 'Entrar', register: 'Não tem conta? Cadastre-se',
      dTitle: 'Esta conta não pode enviar arquivos', dBody: 'Uso restrito a contas da lista de permissões. Conectado como: {name}', dHint: 'Quer usar outra conta? Saia primeiro e entre com a outra.', dHome: 'Voltar ao viaai.si', dOut: 'Sair e trocar de conta',
    },
    ru: {
      title: 'Войдите, чтобы пользоваться хостингом изображений',
      lead: 'Вход выполняется через аккаунт viaai.si: один аккаунт для всех сайтов сети.',
      head: 'После входа вы сможете:',
      feats: ['Загружать изображения и файлы перетаскиванием, щелчком или вставкой, пакетно, и получать постоянные ссылки', 'Вставлять ссылки на внешние изображения и сохранять их на хостинге', 'Копировать ссылки одним щелчком в выбранном формате', 'Сжимать и конвертировать в WebP перед загрузкой, выбирать папку и имена файлов', 'Просматривать историю загрузок и находить ссылки снова'],
      login: 'Войти', register: 'Нет аккаунта? Зарегистрируйтесь',
      dTitle: 'Этот аккаунт не может загружать файлы', dBody: 'Только для аккаунтов из белого списка. Вы вошли как: {name}', dHint: 'Хотите использовать другой аккаунт? Сначала выйдите, затем войдите под другим.', dHome: 'Вернуться на viaai.si', dOut: 'Выйти и сменить аккаунт',
    },
    ja: {
      title: 'ログインして画像ホスティングを使う',
      lead: 'ログインには viaai.si のアカウントを使います。1つのアカウントでサイト群全体に入れます。',
      head: 'ログインすると次のことができます。',
      feats: ['ドラッグ、クリック、貼り付けで画像やファイルをまとめてアップロードし、安定したリンクを取得', '外部の画像リンクを貼り付けてホスティングに保存', 'ワンクリックでリンクをコピー（リンク形式を選べます）', 'アップロード前に圧縮や WebP 変換を行い、保存先フォルダとファイル名の付け方を選択', 'アップロード履歴からリンクを探し直す'],
      login: 'ログイン', register: 'アカウントをお持ちでない方は登録',
      dTitle: 'このアカウントにはアップロード権限がありません', dBody: 'ホワイトリストに登録されたアカウントのみ利用できます。ログイン中のアカウント: {name}', dHint: '別のアカウントを使うには、いったんログアウトしてからログインし直してください。', dHome: 'viaai.si に戻る', dOut: 'ログアウトしてアカウントを切り替える',
    },
  };

  // ---------- 纯函数 ----------
  /** 语言：共享 cookie viaai_lang 优先，其次页面 <html lang>，都不在 8 种之内就中文 */
  function pickLang(cookieLang, htmlLang) {
    var c = String(cookieLang || '').toLowerCase();
    if (SUPPORTED.indexOf(c) >= 0) return c;
    var h = String(htmlLang || '').slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(h) >= 0 ? h : 'zh';
  }
  function prefix(lang) { return lang === 'zh' || SUPPORTED.indexOf(lang) < 0 ? '' : '/' + lang; }
  /** 通行证页面链接：https://id.viaai.si/<lang>/login?return=…（中文无语言前缀） */
  function idUrl(lang, page, returnUrl) { return ID + prefix(lang) + '/' + page + '?return=' + encodeURIComponent(returnUrl); }
  function homeUrl(origin) { return origin + '/'; }
  /** 主站链接：https://viaai.si/（中文）/ https://viaai.si/ja */
  function mainUrl(lang) { return MAIN + (prefix(lang) || '/'); }
  function fill(s, vars) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : ''; }); }
  /**
   * 该显示什么：'gate'（过渡页）| 'denied'（无上传权限）| 'redirect-home'（已登录在 /login）| null（什么都不显示）
   * check：sessionCheck 的 JSON，请求失败传 null；path：'/' 或 '/login'
   */
  function viewFor(check, path) {
    if (!check) return path === '/login' ? 'gate' : null; // 请求失败：/login 上也要有登录按钮，不白屏
    if (check.passportLogin !== true) return null;       // 后端没开通行证（回滚）：保留上游登录页
    if (!check.valid) return 'gate';
    if (check.authType === 'user' && check.uploadAllowed === false) return 'denied';
    return path === '/login' ? 'redirect-home' : null;
  }
  window.__viaaiGate = { SUPPORTED: SUPPORTED, TEXT: TEXT, pickLang: pickLang, prefix: prefix, idUrl: idUrl, homeUrl: homeUrl, mainUrl: mainUrl, fill: fill, viewFor: viewFor };

  if (typeof document === 'undefined' || !document.documentElement) return; // 测试环境只要纯函数

  // ---------- DOM ----------
  var root = document.documentElement;
  var PENDING = 'viaai-login-pending';
  var GATE_ON = 'viaai-gate-on';
  var BOX = 'viaai-gate';
  var seq = 0;
  var cur = { kind: null, check: null };

  var st = document.createElement('style');
  st.textContent =
    'html.' + PENDING + ' #app{visibility:hidden!important}' +
    // 过渡页盖在上游登录页（壁纸、logo、页脚）上，遮住访问码输入框；导航栏 z-index 200，在它上面
    'html.' + GATE_ON + ' .login-container{display:none!important}' +
    '#' + BOX + '{position:fixed;inset:0;z-index:150;display:flex;align-items:center;justify-content:center;padding:96px 16px 64px;box-sizing:border-box;pointer-events:none;' +
      'font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC","Noto Sans",sans-serif;--g-bg:rgba(255,255,255,.74);--g-fg:#1f2937;--g-mut:#4b5563;--g-bd:rgba(255,255,255,.75);--g-pri:#2563eb;--g-sec:#1d4ed8}' +
    'html.dark #' + BOX + '{--g-bg:rgba(22,27,38,.74);--g-fg:#f3f4f6;--g-mut:#c3cad6;--g-bd:rgba(255,255,255,.16);--g-pri:#3b82f6;--g-sec:#8ab4ff}' +
    // 无权限提示盖在上传页上：整体模糊压暗，盖住上传界面
    '#' + BOX + '.dim{pointer-events:auto;background:rgba(15,23,42,.35);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}' +
    '#' + BOX + ' .g-card{pointer-events:auto;width:100%;max-width:520px;max-height:100%;overflow:auto;box-sizing:border-box;padding:28px 30px;border-radius:18px;background:var(--g-bg);color:var(--g-fg);border:1px solid var(--g-bd);-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);box-shadow:0 10px 40px rgba(0,0,0,.18)}' +
    '#' + BOX + ' h1{margin:0 0 8px;font-size:24px;line-height:1.3;font-weight:700;color:var(--g-fg);overflow-wrap:anywhere}' +
    '#' + BOX + ' p{margin:0 0 14px;color:var(--g-mut);overflow-wrap:anywhere}' +
    '#' + BOX + ' h2{margin:6px 0 8px;font-size:15px;font-weight:700;color:var(--g-fg)}' +
    '#' + BOX + ' ul{margin:0 0 20px;padding:0 0 0 1.2em;color:var(--g-fg)}#' + BOX + ' li{margin:4px 0;overflow-wrap:anywhere}' +
    '#' + BOX + ' .g-acts{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px}' +
    '#' + BOX + ' .g-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 28px;border-radius:12px;background:var(--g-pri);color:#fff;font:inherit;font-weight:700;text-decoration:none;border:0;cursor:pointer;box-sizing:border-box;max-width:100%}' +
    '#' + BOX + ' .g-btn:hover{filter:brightness(1.08)}' +
    '#' + BOX + ' .g-btn.alt{background:transparent;color:var(--g-fg);border:1px solid var(--g-bd);box-shadow:inset 0 0 0 1px rgba(127,127,127,.35)}' +
    '#' + BOX + ' .g-link{color:var(--g-sec);text-decoration:underline;text-underline-offset:3px;font-weight:600;overflow-wrap:anywhere}' +
    '#' + BOX + ' a:focus-visible,#' + BOX + ' button:focus-visible{outline:3px solid var(--g-sec);outline-offset:2px}' +
    '@media(max-width:480px){#' + BOX + '{padding:88px 12px 56px}#' + BOX + ' .g-card{padding:22px 18px}#' + BOX + ' h1{font-size:21px}#' + BOX + ' .g-btn{width:100%}}';
  (document.head || root).appendChild(st);

  function path() { return location.pathname.replace(/\/+$/, '') || '/'; }
  function curLang() {
    var m = /(?:^|;\s*)viaai_lang=([a-z]{2})(?:;|$)/.exec(document.cookie);
    return pickLang(m && m[1], root.lang);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function release() { root.classList.remove(PENDING); }
  function app() { return document.getElementById('app'); }

  function clear() {
    var old = document.getElementById(BOX);
    if (old) old.remove();
    root.classList.remove(GATE_ON);
    var a = app();
    if (a && a.hasAttribute('inert') && a.dataset.viaaiInert) { a.removeAttribute('inert'); delete a.dataset.viaaiInert; }
  }

  function render() {
    var kind = cur.kind;
    if (kind !== 'gate' && kind !== 'denied') { clear(); return; }
    var lang = curLang();
    var t = TEXT[lang];
    var ret = homeUrl(location.origin);
    var prev = document.getElementById(BOX);
    var hadFocus = prev && prev.contains(document.activeElement);
    clear();
    var box = el('div', kind === 'denied' ? 'dim' : '');
    box.id = BOX;
    box.lang = lang;
    var card = el('section', 'g-card');
    card.setAttribute('role', 'region');
    if (kind === 'gate') {
      card.appendChild(el('h1', '', t.title));
      card.appendChild(el('p', '', t.lead));
      card.appendChild(el('h2', '', t.head));
      var ul = el('ul');
      t.feats.forEach(function (f) { ul.appendChild(el('li', '', f)); });
      card.appendChild(ul);
      var acts = el('div', 'g-acts');
      var login = el('a', 'g-btn', t.login); login.href = idUrl(lang, 'login', ret); login.rel = 'nofollow';
      var reg = el('a', 'g-link', t.register); reg.href = idUrl(lang, 'register', ret); reg.rel = 'nofollow';
      acts.appendChild(login); acts.appendChild(reg);
      card.appendChild(acts);
      root.classList.add(GATE_ON);
    } else {
      var name = cur.check && cur.check.passport && cur.check.passport.username || '';
      card.appendChild(el('h1', '', t.dTitle));
      card.appendChild(el('p', '', fill(t.dBody, { name: name })));
      card.appendChild(el('p', '', t.dHint));
      var acts2 = el('div', 'g-acts');
      var home = el('a', 'g-btn', t.dHome); home.href = mainUrl(lang);
      var out = el('button', 'g-btn alt', t.dOut); out.type = 'button';
      out.addEventListener('click', function () {
        // 通行证统一退出；成功后下面包的 fetch 会刷新页面，路由守卫重新检查
        fetch(ID + '/api/v1/logout', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(function () {});
      });
      acts2.appendChild(home); acts2.appendChild(out);
      card.appendChild(acts2);
      var a = app();
      if (a && !a.hasAttribute('inert')) { a.setAttribute('inert', ''); a.dataset.viaaiInert = '1'; } // 盖住的上传界面不可聚焦
    }
    box.appendChild(card);
    document.body.appendChild(box);
    if (hadFocus) { var f = box.querySelector('a,button'); if (f) f.focus(); }
  }

  function check() {
    var p = path();
    if (p !== '/' && p !== '/login') { cur = { kind: null, check: null }; clear(); release(); return; }
    var n = ++seq;
    if (p === '/login') root.classList.add(PENDING); // 判断期间先藏起应用，避免闪一下访问码登录页
    var timer = setTimeout(function () { if (n === seq) done(null); }, 4000);
    function done(j) {
      clearTimeout(timer);
      if (n !== seq) return;
      var p2 = path();
      if (p2 !== '/' && p2 !== '/login') return;
      var v = viewFor(j, p2);
      if (v === 'redirect-home') { location.replace('/'); return; }
      cur = { kind: v, check: j };
      render();
      release();
    }
    fetch('/api/auth/sessionCheck', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(done, function () { done(null); });
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
  window.addEventListener('viaai-lang', render);
  try { new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ['lang'] }); } catch (e) {}
})();

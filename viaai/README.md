# viaai.si 站群定制（imgbed.viaai.si）

本仓库是上游 [MarSeventh/CloudFlare-ImgBed](https://github.com/MarSeventh/CloudFlare-ImgBed) 的 fork，每天自动同步上游。
为避免同步冲突，站群定制全部放在这里，由 `scripts/patch-dist.mjs` 在部署时重新应用到 `frontend-dist/`（幂等）。

| 内容 | 位置 |
|---|---|
| 补丁脚本（index.html 元数据 / canonical / OG / 图标 / 注入导航，重新生成 .gz） | `scripts/patch-dist.mjs`，`npm run patch:dist` |
| 站群统一导航栏（右上角一排「菜单▾ 语言▾ 主题」，与左上角 logo 水平对齐；菜单与主站一致） | `viaai/overlay/viaai-nav.js` |
| 共享 cookie（`viaai_lang`、`viaai_theme`）↔ 图床语言 / 主题（可读可写） | `viaai/overlay/viaai-init.js` |
| 界面语言包（hi / es / fr / pt / ru / ja，只覆盖上传页、登录页等用户可见文案）与注入脚本 | `viaai/locales/*.json`、`viaai/overlay/viaai-i18n.js` |
| 用户登录页 → 统一通行证登录跳转、通行证退出后刷新 | `viaai/overlay/viaai-login.js` |
| 通行证登录态 / 上传防滥用（后端） | `functions/utils/auth/passport.js`、`passportUpload.js`，挂钩点见下文 |
| robots.txt、favicon、apple-touch-icon、og.png | `viaai/overlay/` |
| 部署时自动执行 | `.github/workflows/deploy-worker.yml` 的 "Apply viaai.si patches" 步骤 |

- 账号：管理员账号保持独立（后台「安全设置」配置）；网页端「用户登录」已改为统一通行证，见下文「统一通行证登录」。
- 品牌文字（站点标题、Logo、页脚等）：在后台「页面设置」配置，不改代码。
- 页脚 / 署名中的上游链接保留（MIT 协议）。
- 上游同步后 `frontend-dist/` 会被覆盖，重新执行 `npm run patch:dist` 并提交即可（部署流程已自动执行）。

## 语言 / 主题与共享 cookie

- 主站及其他子站在 `.viaai.si` 下共享 `viaai_lang`（zh/en/hi/es/fr/pt/ru/ja）和 `viaai_theme`（light/dark）。图床对两者**可读可写**，写法与主站一致：`Domain=.viaai.si; Path=/; Max-Age=30天; SameSite=Lax; Secure`，每次访问对已有的合法取值续期（滑动 30 天）。
- 语言：用户在栏里的语言下拉切换时写回 `viaai_lang`（`viaai-init.js` 的 `__viaai.set`）。
- 主题：用户在图床切换主题时写回 `viaai_theme`；加载、跟随系统、定时深色等非用户操作造成的变化不写（以 1 秒内有无点击 / 按键判断）。
- 读取同步：页面加载时把 cookie 的值写进图床自己的 localStorage（`viaai-locale` / `app-locale`、`vuex.useDarkMode/cusDarkMode`）。只有 cookie 的值相对上次同步变了才覆盖（自己写的 cookie 已记为“已同步”），所以不会覆盖用户在图床里刚做的选择，别的站再次切换才会同步过来。
- cookie 里不在 8 种语言之内的值（如 `de`）：图床显示英文，也不会去改写它。
- 菜单文字跟随图床当前显示的语言；跳往其他站的链接带对应语言前缀。

## 多语言（与主站一致的 8 种：zh / en / hi / es / fr / pt / ru / ja）

- 应用自带 zh-CN / en；其余语言以 `viaai/locales/<code>.json` 提供，补丁脚本拷到 `frontend-dist/viaai-locales/`。
- `viaai-i18n.js` 在应用挂载后，从 `#app.__vue_app__` 的 provides 里取出 vue-i18n 全局实例，`setLocaleMessage` 注册语言包并切换；语言包里没有的文案（管理后台、设置页）回退到英文。
- 当前语言：`localStorage["viaai-locale"]`。共享 cookie `viaai_lang` 变化时覆盖它（`viaai-init.js`）；不在 8 种之内的语言用英文。用户在栏里切换语言时同时写回该 cookie。
- 加新语言：翻译 `viaai/locales/<code>.json`（键与 `zh-CN`/`en` 一致，保留 `{name}`、`<em>`、`<br>` 等占位符），把 code 加进 `viaai-init.js` 的 `SUPPORTED` 和 `viaai-nav.js` 的 `LABELS`/`NAMES`，再运行 `npm run patch:dist`。
- 只翻译了用户可见部分（登录、上传、上传设置、历史、链接格式、公开浏览、目录选择等，184 条）。Element Plus 组件自带文案未接入。

## 右上角导航栏

- 位置：固定在右上角，垂直中心与左上角 logo 对齐；上游原有的右上角固定按钮（上传目录、文件管理、「⋮」等）整体下移到它下面（`viaai-nav.js` 里的 `reflow`，按「固定定位、靠近顶部右半边」自动识别，不依赖具体类名）。
- 菜单▾：首页 · 资讯 · 开源 · 导航 · 图床 · 关于（与主站一致）。语言▾：8 种语言，切换时写回共享 cookie。主题：栏里自己的按钮，样式与行为和其他站点（主站 `.theme-btn`）一致——34×34、1px 描边、8px 圆角、同一个半实心圆图标，悬停时描边和图标变主色；浅 / 深二选一（经应用 vuex store 设置），变化后写回共享 cookie `viaai_theme`。上游自带的主题按钮（浅 / 深 / 自动三态）一律隐藏。
- 隐藏「⋮」下拉里的语言切换项。

## 页脚

上游页脚 `© 2024-年份 Designed by SanyueQi for You!` 由 `viaai-nav.js` 的 `renderFooter` 替换为 `© 年份 AI之路 · viaai.si`（非中文显示 `AI Road`，`viaai.si` 链到主站对应语言），并去掉右边的传送门（飞机）图标和链接（后台「页脚传送门链接」配置因此不再生效）。上游页脚结构变了就什么都不改。原项目是 MIT 协议，保留 `LICENSE` 即可。

## Logo

- 用主站同一张图 `viaai/overlay/viaai-logo.png`（400×80，图标 + “AI之路”，来自 `si.viaai/public/logo.png`；主站换 logo 时在这里同步替换，并把 `viaai-nav.js` 里的 `LOGO_SRC` 的 `?v=` 加 1）。
- **首页（上传页，路径 `/`）**：logo 放在上传框上方正中间（`<html class="viaai-home">`，由 `viaai-init.js` 按路径设置），桌面 240×48、手机 180×36，位置就是原来大标题的位置（标题只是 `visibility:hidden`，保留版面间距）。其余页面（登录等）仍在左上角：桌面 200×40、手机 150×30，与右上角栏水平对齐。深色模式用与主站相同的滤镜。管理后台等非固定位置的方形小 logo 只显示图标部分。
- **链接**：所有 logo 都指向图床首页 `https://imgbed.viaai.si/`（同一标签页打开）。后台「图床Logo」（`logoUrl`）和「Logo跳转链接」（`logoLink`）配置因此不再生效：`renderLogo` 会把 Vue 改回去的 `src` / `href` 再改回来。

## 上传页大标题

上传页中间的大标题（“图床名称 ImgHub”，`.upload-home .header h1.title`）由 `viaai-nav.js` 的样式隐藏（上游代码已压缩，不改源码）。登录页标题（`.login-title`）不受影响。

## 后台页面（/dashboard、/systemConfig、/customerConfig）

- **不显示站群导航栏**：后台顶部工具栏本来就有主题、中英文切换，叠加会重叠。判断页面靠路径（`viaai-init.js` 的 `ADMIN_PATHS`），给 `<html>` 加 `viaai-admin` 类，样式里隐藏本栏；单页应用切换路由时由 `viaai-route` 事件更新。新增后台页面路径时把它加进 `ADMIN_PATHS`。
- **用后台自带的按钮**：语言切换（地球图标，只有中文 / English）放到主题按钮前面（`order:-1`）；主题按钮保留上游的三态行为（浅 / 深 / 自动），外观换成与前端、主站一致：34×34、1px 描边、8px 圆角、同一个半实心圆图标（隐藏它随状态变化的太阳 / 月亮图标，用遮罩画固定的半圆）。
- **语言 cookie 独立**：后台语言存在 `imgbed_admin_lang`（只在本站有效，不带 `Domain`），**不读不写**前端和其他站共用的 `viaai_lang`；没选过时按前端语言推导（中文 → 中文，其余 → English）。回到前端页面仍按共享的 `viaai_lang`。
- **主题仍共用** `viaai_theme`：后台点主题按钮同样会写回共享 cookie。

## 导航栏第一个按钮：首页

栏里第一个按钮原来是「菜单▾」，现在拆成两半、视觉上是一个整体：左边是「首页」链接（随语言：首页 / Home / ホーム / Inicio / Accueil / Início / Главная / होम，链到主站首页，如 `https://viaai.si/ja`，当前标签页打开），右边的小三角展开菜单（首页 · 资讯 · 开源 · 导航 · 图床 · 关于，菜单里也有「首页」链接）。

## 语言下拉

与主站一致：按钮上直接显示当前语言自己的名字（中文 / English / 日本語 / Español / Français / Português / Русский / हिन्दी），不再写「语言」二字；下拉里列出各语言自己的名字，当前的高亮。（`aria-label` 仍是“语言: 当前语言名”。）

## 统一通行证登录（替代网页端的访问码登录）

图床网页端上传原来靠「用户访问码」（authCode）登录；现在改为 viaai.si 站群的统一通行证（`id.viaai.si`）。管理员登录与后台（`/dashboard`、`/api/manage/*`）、API Token、文件读取（`/file/*`、`/random`）、存储渠道**都没动**。

**谁能上传（`PASSPORT_LOGIN` 开启时，默认）**：
1. 管理员 session（`admin_session`）；
2. API Token（`Authorization` 头，要有 `upload` 权限）；
3. 通行证已登录（`viaai_sid` cookie，`Domain=.viaai.si`，会随请求发到本站）；
4. 老脚本 / PicGo 等**非浏览器客户端**的访问码：URL 参数 `authCode` 或 `authCode` 请求头，且请求**不带** `Origin` / `Sec-Fetch-*`。浏览器来的访问码（Referer、Cookie 里的 authCode、带 Origin 的请求）不再有效。

「没配置访问码 = 放行」在开启时**失效**：匿名永远 401（库里没配访问码也一样）。旧的 `user_session` cookie 也不再认（自然过期）。

**后端**
- `functions/utils/auth/passport.js`：`getPassportUser(request)`。没有 `viaai_sid` 不发请求；有就把 Cookie 头原样转发到 `https://id.viaai.si/api/v1/session`（1.8 秒超时）；超时 / 非 200 / 内容异常 / `user.id` 不符合 `u_xxx` → 匿名，不抛错；同一个请求只问一次。
- `authCore.js` 的 `checkUser`：admin session 之后、旧的 user session / authCode 之前加通行证；返回值多了可选字段 `userId` / `username`。**ADMIN 范围不接受通行证**。
- `POST /api/auth/login` 开启时 410（不再创建会话）；`GET /api/auth/sessionCheck` 开启时：通行证已登录 `{valid:true, authType:'user', userRequired:true, passportLogin:true, passport:{id,username}}`，未登录 `{valid:false, userRequired:true, passportLogin:true}`；`POST /api/auth/logout` 不变（只清本站 cookie，不替通行证退出）。
- 上传入口（`/upload`、`/upload/huggingface/*`）用 `guardUpload`（`passportUpload.js`）替代 `userAuthCheck`。

**防滥用（只针对通行证登录的上传；admin / Token / 访问码客户端不受影响）**
- Origin 校验：请求带 `Origin` 时必须是 `https://imgbed.viaai.si`（`http://localhost|127.0.0.1[:端口]` 放行），否则 403；不带 Origin 的按其鉴权方式处理。
- 限流：每用户每分钟最多 10 次上传请求、每天（UTC）最多 100 张，超限 429。非分块上传、分块上传的初始化、HuggingFace 的 getUploadUrl 各算一次；中间分块 / 合并 / 清理 / commit 不算。计数 key `manage@viaai@upload@<userId>`（每用户一行；`manage@` 前缀让 D1 适配器存进 settings 表，不会混进文件列表），值 `{day,d,m,mc}`（UTC 日期、日计数、当前分钟、分钟计数，换天清零），KV 模式另带 2 天 TTL；**每次计数的上传 1 次读 + 1 次写**（429 时只读），读后写非原子，并发时可能少算。KV 免费版每天 1000 次写，所以全站通行证上传 ≤ 约 1000 次/天。
- 记录上传者：成功写入的文件元数据多 `uploaderId` / `uploaderName`（现有字段不变；admin / Token / 访问码上传没有这两个字段）。
- 白名单：环境变量 `UPLOAD_ALLOWED_USERS`（逗号分隔的通行证用户 id）；**设置了才限制**，不设置 = 所有已登录通行证用户都可上传。

**前端（`viaai-login.js`）**：上游路由守卫调 `sessionCheck`，`userRequired` 且未登录就把路由推到 `/login`（输入访问码的用户登录页；管理员登录是另一条路由 `/adminLogin`，不动）。脚本在 `/login`（直接打开或单页应用 pushState 过来）先问 `sessionCheck`：`passportLogin:true` 且未登录 → `location.replace('https://id.viaai.si/<lang>/login?return=<图床首页>')`（中文无前缀，语言取 `viaai_lang`，没有就按页面语言）；已登录 → 回首页；后端没开通行证（回滚）→ 保留访问码登录页。页头的「登录 / 用户名 / 退出」仍是 `viaai-auth.js`；脚本包了一层 `fetch`，通行证统一退出成功后刷新页面，路由守卫重新检查，回到未登录。

**回滚**：Pages 环境变量 `PASSPORT_LOGIN=off` 即可恢复访问码登录（`/api/auth/login`、`sessionCheck`、鉴权全部回到上游逻辑，登录页不再跳转）。

**测试**：`npm run test:viaai`（node:test，不依赖服务和额外依赖；`test/viaai/hooks.mjs` 负责在没装依赖时解析 functions/ 里无扩展名的导入并桩掉 `@aws-sdk/*`）。

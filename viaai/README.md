# viaai.si 站群定制（imgbed.viaai.si）

本仓库是上游 [MarSeventh/CloudFlare-ImgBed](https://github.com/MarSeventh/CloudFlare-ImgBed) 的 fork，每天自动同步上游。
为避免同步冲突，站群定制全部放在这里，由 `scripts/patch-dist.mjs` 在部署时重新应用到 `frontend-dist/`（幂等）。

| 内容 | 位置 |
|---|---|
| 补丁脚本（index.html 元数据 / canonical / OG / 图标 / 注入导航，重新生成 .gz） | `scripts/patch-dist.mjs`，`npm run patch:dist` |
| 站群统一导航栏（右上角一排「菜单▾ 语言▾ 主题」，与左上角 logo 水平对齐；菜单与主站一致） | `viaai/overlay/viaai-nav.js` |
| 共享 cookie（`viaai_lang`、`viaai_theme`）↔ 图床语言 / 主题（可读可写） | `viaai/overlay/viaai-init.js` |
| 界面语言包（hi / es / fr / pt / ru / ja，只覆盖上传页、登录页等用户可见文案）与注入脚本 | `viaai/locales/*.json`、`viaai/overlay/viaai-i18n.js` |
| robots.txt、favicon、apple-touch-icon、og.png | `viaai/overlay/` |
| 部署时自动执行 | `.github/workflows/deploy-worker.yml` 的 "Apply viaai.si patches" 步骤 |

- 账号：保持独立（管理员账号在后台「安全设置」配置）。
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
- 菜单▾：首页 · 资讯 · 开源 · 导航 · 图床 · 关于（与主站一致）。语言▾：8 种语言，切换时写回共享 cookie。主题：浅 / 深二选一，页面上有上游自己的主题按钮（登录页 `.toggle-dark`、上传页桌面端 `.toggle-dark-button`，浅 / 深 / 自动三态）时，把它放进栏里的主题位置（不动 DOM，用 fixed + zoom 盖在本栏占位按钮上）；没有可见的（如手机上传页）才用本栏自己的主题按钮（浅 / 深二选一，经应用 vuex store 设置）。两种情况主题变化后都会写回共享 cookie `viaai_theme`。
- 隐藏「⋮」下拉里的语言切换项。

## 页脚

上游页脚 `© 2024-年份 Designed by SanyueQi for You!` 由 `viaai-nav.js` 的 `renderFooter` 替换为 `© 年份 AI之路 · viaai.si`（非中文显示 `AI Road`，`viaai.si` 链到主站对应语言），并去掉右边的传送门（飞机）图标和链接（后台「页脚传送门链接」配置因此不再生效）。上游页脚结构变了就什么都不改。原项目是 MIT 协议，保留 `LICENSE` 即可。

## Logo

- 用主站同一张图 `viaai/overlay/viaai-logo.png`（400×80，图标 + “AI之路”，来自 `si.viaai/public/logo.png`；主站换 logo 时在这里同步替换，并把 `viaai-nav.js` 里的 `LOGO_SRC` 的 `?v=` 加 1）。
- 尺寸：左上角固定的 logo 桌面 200×40、手机 150×30，垂直中心与右上角栏对齐；深色模式用与主站相同的滤镜。管理后台等非固定位置的方形小 logo 只显示图标部分。
- 链接指向主站（当前语言）。后台「图床Logo」（`logoUrl`）和「Logo跳转链接」（`logoLink`）配置因此不再生效：`renderLogo` 会把 Vue 改回去的 `src` / `href` 再改回来。

## 上传页大标题

上传页中间的大标题（“图床名称 ImgHub”，`.upload-home .header h1.title`）由 `viaai-nav.js` 的样式隐藏（上游代码已压缩，不改源码）。登录页标题（`.login-title`）不受影响。

# viaai.si 站群定制（imgbed.viaai.si）

本仓库是上游 [MarSeventh/CloudFlare-ImgBed](https://github.com/MarSeventh/CloudFlare-ImgBed) 的 fork，每天自动同步上游。
为避免同步冲突，站群定制全部放在这里，由 `scripts/patch-dist.mjs` 在部署时重新应用到 `frontend-dist/`（幂等）。

| 内容 | 位置 |
|---|---|
| 补丁脚本（index.html 元数据 / canonical / OG / 图标 / 注入导航，重新生成 .gz） | `scripts/patch-dist.mjs`，`npm run patch:dist` |
| 站群统一导航栏（右上角一排「菜单▾ 语言▾ 主题」，与左上角 logo 水平对齐；菜单与主站一致） | `viaai/overlay/viaai-nav.js` |
| 共享 cookie（`viaai_lang`、`viaai_theme`）→ 图床语言 / 主题（只读） | `viaai/overlay/viaai-init.js` |
| 界面语言包（hi / es / fr / pt / ru / ja，只覆盖上传页、登录页等用户可见文案）与注入脚本 | `viaai/locales/*.json`、`viaai/overlay/viaai-i18n.js` |
| robots.txt、favicon、apple-touch-icon、og.png | `viaai/overlay/` |
| 部署时自动执行 | `.github/workflows/deploy-worker.yml` 的 "Apply viaai.si patches" 步骤 |

- 账号：保持独立（管理员账号在后台「安全设置」配置）。
- 品牌文字（站点标题、Logo、页脚等）：在后台「页面设置」配置，不改代码。
- 页脚 / 署名中的上游链接保留（MIT 协议）。
- 上游同步后 `frontend-dist/` 会被覆盖，重新执行 `npm run patch:dist` 并提交即可（部署流程已自动执行）。

## 语言 / 主题与共享 cookie

- 主站及其他六个子站在 `.viaai.si` 下共享 `viaai_lang`（zh/en/hi/es/fr/pt/ru/ja）和 `viaai_theme`（light/dark）。
- `viaai_lang`：图床**只读**，不写、不续期。
- `viaai_theme`：图床**可读可写**。用户在图床右上角切换主题时写回 cookie（`Domain=.viaai.si; Max-Age=30天`，与主站写法一致），其他站随之变化；加载、跟随系统、定时深色等非用户操作造成的变化不写（以 1 秒内是否有点击 / 按键判断）。
- 图床只有中文 / 英文：`zh` → 中文，其余语言一律 → 英文；主题直接对应。
- 同步方式：页面加载时把 cookie 的值写进图床自己的 localStorage（`app-locale`、`vuex.useDarkMode/cusDarkMode`）。只有 cookie 的值相对上次同步变了才覆盖，所以在图床右上角手动切换的选择（只改本站 localStorage）会保留，直到别的站再次切换。
- 左下角菜单的文字跟随图床当前显示的语言（中/英）；跳往其他站的链接在“图床显示的是 cookie 语言的回退”时仍带 cookie 的原语言（如 `ja` → `/ja`）。

## 多语言（与主站一致的 8 种：zh / en / hi / es / fr / pt / ru / ja）

- 应用自带 zh-CN / en；其余语言以 `viaai/locales/<code>.json` 提供，补丁脚本拷到 `frontend-dist/viaai-locales/`。
- `viaai-i18n.js` 在应用挂载后，从 `#app.__vue_app__` 的 provides 里取出 vue-i18n 全局实例，`setLocaleMessage` 注册语言包并切换；语言包里没有的文案（管理后台、设置页）回退到英文。
- 当前语言：`localStorage["viaai-locale"]`。共享 cookie `viaai_lang` 变化时覆盖它（`viaai-init.js`）；不在 8 种之内的语言用英文。图床右上角中/英按钮和左下角菜单底部的语言选择都只改本站设置，不写 cookie。
- 加新语言：翻译 `viaai/locales/<code>.json`（键与 `zh-CN`/`en` 一致，保留 `{name}`、`<em>`、`<br>` 等占位符），把 code 加进 `viaai-init.js` 的 `SUPPORTED` 和 `viaai-nav.js` 的 `LABELS`/`NAMES`，再运行 `npm run patch:dist`。
- 只翻译了用户可见部分（登录、上传、上传设置、历史、链接格式、公开浏览、目录选择等，184 条）。Element Plus 组件自带文案未接入。

## 右上角导航栏

- 位置：固定在右上角，垂直中心与左上角 logo 对齐；上游原有的右上角固定按钮（上传目录、文件管理、「⋮」等）整体下移到它下面（`viaai-nav.js` 里的 `reflow`，按「固定定位、靠近顶部右半边」自动识别，不依赖具体类名）。
- 菜单▾：首页 · 资讯 · 开源 · 导航 · 图床 · 文件 · 关于（与主站一致）。语言▾：中文 / English / 日本語 / Español，只改图床自己的设置。主题：浅 / 深二选一，通过应用的 vuex store 设置，并写回共享 cookie `viaai_theme`。
- 隐藏上游自带的主题按钮（三态循环）和「⋮」下拉里的语言切换项。

## 页脚

上游页脚 `© 2024-年份 Designed by SanyueQi for You!` 由 `viaai-nav.js` 的 `renderFooter` 替换为 `© 年份 AI之路 · viaai.si`（非中文显示 `AI Road`，`viaai.si` 链到主站对应语言），右边的传送门图标保留（链接仍由后台「页脚传送门链接」配置，默认指向上游作者主页）。上游页脚结构变了就什么都不改。原项目是 MIT 协议，保留 `LICENSE` 即可。

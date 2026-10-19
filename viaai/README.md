# viaai.si 站群定制（imgbed.viaai.si）

本仓库是上游 [MarSeventh/CloudFlare-ImgBed](https://github.com/MarSeventh/CloudFlare-ImgBed) 的 fork，每天自动同步上游。
为避免同步冲突，站群定制全部放在这里，由 `scripts/patch-dist.mjs` 在部署时重新应用到 `frontend-dist/`（幂等）。

| 内容 | 位置 |
|---|---|
| 补丁脚本（index.html 元数据 / canonical / OG / 图标 / 注入导航，重新生成 .gz） | `scripts/patch-dist.mjs`，`npm run patch:dist` |
| 站群统一导航（左下角悬浮胶囊，菜单与主站一致，随图床右上角中/英切换） | `viaai/overlay/viaai-nav.js` |
| 共享 cookie（`viaai_lang`、`viaai_theme`）→ 图床语言 / 主题（只读） | `viaai/overlay/viaai-init.js` |
| 界面语言包（目前 ja / es，只覆盖上传页、登录页等用户可见文案）与注入脚本 | `viaai/locales/*.json`、`viaai/overlay/viaai-i18n.js` |
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

## 多语言（zh / en / ja / es，逐步扩到主站的 8 种）

- 应用自带 zh-CN / en；其余语言以 `viaai/locales/<code>.json` 提供，补丁脚本拷到 `frontend-dist/viaai-locales/`。
- `viaai-i18n.js` 在应用挂载后，从 `#app.__vue_app__` 的 provides 里取出 vue-i18n 全局实例，`setLocaleMessage` 注册语言包并切换；语言包里没有的文案（管理后台、设置页）回退到英文。
- 当前语言：`localStorage["viaai-locale"]`。共享 cookie `viaai_lang` 变化时覆盖它（`viaai-init.js`）；cookie 的语言图床还没有时用英文。图床右上角中/英按钮和左下角菜单底部的语言选择都只改本站设置，不写 cookie。
- 加新语言：翻译 `viaai/locales/<code>.json`（键与 `zh-CN`/`en` 一致，保留 `{name}`、`<em>`、`<br>` 等占位符），把 code 加进 `viaai-init.js` 的 `SUPPORTED` 和 `viaai-nav.js` 的 `LABELS`/`NAMES`，再运行 `npm run patch:dist`。
- 只翻译了用户可见部分（登录、上传、上传设置、历史、链接格式、公开浏览、目录选择等，184 条）。Element Plus 组件自带文案未接入。

# 图床 imgbed.viaai.si：技术开发文档

仓库：`log729/si.viaai.imgbed`。本文按 2026-11-03 的 main 代码整理，用于开发接手、扩展和故障排查；接口和命令发生变化时须同步更新本文。

## 1. 上游与站群定制层

本仓库基于 CloudFlare-ImgBed。前端源码主要以已构建的 frontend-dist 形式维护；Functions 提供上传、文件、管理、WebDAV 等功能。另有 Workers 与 Docker/Node 部署适配，不能把它描述成一个只有静态图片的站点。

站群定制尽量在 `viaai/` overlay 和 `scripts/patch-dist.mjs`，不直接反编译修改压缩后的上游 JS。上游同步与本地补丁是两条维护链，更新后必须验证补丁幂等和路由/DOM 兼容。

## 2. 源码地图

| 路径 | 职责 |
| --- | --- |
| `frontend-dist/` | 上游构建的 HTML、JS/CSS 及应用资源 |
| `functions/upload/` | 普通上传、分块与合并 |
| `functions/file/` | 文件读取、路径与图片变换 |
| `functions/api/` | 配置和管理相关 API |
| `functions/webdav/` | WebDAV 接口 |
| `functions/utils/databaseAdapter.js` | KV/D1 元数据适配 |
| `functions/utils/auth/` | 管理员、Token、用户/通行证校验 |
| `viaai/overlay/` | 导航、主题、登录过渡与站群资产 |
| `viaai/locales/` | 额外前端语言包 |
| `scripts/patch-dist.mjs` | 将 overlay/元信息重新应用到 frontend-dist |
| `deploy/worker/` | Functions 路由生成、Worker 入口与配置生成 |
| `deploy/server/` | Node/Docker 运行适配 |
| `test/viaai/` | 定制行为的 Node 测试及依赖桩 |

## 3. 开发与测试

```bash
npm ci
npm run test:viaai
npm run patch:dist
npm start
```

npm start 以 Pages dev 运行 frontend-dist，绑定本地 img_url 与 img_r2，默认端口 8080；需可用 Wrangler。`npm test` 是 Mocha 集成测试，通常需要服务；`ci-test` 会启动服务并等待就绪再跑 Mocha，不能和 test:viaai 混为一类验证。

patch:dist 会改写已跟踪前端文件和 gzip，文档校验不需要执行它。修改 overlay 后才按发布流程应用并检查差异；同一补丁重复执行应不重复插入元信息或脚本。

## 4. 存储与绑定

元数据适配器优先使用 `img_url` KV；未配置时选择 `img_d1` D1。两者均提供时不要假定 D1 生效。文件后端根据渠道配置，R2 绑定名 img_r2，其他上游存储渠道以配置与上传实现为准；元数据与文件本体不是同一层。

上传成功后必须保持文件元数据、索引、目录与渠道实际对象一致。测试渠道变更时分别覆盖上传/读取/删除/分块失败，不在生产批量上传或清理作验证。

## 5. 认证和上传保护

网页普通用户接入统一通行证，管理员后台、API Token 和非浏览器旧客户端仍有各自权限路径。PASSPORT_LOGIN 默认开启，off 是恢复旧登录方式的开关，不是常规测试配置。

通行证会话在 passport.js 校验，上传走 passportUpload 的 guardUpload；匿名不能因为访问码没配置而获准上传。UPLOAD_ALLOWED_USERS 只限制通行证路径，不自动限制管理员或 API Token；通行证不等于管理员权限。

现有上传保护包含 Origin 检查、每用户请求/日额度与上传者记录。限流读后写不是强原子事务，不应承诺高并发严格计数。增加新上传入口必须复用保护，不能只保护首页按钮。

文件访问、管理接口和 WebDAV 要各自检查鉴权范围，不能把上传通过等同于可删除所有文件。图片/文件可能含隐私数据，公开站点与受保护管理页的缓存和 CORS 要分开核对。

## 6. 前端、多语言与后台

前端 overlay 使用共享 viaai_lang/viaai_theme；后台保留上游语言能力，用独立 imgbed_admin_lang，不让后台中英切换覆盖整个站群语言。ADMIN_PATHS 控制定制导航是否显示，新增上游路由需同步检查。

viaai-login 渲染通行证过渡与白名单提示；viaai-nav 管站群导航、主题、页脚和 Logo；i18n 脚本补充上游语言包。DOM 观察与路由事件要幂等，不反复注册监听或重复创建导航。

新增定制尽量局部实现，保留上游许可；源文件与生成产物的关系详见 [站群定制说明](../viaai/README.md)。

## 7. 部署与上游同步

Pages 以 frontend-dist＋Functions 提供服务；Worker 模式先执行 patch-dist、generate-routes 和配置生成，再部署 generated Worker＋静态资产。绑定和 Secret 以 deploy/worker/wrangler.toml 模板及工作流为准。

deploy-worker.yml 监听 main，但任务是否运行还取决于 fork 条件和 Cloudflare Secrets，不能仅凭提交成功声称已发布。Docker 工作流另有上游仓库限定，不代表本站每次提交都发布镜像。

自动上游同步受 breaking update guard 控制；不要绕过公告确认强行同步。上游更新后先验证 overlay、认证边界、文件下载和分块上传，再检查所有生成资源。需要改数据结构时同时核对适配器和现有数据库兼容。

排错：空白页面看资源版本和 overlay 注入；登录后不能上传看 guard/白名单/Origin；上传成功无法读看对象与元数据；修改配置未生效看 KV/D1 选择；Worker 与 Pages 不同行为看 generated routes 和静态资源 fallback。

补充阅读：[仓库说明](../README.md)、[中文说明](../README_zh.md)、[定制层说明](../viaai/README.md)。

## 站群协作与变更边界

- 语言通常为 zh/en/hi/es/fr/pt/ru/ja，中文无语言前缀；各仓库的路由函数、缓存键和页面能力并不完全相同，不能机械套用。
- `viaai_lang`、`viaai_theme` 用于站群偏好，不应存放业务数据或凭证。通行证会话与偏好 cookie 不是同一种数据。
- 密钥只配置在本地未跟踪变量文件或 Cloudflare/GitHub 加密变量；文档列变量名，不写实际值，不复制生产 cookie、API Key 或用户数据做示例。
- 其他仓库的菜单、数据和代码不会随本站提交自动变化。跨站变更应列出依赖，先发布被依赖接口，再发布消费者。
- D1/KV 等套餐额度为账号共用；新增公开查询先评估缓存、索引和扫描行数，不把某个站的预算当成独享。

## 提交与验收

先在独立分支修改，保持锁文件与依赖一致。本文档类变更至少校验相对链接、路径、命令与差异；业务变更还须运行本仓库对应测试和构建。测试期望应来自标准向量或独立计算，不照抄输出。

经 PR 审查和必要检查后合并到 main，再核对实际部署状态。合并、构建成功和正式域名已更新是三个不同状态；具体部署方式见本仓库部署章节。远程迁移、种子覆盖、资源初始化、邮件发送和部署命令具有外部副作用，不属于普通文档校验，不要为验证示例直接执行。

回滚优先用可审查的 Git revert/PR；如涉及数据库，代码回滚不会自动撤销迁移或数据写入，应先备份并制定兼容策略。日志不得记录密码、验证码、明文会话和授权头。

## 用户文件隔离与主动内容（2026-11 安全修复）

- 通行证用户的 `uploaderId` 由服务端认证结果填写，用户提交的路径或 owner 参数不能决定归属。新文件路径位于 `users/<userId>/`，数据库中的归属字段仍是管理授权依据。已有带归属的文件保留原路径；没有归属的旧文件只由管理员维护，不自动认领。
- `/my-files.html` 提供八语言个人文件页，导航菜单可进入。`GET /api/my-files` 在分页、计数前过滤归属，再从数据库复核每项，仅返回展示字段；`DELETE /api/my-files?id=...` 重新读数据库校验归属，并要求同源 Origin。未知文件、他人文件、未归属旧文件均返回 404，不能根据前端显示范围授予权限。该接口拒绝没有个人身份的共享访问码/API Token；管理员通过原有管理后台维护。
- 文件外链 `/file/*` 仍可公开访问。这是管理隔离，不是私有文件保密存储；拥有链接的人可以读取。共享图库、随机图接口不枚举带用户归属的文件；内部列表缓存升级为 v2，避免读到旧的共享枚举结果。目录建议只读取当前用户归属的索引项。
- 分块初始化保存 ownerId；上传、合并、清理都先检查会话归属，不能把校验失败送入会删除其他会话的异常清理分支。渠道来自会话，客户端后续不能替换。旧的无归属分块会话不能被通行证用户续传，应重新上传。
- HuggingFace 直传签发一小时的服务端票据，绑定 owner、fullId、存储路径、哈希、大小和渠道。提交必须匹配票据；multipart 完成地址另绑定随机 ticket 和原始目标地址。升级前已签发但未完成的直传需重新初始化。KV TTL 与显式过期时间均生效；D1 依靠显式过期检查，不依赖 KV TTL。
- 管理员必须配置密码；未配置或只配置用户名时，管理员认证关闭且登录接口返回 503，不再创建免密管理员会话。新实例先配置 `BASIC_PASS`（可配 `BASIC_USER`）再登录配置后台。修改生产变量前先核对当前管理员配置来源。
- 仅 MIME 白名单内的常见栅格图片、音视频允许 inline；HTML、SVG、XML、PDF 和未知类型按附件下载。文件响应统一加 `nosniff` 与 `CSP: sandbox; default-src 'none'; base-uri 'none'; form-action 'none'`，移除 Set-Cookie。HEAD、Range、缓存命中以及已存在文件同样受保护。`fetchRes` 代理也使用此策略，不能透传上游 Cookie。白名单策略变更必须同时测试 Pages/Worker/服务端适配层，Worker 生成器负责补强旧缓存命中。
- 如正式站点在 Worker/Functions 外还设置了缓存 HTML/SVG 响应的 CDN 规则，发布时需要清理那一层旧文件响应缓存；此代码不能改写绕过应用执行的历史响应。

## 遥测边界

默认关闭遥测，移除向上游预置 Sentry 项目发送数据的 SDK。只有管理员明确启用、运营者配置自己的 `SENTRY_DSN`、且 `disable_telemetry` 不为 `true` 时才发送。`disable_telemetry=true` 始终覆盖数据库开关；`sampleRate` 取 0–1，默认 0.001。

发送体由封闭的固定字段构造：随机事件 ID、时间、固定文案、HTTP 方法、固定路由分类（upload/manage/other）、状态码和耗时。不会传递 Request、环境变量、Cookie、Authorization、自定义请求头、完整 URL、路径参数、查询参数、请求体、CF/IP 信息、异常消息/堆栈或用户信息。新加遥测不能直接把对象交给第三方 SDK，也不能把任意日志作为附件。既有远端历史事件不属于本次代码清理范围。

回归入口：`npm run test:viaai`；安全用例在 `test/viaai/security.test.mjs`，包含 KV、真实 SQLite 支撑的 D1 适配器和生成 Worker 路由。生成前端与路由：`npm run patch:dist`、`node deploy/worker/generate-routes.js`。本地浏览器验收应覆盖八语言、移动端、删除确认和未登录提示；不用真实账号或生产文件做破坏性测试。

# 内置 MCP 服务改动计划

## 目标与基线

让 AI 客户端通过 MyBrowser 打开后台标签页、读取页面、操作 DOM、执行 JavaScript 和截图。服务默认关闭，只在本机监听，开启后使用令牌鉴权。支持 Claude Code、Cursor、VS Code、自定义程序，并通过 stdio 转接脚本支持 Claude 桌面版。

工作分支为 `feat/mcp-server`，基于 2026-11-07 获取的 `origin/main`，基线提交为 `9f58529a1e2755ca1bc41b340be77d440386facc`。本次只制定计划，不提交、不推送、不实现功能。已有 `.vscode/settings.json` 和 `design/` 改动不纳入此次功能。

基线已通过 `pnpm run typecheck` 和 `pnpm run vite:build`。原方案提到的 101 项冒烟测试及重启测试尚未在仓库找到，不能视为已有可运行的验收基础。

## 标签页访问范围（已确认）

用户于 2026-11-07 确认：AI 可以列出并操作所有标签页，包括用户手动打开的标签页。`list_tabs` 返回全部标签页，并标明哪些由 AI 创建；页面类工具对任意有效标签页编号均可操作。设置面板和 README 须明确提示：开启后 AI 可读取和操作所有已打开页面，包括已登录的页面。

AI 创建的标签页默认在后台打开，显示 AI 标记。所有针对既有页面的工具必须指定标签页编号，不默认操作当前页面。

## 第一阶段：技术预验证

先建立独立的本地测试网页和临时用户数据目录，验证后台 webview 的实际行为。比较当前 `display: none` 与保持尺寸的叠放布局，检查元素位置、可见文字、截图、懒加载、页面定时器和切换标签页时的加载次数。补充窗口最小化、恢复、两种布局及设置遮罩场景。不能把 `visibility: hidden` 当作已验证方案；只有实际通过检查的方式才能用于实现。若需要调整后台节流策略，同时记录 CPU 和资源占用影响。

若通用叠放方案影响普通标签页，再验证仅对 AI 标签页保留渲染的可行性。若仍无法满足后台截图和定位要求，记录证据并重新确定渲染方案，不能以空白截图或临时抢占前台作为完成标准。涉及功能范围取舍时交由用户决定。

在独立实验目录验证 `@modelcontextprotocol/server@2.4.0` 的 CommonJS、原生 HTTP 接入、无会话模式和 JSON 应答接口，跑通初始化、工具发现及工具调用。确认所需适配包和 `zod` 版本后再更新项目依赖。若新版无法满足需求，按原方案验证 `@modelcontextprotocol/sdk@1.32.2`，记录具体原因。两个指定版本及新版 CommonJS 导出已通过 npm 元数据确认，接口兼容性仍需实验。

本阶段产出可复现的验证脚本和结论。后台渲染或协议最小链路未通过时，不扩展实现全部工具。

### 第一阶段结论（2026-11-07）

后台渲染实验脚本在 `spike/webview-render/`，运行 `node_modules/.bin/electron spike/webview-render/main.js`，可用 `SPIKE_MODES`、`SPIKE_REPEAT` 选择方式和轮数。窗口 800×600，后台页面每 2 秒采样一次：

| 方式 | 视口 / 百分比布局 | visibilityState | 懒加载 | rAF | 截图 | 切换后重载 |
|---|---|---|---|---|---|---|
| 现状 `display: none` | 0×0 / 0 | hidden | 不触发 | 停止 | 空图 | 否 |
| 叠放 + `visibility: hidden` | 正常 | hidden | 不触发 | 停止 | 报 `UnknownVizError` | 否 |
| 移到屏幕外 | 正常 | hidden | 不触发 | 停止 | 报错或超时 | 否 |
| 叠放 + 层级（后台被前台盖住） | 正常 | visible | 触发 | 正常 | 正常 | 否 |
| 按需：平时 `display: none`，工具执行时临时放到前台页下方 | 正常 | visible | 触发 | 正常 | 正常 | 否 |

- `visibility: hidden` 和移到屏幕外都不可用，证实不能直接采用原方案。
- 绝对定位元素在 `display: none` 下仍能读到非零位置，容易误判；判断渲染是否可用要看视口、百分比布局和截图。
- `backgroundThrottling=no` 只恢复定时器频率，不解决视口为零和截图问题。
- 叠放 + 层级让所有后台标签页按前台运行（定时器、动画、视频持续），资源占用未量化；最小化时截图仍返回图片，但很可能是旧画面，未验证。
- 按需方式：从开始渲染到视口可用约 15 ms，到截图可用 50–100 ms（3 轮一致）；恢复隐藏后页面不重载。全量运行中有一次按需渲染未生效，原因未查明，实现时需等待 `visibilityState === 'visible'` 并在超时后重试一次。
- 按需方式在窗口最小化时能取得视口，但截图超时，需要返回明确错误。
- Electron 45 没有 `incrementCapturerCount`。
- 尚未在真实应用的经典 / 侧栏布局和设置遮罩下验证，留到第三阶段接入后补测。

用户于 2026-11-07 确认采用按需方式：普通标签页行为和资源占用不变，只在工具执行期间（按标签页引用计数）临时渲染目标页。代价是页面在工具执行期间会收到 `visibilitychange`，以及窗口最小化时无法截图（返回明确错误）。

协议实验在 `spike/mcp-sdk/`，`npm install` 后先 `npm start` 再 `npm test`：

- `@modelcontextprotocol/server@2.4.0` 的 CommonJS 构建可在 Node 24 和 Electron 45 主进程中直接 `require`，实际安装的 `zod` 为 4.6.7。不需要退回 `@modelcontextprotocol/sdk@1.32.2`。
- 不需要 express 或 `@modelcontextprotocol/node`：用约 20 行代码把 `node:http` 请求转成 Web `Request`，交给 `createMcpHandler(...).fetch`。
- SDK 同时支持 2026-07-28 新协议和 2025 版协议。当前 Claude Code 走新协议（`server/discover`、`subscriptions/listen`），老客户端走 `initialize` 握手。
- 新协议设 `responseMode: 'json'` 后普通请求返回 JSON；`subscriptions/listen` 始终是长连接 SSE，关闭服务时必须调用 `handler.close()` 并断开连接。
- SDK 内置的 2025 版无会话回退只返回 SSE。改为用 `isLegacyRequest` 分流，手动创建 `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`，即可返回 JSON。
- 已验证：初始化、`initialized` 通知返回 202、工具发现、工具调用、图片内容、参数校验错误自动转为 `isError` 结果、无令牌 / 错误令牌 401、带 Origin 403、GET 405、超大请求体被拒。
- 用临时配置 `claude -p --mcp-config spike/mcp-sdk/mcp-config.json --strict-mcp-config` 让 Claude Code 实际调用了 echo 和 png 工具，均成功，未改动用户的 Claude Code 配置。
- 影响第五阶段：stdio 转接脚本收到 `text/event-stream` 应答时，要逐条解析 SSE 事件写到 stdout，不能只处理 JSON。

## 第二阶段：服务配置与 HTTP 接口

新增 `src/main/mcp/config.js` 和 `server.js`，由主进程管理开启状态、端口和令牌。配置保存在应用用户数据目录的 `mcp.json`，首次开启时生成随机令牌，写入采用原子替换，错误时返回明确状态，避免静默丢失配置。设置面板读取主进程状态，不另存一份相互冲突的开关值。

默认监听 `127.0.0.1:17345/mcp`。校验 Host、提供的 Origin 和 Bearer 令牌，不向任意网页开放 CORS；无 Origin 的本机客户端仍须鉴权。HTTP 请求体和工具结果设定大小上限，令牌不进入日志。测试无令牌、错误令牌、错误 Host、非允许 Origin，以及开启跨域的网页请求。网页来源检查不能代替令牌鉴权。

明确处理端口冲突、配置损坏、重复开启、快速切换开关和应用退出。关闭时停止接受请求，清理连接和待处理任务；重启恢复开关状态。macOS 窗口关闭后应用仍运行以及窗口重新创建时，服务必须能返回明确的窗口不可用状态并恢复连接。

### 第二阶段进度（2026-11-07）

已完成 `src/main/mcp/{config,server,factory}.js` 和 `src/main/ipcs/mcp.ipc.js`，接入 `main.js`，依赖固定为 `@modelcontextprotocol/server@2.4.0`、`zod@4.6.7`。

- 配置损坏或端口非法时进入错误状态，不覆盖原文件；用户修好文件后可直接在界面重试。
- 任何带 Origin 的请求一律 403（包括 `null` 和本机地址），不返回 CORS 头。
- 令牌用常量时间比较，不写入日志；`mcp.json` 以 0600 权限原子写入（Windows 上权限位无效）。
- 启停操作串行执行；关闭时中止 SDK 长连接并断开所有 socket；退出时 `before-quit` 同步断开。
- IPC 只接受当前主窗口的请求；连接配置（含令牌）按需获取，不随状态广播。
- `pnpm run test:mcp`（`test/mcp/server.test.js`，12 项）覆盖握手、鉴权、Host、Origin、路径、类型、大请求体、首次开启、重启恢复、快速切换、端口占用、配置损坏和关闭连接，全部通过。
- 用 `test/mcp/launch-app.js` 以临时用户数据目录启动真实应用，HTTP 握手和 Claude Code 新协议连接均成功（尚无工具）。
- 未完成：新协议 `subscriptions/listen` 长连接在关闭服务时被中断的自动化测试；macOS 窗口重建场景（无 macOS 环境，且依赖第三阶段的窗口状态）；打包产物验证留到第六阶段。

## 第三阶段：标签页注册与 IPC

扩展 `register-webview-handler` 载荷，登记标签页编号与 webContents 的对应关系，校验发送者为当前主窗口及目标 webContents 的归属。重复 `dom-ready` 注册应幂等；销毁、崩溃、窗口重建时清理旧映射。

新增 `src/main/mcp/tabs.js`、`src/main/ipcs/mcp.ipc.js` 和 `src/renderer/helpers/mcp.helper.ts`。主进程通过请求编号关联界面应答，设置超时并校验来源。界面尚未就绪时返回明确错误，不无限等待。preload 只放行必要通道，并提供监听清理能力。

扩展 `WebviewHelper.createNewTab`，支持后台创建和 AI 标记，返回标签页编号。`open_tab` 至少等待该标签页完成注册、可被后续工具寻址后才成功返回；首次加载失败或超时要给出标签页编号及实际状态，避免客户端重复调用后留下无法追踪的标签页。

保留现有至少一个标签页的行为，关闭最后一个标签页时返回明确错误，不报告虚假的成功。处理手动关闭与工具操作之间的竞争，防止已销毁页面、旧请求或重建窗口中的重复编号指向错误页面。列表不按来源过滤；每一个页面工具仍须校验标签页编号有效且对应的 webContents 未销毁。

### 第三阶段进度（2026-11-07）

已完成 `src/main/mcp/{tabs,tools,errors}.js`、`src/renderer/helpers/mcp.helper.ts`，并实现 `list_tabs`、`open_tab`、`close_tab`、`activate_tab` 四个工具。

- 对外标签页编号直接用网页视图的 webContents id，整个运行期间不重复；界面重载或窗口重建后，旧编号返回 `tab_not_found`，不会指向新页面。
- 登记校验发送者是当前主窗口，且网页视图的 `hostWebContents` 是主窗口；网页视图销毁时自动移除。
- 在 `did-attach` 和 `dom-ready` 都登记（幂等）。只在 `dom-ready` 登记时，被浏览器禁止的端口（`ERR_UNSAFE_PORT`）永远不会登记，Claude Code 实测中发现并修复。
- 首次加载失败发生在登记之前，主进程监听不到，以界面记录的 `loadError` 为准。
- 界面请求有 5 秒超时；界面重新加载或窗口关闭时，进行中的请求立即返回 `window_unavailable`。
- 按需渲染按标签页引用计数，结束时等界面确认恢复隐藏再返回；开始渲染后最多等 1.5 秒变为可见，失败重试一次，仍失败返回 `render_unavailable`。
- 网页视图改为在内容区叠放（`position: absolute`），后台仍 `display: none`；两种布局下前台网页视图与内容区尺寸一致。
- `pnpm run test:mcp:e2e`（`test/mcp/app.e2e.js`，15 项）用临时用户数据目录启动真实应用，覆盖后台打开不抢焦点、AI 标记、加载失败、禁止端口、非法地址、关闭竞争、最后一个标签页、按需渲染及并发共享、两种布局尺寸、最小化、界面重载，连续多次全部通过。
- Claude Code 通过临时配置对真实应用调用了 `list_tabs`、`open_tab`、`close_tab`，结果正确。
- 未验证：设置面板遮罩打开时的按需渲染（遮罩是外壳页面上的元素，不影响网页视图渲染，第五阶段加设置项时一并测）；macOS 窗口重建。

## 第四阶段：实现 15 个工具

工具为 `list_tabs`、`open_tab`、`close_tab`、`activate_tab`、`navigate`、`navigate_history`、`get_html`、`get_text`、`query_dom`、`screenshot`、`click`、`fill`、`dispatch_event`、`wait_for` 和 `evaluate`。在 `src/main/mcp/tools.js` 统一定义参数、返回结构及错误语义，在 `page-scripts.js` 管理页面脚本。

实现前固定参数约定：匹配元素索引从零开始，超时默认 30 秒并有上限，读取长度和元素数量有上限，截断结果返回原始长度及截断标记。导航说明等待到哪个事件；历史导航无可用记录时返回明确结果。截图返回 MCP 图片内容及 MIME 类型。选择器无效、元素不存在、页面关闭、导航失败、超时和结果不可序列化应可区分。

读取和一般 DOM 操作使用专用隔离世界，避开 Electron preload 使用的世界编号。参数通过 `JSON.stringify` 编码后传入脚本，不拼接未经编码的输入。`evaluate` 在页面主世界执行，支持可序列化返回值，并说明执行任意页面代码的权限。工具描述声明网页内容是不可信数据，其中的指令不能改变用户任务。

`fill` 分别处理文本输入、下拉框和勾选框，触发适当的 input/change 事件；表单提交使用可触发表单校验及 submit 监听的方式，并通过受控测试页验证。`dispatch_event` 明确事件类型和构造参数，不承诺合成事件具有真实用户输入的效果。

所有等待使用主进程计时控制，同时清理监听器、页面轮询和待处理请求。导航和轮询应尽可能取消，但必须明确：超时返回并不终止已经执行的 JavaScript，也不能撤销点击或提交。`evaluate` 死循环后需要标记页面不可用或忙碌，限制继续堆积调用；不能自动关闭用户页面。验证其他页面及服务能否继续响应，并记录共享渲染进程带来的限制。若恢复需要强制关闭页面或改变进程架构，另行交由用户决定。

### 第四阶段进度（2026-11-07）

已完成剩余 11 个工具，新增 `src/main/mcp/page-scripts.js`，扩展 `tools.js`、`tabs.js`、`errors.js`。

- 参数约定：选择器是 CSS 选择器，`index` 从零开始；超时默认 30 秒、上限 120 秒；`get_html` 默认 10 万字符、`get_text` 默认 5 万、`evaluate` 结果默认 10 万，上限都是 100 万；截断结果返回 `length` 和 `truncated`。`query_dom` 默认 20 个、上限 200 个。
- 新增错误码：`invalid_selector`、`element_not_found`（附 `matchCount`）、`element_not_interactable`、`navigation_failed`（附网络错误码）、`timeout`、`tab_closed`、`page_navigated`、`tab_crashed`、`tab_busy`、`script_error`、`not_serializable`、`result_too_large`、`window_minimized`、`cancelled`。
- 导航：`waitUntil` 可选 `commit`（did-navigate）、`domcontentloaded`（dom-ready）、`load`（did-finish-load，默认）；同文档跳转在提交时完成。超时不停止加载。没有历史记录时 `navigate_history` 返回 `navigated: false`。只认新文档提交后的 load，避免上一个页面迟到的 load 事件让导航提前返回（测试中发现）。
- 页面脚本在隔离世界 1001 执行，参数用 `JSON.stringify` 编码；`evaluate` 和 `wait_for` 的 `expression` 在主世界。`evaluate` 先在主进程用 `vm.Script` 只做语法检查，接受表达式或带 `return` 的语句，在页面里转成 JSON 字符串后返回。
- 需要布局的工具（`get_text`、`query_dom`、`screenshot`、`click` 的真实点击、`evaluate`、等可见性或文字的 `wait_for`）走按需渲染；`get_html`、`fill`、`dispatch_event`、`click` 的 `dom` 方式不渲染。
- `click` 默认用 `sendInputEvent` 发真实鼠标事件（页面看到 `isTrusted: true`）：先滚动到视口内、做命中检查，被遮挡、不可见、禁用时返回 `element_not_interactable`；发送后确认元素收到 click。测试中发现两个问题并已修复：真实点击会把外壳页面的键盘焦点抢到后台网页视图上（用户正在地址栏输入会被打断），现在点击后会把焦点还给原先的元素；页面刚显示时鼠标事件偶尔被丢弃，现在先等两帧再发送。
- `fill` 在隔离世界赋值，走原生 setter，测试页用实例级 setter 模拟 React 的值追踪，确认框架能识别修改。提交用 `requestSubmit()`，结果报告校验是否通过及第一个不合法的字段。不支持文件选择框。
- 截图默认缩放到 CSS 像素（300% 缩放下不会大三倍），`fullResolution` 保留设备像素；最长边 4096，base64 超过 10 MiB 返回 `result_too_large`。不支持整页长截图。
- 卡死处理：脚本超时或被取消后仍在运行时，标签页标记为忙碌，之后的页面操作直接返回 `tab_busy`，不再堆积；脚本结束、页面跳转或渲染进程结束后自动解除。不自动关闭或结束页面。实测 `while (true) {}` 时，服务、界面、另一站点的标签页，以及同站点的另一个标签页都照常响应；卡死的标签页可以正常关闭。同站点是否共用渲染进程由 Chromium 决定，测试只记录不断言。
- 修复按需渲染的偶发失败（第一阶段未查明的那一次）：失败时带回的现场显示窗口可见、有焦点，外壳页面却是 `hidden`，即 Windows 上 Chromium 的窗口遮挡推算误判，整个窗口停止渲染。`main.js` 在 Windows 上关闭 `CalculateNativeWinOcclusion`，只有最小化才算不可见。修复前全量测试约每三轮失败一次，修复后连续 11 轮通过。代价是窗口被其他程序挡住时当前标签页继续渲染，资源占用未量化。渲染失败的错误里保留了页面、外壳和窗口状态。
- 测试：公共部分提取到 `test/mcp/harness.js`，受控测试页在 `test/mcp/fixtures/`，新增 `test/mcp/page.e2e.js`（18 项）；`launch-app.js` 增加 `cover` / `uncover`（用另一个窗口盖住主窗口并拿走焦点）。`pnpm run test:mcp:e2e` 现在运行 `test/mcp/*.e2e.js` 共 33 项。
- Claude Code 通过临时配置对真实应用依次调用 `open_tab`、`fill`（含提交）、`evaluate`、`navigate`、`get_text`、`query_dom`、`click`、`screenshot`、`navigate_history`、`close_tab`，结果正确，模型能看到截图内容。
- 未做或未验证：用外部程序窗口遮挡的自动化测试（没能稳定把记事本置顶）；关闭遮挡推算后的资源占用；整页长截图；iframe 和 Shadow DOM 内的元素（选择器只查主文档）；键盘输入类工具不在 15 个工具范围内。

## 第五阶段：设置与客户端接入

在“允许跨域”下增加“AI 接口（MCP）”开关，展示实际服务状态、监听地址及启动失败原因。连接弹窗分别提供 Claude Code 命令、Cursor JSON、VS Code JSON、Claude 桌面版 stdio 配置，避免混用不同客户端的配置结构。开关旁明确提示：开启后 AI 可读取和操作所有标签页，包括已登录的页面。

新增无外部依赖的 `src/main/mcp/stdio-bridge.js`，使用应用自身 exe 的 Node 模式启动，通过 `ELECTRON_RUN_AS_NODE=1` 运行。明确开发环境和打包环境的配置发现方式，并支持显式指定配置路径，供临时测试目录使用。验证安装版、便携版和包含空格的路径，不能仅凭默认目录推断用户数据位置。

转接脚本支持逐行 JSON-RPC、请求编号、初始化、无编号通知、HTTP 202 空应答及协议头传递。stdout 仅输出协议消息，诊断写 stderr。服务未运行、未开启、鉴权失败及网络中断时给出适当错误，不自动启动应用。通过 `extraResources` 打包脚本，并验证发布包中的依赖和可执行文件路径。

### 第五阶段进度（2026-11-07）

- 设置改为两级：菜单（主题三选一、常用操作、“更多设置”、AI 接口状态行）+ 设置页。设置页按 `design/settings-page.html` 实现，作为内置标签页（`mybrowser://settings/<分区>`，`Ctrl+,`）显示在内容区，由外壳绘制，不进 `list_tabs`，`close_tab` / `activate_tab` 对它返回 `tab_not_found`。
- 开关状态只以主进程为准：界面通过 `mcp-get-status` / `mcp-status-changed` 显示未开启、正在启动、运行中、启动失败（含原因与“重试”）。权限提示常驻在开关下方。
- 连接弹窗五个客户端各自格式；令牌只在打开弹窗时通过 `mcp-get-connection` 获取，默认打码。桌面版配置为 `process.execPath` + `stdio-bridge.js --config <mcp.json 绝对路径>` + `ELECTRON_RUN_AS_NODE=1`，不含令牌。
- `src/main/mcp/stdio-bridge.js` 已实现：零依赖，每次请求重读 mcp.json，也接受 `MYBROWSER_MCP_CONFIG` / `MYBROWSER_MCP_URL` / `MYBROWSER_MCP_TOKEN`；请求并发转发；JSON 与 SSE 应答逐条写 stdout；202 不输出；记住 `mcp-session-id` 和协商的协议版本；连不上、令牌错、未开启时给带 id 的请求回 JSON-RPC 错误。`package.json` 的 `extraResources` 已加入 `mcp/stdio-bridge.js`。
- 测试：`test/mcp/bridge.test.js`（5 项，真实服务 + 子进程）、`test/mcp/settings.e2e.js`（9 项：打开/去重、不进列表、状态与地址、弹窗内容、开关、端口占用与重试、搜索、跟随系统主题、关闭）。全量 `test:mcp` 17/17、`test:mcp:e2e` 42/42 通过，typecheck 与 vite build 通过。
- 未验证：打包产物里的转接脚本路径和安装版/便携版/含空格路径（留到第六阶段打包时测）；Claude 桌面版真实连接；焦点在网页视图里时按 `Ctrl+,`（只改了预加载脚本的快捷键白名单，自动化没覆盖）；设置面板遮罩下的按需渲染仍未补测。

## 第六阶段：验证与交付

将本地测试页面和集成脚本纳入仓库，提供明确运行命令。测试使用临时用户数据目录、独立端口和清理逻辑，不读取或修改真实浏览器会话。先定位原有 101 项冒烟测试及重启测试的位置；找不到时明确记录缺失，并依据现有功能补建回归检查，不能声称原测试已通过。

自动化覆盖协议初始化与发现、鉴权、标签页权限、后台创建不抢焦点、读取截断、元素操作、表单提交、导航、等待、截图、关闭竞争、超时、服务开关和重启。回归检查覆盖经典与侧栏布局、快捷键、地址栏、书签、跨域开关及标签页切换不刷新。

完成 `pnpm run typecheck`、`pnpm run vite:build`，再对 Windows 打包产物重复核心 HTTP 和 stdio 调用。真实客户端调用改用 Cola（用户 2026-11-07 指定，暂不调用 Claude）：在 `~/.cola/mcp/servers.json` 里加入 MyBrowser 的 HTTP 地址和令牌，由 Cola 通过 `mcp__mybrowser__*` 工具实际调用，测完移除该条目。Cursor、VS Code 和 Claude 桌面版分别记录配置验证和真实连接验证结果；未实际验证的客户端不能宣称连接已通过，其他平台也不能由 Windows 测试结果代替。

交付包括实现代码、可复现测试、验证记录和 README 接入说明。README 写明配置位置、权限范围、令牌、端口修改方法、合成事件限制和故障排查。是否提交、推送或创建 PR 等后续动作等待用户指示。

### 第六阶段验证记录（2026-11-07，Windows）

- 补测：菜单遮罩打开时前台/后台标签页工具照常工作、设置页在前台时网页仍可渲染读取、焦点在网页里按 `Ctrl+,`（去掉 `preload.js` 白名单里的 `,` 后该项失败，确认测试有效）。
- 101 项冒烟测试与重启测试在仓库和提交历史里都找不到，未声称其通过；按现有功能补建 `test/mcp/regression.e2e.js`（7 项：地址栏、网页内快捷键、按键交给网页、书签、跨域开关、切换标签页/布局不刷新、重启后设置保留）。
- 测试稳定性：本机动态端口从 1024 起，偶尔分到 fetch 禁用端口导致 `bad port`；`harness.js` 已跳过这些端口。
- 打包（electron-builder 26.18.0，输出到临时目录）：`app.asar` 内 `@modelcontextprotocol/core|server`、`zod`、`node-slogger` 可解析，`resources/mcp/stdio-bridge.js` 存在。含空格路径下 `win-unpacked` 的 HTTP 与 stdio（应用自身 exe + `ELECTRON_RUN_AS_NODE`）均通。
- 便携版：每次启动解压到 `%TEMP%` 下的临时目录，外壳以 `ELECTRON_RUN_AS_NODE` 运行时不转发 stdout，不能当 stdio 命令。改为把脚本复制到 `<userData>/mcp-bridge/` 并用本机 `node` 运行，设置页提示；`test/mcp/portable.e2e.js` 覆盖。便携版 HTTP 实测通过。
- 安装版 NSIS 未实际安装（需要管理员权限并写注册表），其安装后结构与 `win-unpacked` 相同。
- Cola 真实客户端（Cola staging 版的配置在 `COLA_DATA_DIR/mcp/servers.json`，不是 `~/.cola`）：开发版与重新打包后的 `win-unpacked` 上 15 个工具均实际调用成功，测完已移除配置。实测发现并修复三处：
  - 窗口最小化时，需要渲染的工具（`get_text`、`query_dom`、`screenshot`、`click`、`evaluate`、等可见/文字的 `wait_for`）原先等待后报 `render_unavailable`（“页面可能卡死”），现在立即返回 `window_minimized`。不需要渲染的工具照常工作。
  - 客户端并发发出多个真实点击时互相覆盖点击确认标记和焦点记录，误报“没有收到 click”；真实点击现在全局排队。
  - 未设背景色的网页截图是透明底，JPEG 变成黑底；编码前已叠到白底。
  - 三处各有端到端测试，去掉修复时对应测试失败。
- 已知行为（未改）：同一标签页并发两次 `navigate` 时，前一次被打断后跟随新的导航结果返回，返回的 `url` 是实际落点。
- 最终结果：`test:mcp` 17/17，`test:mcp:e2e` 54/54，typecheck 与 vite build 通过。
- 未验证：Claude Code / Claude 桌面版 / Cursor / VS Code 的真实连接（只核对了配置格式）；macOS 与 Linux。

## 预计涉及文件

主进程新增 `src/main/mcp/{config,server,tools,tabs,page-scripts}.js`、`src/main/mcp/stdio-bridge.js` 和 `src/main/ipcs/mcp.ipc.js`，修改 `src/main/main.js`、`src/main/ipcs/index.js`、`src/main/ipcs/webview-handler.ipc.js` 和 `src/main/main-preload.js`。

界面新增 `src/renderer/helpers/mcp.helper.ts` 和连接配置弹窗，修改 `src/renderer/helpers/webview.helper.tsx`、`src/renderer/components/content-area/webview.tsx`、`src/renderer/components/tabs-container/tab.tsx`、`src/renderer/components/settings/settings-panel.tsx`、必要的类型声明和 `src/styles/components.css`。

依赖及交付修改 `package.json`、`pnpm-lock.yaml` 和 `README.md`，新增测试脚本、测试网页及验证记录。具体测试目录在确认现有测试来源后确定。

## 本次不包含

不实现真实键盘鼠标输入、跨域 iframe 内部操作、Shadow DOM 穿透、控制台与网络采集，以及令牌重置或端口修改界面。若预验证发现这些边界需要调整，先更新计划并取得涉及产品取舍的明确决定。

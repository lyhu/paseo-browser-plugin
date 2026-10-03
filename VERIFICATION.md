# 验证记录

环境：macOS mini，系统 Google Chrome。当前桌面 daemon 0.10.2；另在 `.runtime/` 中安装 CLI/server 0.10.3 并以独立 `PASEO_HOME`、127.0.0.1:6791 启动验证，没有替换或重启用户 daemon。

## 已通过

- `npm run typecheck`：新版分离 client/server/shared 入口与严格 TypeScript。
- `npm test`：实际启动 macOS Chrome，验证 JPEG、点击、中文输入、退格、滚动、WebSocket/SSE、弹出标签、隔离与持久化的工作区存储。页面错误提示、历史返回、相同帧省略与关闭最后标签测试也已通过。
- 0.10.2 本地 daemon 插件加载和 RPC：`running`，1280×800 画面及中文输入。
- 0.10.2 公网中继 E2EE RPC：实际经已配置的公网中继传输操作及 JPEG，没有直连代替中继。最后一次复测返回 `pass:true`、远程页面标题包含中文输入、WebSocket echo 与 SSE ready；362,034 字节 JPEG 经中继往返约 768ms（单次观测，不是性能保证）。
- 0.10.3 隔离 daemon 插件加载和 RPC：`running`，中文输入与截图通过。
- 生产依赖安装：复制源文件到仓库外的 `/tmp` 隔离目录（避免从开发目录解析依赖），执行 `npm ci --omit=dev`，仅 29 个运行依赖；安装为 `browser-prod-isolated-test` 后 `running`，实际浏览器 RPC 通过，包括 362,034 字节 JPEG。
- 官方 0.10.3 Web UI 实际操作：出现 Remote Browser workspace 标签；点击保存、键盘 `abc` + Backspace、粘贴 `中文UI`、底部发送 `追加文本`，远程页面标题证实得到 `ab中文UI追加文本`；网页弹出标签可切换并滚动 500px，关闭标签后原标签仍保留。

UI 截图及 RPC 截图存于本地忽略目录 `test-results/`。测试进程、profiles、隔离安装都在忽略目录 `.runtime/`，不进入源码提交。

## 目标 8048 网站（2026-10-03 最新复测）

最新中继 RPC 打开 `http://172.29.227.37:8048/#claude-configs` 后，远程 Chrome 标题为 `Hexa-Distill｜代码PR蒸馏平台`，地址转到 `#login`，返回 16,105 字节 JPEG，捕获的页面错误为空。人工查看截图，确认登录表单已清楚显示。登录后配置页尚未验收。

此前一次测试遇到该网站 `assets/index-BQBCV4ws.js` 报 `net::ERR_CONTENT_LENGTH_MISMATCH`，应用根节点为空；最新复测中未再出现。没有修改该内网服务器或尝试登录。

## Pro 实机验收（2026-10-03）

用户在外网 Pro 的 Paseo 中连接 mini，确认出现 Remote Browser 入口，并对原目标地址测试后反馈：“登录页和操作都正常”。这是用户实机确认，独立于 mini 上的自动化测试。

核心需求已验收：外网 Pro 通过已有 Paseo 中继，访问并操作 macOS mini 上 Chrome 加载的内网网页。此次升级与 macOS 适配任务完成；没有据此宣称整个 macOS 桌面、登录后配置页或以下扩展场景均已验证。

## 验证边界与后续检查

- 登录后配置页及具体业务流程尚未单独确认；Pro 到 mini 的操作延迟未量化。
- 新增错误提示及标签切换输入目标修正在官方 UI 的最终复测；原浏览器自动化连接在配对另一 host 时卡住，尚未完成该补充 UI 验证。
- 紧凑界面和暗色主题。
- Linux 实机与原生移动客户端的完整交互不在已通过范围。

自动化测试与 Pro 用户实机确认共同支持核心需求验收。上述补充检查和平台限制继续保留，不计作已通过。

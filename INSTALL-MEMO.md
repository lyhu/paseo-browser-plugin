# Remote Browser 安装备忘

适用场景：外网电脑（例如 Pro）通过 Paseo 公网中继连接内网电脑（例如 mini），在 Paseo 的 Remote Browser 标签中访问和操作内网网站。

## 安装在哪台电脑

| 电脑角色 | 需要安装什么 |
| --- | --- |
| 内网浏览器主机，例如 mini | Paseo daemon、Google Chrome、`browser-tab` 插件 |
| 外网操作电脑，例如 Pro | 兼容的 Paseo 客户端，连接上面的 daemon；无需再安装插件或本插件的 Node 依赖 |
| 另一台要提供内网浏览器的电脑 | 在那台电脑的 daemon 上重新安装插件和 Chrome |

插件按 daemon 安装。网页及请求在 daemon 主机的独立 Chrome 中执行；Pro 只显示画面并发送操作。输入 `http://localhost:3000` 时访问的是 daemon 主机，而不是 Pro。

## 已验证版本与前提

- Paseo daemon 0.10.2、0.10.3；客户端使用兼容的 0.10.x 版本。插件声明支持 `>=0.10.2 <0.11.0`，升级到 0.11 或更高版本前需要重新检查兼容性。
- macOS + Google Chrome 已验证；Linux 的浏览器发现逻辑已实现，但尚未做 Linux 实机验收。
- Node.js **22.12.0 或更高版本**与 npm，供安装运行依赖。`puppeteer-core` 的当前锁定版本要求这个 Node 版本。
- 内网主机本身能访问目标网站，Pro 已能通过 Paseo 配对/中继连接该主机。

## 新的 macOS 内网主机安装

1. 安装并启动 Paseo，安装 Google Chrome。默认 Chrome 路径：
   `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。
2. 确认终端中的 `node`、`npm` 和 `paseo` 可用，并确认 CLI 指向预期 daemon：

   ```bash
   node --version
   npm --version
   paseo daemon status --json
   ```

   如没有 Paseo CLI，可在 Node 环境中安装此次验证的版本：

   ```bash
   npm install -g @getpaseo/cli@0.10.3
   ```

3. 在该 daemon 的 Paseo 设置中打开 **插件 → Enable plugins**。插件是受信任代码，运行于 daemon 主机及客户端，请只安装自己信任的来源。
4. 在内网主机终端执行：

   ```bash
   paseo plugin install https://github.com/lyhu/paseo-browser-plugin --ref main
   paseo plugin ls --json
   ```

   安装会根据 manifest 执行 `npm ci --omit=dev`；`browser-tab` 应显示 `running`。不需要安装 Xvfb、VNC、Fluxbox 或 websockify，也不需要开放网站/VNC 端口到公网。

### 希望保留本地源码时

以下命令在内网主机执行；目录可换成自己的项目目录。目录已存在时使用下一节的更新流程。

```bash
mkdir -p ~/project
cd ~/project
git clone https://github.com/lyhu/paseo-browser-plugin.git
cd paseo-browser-plugin
npm ci
npm run typecheck
paseo plugin install "$PWD"
paseo plugin ls --json
```

CLI 默认管理本机 daemon。多 daemon 环境请先查看 `paseo daemon status --json` 的 home/连接信息，必要时使用 CLI 的 `--home` 或 `--host` 指定目标，避免安装到错误 daemon。

## 在外网 Pro 打开

1. 在 Pro 的 Paseo 连接刚安装插件的内网主机。
2. 选择属于该主机的 workspace。
3. 点击 **新建标签页 → Remote Browser**；也可按 `⌘K` 搜索 **Open remote browser**。
4. 输入完整的 `http://` 或 `https://` 地址，点击 **连接**。
5. 点击远程画面中的控件，测试输入和滚动。中文可以直接粘贴；也可先点远程输入框，再用底部“发送文字”。

这次验收使用的地址：

```text
http://172.29.227.37:8048/#claude-configs
```

该地址只适用于能访问这个内网的 daemon。新的内网环境请替换成自己的目标地址。当前地址在未登录时跳转到登录页，属于网站正常行为。

**Pro 无需重复安装插件。** 若 Pro 自己也要作为另一个远程浏览器主机，让其他设备访问 Pro 的网络，才需要在 Pro 的 daemon 上安装。

## 更新

以 Git 来源安装的插件，在内网主机执行：

```bash
paseo plugin update browser-tab
paseo plugin ls --json
```

以本地源码目录安装的插件，在源码目录执行：

```bash
git pull --ff-only
npm ci
npm run typecheck
paseo plugin reload browser-tab --json
```

本地有未提交修改时，先保存并处理修改，不要强制覆盖。插件重载会关闭它创建的 Chrome 会话；工作区 profile 保留。无需重启整个 daemon。

## 验证与排查

- **没有 Remote Browser**：确认连接的主机正确、进入了该主机的 workspace、插件功能开启且 `browser-tab` 为 `running`。重新连接主机以取得插件贡献，检查客户端版本。
- **找不到 Chrome**：确认默认路径。其他路径可通过 daemon 环境中的 `PASEO_BROWSER_EXECUTABLE` 指定；GUI daemon 通常不会继承当前终端新设置的环境变量。
- **GitHub 下载超时**：检查内网主机的 GitHub/registry 连通性；通过自己已有的代理拉取源码后按本地目录安装。不必修改 Pro 的网络。
- **页面连接失败**：先确认 daemon 主机能访问该网址；面板会显示浏览器网络或 JS 错误。查看插件日志：

  ```bash
  paseo plugin logs browser-tab
  ```

- **会话失效**：点击“重新连接”。没有请求的会话约 30 分钟后退出；不同 workspace 使用独立 profile，最多四个活动会话。
- **网站要求登录**：直接在远程页面登录。Cookie/localStorage 保存在 daemon 的专用 profile 中，默认位于 `~/.paseo/browser-tab/profiles/`；自定义 `PASEO_HOME` 时存于该 home 下。它不会共享主机日常 Chrome 的登录状态。

开发/自动验证在 daemon 主机的源码目录执行：

```bash
npm run typecheck
npm test
npm run test:integration
npm run test:integration -- --relay
```

这些集成测试创建只监听主机 localhost 的测试页，再调用真实插件 RPC。`--relay` 确认公网中继 E2EE 画面和操作传输。最后仍应从外网电脑实际打开目标页面验收。

## 本次结果和能力范围

用户已在外网 Pro 确认 Remote Browser 入口出现，并反馈目标网站“登录页和操作都正常”；mini 的 macOS、Paseo 0.10.2/0.10.3 和中继自动验证也已通过。完整记录见 [VERIFICATION.md](VERIFICATION.md)。

当前适合网页表单和管理后台。它传输网页视口，不传输整个 macOS 桌面；文件上传/下载回传、双向剪贴板、音视频及系统弹窗尚未实现。登录后的具体业务流程与 Linux/原生移动客户端不在本次已验证范围。

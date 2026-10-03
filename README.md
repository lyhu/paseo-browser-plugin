# Paseo Remote Browser

在外网设备的 Paseo workspace 中操作 daemon 主机上的 Chrome，访问该主机可达的内网网站。支持 macOS，不再依赖 Xvfb、Fluxbox、VNC、websockify 或一个由客户端直接访问的 localhost iframe。

本地改造基于 [lyhu/paseo-browser-plugin](https://github.com/lyhu/paseo-browser-plugin)，保留插件 ID `browser-tab`。当前接口适配 Paseo **0.10.2–0.10.x**；已验证的最新版本是 **0.10.3**。

```mermaid
flowchart LR
  Pro[外网 Pro · Paseo Remote Browser 面板] <-->|画面与鼠标键盘 · 插件 RPC| Relay[Paseo 公网中继 · E2EE]
  Relay <--> Mini[内网 mini · Paseo daemon]
  Mini <--> Chrome[mini 上的独立 Chrome 会话]
  Chrome <--> Site[内网 HTTP / HTTPS 网站]
```

网页、JavaScript、Cookie、WebSocket、SSE 和网络请求都在远程 Chrome 中执行。客户端通过已有的 Paseo 连接取得 JPEG 画面并发送输入，无需为每个网站配置 nginx，也无需把网站/VNC 端口暴露到公网。浏览器查看 `localhost` 时，指的是 daemon 主机。

其他电脑的部署步骤见 [安装备忘](INSTALL-MEMO.md)。

## 安装到 daemon 主机

macOS 上先安装 Google Chrome，默认发现路径为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。Linux 可使用 `/usr/bin/google-chrome`、`/usr/bin/chromium` 或 `/usr/bin/chromium-browser`；Linux 实机尚未验收。

```bash
cd /absolute/path/to/paseo-browser-plugin
npm ci
npm run typecheck
paseo plugin install "$PWD"
paseo plugin ls --json
```

要求 daemon 的插件功能已经开启，插件应显示 `running`。已安装该 ID 的开发版本时修改代码后使用：

```bash
npm run typecheck
paseo plugin reload browser-tab --json
```

不需要重启 daemon。也可以直接从本仓库安装：

```bash
paseo plugin install https://github.com/lyhu/paseo-browser-plugin --ref main
```

插件安装在提供远程浏览器的 daemon 上。

## 在 Pro 使用

Pro 的 Paseo app 和 mini daemon 都应为兼容的 0.10.x 版本。**Pro 不需要另装一份插件**：连接 mini 后由 mini 提供客户端贡献和 RPC。

1. 在 Pro 通过已有的公网中继连接 mini。
2. 打开属于 mini 的一个 workspace，点击新建标签页，选择 **Remote Browser**。也可按 `⌘K` 搜索 **Open remote browser**。
3. 输入完整的 `http://` 或 `https://` 地址，点击 **连接**。
4. 在远程画面中点击、滚动和输入。可直接粘贴中文，也可先点远程输入框，再使用底部“发送文字”。

这是插件的 **Remote Browser** 入口。Paseo 原有的 Browser 标签页继续采用原有实现。

支持前进、后退、刷新、新建/关闭远程标签页，以及网页弹出新标签页。关闭面板后会话可保留；重新连接可复用工作区会话，关闭会话会退出该工作区的 Chrome。Cookie/localStorage 等用户数据按工作区存储，关闭会话后仍保留。

## 行为与边界

- 默认运行独立的 headless Chrome，不接管 mini 已打开的日常 Chrome，也不读取其个人 profile。
- 画面尺寸为 1280×800。采用串行 JPEG 拉取、变化帧发送和输入批处理；局域网通常流畅，公网速度取决于中继往返时间。适合表单、管理后台和普通网页，不承诺视频/音频或远程桌面的帧率。
- 传输网页视口和输入，不传输整个 macOS 桌面、Chrome 原生菜单或开发者工具。
- JS `alert` 自动确认，`confirm` / `prompt` 自动取消。原生文件选择、下载回传、双向剪贴板、音视频、摄像头/麦克风、硬件密钥和系统权限弹窗尚未实现。浏览器原生右键菜单不会出现在截图中。
- 桌面 Paseo / Web 客户端支持鼠标、键盘和滚动；原生移动客户端目前只有画面及显式文字/滚动控件，没有完整触控操作适配。
- 每个工作区一个独立 profile，最多四个活动工作区会话。没有请求的会话约 30 分钟后退出。插件停用或重载时退出其 Chrome。
- 这是受信任插件。已配对客户端获得远程浏览器操作能力；网页访问仍受 daemon 的网络和证书配置约束。
- 面板显示远程页面的网络/JS 错误。连接成功并不代表被访问网站本身没有错误。

高级配置通过 daemon 环境提供：`PASEO_BROWSER_EXECUTABLE`（浏览器路径）、`PASEO_BROWSER_PROFILE_ROOT`（存储根目录）、`PASEO_BROWSER_HEADLESS=false`（在主机显示独立浏览器窗口）。GUI 启动的 daemon 通常不会继承终端环境，需要在其实际运行环境配置。

## 验证

```bash
npm run typecheck
npm test
npm run test:integration
npm run test:integration -- --relay
```

集成测试要求当前 daemon 已安装插件。默认连接 `ws://127.0.0.1:6767/ws`；可通过 `PASEO_TEST_URL` 和 `PASEO_TEST_PLUGIN_ID` 指定隔离 daemon/插件。`--relay` 从该 daemon 获取配对信息，再建立真实公网中继 E2EE 连接；配对密钥不打印。测试页面只监听 daemon 机器的 localhost，所以集成测试客户端也在该机器执行。

详细验收记录见 [VERIFICATION.md](VERIFICATION.md)。自动测试经过公网中继；外网 Pro 用户已确认 Remote Browser 入口、目标网站登录页和操作正常。登录后业务流程及扩展场景的验证边界见记录。

## License

MIT

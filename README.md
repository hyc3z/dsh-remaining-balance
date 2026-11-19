# dsh-remaining-balance

在 DeepSeek Harness 输入框下方的统计标签里，用**钱包图标 + 金额**显示当前登录账户的剩余余额；点一下展开**今日用量**，按 API Key 和模型列出今天花了多少。

![输入框下方的余额标签](docs/preview.png)

![点击展开的今日用量面板](docs/preview-panel.png)

> 截图里最右侧 `👛 ¥108.28` 是本插件加的；点开后是「今日用量」面板，数据与 DeepSeek Platform 用量页同源。

## 功能

- **一眼看到还剩多少钱**：在「8 轮 204 步 · 208 tok/s」「46.5M tok · 缓存命中 99.6%」「34%」这排统计标签中插入一项，图标 + 金额，和内置标签同字号、同颜色、同间距。
- **点击看今日用量**：弹出的面板分两列列出今天每个 API Key 的花费，以及它下面各模型的花费；范围固定今日 `00:00–24:00`（本地时区）。
- **同一份数据源**：余额来自 Harness 的账户服务（与「设置 → 账户」一致）；今日用量来自 Platform 用量页所用的 `/api/v0/usage/by_api_key/cost` 接口，用同一个账户登录态读取。
- **自动刷新**：余额每 60 秒、以及窗口重新聚焦时刷新；用量面板打开时读取，60 秒内重复打开不重复请求。
- **不花 token**：只查账户余额和用量，不发任何模型请求。
- **不造假数据**：未登录、读取中、读取失败时**什么都不显示**；余额为负时数字变警示色。
- **悬停看明细**：鼠标放在金额上能看到「充值余额 / 赠金余额」分项。
- **深浅主题自适应**：颜色全部取 Harness 主题变量；弹层使用与内置统计弹窗相同的菜单材质。

## 安装

前置条件：

- 已安装 DeepSeek Harness（桌面版 / Web 版），并在 Harness 里**登录了 DeepSeek 账户**；
- 从 Git 仓库安装时，`PATH` 里需要有 `git`（Harness 的插件安装器会调用 pnpm / git）。

### 方式一：从 GitHub 直接安装（推荐，一行搞定）

打开 **插件 → 添加插件**，在输入框里填：

```
github:hyc3z/dsh-remaining-balance
```

或者等价地填完整地址：

```
https://github.com/hyc3z/dsh-remaining-balance
```

点安装，然后 `Ctrl+R` 刷新页面即可。

> 「添加插件」接受包名、Git 地址、tgz 包或本地绝对路径，这条命令与 README 里的 `dsh plugin add ...` 等价。

### 方式二：下载打包好的 tgz

在 [Releases](https://github.com/hyc3z/dsh-remaining-balance/releases) 里下载 `dsh-remaining-balance-<version>.tgz`，在「添加插件」里填入该文件的绝对路径。

### 方式三：本地目录

```sh
git clone https://github.com/hyc3z/dsh-remaining-balance.git
```

在「添加插件」里选择这个目录。

### 关于「DeepSeek 插件商店」

Harness 的「插件」页里有一个官方插件目录（Discover），目前只收录随安装包分发的官方插件，**没有面向第三方插件的公开提交入口**，所以第三方插件目前的标准分发方式就是上面三种：Git 地址、tgz、本地目录。等这个包发布到 npm 之后，「添加插件」里直接填 `dsh-remaining-balance` 就能装（仓库里的 Release 工作流已经为发布预留了位置）。

卸载：在 **插件** 页关掉它，或移除该 bundle，不会留下数据。

## 今日用量面板

- 接口：`GET https://platform.deepseek.com/api/v0/usage/by_api_key/cost?start=<day-start>&end=<next-day-start>&tz=<offset>`，返回按 `api_key` × `model` 的逐小时花费；Host 侧汇总成「每个 key 一行 + 模型子行」。
- 该接口只接受**整天窗口**（本地时区午夜到次日午夜），所以面板固定看今天，不做日期选择。
- Host 把结果缓存 60 秒，避免反复打开面板时重复请求 Platform。
- 只返回金额、key 名称、模型名；不返回任何 Token、Cookie 或 API Key。

## 工作原理

- **Host 半**（`index.js`）注册两个只读路由：
  - `GET /dsh-remaining-balance/balance`：调用 Harness 的 `deepseekAccount` 服务读余额；
  - `GET /dsh-remaining-balance/usage`：用账户登录态（`getPlatformSession()`）调用 Platform 用量接口，汇总今日花费。
- **Client 半**（`client.js`）往 `conversation.composer.dock` 注册一个标签项，并通过 `react-dom` portal 把面板挂到 `body`，避免被输入框容器裁剪；余额优先走 Host 路由，路由不可用时回退到浏览器里的账户 Remote。
- 诊断：宿主把最近一次结果码写到 `$DSH_HOME/balance-pill/diagnostics.json`（不含金额以外的账户信息，也没有 Token）。

## 已知限制

- 一次只显示**一个币种**的合计（人民币优先）；同时有美元余额时只显示人民币那笔，明细可在悬停提示里看到。
- 余额与用量都依赖 Platform 账户；只用 API Key、没在 Harness 里登录账户的安装读不到数据，标签会保持隐藏。
- Platform 用量接口不是公开 API，平台改版后可能失效；失效时面板显示「暂时读不到今日用量」，余额显示不受影响。
- 余额刷新间隔固定 60 秒 + 聚焦即时刷新，暂不可配置。

## 目录结构

```
.
├── package.json              # bundle 清单（dsh.bundle + dsh.client）
├── cordis.patch.yml          # 插入 remaining-balance 一行
├── index.js                  # Host：余额与今日用量只读路由
├── client.js                 # Client：统计标签项 + 用量弹层
├── icon.svg                  # 插件图标
├── locale/en.json            # 插件列表里的英文标题与说明
├── locale/zh.json            # 中文标题与说明
├── docs/preview.png          # 截图：统计标签里的余额
├── docs/preview-panel.png    # 截图：今日用量面板
└── .github/workflows/release.yml  # 打 tag 时打包并创建 Release
```

## 开发

- 无需构建：`index.js` 与 `client.js` 都是可直接加载的普通 JS。
- 本地改完在 **插件** 页重新启用该 bundle，刷新页面即可生效。
- 发布：打 `v*` tag 后由 GitHub Actions 执行 `npm pack` 并把 tgz 附到 Release；仓库 Secrets 配好 `NPM_TOKEN` 后可再加一步 `npm publish`。

## License

MIT

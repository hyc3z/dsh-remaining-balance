# dsh-remaining-balance

在 DeepSeek Harness 输入框下方的统计标签里，用**钱包图标 + 金额**实时显示当前登录账户的剩余余额。

![输入框下方的余额标签](docs/preview.png)

> 截图里最右侧那一项 `👛 ¥110.54` 就是本插件加的；左边几项是 Harness 自带的轮次/速度、token 用量和上下文占用。

## 功能

- **一眼看到还剩多少钱**：在「6 轮 20 步 · 177 tok/s」「641K tok · 缓存命中 95%」「4%」这排统计标签中插入一项，图标 + 金额，和内置标签同字号、同颜色、同间距。
- **同一份数据源**：余额来自 Harness 的账户服务（`deepseekAccount`），与「设置 → 账户」页面显示的是同一份 Platform 余额（充值余额 + 赠金）。
- **自动刷新**：每 60 秒读一次；窗口重新获得焦点、切回页面时立即读一次。充值后回到窗口就能看到新数字。
- **不花 token**：只查账户余额，不发任何模型请求。
- **不造假数据**：未登录、读取中、读取失败时**什么都不显示**，不会显示一个假的 0；余额为负时数字变警示色。
- **悬停看明细**：把鼠标放在金额上，能看到「充值余额 / 赠金余额」分项；主显示是它们的合计。
- **深浅主题自适应**：颜色全部取 Harness 主题变量，亮色/暗色都能看。

## 安装

要求：已安装 DeepSeek Harness（桌面版或 Web 版），并在 Harness 里**登录了 DeepSeek 账户**（用 API Key 的安装也能装，但读不到账户余额，插件会保持隐藏）。

1. 克隆本仓库：

   ```sh
   git clone https://github.com/<owner>/dsh-remaining-balance.git
   ```

2. 在 Harness 里打开 **插件 → 添加插件**，选择克隆下来的目录（该目录里有 `package.json` 和 `cordis.patch.yml`）。

   也可以用 CLI / 智能体工具安装同一个目录：

   ```
   plugin_manager install_bundle  <仓库目录的绝对路径>
   ```

3. 刷新页面（`Ctrl+R`）。之后输入框下方那排统计里就会出现钱包图标和余额。

卸载：在 **插件** 页关掉它，或移除该 bundle 即可，不会留下任何数据。

## 工作原理

- **Host 半**（`index.js`）注册一个只读路由 `GET /dsh-balance-pill/balance`，调用 Harness 的 `deepseekAccount` 服务读取余额，只返回状态码和钱包金额，不返回凭据、Token 或密钥。
- **Client 半**（`client.js`）往 `conversation.composer.dock` 插槽注册一个标签项，每 60 秒、以及窗口重新聚焦时请求上面的路由；路由不可用时自动回退到浏览器里的账户 Remote，两种方式读的是同一份余额。
- 为了排查「标签不显示」的情况，宿主会把最近一次结果码写到 `$DSH_HOME/balance-pill/diagnostics.json`（形如 `{"status":"ready"}`，不含金额以外的账户信息，也没有任何 Token）。

## 已知限制

- 一次只显示**一个币种**的合计（人民币优先）；同时有美元余额时只显示人民币那笔，明细可在悬停提示里看到。
- 余额来自 DeepSeek Platform 账户；如果只用 API Key、没有在 Harness 里登录账户，则读不到余额，标签保持隐藏。
- 刷新节奏固定为 60 秒 + 聚焦即时刷新，暂不可配置；余额变化不是逐笔推送的。
- 依赖 Harness 的统计标签插槽（`conversation.composer.dock`），后续版本若改动插槽名称，需要同步适配。

## 目录结构

```
.
├── package.json          # bundle 清单（dsh.bundle + dsh.client）
├── cordis.patch.yml      # 插入 remaining-balance 一行
├── index.js              # Host：余额只读路由
├── client.js             # Client：统计标签项 + 轮询
├── icon.svg              # 插件图标
├── locale/en.json        # 插件列表里的英文标题与说明
├── locale/zh.json        # 中文标题与说明
├── docs/preview.png      # 截图
└── README.md
```

## License

MIT

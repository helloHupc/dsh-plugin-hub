# DSH 插件聚合检测站 — 项目方案

> 状态:**已实施**。ETL/前端/定时刷新已跑通,部署见 README。

> 目标:自动检测全网 DeepSeek Harness (dsh) 插件,汇总多数据源,自己分类/排序/搜索,每小时刷新,静态托管部署。

---

## 一、背景与目标

DeepSeek Harness (`dsh`) 是 DeepSeek 的开源 agent harness,插件生态庞大且分散:
- GitHub 上带 `dsh-plugin` topic 的仓库共 **3937** 个
- 社区有多个聚合仓库,但都不完整、更新不同步、分类标准不一

我们需要一个**自建聚合站**:把全网数据源汇总到一起,用**自己的逻辑**清洗、去重、分类、排序、搜索,而不是照搬任何单一仓库。

### 核心需求
1. 汇总所有来源数据(非照搬单仓库)
2. 自己重新分类、排序、搜索
3. 每小时刷新一次
4. 按 star 数 / 最后更新时间排序
5. 部署到 EdgeOne Makers(国内外可访问)

---

## 二、数据源盘点(已核实)

| 数据源 | 类型 | 规模 | 数据形态 | 用途 |
|---|---|---|---|---|
| GitHub `dsh-plugin` topic 搜索 API | 实时 API | 3937(topic)/API 封顶取~900 | JSON | 实时新插件、最新 pushed_at |
| `dshworks/awesome-dsh-plugins` | 开放数据仓库 | **2757** 插件 | `data/plugins.json` | 主数据、已验证、含 stars/分类 |
| `kejixiaoliang/awesome-dsh-plugins` | 开放数据仓库 | 365 | `data/plugins.json` | 中文 14 类分类增强 |
| `ZASENJC/dsh-plugins-store` | 自动收录 | 不确定 | catalog.json | 可选,自动分类验证 |
| `awesome-dsh-plugin/awesome-dsh-plugin` | 精选 README | ~上千条 | README.md | 人气榜交叉参考 |
| `0xsline/awesome-deepseek-harness` | README 生态 | — | README.md | 生态补充 |

### 数据缺口(验证过)
- GitHub topic 搜索 API 最多返回 **1000** 条,取不到全部 3937
- `dshworks` 有 2757 条,但**缺 565 个近期 topic 插件**
- 任何单一源都不完整,必须**合并**

### 数据流
```
GitHub Actions cron (每小时)
   │
   ▼
聚合 ETL 脚本 (aggregate.py)
   ├─ 拉取所有数据源
   ├─ 合并 + 去重 (以 repo 为唯一键)
   ├─ 自己分类 (关键词规则分类器)
   ├─ 排序字段: stars / pushed_at
   └─ 输出 data/plugins.json
   │
   ▼
git push 新 data.json
   │
   ▼
EdgeOne Makers 自动监听 → 重新部署
   │
   ▼
静态前端 (浏览器加载 data.json → 搜索/分类/排序)
```

---

## 三、架构分层

### 1. 聚合层(ETL 脚本) — 核心逻辑,自己写

用 Python 标准库(零依赖,CI 好跑)。

**① 拉取**
- GitHub topic 搜索:`search/repositories?q=topic:dsh-plugin`(实时,取最新)
- `dshworks` raw JSON:`data/plugins.json`
- `kejixiaoliang` raw JSON:`data/plugins.json`
- (可选)ZASENJC catalog、awesome-dsh-plugin README

**② 去重**
- 唯一键 = `repo` (`owner/name`)
- 先到先得,后续源只补字段:
  - `pushed_at` 取最新
  - `description` 取最完整
  - `tags` 并集
  - `stars` 策略:优先 topic 搜索实时值,缺失用 dshworks 每日值
- 每条记录标注 `sources: [...]` 来源列表

**③ 自己的分类**(不照搬任何仓库分类)

关键词规则分类器,跑在 `repo名 + description` 上,可多标签。初始化词表:

```
UI 增强         ui, panel, sidebar, theme-skin, dashboard, web-ui
主题/外观        theme, skin, wallpaper, dark, css
模型/提供商      provider, model, anthropic, openai, gemini, router
记忆/会话        memory, session, context, history, recall
工具/能力        tool, mcp, shell, terminal, browser, file
技能/Skills      skill, agent, prompt
工作流/自动化    workflow, cron, automation, pipeline, orchestrat
通知/集成        notify, slack, telegram, lark, 飞书, discord, webhook
开发/运行时      dev, debug, runtime, plugin-manager, build
插件市场/管理器  market, store, manager, install
多模态/视觉      vision, image, ocr, mcp-serve, screen
手机/移动端      mobile, pwa, phone, android
桌面/TUI         desktop, tui, cli, terminal-ui
成本/用量        cost, token, usage, balance, billing
安全/权限        security, approval, sandbox, permission
娱乐            fun, game, pet, petdex
```

未知关键词 → 兜底 `uncategorized`,后续迭代补充。

**④ 输出**
单一 `data/plugins.json`,含:
- `meta`: `updated_at`、各源计数、去重统计
- `plugins[]`: 标准化数组
- `taxonomy`: 类别定义

### 2. 定时刷新(每小时)

**首选:GitHub Actions cron**
- `cron: '0 * * * *'`(每小时整点)
- 跑 ETL → 更新 `data/plugins.json` → commit → push
- EdgeOne Makers 自动监听此 push → 重新部署
- 优点:与托管商无关、免费、可日志/重试

备选(不推荐,卡生态):
- Vercel Cron / EdgeOne 定时边缘函数

### 2.1 通知(仅 GitHub 原生邮件,零配置)

- GitHub Actions 任务**跑失败时自动给仓库操作者发邮件**(平台原生能力)
- 无需写代码、无需第三方服务
- 覆盖场景:聚合失败、脚本异常、部署失败
- 成功时**不通知**(避免每小时刷屏),只看失败即可
- 结论:不引入 Server酱等第三方推送,保持零外部依赖

### 3. 前端(纯静态)

- 单页 HTML + JS + CSS(或 Tailwind CDN)
- 加载 `data/plugins.json` 后**本地**做:
  - 搜索:名字/描述/tags 子串 + 模糊
  - 分类过滤(多标签)
  - 排序:star / 最近更新 / 新增
  - 分页
- Header 显示:上次刷新时间 + 插件总数 + 各源贡献数
- 无后端,静态托管直接 serve

---

## 四、部署方案

### 4.1 结论:EdgeOne Makers(已查证,支持 Git 自动部署)

| | Vercel | EdgeOne Makers |
|---|---|---|
| Git 自动部署 | ✅ 原生 | ✅ 支持(GitHub/GitLab/Bitbucket/Gitee) |
| push 自动触发 | ✅ | ✅ 自动监听 GitHub 更新 |
| 国内访问 | ❌ 被墙/不稳 | ✅ 快 |
| 国外访问 | ✅ | ✅ |
| 备案要求 | 无需 | 自定义域名国内节点需 ICP 备案 |

**选 EdgeOne Makers**:国内外都能访问,支持 Git 自动部署,免费额度够用。

### 4.2 部署流程
```
GitHub Actions (每小时) → 更新 data.json → push
        ▼
EdgeOne Makers 检测到 GitHub 最新提交
        ▼
自动构建 + 部署到 EdgeOne 全球网络
        ▼
用户访问 (国内/国外都通)
```

### 4.3 自动更新链路
- 数据更新频率 = GitHub Actions cron 频率(每小时)
- 前端每次加载拉最新 `data.json`
- 无需用户手动刷新部署

---

## 五、目录结构

```
dsh-plugin-hub/
├── docs/
│   └── PROJECT_PLAN.md          # 本方案
├── scripts/
│   └── aggregate.py             # ETL:拉取+合并+去重+分类
├── data/
│   ├── plugins.json             # 合并后的单一数据源(构建产物)
│   └── dshworks_plugins.json    # 原始源缓存(已抓取)
├── site/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── .github/workflows/
│   ├── refresh.yml              # 每小时 cron 跑 ETL
│   └── deploy.yml               # 部署(可选)
└── README.md
```

---

## 五.5、通知策略

只用 **GitHub Actions 原生失败邮件**:
- 触发条件:workflow / 脚本 / 部署 失败
- 接收端:GitHub 仓库操作者邮箱(auto)
- 配置:无,平台默认
- 成功不打扰,失败才提醒

## 六、实施步骤(当前进度)

- [x] 1. `aggregate.py` ETL 原型(6 源合并 → 3768 条去重 → 分类词表迭代至 8% 未分类)
- [x] 2. 分类词表迭代(词边界 + CJK 子串匹配)
- [x] 3. 前端(搜索/分类/排序/分页,已无头浏览器验证)
- [x] 4. GitHub Actions cron(每小时,数据变化才提交)
- [x] 5. EdgeOne Makers 关联部署(edgeone.json 静态配置)
- [x] 6. 上线验证

### 原步骤清单

1. **写 `aggregate.py` ETL 原型**
   - 合并 5 个源 → 去重 → 分类 → 输出 `data/plugins.json`
   - 跑一遍,人工验证去重/分类质量
2. **迭代分类词表**
   - 看未分类(uncategorized)数量,补词
3. **写前端**(搜索/分类/排序/分页)
4. **配 GitHub Actions cron**(每小时)
5. **EdgeOne Makers 关联仓库部署**
6. **上线验证**(国内/国外访问、自动更新)

---

## 七、待确认问题

1. 先跑 ETL 原型验证去重/分类质量?
2. EdgeOne 用自定义域名还是默认域名?(影响备案)
3. 前端样式偏好?(简洁 / 卡片 / 表格)
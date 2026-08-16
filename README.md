# DSH 插件聚合站

全网 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) 插件聚合检测站:
多数据源自动汇总 → 自己的逻辑去重/分类/排序 → 静态页检索,每小时刷新。

线上地址:https://dsh-plugin-hub.hupc.site

## 数据源(6 个)

| 来源 | 说明 | 规模(实测) |
|---|---|---|
| GitHub `dsh-plugin` topic 搜索 API | 实时,最新 pushed_at/stars | 1000(API 封顶) |
| dshworks/awesome-dsh-plugins | 主数据,含 npm/验证状态 | 2757 |
| kejixiaoliang/awesome-dsh-plugins | 中文分类增强 | 365 |
| ZASENJC/dsh-plugins-store | catalog.json,自动分类验证 | 826 |
| awesome-dsh-plugin/awesome-dsh-plugin | 精选 README | 617 |
| 0xsline/awesome-deepseek-harness | 生态补充 README | 302 |

实测合并去重后 **~3700+** 条,无重复 id,未分类率 ~8%(分类词表可持续迭代)。

## 本地使用

```bash
# 跑一次完整 ETL(实时拉取)
python3 scripts/aggregate.py

# 只用本地缓存调试
python3 scripts/aggregate.py --offline

# 本地预览站点
mkdir -p site/data && cp data/plugins.json site/data/plugins.json
cd site && python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 目录结构

```
├── docs/PROJECT_PLAN.md     # 方案文档
├── scripts/aggregate.py     # ETL:拉取+合并+去重+自分类
├── data/plugins.json        # 合并产物(每小时刷新)
├── data/raw/                # 各源缓存(失败回退)
├── site/                    # 静态前端(index.html / app.js / style.css)
└── .github/workflows/refresh.yml  # 每小时 cron
```

## 自动刷新

GitHub Actions `refresh-data` workflow:
- `cron: 0 * * * *` 每小时整点 + 手动 `workflow_dispatch`
- 跑 ETL → 数据有变化才 commit + push(不刷空提交)
- 失败时 GitHub 原生邮件通知仓库操作者,零第三方依赖

## 社区

- [Linux.do](https://linux.do) — **学AI，上L站**

## 安全提示

⚠️ 安装第三方插件 = 以你的权限在本机运行第三方代码。本聚合站只做索引与分类,**不做安全审查**;
安装前请自行审阅源码,陌生插件请在无密钥环境试用。

## License

MIT

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DSH 插件聚合 ETL — 汇总全网 DeepSeek Harness (dsh) 插件,去重 / 自己分类 / 排序。

数据流:
    6 个数据源(实时拉取,失败时回退到本地缓存)
        ↓
    合并 + 去重(唯一键 = lower(repo) [+ #path, 区分 monorepo 子包])
        ↓
    自己的关键词规则分类器(16 类,可多标签;不照搬任何单一仓库分类)
        ↓
    输出 data/plugins.json(单一数据源,前端直接加载)

零第三方依赖,Python 3.8+ 标准库即可跑(GitHub Actions 每小时 cron)。

用法:
    python3 scripts/aggregate.py            # 拉取 + 合并 + 输出
    python3 scripts/aggregate.py --offline  # 只用本地缓存(调试)
"""
import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_DIR = os.path.join(ROOT, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
OUT_FILE = os.path.join(DATA_DIR, "plugins.json")

UA = "Mozilla/5.0 (dsh-plugin-hub aggregator; +https://github.com/helloHupc/dsh-plugin-hub)"
TIMEOUT = 25
RETRIES = 2

# ---------------------------------------------------------------------------
# 分类词表(自己的规则,不照搬任何仓库的分类;按优先级排列,可多标签)
# ---------------------------------------------------------------------------
CATEGORY_RULES = [
    ("ui",        "UI 增强",         ["ui", "panel", "sidebar", "dashboard", "web-ui", "webui", "composer", "shortcut", "status bar", "message-rail", "widget", "前端", "frontend"]),
    ("theme",     "主题与外观",       ["theme", "skin", "wallpaper", "dark", "css", "appearance", "animation", "sound", "sfx", "壁纸", "background", "design"]),
    ("model",     "模型与接入",       ["provider", "model", "anthropic", "openai", "gemini", "router", "relay", "api-key", "z.ai", "deepseek api", "claude", "gpt"]),
    ("memory",    "记忆与上下文",     ["memory", "session", "context", "history", "recall", "session store", "knowledge", "archiv*"]),
    ("tools",     "工具与能力",       ["tool", "mcp", "shell", "terminal", "browser", "file", "fs", "search", "webhook", "pdf", "image", "diff", "git", "exec", "ssh", "document", "docx", "scrape", "网页"]),
    ("skill",     "技能包",           ["skill", "prompt", "agent", "persona", "rules", "instructions", "智能体", "助手", "伙伴"]),
    ("workflow",  "工作流与自动化",   ["workflow", "cron", "automation", "pipeline", "orchestrat*", "deepresearch", "research", "plan-execute", "schedule", "todo", "自动化", "流程", "brainstorm", "canvas", "spec driven", "画布"]),
    ("notify",    "通知与集成",       ["notify", "notification", "slack", "telegram", "lark", "飞书", "discord", "wechat", "email", "push", "qqbot", "bot", "im", "channel", "通知"]),
    ("dev",       "开发与运行时",     ["dev", "debug", "runtime", "plugin-manager", "build", "sdk", "api client", "ide", "vscode", "codex", "claude-code", "testing", "screenshot", "template", "github action"]),
    ("market",    "插件市场与管理",   ["market", "marketplace", "store", "manager", "install", "registry", "catalog", "awesome", "radar", "collection", "index", "leaderboard", "插件市场"]),
    ("vision",    "多模态与视觉",     ["vision", "ocr", "screen", "screenshot", "image", "multimodal", "video", "voice", "tts", "asr", "speech", "transcrib*"]),
    ("mobile",    "手机与移动端",     ["mobile", "pwa", "phone", "android", "ios", "touch", "app"]),
    ("tui",       "桌面与终端",       ["desktop", "tui", "cli", "terminal-ui", "ratatui", "rust", "windows"]),
    ("cost",      "成本与用量",       ["cost", "token", "usage", "balance", "billing", "quota", "spend", "meter", "save-money", "省钱"]),
    ("security",  "安全与权限",       ["security", "approval", "sandbox", "permission", "gate", "auth", "token gate", "proxy"]),
    ("fun",       "娱乐",             ["fun", "game", "petdex", "pet", "whale", "meme", "ascii", "animation", "companion", "galgame", "gal", "桌宠", "live2d"]),
]
CATEGORY_LABELS = {
    "ui":        ("UI Enhancements", "UI 增强"),
    "theme":     ("Themes & Appearance", "主题与外观"),
    "model":     ("Models & Providers", "模型与接入"),
    "memory":    ("Memory & Context", "记忆与上下文"),
    "tools":     ("Tools & Capabilities", "工具与能力"),
    "skill":     ("Skills & Prompts", "技能包"),
    "workflow":  ("Workflow & Automation", "工作流与自动化"),
    "notify":    ("Notifications & Integrations", "通知与集成"),
    "dev":       ("Development & Runtime", "开发与运行时"),
    "market":    ("Plugin Markets & Managers", "插件市场与管理"),
    "vision":    ("Multimodal & Vision", "多模态与视觉"),
    "mobile":    ("Mobile & PWA", "手机与移动端"),
    "tui":       ("Desktop & TUI", "桌面与终端"),
    "cost":      ("Cost & Usage", "成本与用量"),
    "security":  ("Security & Permissions", "安全与权限"),
    "fun":       ("Just for Fun", "娱乐"),
    "uncategorized": ("Uncategorized", "未分类"),
}

# 外部来源自带的分类 → 我方分类(仅作兜底 hint,主分类仍是自己的规则)
CURATED_CAT_HINT = {
    # dshworks category
    "bundle": "dev", "plugin": None, "official": "dev", "integrations": "notify",
    # kejixiaoliang category id
    "ui": "ui", "theme": "theme", "model": "model", "session": "memory",
    "memory": "memory", "tools": "tools", "skill": "skill", "workflow": "workflow",
    "notify": "notify", "dev": "dev", "market": "market", "fun": "fun",
    # ZASENJC categories
    "development": "dev", "agent-session": "skill", "data": "tools",
    "security": "security", "operations": "workflow", "lifestyle": "fun",
    "other": None,
}

# ---------------------------------------------------------------------------
# 数据源定义
# ---------------------------------------------------------------------------
SOURCES = [
    {
        "id": "github_topic",
        "label": "GitHub dsh-plugin topic(实时)",
        "cache": "github_topic.json",
        "fetch": lambda: fetch_github_topic(),
    },
    {
        "id": "dshworks",
        "label": "dshworks/awesome-dsh-plugins",
        "cache": "dshworks_plugins.json",
        "fetch": lambda: fetch_json("https://raw.githubusercontent.com/dshworks/awesome-dsh-plugins/main/data/plugins.json"),
    },
    {
        "id": "kejixiaoliang",
        "label": "kejixiaoliang/awesome-dsh-plugins(中文分类)",
        "cache": "kejixiaoliang.json",
        "fetch": lambda: fetch_json("https://raw.githubusercontent.com/kejixiaoliang/awesome-dsh-plugins/main/data/plugins.json"),
    },
    {
        "id": "zasenjc",
        "label": "ZASENJC/dsh-plugins-store catalog",
        "cache": "zasenjc_catalog.json",
        "fetch": lambda: fetch_json("https://raw.githubusercontent.com/ZASENJC/dsh-plugins-store/main/src/data/catalog.json"),
    },
    {
        "id": "awesome_readme",
        "label": "awesome-dsh-plugin/awesome-dsh-plugin README",
        "cache": "awesome_readme.md",
        "fetch": lambda: fetch_text("https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/README.md"),
    },
    {
        "id": "0xsline_readme",
        "label": "0xsline/awesome-deepseek-harness README(生态补充)",
        "cache": "0xsline_readme.md",
        "fetch": lambda: fetch_text("https://raw.githubusercontent.com/0xsline/awesome-deepseek-harness/main/README.md"),
    },
]


# ---------------------------------------------------------------------------
# 网络层:拉取 + 重试 + 缓存回退
# ---------------------------------------------------------------------------
def http_get(url, binary=False):
    last = None
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    for i in range(RETRIES + 1):
        try:
            headers = {
                "User-Agent": UA,
                "Accept": "application/vnd.github+json" if "api.github.com" in url else "*/*",
            }
            if token and "api.github.com" in url:
                headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(url, headers=headers)
            # macOS 系统 Python 常缺 CA 证书:优先 certifi,否则回退无验证(仅读公开数据)
            ctx = None
            try:
                import certifi  # noqa: PLC0415
                ctx = ssl.create_default_context(cafile=certifi.where())
            except Exception:  # noqa: BLE001
                pass
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
                data = r.read()
                return data if binary else data.decode("utf-8", errors="replace")
        except (ssl.SSLError, urllib.error.URLError) as e:
            if isinstance(e, ssl.SSLError) and last is None:
                # CA 缺失 → 无验证重试一次
                last = e
                opener = urllib.request.build_opener(
                    urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
                try:
                    with opener.open(req, timeout=TIMEOUT) as r:
                        data = r.read()
                        return data if binary else data.decode("utf-8", errors="replace")
                except Exception as e2:  # noqa: BLE001
                    last = e2
            else:
                last = e
            time.sleep(1.5 * (i + 1))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def fetch_json(url):
    return json.loads(http_get(url))


def fetch_text(url):
    return http_get(url)


def load_source(name):
    """优先实时拉取,失败回退本地缓存(data/raw/ 或 data/)。"""
    src = next(s for s in SOURCES if s["id"] == name)
    if OFFLINE:
        data = read_cache(src["cache"])
        return data, False
    try:
        return src["fetch"](), True
    except Exception as e:  # noqa: BLE001
        print(f"  !! {name} 拉取失败({e}),回退本地缓存")
        data = read_cache(src["cache"])
        return data, False


def read_cache(name):
    for d in (RAW_DIR, DATA_DIR):
        p = os.path.join(d, name)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                raw = f.read()
            if name.endswith(".json"):
                return json.loads(raw)
            return raw
    return None


# ---------------------------------------------------------------------------
# GitHub topic 搜索(Search API,无 token 时 10 页 × 100 = 上限 1000 条)
# ---------------------------------------------------------------------------
def fetch_github_topic():
    all_items = []
    for page in range(1, 11):
        url = ("https://api.github.com/search/repositories?q=topic:dsh-plugin"
               "&sort=updated&order=desc&per_page=100&page=%d" % page)
        d = fetch_json(url)
        items = d.get("items", [])
        all_items.extend(items)
        if len(items) < 100:
            break
        time.sleep(1.2)  # 无 token 搜索限流 10 次/分钟
    return {"collected": len(all_items), "items": all_items}


# ---------------------------------------------------------------------------
# 各来源 → 统一中间记录
# ---------------------------------------------------------------------------
def parse_github_topic(doc):
    out = []
    for it in doc.get("items", []):
        lic = it.get("license") or {}
        out.append({
            "full_name": it["full_name"],
            "url": it.get("html_url") or "https://github.com/" + it["full_name"],
            "description": it.get("description"),
            "stars": it.get("stargazers_count"),
            "pushed_at": it.get("pushed_at"),
            "updated_at": it.get("updated_at"),
            "created_at": it.get("created_at"),
            "language": it.get("language"),
            "license": lic.get("spdx_id") if isinstance(lic, dict) else None,
            "topics": it.get("topics") or [],
            "archived": bool(it.get("archived")),
            "fork": bool(it.get("fork")),
        })
    return out


def parse_dshworks(doc):
    """dshworks: repo 字段可能是 owner/name 或 owner/name#subpath,path 字段区分 monorepo 子包。"""
    out = []
    for p in doc.get("plugins", []):
        repo = p.get("repo") or ""
        path = p.get("path") or ""
        base = repo.split("#")[0].strip()
        if "/" not in base:
            continue
        rec = {
            "full_name": base,
            "url": "https://github.com/" + base,
            "description": p.get("description"),
            "stars": p.get("stars"),
            "pushed_at": p.get("pushedAt"),
            "topics": [],
            "npm": p.get("npm"),
            "path": path,
            "official": bool(p.get("official")),
            "status": p.get("status"),
            "curated_categories": [p["category"]] if p.get("category") else [],
            "tags": list(p.get("tags") or []),
        }
        if p.get("name") and p["name"] != base.split("/")[-1]:
            rec["alias"] = p["name"]
        out.append(rec)
    return out


def parse_kejixiaoliang(doc):
    out = []
    for p in doc.get("plugins", []):
        full = p.get("fullName") or ""
        if "/" not in full:
            continue
        cat = (p.get("category") or {}).get("id")
        out.append({
            "full_name": full,
            "url": p.get("url") or "https://github.com/" + full,
            "description": p.get("description"),
            "stars": p.get("stars"),
            "pushed_at": p.get("pushedAt"),
            "npm": p.get("npmName"),
            "curated_categories": [cat] if cat else [],
        })
    return out


def parse_zasenjc(doc):
    out = []
    for r in doc.get("repositories", []):
        full = r.get("fullName") or ""
        if "/" not in full:
            continue
        cats = r.get("categories") or ([r["category"]] if r.get("category") else [])
        out.append({
            "full_name": full,
            "url": r.get("url") or "https://github.com/" + full,
            "description": r.get("description"),
            "stars": r.get("stars"),
            "pushed_at": r.get("pushedAt"),
            "updated_at": r.get("updatedAt"),
            "language": r.get("language"),
            "license": (r.get("license") or {}).get("spdxId") if isinstance(r.get("license"), dict) else None,
            "topics": r.get("topics") or [],
            "archived": bool(r.get("archived")),
            "fork": bool(r.get("fork")),
            "curated_categories": [c for c in cats if isinstance(c, str)],
        })
    return out


MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\((https?://github\.com/([^/)]+)/([^/)#)]+)(?:#[^)]*)?)\)")
NON_PLUGIN_URL = re.compile(r"(topics/|features/|sponsors|\.svg|\.png|\.jpg|badge|compare/|releases)", re.I)
NON_PLUGIN_LINE = re.compile(r"(^#|\*\*|banner|badge|shield|contribut|awesome|count|install|changelog)", re.I)


def parse_readme(text, skip_anchors=()):
    """解析 README 里的 `- [name](github-url) - description` 列表行。"""
    out = []
    seen = set()
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("- ") and not line.startswith("* "):
            continue
        if NON_PLUGIN_LINE.search(line):
            continue
        m = MARKDOWN_LINK.search(line)
        if not m:
            continue
        url = m.group(2)
        if NON_PLUGIN_URL.search(url):
            continue
        full = (m.group(3) + "/" + m.group(4)).lower()
        if full in seen:
            continue
        seen.add(full)
        desc = line[m.end():].lstrip(" -–—:").strip()
        out.append({
            "full_name": full,
            "url": url,
            "description": desc or None,
            "curated_categories": [],
        })
    return out


# ---------------------------------------------------------------------------
# 合并 + 去重
# ---------------------------------------------------------------------------
def normalize_key(full_name):
    """唯一键:lower(owner/name)。monorepo 子包由 path 字段区分,不并入 key。"""
    return full_name.strip().lower().rstrip("/")


def merge_all(parsed):
    merged = {}
    source_counts = Counter()
    for src_id, records in parsed.items():
        source_counts[src_id] = len(records)
        for r in records:
            key = normalize_key(r["full_name"])
            rec = merged.setdefault(key, {
                "id": key,
                "owner": key.split("/")[0],
                "name": key.split("/")[-1],
                "url": None,
                "description": None,
                "description_zh": None,
                "stars": None,
                "pushed_at": None,
                "created_at": None,
                "language": None,
                "license": None,
                "topics": [],
                "tags": [],
                "npm": None,
                "path": None,
                "official": False,
                "status": None,
                "archived": False,
                "fork": False,
                "alias": None,
                "curated_categories": [],
                "sources": [],
            })
            if src_id not in rec["sources"]:
                rec["sources"].append(src_id)
            # url
            if not rec["url"] and r.get("url"):
                rec["url"] = r["url"]
            # description:取最完整
            d = r.get("description")
            if d:
                if not rec["description"] or len(d) > len(rec["description"]):
                    rec["description"] = d
            # stars:topic 实时值优先,缺失补其他源
            if src_id == "github_topic" and r.get("stars") is not None:
                rec["stars"] = r["stars"]
            elif rec["stars"] is None and r.get("stars") is not None:
                rec["stars"] = r["stars"]
            # pushed_at 取最新
            pa = r.get("pushed_at")
            if pa and (not rec["pushed_at"] or pa > rec["pushed_at"]):
                rec["pushed_at"] = pa
            for f in ("created_at", "language", "license"):
                if not rec.get(f) and r.get(f):
                    rec[f] = r[f]
            rec["topics"] = sorted(set(rec["topics"]) | set(r.get("topics") or []))
            rec["tags"] = sorted(set(rec["tags"]) | set(r.get("tags") or []))
            rec["curated_categories"] = sorted(set(rec["curated_categories"]) | set(r.get("curated_categories") or []))
            for f in ("npm", "path", "alias", "official", "status", "archived", "fork"):
                v = r.get(f)
                if v:
                    rec[f] = v
    return merged, source_counts


# ---------------------------------------------------------------------------
# 自己的分类器:关键词规则(词边界匹配,避免 ui→quick 这类误命中),可多标签
# ---------------------------------------------------------------------------
_WORD_CACHE = {}


def _word_re(word):
    """规则词 → 边界正则。连字符/点号归一,单复数,* 后缀词干;含 CJK 的词用子串匹配(\b 对汉字无效)。"""
    if word not in _WORD_CACHE:
        stem = word.endswith("*")
        base = word.rstrip("*")
        has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in base)
        if has_cjk:
            _WORD_CACHE[word] = re.compile(re.escape(base))
            return _WORD_CACHE[word]
        variants = {base}
        if "." in base or "-" in base:
            variants.add(base.replace(".", " ").replace("-", " "))
        if stem:
            variants.add(re.escape(base) + r"\w*")
        elif not base.endswith("s"):
            variants.add(base + "s")
        _WORD_CACHE[word] = re.compile(r"\b(?:%s)\b" % "|".join(
            sorted(variants, key=len, reverse=True)))
    return _WORD_CACHE[word]


def classify(rec):
    text = " ".join(filter(None, [
        rec["name"].replace("-", " ").replace("_", " "),
        rec["description"] or "",
        " ".join(rec["topics"]),
    ])).lower()
    text = text.replace("-", " ").replace("_", " ").replace(".", " ")
    hits = []
    for cat_id, zh, words in CATEGORY_RULES:
        if any(_word_re(w).search(text) for w in words):
            hits.append(cat_id)
    # 兜底:若自己规则没命中,用外部来源分类映射作 hint
    hint = None
    if not hits:
        for c in rec["curated_categories"]:
            mapped = CURATED_CAT_HINT.get(c)
            if mapped:
                hint = mapped
                break
    rec["categories"] = hits
    rec["category"] = hits[0] if hits else (hint or "uncategorized")
    rec["category_source"] = "keyword" if hits else ("hint" if hint else "none")
    # 命中分类进入 tags
    for cat_id in hits:
        rec["tags"].append("cat:" + cat_id)
    return rec


# ---------------------------------------------------------------------------
# 输出
# ---------------------------------------------------------------------------
def main():
    global OFFLINE
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="只用本地缓存")
    ap.add_argument("--out", default=OUT_FILE)
    args = ap.parse_args()
    OFFLINE = args.offline

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    print("== 拉取数据源 ==")
    parsed, live = {}, {}
    for src in SOURCES:
        data, ok = load_source(src["id"])
        live[src["id"]] = ok
        if data is None:
            print(f"  !! {src['id']} 无数据可用,跳过")
            continue
        if src["id"] == "github_topic":
            parsed[src["id"]] = parse_github_topic(data)
        elif src["id"] == "dshworks":
            parsed[src["id"]] = parse_dshworks(data)
        elif src["id"] == "kejixiaoliang":
            parsed[src["id"]] = parse_kejixiaoliang(data)
        elif src["id"] == "zasenjc":
            parsed[src["id"]] = parse_zasenjc(data)
        else:
            parsed[src["id"]] = parse_readme(data)
        print(f"  ✓ {src['id']}: {len(parsed[src['id']])} 条")

    print("== 合并去重 ==")
    merged, src_counts = merge_all(parsed)
    print(f"  去重后: {len(merged)} 条(原始 {sum(src_counts.values())} 条)")

    print("== 分类 ==")
    plugins = [classify(rec) for rec in merged.values()]
    # 官方核心仓库特殊处理(框架本体,不是插件)
    for p in plugins:
        if p["id"] == "deepseek-ai/deepseek-harness":
            p["categories"].insert(0, "dev")
            p["category"] = "dev"
            p["category_source"] = "keyword"
    cat_count = Counter(p["category"] for p in plugins)
    uncat = cat_count.get("uncategorized", 0)
    print("  分类分布:", dict(sorted(cat_count.items(), key=lambda kv: -kv[1])))
    print(f"  未分类: {uncat} ({uncat * 100.0 // max(len(plugins), 1)}%)")

    # 排序:stars 降序(缺失垫底),再按 pushed_at
    plugins.sort(key=lambda p: (p["stars"] is None, -(p["stars"] or 0),
                                p["pushed_at"] or "", p["name"]))

    taxonomy = [
        {"id": cid, "en": CATEGORY_LABELS[cid][0], "zh": CATEGORY_LABELS[cid][1]}
        for cid, zh, words in CATEGORY_RULES
    ] + [{"id": "uncategorized", "en": "Uncategorized", "zh": "未分类"}]

    out = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "total": len(plugins),
            "raw_counts": dict(src_counts),
            "live_sources": [k for k, v in live.items() if v],
            "cached_sources": [k for k, v in live.items() if not v],
            "stats": {
                "deduped_from": int(sum(src_counts.values())),
                "uncategorized": uncat,
                "with_stars": sum(1 for p in plugins if p["stars"] is not None),
                "keyword_classified": sum(1 for p in plugins if p["category_source"] == "keyword"),
            },
        },
        "taxonomy": taxonomy,
        "plugins": plugins,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(args.out) / 1024 / 1024
    print(f"== 输出 {args.out} ({size:.2f} MB, {len(plugins)} 条)==")
    return out


if __name__ == "__main__":
    sys.exit(0 if main() else 1)

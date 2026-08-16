#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SEO 静态构建:从 data/plugins.json 生成可爬取的 site/index.html + robots.txt + sitemap.xml。

问题:前端是 JS 渲染,百度等爬虫不执行 JS,看不到插件内容。
解决:把 Top 100 插件卡片静态嵌入 HTML(爬虫可读;浏览器里 JS 初始化后正常接管)。
另注入:title/description/keywords、canonical、OG 分享标签、JSON-LD 结构化数据。

用法:
    python3 scripts/build_site.py                 # SITE_URL 默认 dsh-plugin-hub.hupc.site
    SITE_URL=https://xxx python3 scripts/build_site.py
    python3 scripts/build_site.py --url https://xxx
"""
import argparse
import html
import json
import os
import re
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE_DIR = os.path.join(ROOT, "site")
DATA_FILE = os.path.join(ROOT, "data", "plugins.json")
TEMPLATE = os.path.join(SITE_DIR, "index.template.html")
TOP_N = 100  # 静态嵌入的插件数

# 分类 id → 中文名(与 aggregate.py 一致)
CAT_ZH = {
    "ui": "UI 增强", "theme": "主题与外观", "model": "模型与接入",
    "memory": "记忆与上下文", "tools": "工具与能力", "skill": "技能包",
    "workflow": "工作流与自动化", "notify": "通知与集成", "dev": "开发与运行时",
    "market": "插件市场与管理", "vision": "多模态与视觉", "mobile": "手机与移动端",
    "tui": "桌面与终端", "cost": "成本与用量", "security": "安全与权限",
    "fun": "娱乐", "uncategorized": "未分类",
}
DEFAULT_URL = "https://dsh-plugin-hub.hupc.site"


def esc(s):
    return html.escape(str(s), quote=True)


def fmt_stars(n):
    return "–" if n is None else f"{n:,}"


def card(p):
    cat = CAT_ZH.get(p["category"], p["category"])
    pushed = ""
    if p.get("pushed_at"):
        try:
            pa = p["pushed_at"].replace("Z", "+00:00")
            dt = datetime.fromisoformat(pa)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            d = (datetime.now(timezone.utc) - dt).days
            pushed = f'<span class="push">更新 {d} 天前</span>' if d > 0 else '<span class="push">更新 今天</span>'
        except ValueError:
            pass
    desc = esc((p.get("description") or "无描述")[:140])
    return (
        f'<article class="card">'
        f'<div class="card-top"><a class="name" href="{esc(p["url"])}">{esc(p["id"])}</a>'
        f'<span class="star">★ {fmt_stars(p.get("stars"))}</span></div>'
        f'<div class="meta"><span class="cat cat-{esc(p["category"])}">{esc(cat)}</span>{pushed}</div>'
        f'<p class="desc">{desc}</p>'
        f'</article>'
    )


def build(data, url):
    url = url.rstrip("/")
    generated = data["meta"]["generated_at"]
    total = data["meta"]["total"]

    # 静态卡片:按 star 排序取 Top N
    plugins = sorted(
        data["plugins"],
        key=lambda p: (p.get("stars") is None, -(p.get("stars") or 0), p["name"]),
    )[:TOP_N]
    cards = "".join(card(p) for p in plugins)

    title = "DSH 插件聚合站 - DeepSeek Harness 插件大全 · 实时聚合检索"
    desc = (f"聚合全网 {total:,} 个 DeepSeek Harness (dsh) 插件:自动分类、按 Star/更新时间排序、支持搜索。"
            "多数据源每小时刷新,发现最新 AI Agent 插件。")
    keywords = "dsh插件,DeepSeek Harness 插件,dsh plugin,DeepSeek 插件,AI Agent 插件,插件市场"

    item_list = [
        {"@type": "ListItem", "position": i + 1, "name": p["id"], "url": p["url"]}
        for i, p in enumerate(plugins)
    ]
    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebSite", "name": "DSH 插件聚合站", "url": url + "/",
             "description": desc, "inLanguage": "zh-CN"},
            {"@type": "ItemList", "name": f"热门 DSH 插件 Top {TOP_N}",
             "itemListElement": item_list},
        ],
    }, ensure_ascii=False)

    meta = f"""<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="keywords" content="{keywords}">
<link rel="canonical" href="{url}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DSH 插件聚合站">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}/">
<meta property="og:image" content="{url}/logo.png">
<meta property="og:locale" content="zh_CN">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<script type="application/ld+json">{jsonld}</script>"""

    tpl = open(TEMPLATE, encoding="utf-8").read()
    out = tpl.replace("{{SEO_META}}", meta).replace("{{STATIC_CARDS}}", cards)
    with open(os.path.join(SITE_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(out)

    date_only = generated[:10]
    with open(os.path.join(SITE_DIR, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\nSitemap: {url}/sitemap.xml\n")
    with open(os.path.join(SITE_DIR, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f'  <url><loc>{url}/</loc><lastmod>{date_only}</lastmod>'
            f'<changefreq>hourly</changefreq><priority>1.0</priority></url>\n'
            "</urlset>\n"
        )
    print(f"== 构建完成: {TOP_N} 静态卡片, canonical={url}/, total={total}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None)
    args = ap.parse_args()
    url = args.url or os.environ.get("SITE_URL") or DEFAULT_URL
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)
    build(data, url)


if __name__ == "__main__":
    main()

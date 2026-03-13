# Pinpoint Worker

Cloudflare Worker — 负责定时抓取 LinkedIn Pinpoint 数据、发布到新站 `data/puzzles/`、触发 revalidate、发送告警。

---

## 本地开发

```bash
cd worker
npm install

npm run dev          # 本地启动（wrangler dev）
npm run deploy:dry   # dry-run，验证配置不实际部署
npm run deploy       # 部署到 Cloudflare（默认顶层 production 配置）
npm run typecheck    # TypeScript 类型检查
npm run tail         # 实时查看线上 Worker 日志
```

部署到指定服务名（shadow / staging）：

```bash
cd worker
wrangler deploy --name pinpoint-worker-shadow    # 影子运行（阶段 A）
wrangler deploy --name pinpoint-worker-staging   # 受控演练（阶段 B）
```

---

## Secrets 清单

通过 `wrangler secret put <NAME>` 或 Cloudflare Dashboard 设置。

| Secret 名称 | 用途 | shadow 需要 | staging/生产需要 |
|---|---|---|---|
| `GRAPHQL_COOKIE` | LinkedIn raw cookie（`li_at=...; JSESSIONID=...`），HTML 抓取鉴权 | ✅ | ✅ |
| `GRAPHQL_TOKEN` | GraphQL endpoint 可选 Bearer token | 可选 | 可选 |
| `GRAPHQL_CSRF_TOKEN` | Voyager GraphQL 可选 CSRF token | 可选 | 可选 |
| `SITE_API_TOKEN` | 调 `/api/admin/generate-draft` 的 Bearer token（enrichment/i18n 用） | ❌ | ✅ |
| `GITHUB_TOKEN_NEW_SITE` | GitHub fine-grained PAT，`contents:write` on `elng12/pinpoint-answer-today-new` | ❌ | ✅ |
| `NEW_SITE_REVALIDATE_SECRET` | 必须与 Vercel `REVALIDATE_SECRET` 值完全一致 | ❌ | ✅ |
| `FEISHU_WEBHOOK_URL` | 飞书告警 webhook URL | ❌ | ✅ |
| `FALLBACK_WEBHOOK_SECRET` | Playwright fallback webhook HMAC 签名密钥（可选） | 可选 | 可选 |
| `ADMIN_SECRET` | 受保护管理接口的密钥 | 可选 | ✅ |
| `WORKER_ADMIN_SECRET` | Worker 管理接口独立密钥 | 可选 | ✅ |

**注意**：enrichment 不直接调用 OpenRouter，而是通过 `SITE_API_TOKEN` 调站点自己的 `/api/admin/generate-draft`，再由站点侧调用 AI API。

---

## 关键配置

| 配置项 | 值 |
|---|---|
| KV namespace | `PP_DATA`，namespace ID `2689a48e886548a3acbe8fa9ede4e3f6` |
| Cron | `1,3,7,10,15,20 8 * * *`（UTC），即北京时间 16:01 / 16:03 / 16:07 / 16:10 / 16:15 / 16:20 |
| 目标仓库 | `elng12/pinpoint-answer-today-new`，分支 `main` |
| revalidate 地址 | `https://pinpointanswertoday.app/api/revalidate` |

---

## KV 状态键说明

| Key 模式 | 用途 |
|---|---|
| `pinpoint:YYYY-MM-DD` | 当日抓取原始数据，TTL 60 天 |
| `pinpoint:last` | 最近一次成功抓取的快照 |
| `publish:{date}:quick_done` | quick publish 已完成标记（去重用） |
| `publish:{date}:enrich_done` | enrich 已完成标记 |
| `publish:{date}:enrich_running` | enrich 运行锁（防并发） |
| `publish:{date}:i18n:{locale}:done` | i18n 某语言已完成标记 |
| `publish:{date}:i18n:{locale}:running` | i18n 某语言运行锁 |
| `monitor:cron:last` | 最近一次 cron 心跳 |
| `monitor:cron:{date}` | 某日 cron 心跳 |
| `monitor:cron:{date}:runs` | 某日 cron 运行次数 |

---

## 监控与排查

| 入口 | 方式 |
|---|---|
| 实时日志 | `cd worker && npm run tail` |
| Cron 历史 | Cloudflare Dashboard → Workers & Pages → `pinpoint-worker` → Triggers |
| Health 检查 | `GET https://<worker-domain>/health` |
| Vercel 部署 | Vercel Dashboard → `pinpoint-answer-today-new` → Deployments |
| revalidate 手动触发 | 见新站 `docs/` 下 runbook |

---

## 迁移状态

当前处于迁移 PR 1 阶段：Worker 代码已迁入新仓库，尚未切换生产 Cron。
生产 Cron 仍由父仓库 `pinpointanswertoday.app` 的 `src/index.ts` 承接。
切流方案见 `docs/single-repo-migration-todo-2026-03-13.md`。

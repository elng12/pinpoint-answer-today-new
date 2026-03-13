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

| Secret 名称 | 用途 | 备注 |
|---|---|---|
| `LINKEDIN_COOKIE` | LinkedIn session cookie，HTML 抓取鉴权 | 格式：`li_at=xxx; ...` |
| `OPENROUTER_API_KEY` | OpenRouter API，enrichment + i18n 内容生成 | 前缀 `sk-or-v1-` |
| `GITHUB_TOKEN_NEW_SITE` | GitHub fine-grained PAT，`contents:write` on `elng12/pinpoint-answer-today-new` | 最小权限，勿用宽权限 token |
| `NEW_SITE_REVALIDATE_SECRET` | 必须与 Vercel 环境变量 `REVALIDATE_SECRET` 值完全一致 | 两边不一致时 revalidate 会静默失败 |
| `NOTIFICATION_WEBHOOK_URL` | 飞书 / Slack 告警 webhook URL | 可选，未设置则不发告警 |
| `NOTIFICATION_WEBHOOK_SECRET` | Webhook HMAC 签名密钥（可选） | 与接收端约定 |

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

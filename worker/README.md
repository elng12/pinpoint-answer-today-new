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
wrangler deploy --env shadow --name pinpoint-worker-shadow    # 影子运行（阶段 A）
wrangler deploy --env staging --name pinpoint-worker-staging  # 受控演练（阶段 B）
```

---

## Secrets 清单

通过 `wrangler secret put <NAME> --env <environment>` 或 Cloudflare Dashboard 设置。

| Secret 名称 | 用途 | shadow 需要 | staging/生产需要 |
|---|---|---|---|
| `GRAPHQL_COOKIE` | LinkedIn raw cookie（`li_at=...; JSESSIONID=...`），HTML 抓取鉴权 | ✅ | ✅ |
| `GRAPHQL_TOKEN` | GraphQL endpoint 可选 Bearer token | 可选 | 可选 |
| `GRAPHQL_CSRF_TOKEN` | Voyager GraphQL 可选 CSRF token | 可选 | 可选 |
| `SITE_API_TOKEN` | 调 `/api/admin/generate-draft` 的 Bearer token（enrichment/i18n 用） | ❌ | ✅ |
| `GITHUB_TOKEN_NEW_SITE` | GitHub fine-grained PAT，`contents:write` on `elng12/pinpoint-answer-today-new` | ❌ | ✅ |
| `NEW_SITE_REVALIDATE_SECRET` | 必须与 Vercel `REVALIDATE_SECRET` 值完全一致 | ❌ | ✅ |
| `FEISHU_WEBHOOK_URL` | 飞书告警 webhook URL | ❌ | ✅ |
| `FALLBACK_WEBHOOK_SECRET` | Playwright fallback webhook HMAC 签名密钥（`FALLBACK_WEBHOOK` 已清空，此密钥暂不生效） | ❌ | ❌ |
| `ADMIN_SECRET` | 受保护管理接口的密钥 | 可选 | ✅ |
| `WORKER_ADMIN_SECRET` | Worker 管理接口独立密钥 | 可选 | ✅ |

**注意**：enrichment 不直接调用 OpenRouter，而是通过 `SITE_API_TOKEN` 调站点自己的 `/api/admin/generate-draft`，再由站点侧调用 AI API。

补充说明：

- `staging` / `shadow` 的 secret 请优先使用 `wrangler secret put <NAME> --env staging` 或 `--env shadow`，不要只写 `--name pinpoint-worker-staging`，否则容易写进错误作用域
- `FEISHU_WEBHOOK_URL` 不是阶段 B 演练必需；如果 staging 只是短期手动验证，可先不配，避免测试告警进入正式群
- `GITHUB_TOKEN_NEW_SITE` 长期应使用 fine-grained PAT，并限制到 `elng12/pinpoint-answer-today-new` 的 `contents:write`；临时复用本机 `gh auth token` 只适合一次性演练，不适合长期保留
- 站点 enrichment 走的是站点自己的 `/api/admin/generate-draft`，所以除了 Cloudflare Worker secret 以外，Vercel 站点侧也要有可用的 `API_SECRET_TOKEN` / `ADMIN_PASSPHRASE` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `AI_MODEL`
- 如果用 OpenRouter，推荐统一口径为：
  - `OPENAI_API_KEY=<OpenRouter key>`
  - `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
  - `AI_MODEL=google/gemini-2.0-flash-001` 或你实际在用的模型

本机 env 副本策略：

- 目的：避免只有 Cloudflare / Vercel 控制台里有值，后续排查时还要重新翻历史记录
- 本机副本只保留在非 Git 文件里，不替代线上 secret 管理
- 推荐位置：
  - 父仓库脚本 / AI 工具：`/Users/elng/web/pinpointanswertoday/.env.override.local`
  - 新站本地运行：`/Users/elng/web/pinpointanswertoday/new-pinpoint-site/.env.local`
- 当前建议保留本机副本的关键值：
  - `OPENROUTER_API_KEY`
  - `OPENAI_API_KEY`
  - `OPENAI_BASE_URL`
  - `AI_MODEL`
  - `OPENROUTER_SITE_URL`
  - `OPENROUTER_APP_NAME`
  - `API_SECRET_TOKEN`
  - `ADMIN_PASSPHRASE`
  - `REVALIDATE_SECRET`
- 不要再把 OpenRouter key 或其他 AI key 硬编码回脚本；父仓库脚本应只从 `OPENROUTER_API_KEY` 或 `OPENAI_API_KEY` 读取

`GITHUB_TOKEN_NEW_SITE` 收口步骤：

1. 在 GitHub 生成 fine-grained PAT，只授权仓库 `elng12/pinpoint-answer-today-new`
2. Repository permissions 至少给 `Contents: Read and write`；其余权限默认不加
3. 用 `wrangler secret put GITHUB_TOKEN_NEW_SITE --env staging` 替换 staging 临时 token
4. staging 再手动跑一次 `/admin/run?publish=1&force=1&i18n=0`，确认仍能发布后，再同样替换 production

---

## 关键配置

| 配置项 | 值 |
|---|---|
| KV namespace | `PP_DATA`，namespace ID `2689a48e886548a3acbe8fa9ede4e3f6` |
| Cron | `1,3,7,10,15,20 8 * * *`（UTC），即北京时间 16:01 / 16:03 / 16:07 / 16:10 / 16:15 / 16:20 |
| staging Cron | 已显式关闭：`[env.staging.triggers].crons = []` |
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

当前不是 PR 1 阶段，而是阶段 C 已执行后的观察期。

- 新仓库 `worker/` 已部署到生产服务名 `pinpoint-worker`
- 生产 Cron 已切到当前仓库版本
- 观察期为 `2026-03-13` 到 `2026-03-20`
- 观察期内仍保留父仓库回滚能力，暂不视为“彻底脱钩完成”

当前统一口径以 `docs/single-repo-migration-todo-2026-03-13.md` 为准。

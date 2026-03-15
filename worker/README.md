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
| `FALLBACK_WEBHOOK_SECRET` | Worker 调站点 `/api/fallback/worker-pinpoint` 的 HMAC 签名密钥 | ❌ | ✅ |
| `ADMIN_SECRET` | 受保护管理接口的密钥 | 可选 | ✅ |
| `WORKER_ADMIN_SECRET` | 预留的 Worker 管理接口独立密钥；当前 `/admin/run` 仍使用 `ADMIN_SECRET` | 可选 | ✅ |

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

## 手动触发

当前手动触发入口是 Worker 管理接口 `/admin/run`。

- 生产地址：`https://pinpoint-worker.2296744453m.workers.dev/admin/run`
- staging 地址：`https://pinpoint-worker-staging.2296744453m.workers.dev/admin/run`
- shadow 地址：`https://pinpoint-worker-shadow.2296744453m.workers.dev/admin/run`

当前代码口径：

- `/admin/run` 必须带 `secret=<ADMIN_SECRET>`，否则会返回 `401`
- `WORKER_ADMIN_SECRET` 目前不是 `/admin/run` 的校验口径；不要把它当成当前手动开关密码
- 手动触发时，如果不显式传 `i18n=0`，当前代码默认会开启 i18n
- `enrich=1` 是旧演练参数，当前代码已不读取；现行口径不要再依赖它

常用参数：

- `publish=1`：抓取后继续发布
- `force=1`：即使命中“疑似昨天旧数据”规则也继续跑发布链路
- `date=YYYY-MM-DD`：手动指定日期
- `i18n=0` 或 `i18n=1`：关闭或开启多语言

推荐命令：

```bash
export ADMIN_SECRET='<your-admin-secret>'

curl "https://pinpoint-worker.2296744453m.workers.dev/admin/run?secret=$ADMIN_SECRET&publish=1&force=1&i18n=0"
curl "https://pinpoint-worker-staging.2296744453m.workers.dev/admin/run?secret=$ADMIN_SECRET&publish=1&force=1&i18n=0"
curl "https://pinpoint-worker-shadow.2296744453m.workers.dev/admin/run?secret=$ADMIN_SECRET"
```

返回含义：

- 返回 `200` + JSON：本次手动触发已进入并执行完成
- 返回 `401 unauthorized`：`secret` 不对
- 返回 `503 admin secret not configured`：目标环境没有配置 `ADMIN_SECRET`

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

## 观察期检查项

适用场景：刚改完发布链路、刚部署 Worker、或刚切换生产配置后的 1 到 3 天观察期。

重点看这 5 项：

1. Vercel Deployments
   - 正常预期：同一题不会连续刷出很多个 production build
   - 如果同一题在几分钟内反复出现 `add answer data` / `mark live` 对应部署，说明仍有重复写入

2. Worker Cron 触发
   - 当前生产窗口：北京时间 `16:01 / 16:03 / 16:07 / 16:10 / 16:15 / 16:20`
   - 正常预期：cron 可以重复触发，但不会因为同样内容反复提交 GitHub

3. Worker 日志关键词
   - 建议用 `cd worker && npm run tail`
   - 正常预期能看到以下任一日志，说明去重逻辑在生效：
     - `skip unchanged`
     - `GitHub publish skipped ... (no content changes)`
     - `direct publish fallback skipped (already done)`

4. GitHub `main` 提交频率
   - 正常预期：每道题只出现必要的少量提交，不应再看到同一题短时间内反复提交多轮
   - 如果又出现同题连续提交，优先回查 Worker 日志和 `/admin/run` 使用记录

5. 页面结果
   - 正常预期：首页、归档页、当天详情页都能更新到当天内容
   - 如果 Worker 已成功发布但页面没更新，优先检查 revalidate 是否成功

建议异常判定：

- 同一题在 10 分钟内出现多次 production build
- Worker 日志持续推 GitHub，但没有任何 `skip unchanged` / `no content changes`
- GitHub `main` 再次出现同题多轮重复提交
- 手动触发 `/admin/run` 返回 `401` 或 `503`
- Worker 返回成功，但页面仍是旧内容

---

## 迁移状态

当前不是 PR 1 阶段，而是阶段 C 已执行后的观察期。

- 新仓库 `worker/` 已部署到生产服务名 `pinpoint-worker`
- 生产 Cron 已切到当前仓库版本
- 观察期为 `2026-03-13` 到 `2026-03-20`
- 观察期内仍保留父仓库回滚能力，暂不视为“彻底脱钩完成”

当前统一口径以 `docs/single-repo-migration-todo-2026-03-13.md` 为准。

# 2026-03-13 单仓迁移执行方案 v3

## 结论

目标不是长期维持两个仓库，而是让新仓库 `pinpoint-answer-today-new` 最终接管抓取、发布、站点和部署全链路。

当前还不能直接把父仓库扔掉，原因不是页面没迁完，而是运行基础设施还在父仓库里：

- Cloudflare Worker 抓取与定时任务（`src/index.ts`）
- `wrangler.toml` 和 Cloudflare 绑定（KV、Cron、Secrets）
- 监控与告警
- 新站直发兜底逻辑

所以这次迁移要做的是"把运行底座也搬过去"，不是只搬页面代码。

---

## 当前已知事故记录

**2026-03-13：Pinpoint #682 内容被 Worker 覆盖**

复现路径：

1. 本地手动改好 #682 内容，commit 但未 push
2. 父仓库 Worker Cron 定时运行，通过 GitHub API 向新仓库写入新版 682 JSON，push 5 个新 commit 到 `origin/main`
3. Vercel 自动从 `origin/main` 部署，本地改好的内容从未到达生产环境
4. 本地分支落后 5 个 commit，手动内容被整体覆盖

根本原因：双仓串联的"跨仓库自写入"架构，Worker 写入不带人工内容感知，整体文件覆盖。

**结论：只要父仓库 Worker 还在运行，这类覆盖问题会反复出现。迁移文档第 4 条（去掉跨仓库写入）是解决此类问题的唯一根本手段。**

---

## 当前职责切分

### 父仓库 `pinpointanswertoday.app`

现在还负责：

- `src/index.ts` 里的 Worker 抓取、发布、监控逻辑（**生产 Cron 仍在这里**）
- Cloudflare Cron、KV namespace `2689a48e886548a3acbe8fa9ede4e3f6`、Secrets、Webhook
- 跨仓库写入：通过 `GITHUB_TOKEN_NEW_SITE` 向 `elng12/pinpoint-answer-today-new` 写 JSON

### 新仓库 `pinpoint-answer-today-new`

现在负责：

- Next.js 页面与 API（Vercel 部署）
- `data/puzzles/` 内容数据（**被父仓库 Worker 覆盖写入的目标**）
- `scripts/validate-data.mjs` 数据校验
- `/api/revalidate` 缓存刷新接口
- `worker/` 目录骨架（**已存在但未 commit，见下文**）

---

## 当前进度

### 已完成（2026-03-13）

- [x] `worker/wrangler.toml` 已创建，KV namespace ID `2689a48e886548a3acbe8fa9ede4e3f6` 与父仓库生产配置核对一致
- [x] `worker/package.json` 已创建，含 `dev`、`deploy`、`deploy:dry`、`typecheck`、`tail` 命令
- [x] `worker/tsconfig.json` 已创建
- [x] KV namespace ID、Cron `1,3,7,10,15,20 8 * * *`、Secrets 清单、Feature flags 均已写入 `wrangler.toml`
- [x] `development` 环境已配置（自动关闭 publish/enrich/i18n）
- [x] `shadow` 环境已配置：`AUTO_PUBLISH_ENABLED=false`、`AUTO_ENRICH_ENABLED=false`、`AUTO_I18N_ENABLED=false`，无 Cron 绑定
- [x] `staging` 环境已配置：`AUTO_PUBLISH_ENABLED=true`、`AUTO_ENRICH_ENABLED=true`、`AUTO_I18N_ENABLED=false`，无 Cron 绑定
- [x] **PR 1 完成**：`worker/src/index.ts`（3349 行）、`worker/src/lib/publish/` 2 个依赖文件已迁入，`worker/README.md` 已补充 Secrets 清单与 KV 说明
- [x] `npm run typecheck` 通过，`wrangler deploy --dry-run` 通过，`--env shadow --dry-run` 通过
- [x] revalidate 接口已确认：`POST /api/revalidate?slug=pinpoint-answer-NNN`，Header `x-revalidate-secret: <SECRET>` 或 `Authorization: Bearer <SECRET>`
- [x] `worker/` 目录已 commit 并 push（commit `e9ae89bc`）

### 当前阶段（阶段 B 已完成，待收口）

- [x] 已为 `pinpoint-worker-shadow` 配置最小 Secrets：`GRAPHQL_COOKIE`、`ADMIN_SECRET`
- [x] 已执行：`wrangler deploy --env shadow --name pinpoint-worker-shadow`
- [x] 已手动触发一次 shadow Worker，确认抓取成功、KV 写入成功、`/health` 正常、无 GitHub 写入
- [x] 已为 `pinpoint-worker-staging` 配置阶段 B 所需 Secrets：`GRAPHQL_COOKIE`、`GITHUB_TOKEN_NEW_SITE`、`NEW_SITE_REVALIDATE_SECRET`、`SITE_API_TOKEN`、`ADMIN_SECRET`
- [x] 已执行：`wrangler deploy --env staging --name pinpoint-worker-staging`
- [x] 已完成一次阶段 B 手动演练：`publish=1&force=1&i18n=0`
- [x] 阶段 B 结果确认：`/admin/run` 返回 `200`，详情页 `pinpoint-answer-682` 可访问，响应头出现 `x-vercel-cache: REVALIDATED`
- [x] 已将 staging 的 `GITHUB_TOKEN_NEW_SITE` 替换为新生成的 `github_pat` token，并复跑阶段 B 验证通过
- [x] 已将 production 的 `GITHUB_TOKEN_NEW_SITE` 同步替换为同口径 fine-grained PAT，生产 Worker `/health` 校验正常
- [x] 已完成一次 `staging` enrich 真机验证：`publish=1&force=1&enrich=1&i18n=0`
- [x] enrich 结果确认：`enrich.status=enriched`，站点 `generate-draft` 已能通过 OpenRouter 生成 AI 内容
- [x] 已修正新站 Vercel production 的 `API_SECRET_TOKEN` / `ADMIN_PASSPHRASE` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `AI_MODEL` 写入值，去除尾部换行

### Shadow 手动触发速查

注意：

- `pinpoint-worker-shadow` 的 secret 请用 `wrangler secret put <NAME> --env shadow` 写入，不要混用 `--name pinpoint-worker-shadow`，否则容易写到错误作用域
- `ADMIN_SECRET` 不要写进仓库；保存到密码管理器或本机 shell 环境变量

```bash
export SHADOW_ADMIN_SECRET='<your-shadow-admin-secret>'
curl "https://pinpoint-worker-shadow.2296744453m.workers.dev/admin/run?secret=$SHADOW_ADMIN_SECRET"
curl "https://pinpoint-worker-shadow.2296744453m.workers.dev/health"
curl "https://pinpoint-worker-shadow.2296744453m.workers.dev/monitor/cron-status"
```

### PR 3 已完成（2026-03-13）

- [x] `enrichPublishToSite`：`getLegacySiteBaseUrl` → `getPublicSiteBaseUrl`，`/api/publish` → `publishToNewSiteGitHub`
- [x] `localizePublishToSite`：同上，去掉 "legacy site pipeline unavailable" 早退
- [x] `localizePublishOne`：添加 `doc: Doc` 参数，替换两处 `/api/publish` 为 `publishToNewSiteGitHub`
- [x] 两处 handler `shouldRunEnrich`/`shouldQueueEnrich`：去掉 `!usedQuickFallback` 条件
- [x] staging 完整链路验证通过：quick → enrich → GitHub 写入成功，AI 内容生成走 `NEW_SITE_URL/api/admin/generate-draft`
- [x] commit `8a662d6a`，已 push

### 待完成（后续步骤）

- [ ] 生产 Cron 切换到新仓库 Worker（PR 4 + 阶段 C）
- [ ] 父仓库归档

### Staging 受控演练记录（2026-03-13）

- staging Worker：`https://pinpoint-worker-staging.2296744453m.workers.dev`
- 手动触发参数：`publish=1&force=1&i18n=0`
- 抓取来源：`graphql`
- 发布结果：`quick.status=published`
- 详情页地址：`https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-682`
- 本次未配置 `FEISHU_WEBHOOK_URL`：不是完整演练必需，为避免测试噪音打入正式告警群而暂时跳过
- `GITHUB_TOKEN_NEW_SITE` 已替换为新生成的 `github_pat` token，并再次验证发布 + revalidate 通过
- production 的 `GITHUB_TOKEN_NEW_SITE` 也已同步替换为同口径 fine-grained PAT；本次仅做 secret 替换，未主动触发生产发布

### Staging enrich 验证记录（2026-03-13）

- 手动触发参数：`publish=1&force=1&enrich=1&i18n=0`
- 最终结果：`enrich.status=enriched`
- 站点侧阻塞已清除：`/api/admin/generate-draft` 不再返回 `404` / `401`
- AI 生成链路已确认：新站 Vercel production 现使用 OpenRouter 口径
  - `OPENAI_API_KEY=<OpenRouter key>`
  - `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
  - `AI_MODEL=anthropic/claude-sonnet-4`
- 本次 enrich 触发后，`pinpoint-answer-682` 已写入 AI 内容并重新发布

### 本机本地 env 备份说明（2026-03-13）

- 父仓库 AI / 脚本本地备份：`/Users/elng/web/pinpointanswertoday/.env.override.local`
- 新站本地运行备份：`/Users/elng/web/pinpointanswertoday/new-pinpoint-site/.env.local`
- 已补齐本机保存的关键值：
  - `OPENROUTER_API_KEY`
  - `OPENAI_API_KEY`
  - `OPENAI_BASE_URL`
  - `AI_MODEL`
  - `OPENROUTER_SITE_URL`
  - `OPENROUTER_APP_NAME`
  - `API_SECRET_TOKEN`
  - `ADMIN_PASSPHRASE`
  - `REVALIDATE_SECRET`
- 安全状态：上述文件均被 `.gitignore` 忽略，仅保留在本机
- 已移除父仓库脚本中的硬编码 OpenRouter key：
  - `/Users/elng/web/pinpointanswertoday/scripts/generate-sections-597-610-openrouter.ts`
  - 改为仅从 `OPENROUTER_API_KEY` 或 `OPENAI_API_KEY` 读取

---

## 迁移范围

本次迁移的目标是把生产运行链路收敛到新仓库，范围包括：

- Worker 代码与 Cloudflare 配置
- Cron、KV、Secrets、Webhook、监控与告警入口
- 抓取、发布、revalidate、校验的生产链路
- 运行文档、切流文档、回滚文档

## 非迁移范围

本次迁移不包含：

- 站点功能重构或页面改版
- 数据模型重构
- 历史内容批量重写
- 监控平台替换
- SEO / URL 策略整体重做

---

## 迁移原则

迁移期间遵循以下原则：

1. 先迁运行底座，再迁生产入口
2. 先做 dry run 和手动演练，再切生产 Cron
3. 观察期内保留父仓库回滚能力
4. 避免新旧 Worker 同时写入生产状态或生产数据
5. 配置、绑定、Secrets 的口径最终收敛到新仓库文档与配置文件
6. Cloudflare / Vercel 控制台只是运行载体，不应继续充当唯一真相来源

---

## 最小可执行迁移清单

### 1. 把 Worker 代码搬进新仓库

**当前状态**：骨架已存在于 `worker/`，但未 commit，且 `worker/src/index.ts` 未创建。

待办：

- [ ] 创建 `worker/src/index.ts`，迁入父仓库 `src/index.ts` 的完整逻辑
- [ ] `git add worker/` 并 commit（PR 1）
- [ ] 本地执行 `cd worker && npm install && npm run typecheck` 验证通过
- [ ] 本地执行 `npm run deploy:dry` 确认 wrangler 配置无误

完成标准：

- `worker/` 目录已进入 Git 历史，可从新仓库追溯 Worker 代码
- `npm run typecheck` 无错误
- `wrangler deploy --dry-run` 无报错
- 不再依赖父仓库 `src/index.ts` 作为唯一来源

---

### 2. Cloudflare 配置已基本就绪，核对生产口径

**当前状态**：`worker/wrangler.toml` 已包含以下生产配置：

```toml
name = "pinpoint-worker"
main = "src/index.ts"
compatibility_date = "2025-11-10"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "PP_DATA"
id = "2689a48e886548a3acbe8fa9ede4e3f6"

[triggers]
crons = ["1,3,7,10,15,20 8 * * *"]
# 对应北京时间 16:01 / 16:03 / 16:07 / 16:10 / 16:15 / 16:20
```

待办：

- [ ] 与父仓库生产 `wrangler.toml` 核对 KV namespace ID `2689a48e886548a3acbe8fa9ede4e3f6` 是否一致
- [ ] 与父仓库核对 Cron 表达式 `1,3,7,10,15,20 8 * * *` 是否对齐
- [ ] 确认父仓库生产 Worker 服务名（用于命名 shadow / staging 服务）
- [ ] 确认 `GITHUB_REPO_NEW_SITE = "elng12/pinpoint-answer-today-new"` 与实际仓库名一致

完成标准：

- 新仓库 `wrangler.toml` 与父仓库生产配置核对无差异
- 新仓库文档能说明每个绑定和变量的用途
- 不再依赖控制台手工备注来解释生产配置

---

### 3. 统一 Secrets 与环境变量命名

**当前已知 Secrets 清单**（来自 `worker/wrangler.toml` 注释）：

| Secret 名称 | 用途 | 状态 |
|---|---|---|
| `LINKEDIN_COOKIE` | LinkedIn session cookie，HTML 抓取鉴权 | 父仓库在用 |
| `OPENROUTER_API_KEY` | OpenRouter，enrichment + i18n 内容生成 | 新站 Vercel production 已对齐；本机 `.env.override.local` / `new-pinpoint-site/.env.local` 已保留副本 |
| `GITHUB_TOKEN_NEW_SITE` | Fine-grained PAT，contents:write on 新仓库 | staging / production 均已替换为 fine-grained PAT |
| `NEW_SITE_REVALIDATE_SECRET` | 必须与 Vercel `REVALIDATE_SECRET` 一致 | 已通过 staging 演练验证可用 |
| `NOTIFICATION_WEBHOOK_URL` | 飞书 / Slack 告警 webhook | 父仓库在用 |
| `NOTIFICATION_WEBHOOK_SECRET` | Webhook HMAC 签名（可选） | 父仓库在用 |

待办：

- [x] 已通过 staging 演练确认 `NEW_SITE_REVALIDATE_SECRET` 与 Vercel 当前 `REVALIDATE_SECRET` 可正常协同工作
- [x] 已将 staging 当前 `GITHUB_TOKEN_NEW_SITE` 替换为 fine-grained PAT，并复跑阶段 B 通过
- [x] 已为 production 环境同步配置同口径 fine-grained PAT（仅 `elng12/pinpoint-answer-today-new` `contents:write`）
- [ ] 明确是否还有其他 Secrets 在父仓库使用但未列入上表
- [ ] 在 `worker/README.md` 中写入完整 Secrets 清单与各项用途说明

完成标准：

- 所有 Secrets 能在新仓库文档中找到说明，不需要翻父仓库
- `NEW_SITE_REVALIDATE_SECRET` 与 Vercel 侧一致性已确认
- `GITHUB_TOKEN_NEW_SITE` 权限已最小化

---

### 4. 去掉跨仓库自写入（最高优先级，先解决跨仓覆盖问题）

**根因说明**：当前父仓库 Worker 通过 `GITHUB_TOKEN_NEW_SITE` 写入 `elng12/pinpoint-answer-today-new` 的 `data/puzzles/`。这意味着新仓库里的内容会被"另一个仓库里的定时任务"改动，排查覆盖来源和追 Git 历史都要来回跳两个仓库。

**目标形态**：

- 新仓库 Worker（`worker/src/index.ts`）通过 GitHub API 写入新仓库**自己的** `data/puzzles/`
- 不再依赖父仓库 Worker 作为写入方
- 本阶段先消除"父仓库跨仓写新仓库"这条链路；如需保护人工修改，后续再单独引入冲突保护机制（如仅允许写当天 slug、写前比对、人工锁）

**发布链路（目标态）**：

```
新仓库 Worker Cron 触发
  → 抓取 LinkedIn Pinpoint 数据
  → 生成 JSON，写入 data/puzzles/pinpoint-answer-NNN.json
  → 通过 GitHub API 提交到 elng12/pinpoint-answer-today-new main 分支
  → GitHub 提交触发 Vercel 自动部署
  → Worker 调用 /api/revalidate 补充刷新缓存
```

待办：

- [ ] 完成 `worker/src/index.ts` 迁移后，确认同仓写入逻辑替换了跨仓写入
- [ ] 父仓库 Worker 停止对 `elng12/pinpoint-answer-today-new` 的写入（阶段 C 完成后）
- [ ] 验证：新仓库 Worker 只改约定的生成文件，不再由父仓库跨仓改写 `data/puzzles/`

完成标准：

- 不再通过 GitHub token 从父仓库跨写新仓库内容
- 发布链路从"双仓串联"变成"同仓写入"
- `data/puzzles/` 的自动写入来源收敛到新仓库自身；若要保护人工修改，需另加冲突保护策略

---

### 5. 把自动化入口收敛到新仓库

**当前触发入口清单（已知）**：

| 入口 | 当前位置 | 目标位置 |
|---|---|---|
| Cloudflare Cron `1,3,7,10,15,20 8 * * *` | 父仓库 Worker | 新仓库 `worker/` |
| Vercel 生产部署 | `elng12/pinpoint-answer-today-new` main | 不变 |
| `/api/revalidate` | 新仓库 `app/api/` | 不变 |
| Feishu/Slack 告警 webhook | 父仓库 Worker | 新仓库 `worker/` |

待办：

- [ ] 盘点父仓库是否还有 GitHub Actions（不只是 Worker Cron）
- [ ] 确认父仓库 Worker 是否绑定了 Cron 之外的公网 HTTP Route 或自定义域名
- [ ] 切流后确保所有触发入口都能从新仓库追踪

完成标准：

- 线上任一故障都能从新仓库定位入口和日志
- 不再需要同时盯两个仓库才能看懂链路

---

### 6. 做一次正式切流

**切流前置条件**（全部满足才能执行）：

- [ ] `worker/src/index.ts` 存在且 typecheck 通过
- [ ] 阶段 A（影子运行）：新仓库 Worker 部署到 `pinpoint-worker-shadow`，运行至少 3 天，抓取日志正常
- [ ] 阶段 B（受控演练）：手动触发新仓库 Worker 完整链路一次，确认 JSON 写入 + Vercel 部署 + revalidate + 页面可访问
- [ ] `NEW_SITE_REVALIDATE_SECRET` 与 Vercel 一致性已确认
- [ ] 监控告警在新入口下正常工作

**切流步骤**：

1. 停止父仓库生产 Cron（删除或禁用 Cron 触发器，不删除 Worker 本身）
2. 将新仓库 Worker 部署到生产服务名 `pinpoint-worker`
3. 观察连续 7 天（含工作日与周末）：
   - 每天 Cron 触发成功
   - 抓取结果非空
   - 页面在北京时间 16:30 前更新
4. 7 天无异常 → 切流完成

完成标准：

- 连续 7 天定时任务成功
- 生产 Cron 由新仓库部署的 Worker 承接
- 监控与告警能在新入口下正常工作
- 不再需要父仓库 Worker 参与生产发布

---

### 7. 最后再归档父仓库

待办：

- [ ] 把父仓库 `src/index.ts` 中的 Cron handler 删除或注释掉
- [ ] 在父仓库 README 首行写明："生产 Worker 已迁移到 `pinpoint-answer-today-new/worker/`，本仓库仅作历史归档"
- [ ] 在父仓库保留回滚 runbook 链接，指向新仓库文档
- [ ] 父仓库设为只读或归档状态

完成标准：

- 不会再误把父仓库当成生产主入口
- 新需求默认只在新仓库开始

---

## 状态与绑定迁移策略

### KV 策略

**第一阶段：复用当前生产 KV namespace `2689a48e886548a3acbe8fa9ede4e3f6`**

原因：

- 当前去重、运行锁、心跳监控都依赖既有 KV 状态
- 先复用能降低"状态丢失"与"迁移脚本写错"的风险
- 新旧 Worker 同时写一个 namespace 才危险，而不是复用本身

执行要求：

- 观察期内只能有一个生产写入方
- 若新 Worker 接管生产写入，父仓库 Worker 必须停止生产 Cron
- 如未来要拆新 namespace，单独作为后续任务处理

### 已知 KV 状态项（需要在 README 中补全说明）

| Key 模式 | 用途 |
|---|---|
| `pinpoint:YYYY-MM-DD` | 当日抓取原始数据 |
| quick publish / enrich / i18n done 标记 | 防止重复发布 |
| enrich / i18n running 锁 | 并发保护 |
| cron heartbeat key | 健康监控 |
| 告警抑制 key | 告警降噪 |

### 同仓写入的技术形态（当前方案）

- 新仓库 Worker 通过 GitHub API 提交 `data/puzzles/` 变更到 `elng12/pinpoint-answer-today-new` main 分支
- GitHub 提交自动触发 Vercel 生产部署
- Worker 同时调用 `/api/revalidate` 作为缓存刷新补充
- **暂不引入数据库、R2、额外 Action 中转等改造**

---

## 本地开发命令（新仓库 `worker/` 目录）

```bash
cd worker
npm install

npm run dev           # 本地启动 Worker（wrangler dev）
npm run deploy:dry    # dry-run，验证配置不实际部署
npm run deploy        # 部署到 Cloudflare（默认 production）
npm run typecheck     # TypeScript 类型检查
npm run tail          # 实时查看线上 Worker 日志
```

部署到指定环境（shadow / staging）：

```bash
wrangler deploy --env shadow --name pinpoint-worker-shadow
wrangler deploy --env staging --name pinpoint-worker-staging
wrangler secret put GRAPHQL_COOKIE --env shadow
wrangler secret put ADMIN_SECRET --env shadow
```

---

## 双跑与切流策略

### Worker 服务名规范

| 阶段 | 服务名 | 用途 |
|---|---|---|
| 阶段 A | `pinpoint-worker-shadow` | 影子运行，只抓取不写入生产数据 |
| 阶段 B | `pinpoint-worker-staging` | 受控演练，允许手动触发完整链路 |
| 阶段 C | `pinpoint-worker`（与父仓库同名） | 正式接管生产 Cron |

执行要求：

- 阶段 A、B 不绑定生产 Cron
- 阶段 A 不注入 `GITHUB_TOKEN_NEW_SITE`、`NEW_SITE_REVALIDATE_SECRET`、`NOTIFICATION_WEBHOOK_URL` 等生产写入 Secrets，或通过 `DRY_RUN=true` 在代码层硬拦写操作
- 阶段 B 即使允许完整链路，也只能通过手动触发执行

### 阶段 A：影子运行

目标：

- 验证抓取能力、KV 读写、日志输出、health endpoint
- 对齐抓取结果与父仓库

注意：

- Cron 触发时间建议与父仓库错峰（例如延后 2 分钟），避免上游 rate limit 问题
- 上游 LinkedIn 抓取额度较紧，shadow 不应与生产完全同刻

### 阶段 B：受控演练

目标：

- 手动触发新 Worker，跑完整链路一次
- 验证 JSON 写入 → Vercel 部署触发 → `/api/revalidate` → 页面更新
- 验证 GitHub 写入与 revalidate 的幂等性

当前结果（2026-03-13）：

- 已完成一次 `pinpoint-worker-staging` 手动演练，返回 `200`
- 详情页 `pinpoint-answer-682` 已可访问，且命中 `REVALIDATED`
- `staging` 已显式关闭 Cron：`[env.staging.triggers].crons = []`
- 当前仍需补做的收口动作只有 GitHub token 最小权限化

### 阶段 C：正式切流

步骤：

1. 停止父仓库 Cron（在 Cloudflare Dashboard 删除或注释 `[triggers].crons`）
2. 将新仓库 Worker 部署到 `pinpoint-worker`
3. 验证下一次 Cron 触发成功
4. 连续观察 7 天

---

## 切流前必须满足的检查

- [ ] `worker/src/index.ts` 已创建并进入 Git 历史
- [ ] `npm run typecheck` 无错误
- [ ] `wrangler deploy --dry-run` 无报错
- [ ] `worker/wrangler.toml` 的 KV namespace ID 已与父仓库生产配置核对一致
- [ ] `NEW_SITE_REVALIDATE_SECRET` 与 Vercel `REVALIDATE_SECRET` 值一致
- [ ] cron handler 可手动触发并返回预期结果
- [ ] health endpoint 可访问
- [ ] KV 绑定可读写
- [ ] GitHub 写入链路已完成阶段 B 受控演练（至少一次成功）
- [ ] revalidate 成功并能反映到页面
- [ ] 阶段 A 已连续运行至少 3 天无异常
- [ ] 父仓库停用后，不会丢监控、告警和回滚入口
- [ ] 回滚方案已明确，能在一次值班窗口内完成

---

## 切流后验收项（连续 7 天观察）

每天验收：

- [ ] Cron 按 `1,3,7,10,15,20 8 * * *` 触发
- [ ] 抓取结果非空
- [ ] `data/puzzles/` JSON 写入成功
- [ ] `scripts/validate-data.mjs` 校验通过
- [ ] Vercel 生产部署在预期窗口内完成（通常 3 分钟内）
- [ ] `/api/revalidate` 成功
- [ ] 页面在北京时间 16:30 前展示当日新内容
- [ ] 抓取失败时告警已触达
- [ ] 发布失败时告警已触达

---

## 监控与告警入口（切流后统一收口）

切流完成后，所有入口应能从新仓库定位：

| 入口 | 位置 |
|---|---|
| Worker health endpoint | `https://<worker-domain>/health`（或同等路径） |
| Worker 实时日志 | `cd worker && npm run tail` |
| Cron 运行历史 | Cloudflare Dashboard → Workers & Pages → `pinpoint-worker` → Triggers |
| Vercel 部署状态 | Vercel Dashboard → `pinpoint-answer-today-new` → Deployments |
| revalidate 接口 | `POST /api/revalidate?slug=pinpoint-answer-NNN`，并在请求头带 `Authorization: Bearer <REVALIDATE_SECRET>` 或 `x-revalidate-secret: <REVALIDATE_SECRET>` |
| 告警 webhook | `NOTIFICATION_WEBHOOK_URL`（飞书/Slack，值在 Cloudflare Secrets 中） |

建议后续补一份 `worker/docs/runbook.md`，把以上入口和常见故障排查步骤集中记录。

---

## 回滚方案

### 回滚触发条件

- 新 Worker 定时任务连续失败 2 次以上
- 抓取成功但 GitHub 写入失败
- Vercel 部署未在预期窗口触发
- revalidate 异常导致页面未更新
- KV 写入异常、重复发布或状态污染
- 监控或告警在新入口下缺失

### 回滚动作

1. 在父仓库 `wrangler.toml` 恢复 `[triggers].crons`，执行 `wrangler deploy`
2. 暂停新仓库 `pinpoint-worker` 的 Cron 触发
3. 保留新仓库代码与文档，不做破坏性回退
4. 继续使用父仓库原有监控与告警口径，直到新链路修复完成

### 回滚要求

- 观察期内父仓库 Worker 代码、Secrets、KV 绑定不得删除
- 观察期内父仓库 `wrangler deploy` 能力必须保持可用
- 回滚动作必须能在一次值班窗口内完成，不依赖临时补脚本

数据连续性说明：

- 生产内容数据收敛在新仓库 Git 历史中
- 回滚影响的是"谁负责抓取与发布"，不是"历史内容是否丢失"
- 回滚后旧 Worker 沿用同一新仓库、同一分支、同一数据格式，历史内容不割裂

---

## 建议执行顺序

1. ✅ 创建 `worker/src/index.ts`，迁入父仓库逻辑，commit（**PR 1 已完成**）
2. ✅ 统一 Secrets 说明与 KV 核对，更新 `worker/README.md`，补充 shadow/staging 环境配置（**已完成**）
3. ✅ 为 `pinpoint-worker-shadow` 配置最小 Secrets，部署并手动验证阶段 A（**已完成**）
4. ✅ 为 `pinpoint-worker-staging` 配置完整 Secrets，完成一次阶段 B 手动演练（**已完成**）
5. **当前**：继续推进同仓写入闭环（PR 3）
6. 停父仓库 Cron，切新仓库到生产服务名（PR 4 + 阶段 C）
7. 观察 7 天
8. 归档父仓库

---

## 不建议现在就做的事

- 不要先删父仓库
- 不要只迁页面不迁 Worker
- 不要先改一半 Secrets 命名
- 不要在没有 dry run 的情况下直接切 Cron
- 不要新旧两个 Worker 同时绑定生产 Cron（双写生产 KV）

---

## 建议拆分成的 PR

### PR 1 ✅ 已合并（commit e9ae89bc）

`chore: scaffold cloudflare worker inside new repo`

内容：

- `worker/src/index.ts`（3349 行，生产 Worker 完整逻辑）
- `worker/src/lib/publish/locale-auto-publish-freeze.ts`、`auto-i18n-policy.ts`
- `worker/wrangler.toml`（含 shadow/staging/development 三个命名环境）
- `worker/package.json`、`tsconfig.json`、`.gitignore`、`README.md`

验收：typecheck ✅，deploy --dry-run ✅，shadow env dry-run ✅

### PR 2

`feat: port fetch publish monitor pipeline into new repo`

内容：

- 迁入完整抓取、发布、监控、告警逻辑
- 同仓写入替换跨仓库写入
- 补齐阶段 B 受控演练所需的全部功能

说明：PR 2 需保证新仓库 Worker 能独立完成端到端演练，否则阶段 B 无法验证。

### PR 3

`refactor: replace cross-repo publish with in-repo data update`

内容：

- 清理 PR 2 中为兼容保留的过渡代码
- 确认跨仓库写入路径已完全移除

### PR 4

`chore: cut over production worker to new repo`

内容：

- 停止父仓库 Cron
- 将新仓库 Worker 部署到生产服务名
- 更新 runbook，标记父仓库归档口径

---

## 待确认事项

阶段 A 部署前需要人工确认：

- [x] 父仓库当前生产 Worker 服务名：`pinpoint-worker`（来自父仓库 `wrangler.toml` `name` 字段）
- [x] KV namespace ID：`2689a48e886548a3acbe8fa9ede4e3f6`（两边已核对一致）
- [x] 生产 Cron：`1,3,7,10,15,20 8 * * *`（两边已核对一致）
- [x] revalidate API 格式：`POST /api/revalidate?slug=NNN`，Header `x-revalidate-secret`（已从新站代码确认）
- [ ] shadow / staging 服务部署到哪个 Cloudflare account（需登录 Dashboard 确认）
- [ ] 父仓库 Worker 是否还绑定了 Cron 之外的公网 HTTP Route 或自定义域名
- [ ] `GITHUB_TOKEN_NEW_SITE` 当前是个人 token 还是 fine-grained PAT（需确认后再为 staging 配置）
- [ ] 影子运行期间，LinkedIn 抓取的 rate limit 是否允许 shadow 与父仓库 Worker 同时触发（shadow 不绑定 Cron，只手动触发，无冲突）
- [ ] 当前是否还接了 Cloudflare 之外的外部监控或告警平台

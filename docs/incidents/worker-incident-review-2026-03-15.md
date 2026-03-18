# Worker 事故复盘 & 现状说明 — 2026-03-15

> 作者：审阅整理
> 面向对象：参与本项目的所有同事
> 涉及提交：`a92785f9`、`2f5c3120`、`c7c08e4c`、`55954162`、`06624311`

---

## 一、问题描述

### 现象

2026-03-15 前，Vercel Dashboard 上同一道题（如 Pinpoint #684）出现了 **4–6 个 production deployment**，GitHub `origin/main` 里出现了大量重复提交，格式为：

```
feat: add Pinpoint #684 answer data
feat: publish Pinpoint #684 — mark live
feat: add Pinpoint #684 answer data       ← 重复
feat: publish Pinpoint #684 — mark live   ← 重复
...
```

### 根因

两个独立问题叠加：

#### 问题 A：direct fallback 缺少去重（主犯）

当 `SITE_BASE_URL=""` 时，Worker 会走 direct fallback，直接写 GitHub。但旧代码里这条路径**没有"今天是否已发过"的检查**，每次 cron 触发（北京时间 `16:01 / 16:03 / 16:07 / 16:10 / 16:15 / 16:20` 共 6 次窗口）都会无条件写一次 GitHub，每次写还会产出**两个独立 commit**（slug 文件一个，`registry.json` 一个），因此单题最多产出 12 个提交。

#### 问题 B：registry.json 只要时间戳变化就制造新 commit

旧代码在 `registry.json` 里，每次都会刷新 `updatedAt` 字段为当前时间，即使内容没有任何变化，也会形成新 commit。

---

## 二、本次修复内容（提交 `a92785f9`）

### 2.1 Direct fallback 加 KV 幂等锁

```
publish:{date}:new_site_direct:{signature}:done     TTL 14 天
publish:{date}:new_site_direct:{signature}:running  TTL 30 分钟
```

`signature` = `sha256(puzzleNumber + payload)` 前 24 位，内容不变则 key 相同，14 天内不重复执行。

**效果**：6 次 cron 窗口里，只有第一次真正执行，其余 5 次直接跳过，日志输出 `direct publish fallback skipped (already done)`。

### 2.2 GitHub 写入前做内容比对

新增 `stageFile()` 函数，写入前先拉取远端文件，base64 解码后做字符串严格对比，内容相同则跳过，日志输出 `skip unchanged {path}`。

**效果**：即使 KV 锁被绕过（如手动 `force=1`），只要内容没变，也不会制造新 commit。

### 2.3 多文件合并为单次 commit

旧代码：slug 文件和 `registry.json` 分别各 `PUT`，产出 2 个 commit。
新代码：引入 `stagedFiles[]` 暂存，统一调用 GitHub Tree / Commit / Ref API，一次发布只产出 **1 个 commit**，commit 信息统一为 `feat: publish Pinpoint #${puzzleNumber}`。

### 2.4 registry.json 只在字段真实变化时更新

新增 `needsEntryUpdate` 逐字段比对（`status / slug / publishDate / clues / mainAnswer / category / difficultyLevel / shortSummary`），全部相同则跳过更新，不刷新 `updatedAt`，不制造新 commit。

### 2.5 revalidate 只在有内容变化时触发

`hasContentChanges = slugChanged || registryChanged`，为 `false` 时直接 `return`，不调 Vercel ISR revalidate 接口。

---

## 三、文档收口（提交 `2f5c3120`）

修复了 README 里三处历史遗留误导：

| 原来的说法 | 正确说法 |
|---|---|
| `/admin/run` 用 `WORKER_ADMIN_SECRET` 鉴权 | 当前用 `ADMIN_SECRET`，`WORKER_ADMIN_SECRET` 是预留字段 |
| 手动触发默认不开 i18n | 不传 `i18n=0` 时，当前代码**默认开启** i18n |
| `enrich=1` 参数有效 | 历史残留参数，当前代码不再读取，不要依赖 |

同时新增"观察期检查项"，说明上线后应盯的 5 个指标及异常判定标准。

---

## 四、修复验证结果

| 验证项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| 第一次 Cloudflare 部署 | ✅ 版本 `8d0b85e7` |
| 第二次 Cloudflare 部署（确认新代码生效） | ✅ 版本 `ae6b69fa` |
| 手动触发后检查 `origin/main` HEAD | ✅ 无新增提交，停在 `58943d2a` |
| `quick.status=published` 正常返回 | ✅ |

> **注意**：第一次验证时发现 GitHub 又产出了新提交，排查后确认是 Cloudflare 上跑的还是旧版本。重新部署后第二次验证通过。

---

## 五、已知遗留问题：GraphQL 认证失败（以当时运行记录为准）

### 现象

据 `2026-03-15` 当天的飞书告警和运行记录，`16:07 / 16:10 / 16:15 / 16:20 CST` 的 `scheduled` 触发均出现过 GraphQL 认证失败；已观察到的状态码至少包含 `graphql 401`，其余状态以当时原始日志为准。

### 根因

LinkedIn 的 `li_at` session cookie（存储在 `GRAPHQL_COOKIE` secret 中）**过期了**。代码里没有自动刷新机制，token 完全靠手动维护。

### 这次修复没有解决这个问题

本次修复目标是**重复发布**，GraphQL 认证失败是独立问题。

---

## 六、降级链（提交 `c7c08e4c` / `55954162` / `06624311`）

### 为什么要有降级链

LinkedIn 登录 cookie 随时可能过期，与其每次过期都中断发布，不如建立一条备用数据源。

### 降级链结构

```
LinkedIn GraphQL  →  401 / 超时
        ↓
FALLBACK_WEBHOOK (/api/fallback/worker-pinpoint)
        ↓ mode=auto 自动选择
  ┌─────────────────────────────────────────────────┐
  │  fallback-local      站点本地题库已有数据        │  优先
  │  fallback-competitor 抓竞品 pinpointanswer.today │  兜底
  └─────────────────────────────────────────────────┘
```

**fallback-local**：读站点本地题库（`registry.json` + 对应题目 JSON）里已存在的题目，数据可信，但前提是本地题库里已经有当天题目。

**fallback-competitor**：HTTP 请求抓取竞品站页面，解析 `todayPinpointData` block，提取答案。不依赖登录态，但依赖竞品站可访问。

### 降级链不是修复根因

降级链是**绕开** LinkedIn 认证失效的方案，不是修复它。如果竞品站也挂了、且站点本地题库里也没有当天数据，发布仍会失败。

### 验证降级链是否可用

```
GET /admin/test-fallback?date=2026-03-16&mode=auto&secret=<ADMIN_SECRET>
```

返回示例（正常）：

```json
{
  "ok": true,
  "probeDate": "2026-03-16",
  "mode": "auto",
  "source": "fallback-competitor",
  "answersCount": 5,
  "words": ["...", "...", "...", "...", "..."],
  "theme": "...",
  "mainAnswer": "...",
  "durationMs": 1234
}
```

`ok: true` 且 `answersCount: 5` 则降级链可用，明天 cron 失败时能自动接管。

---

## 七、需要人工跟进的事项

### 7.1 更新 LinkedIn Cookie（待处理）

**优先级：高**
长期依赖降级链不稳定，需要尽快更新 `GRAPHQL_COOKIE`：

1. 浏览器登录 LinkedIn
2. DevTools → Application → Cookies → `www.linkedin.com` → 复制 `li_at` 值
3. 同时从 Network 面板复制完整 Cookie 字符串
4. 更新 Cloudflare secret：

```bash
cd worker
echo "<新的完整cookie字符串>" | wrangler secret put GRAPHQL_COOKIE
```

5. 验证：`GET /admin/run?publish=1&force=1&i18n=0&secret=<ADMIN_SECRET>`，并确认返回里的 `source=graphql`。如果返回 `source=fallback-*`，只能说明降级链接住了，不代表 LinkedIn Cookie 已恢复。

### 7.2 验证降级链连通性（今天就做）

**优先级：高**
在明天 cron 跑之前，先跑一次 `/admin/test-fallback` 确认降级链能用。

### 7.3 补充文档：`force=1` 对 direct fallback 无效（低优先级）

新的 KV 锁**不受 `force=1` 影响**。如果需要强制重发相同内容（比如 Vercel ISR 挂掉需要重新触发 revalidate），需要手动删除 KV 键：

```
publish:{date}:new_site_direct:{signature}:done
```

建议在 README 里补充这条说明。

---

## 八、明天观察期验收标准（2026-03-17 16:20 后）

| 检查项 | 期望值 | 判定方式 |
|---|---|---|
| Vercel production deployments | 同一道题 ≤ 1 个 | Vercel Dashboard |
| GitHub `origin/main` 新增提交数 | 每道题 1 个 commit | `git log --oneline origin/main -5` |
| Worker 日志关键词 | 出现 `skip unchanged` 或 `direct publish fallback skipped` | `/monitor/cron-status` 或 `wrangler tail` |
| 页面内容 | 16:20 后页面显示当天答案 | 直接访问网站 |
| `graphql 401` | 若仍出现，确认降级链是否接管（`source: fallback-*`） | cron-status 接口 |

---

## 九、提交汇总

| 提交 | 说明 | 作者 |
|---|---|---|
| `a92785f9` | fix: harden worker publish idempotency（KV 锁 + 内容比对 + 单 commit） | 同事 |
| `2f5c3120` | docs: add worker observation checklist | 同事 |
| `c7c08e4c` | fix: restore worker fallback webhook（降级链基础设施） | 同事 |
| `55954162` | feat: add manual fallback self-test（`/admin/test-fallback` 端点） | 同事 |
| `06624311` | feat: notify fallback self-test results | 同事 |

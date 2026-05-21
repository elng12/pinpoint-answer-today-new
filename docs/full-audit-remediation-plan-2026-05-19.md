# 全面审批修复方案 v3

> 日期: 2026-05-19
> 版本: v3（根据 agent 审批复核修订）
> 状态: v3 已批准执行（按本文拆分顺序推进）
> 基于: 5 团队并行审查 + 3 专家审批 + 2 个 agent 独立复核

---

## 背景

对项目进行 5 个维度的全面审查后，发现多项需修复的问题。v2 方案覆盖面较完整，但 agent 复核发现它不能直接作为批准执行版使用：存在生产域名写错、部分 false positive、执行顺序污染 GSC 恢复窗口、PR 拆分不够干净等问题。

本 v3 版本已修正审批阻断点，批准按本文拆分顺序推进。除紧急安全事项外，所有生产代码发布都必须避开 Phase 0 后的短期 GSC 归因窗口，保持每个 PR 独立、可验证、可回滚。

> **Phase 0 已完成**（commit `94ff8c5`，2026-05-19 11:16 UTC），修复了 sitemap lastmod 动态化和 #735/#736/#737 registry 恢复。本方案描述的是 Phase 1-5 新增修复。

---

## v2 审批复核结论

**结论：v2 不批准直接执行。**

必须先修正以下阻断点：

1. 生产验证域名统一为 `https://pinpointanswertoday.app`，不得使用 `pinpointanswertoday.com`。
2. Next.js 升级方向成立，但不得默认作为 Phase 0 观察窗口内的第一项生产发布，除非安全负责人明确按紧急安全修复批准。
3. `buildNoStoreHeaders` TypeScript 错误当前不可复现，不能列为 P0。
4. `/pinpoint/:number-analysis` 重定向参数问题已验证不成立，不能作为修复项执行。
5. `contact-us` 重新加入 sitemap 与既有 SEO 策略存在冲突，必须作为独立 SEO 决策，不得并入 P0/P1 快修。
6. `npm audit` 验收不能简单写成“无 critical/high”，应区分生产依赖、Next 直连漏洞和剩余 dev/transitive 漏洞。
7. Phase 2 安全项必须拆成独立 PR，不得把认证、SSRF、HSTS、URL 泄露、rate limit 混在同一 PR。

---

## Phase 1a: Next.js 安全升级（P0 安全项 — 独立 PR，需发布闸门）

### 1a.1 升级 Next.js 15.0.5 → 15.5.18

- **文件**: `package.json`
- **操作**: `npm install next@15.5.18 eslint-config-next@15.5.18 react@19.2.6 react-dom@19.2.6`
- **必须同步升级 `eslint-config-next`**：当前 `package.json` 第 40 行为 `"eslint-config-next": "^15.0.5"`，必须同步升级到 `^15.5.18`，否则 lint 规则与框架版本不匹配
- **React 19.0.0 → 19.2.6 注意事项**：
  - React 19.1+ 修改了 `useEffect` 清理行为和 Server Components 的一些边界情况
  - `@types/react@^19.0.0` 和 `@types/react-dom@^19.0.0` 需确认兼容 19.2.x
- **预评估步骤**（合并前必须完成）：
  1. 阅读 Next.js 15.1-15.5 CHANGELOG，标记 breaking changes
  2. 确认 `dynamic = "force-dynamic"`、`revalidateTag`/`revalidatePath`、中间件行为无变化
  3. 确认 `next/image` 组件 API 无 breaking change
  4. 记录 `npx next build` 升级前构建时间，升级后对比
- **原因**: 当前 15.0.5 含 14 个已知安全漏洞，包括:
  - 中间件授权绕过 (GHSA-f82v-jwr5-mffw)
  - HTTP 请求走私 (GHSA-ggv3-7p47-pfv8)
  - Server Components DoS (GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj)
  - XSS (GHSA-ffhc-5mcf-pf4q, GHSA-gx5p-jg67-6x7h)
  - 缓存投毒 (GHSA-3g8h-86w9-wvmq, GHSA-vfv6-92ff-j949, GHSA-wfc6-r584-vfw7)
  - SSRF via WebSocket (GHSA-c4j6-fc7j-m34r)
  - Image Optimization DoS (GHSA-h64f-5h5j-jqjh)
  - PostCSS XSS (GHSA-qx2v-qp2m-jg93)
- **验证**:
  - `npx next build` 成功
  - `npx tsc --noEmit` 通过
  - `npx next lint` 零警告
  - `npm audit --omit=dev` 无生产依赖 critical/high
  - `npm audit` 中 Next.js 相关 critical/high 已清零；如仍存在 dev/transitive high，单独记录来源和修复计划
  - 构建时间与升级前对比无显著退化
- **发布闸门**:
  - 默认不在 Phase 0 上线后 5 个完整自然日内发布，避免污染 GSC 恢复归因。
  - 如安全负责人认定必须立即修复，则按紧急安全 PR 执行，并在 GSC 监控记录中明确标记“框架升级变量已引入”。
- **回滚方案**:
  1. `git revert <merge-commit-sha>`
  2. 使用 git 中的 `package-lock.json` 恢复依赖锁定，不手动重新生成未审查 lockfile
  3. `npx next build` 确认回滚后构建正常
  4. 升级前记录当前 `package-lock.json` 的 git hash，便于验证回滚完整性

---

## Phase 1b: 移除硬编码开发密钥（P0 — 独立 PR）

### 1b.1 替换硬编码 token

- **涉及文件**:
  - `lib/site/admin-auth.ts`（第 11 行）
  - `scripts/check-pinpoint-guardrails.ts`（第 1745 行、第 1782 行）
  - `scripts/run-pinpoint-regression.mjs`（第 9 行）
- **当前代码**（`admin-auth.ts`）:
  ```ts
  process.env.NODE_ENV === "production" ? null : "admin-secret-dev",
  ```
- **修改为**:
  ```ts
  process.env.NODE_ENV === "production" ? null : process.env.DEV_ADMIN_TOKEN,
  ```
- **guardrails 脚本修改**: `authorization: "Bearer admin-secret-dev"` 改为读取 `process.env.DEV_ADMIN_TOKEN`
- **regression 脚本修改**: 保留现有 `PINPOINT_REGRESSION_ADMIN_TOKEN` 优先级，推荐顺序改为 `PINPOINT_REGRESSION_ADMIN_TOKEN || process.env.DEV_ADMIN_TOKEN || process.env.ADMIN_PASSPHRASE || "admin-secret-dev"`。脚本场景下保留最后回退值可接受，因为脚本仅在本地运行。
- **配套操作**:
  - 在 `.env.example` 中添加 `DEV_ADMIN_TOKEN=change-me-to-a-random-string`（使用占位符，不用弱密钥作示例）
  - 在 `admin-auth.ts` 中添加启动时检查：如果 `DEV_ADMIN_TOKEN` 值为 `admin-secret-dev` 或 `change-me-to-a-random-string`，输出 `console.warn` 警告
  - 开发环境的 `.env.local` 中配置 `DEV_ADMIN_TOKEN=<实际值>`
  - 生产环境不设置此变量，`filter(Boolean)` 自动过滤
- **补充 `.env.example` 缺失变量**:
  - `API_SECRET_TOKEN=change-me`
  - `ADMIN_PASSPHRASE=change-me`
  - `INDEXNOW_KEY=change-me`
- **注意**: `.env.example` 当前已经包含 `NEXT_PUBLIC_TWITTER_HANDLE`，不要重复添加。
- **验证**:
  - 源码中搜索 `admin-secret-dev` 仅出现在 regression 脚本回退值和启动警告中
  - 生产 `ADMIN_TOKENS` 不含硬编码值
  - 本地 guardrails 脚本和 regression 脚本正常工作
- **回滚方案**: `git revert <sha>`，开发者在 `.env.local` 中恢复 `DEV_ADMIN_TOKEN=admin-secret-dev`

---

## Phase 1c: 小型环境与 SEO 决策项（P1/P2 — 必须拆分）

### 1c.1 `buildNoStoreHeaders` TypeScript 错误复核（不执行代码修改）

- **文件**: `lib/api-headers.ts`（第 25 行）
- **复核结论**: agent 只读验证 `tsc --noEmit` 当前通过，文档 v2 声称的 `app/api/health/route.ts:34` 和 `:40` TypeScript 错误不可复现。
- **审批决定**: 不作为 P0 修复项执行。
- **保留动作**: 若未来出现真实类型错误，可作为独立 cleanup PR 统一 `buildCachedHeaders` / `buildNoStoreHeaders` 返回类型；当前不进入执行序列。

### 1c.2 是否将 Contact 页加入 Sitemap（SEO 决策项，暂不执行）

- **文件**: `app/sitemap.ts`
- **v2 原建议**: 在 `indexableLegalRoutes` 数组中添加（与 `disclaimer` 同类，非 `primaryRoutes`）:
  ```ts
  const indexableLegalRoutes = [
    { path: routes.disclaimer, lastModified: getStaticRouteLastModified(routes.disclaimer) },
    { path: routes.contact, lastModified: getStaticRouteLastModified(routes.contact) },
  ];
  ```
- **复核问题**: 历史 SEO 文档曾明确将 `contact-us` 从 sitemap 移除；当前 GSC 恢复方案只要求强化 Trust/E-E-A-T 页面，没有批准将 Contact 重新纳入 sitemap。
- **审批决定**: 暂不执行。必须先补一段 SEO 策略说明，解释为什么现在要推翻旧策略，以及它是否会影响 Phase 0 归因。
- **如二次审批通过后的验证**:
  - `curl http://localhost:3004/sitemap.xml | grep contact-us` 确认出现
  - `curl -s https://pinpointanswertoday.app/sitemap.xml | grep contact-us` 确认生产出现

### 1c.3 确认 `twitter:site` 环境变量

- **操作**: 确认 Vercel 生产环境中 `NEXT_PUBLIC_TWITTER_HANDLE` 已设置
- **格式要求**: 值必须包含 `@` 前缀（如 `@YourHandle`），代码中 `lib/site/config.ts:6` 只做 `trim()` 不做格式校验
- **`.env.example` 状态**: 当前已包含 `NEXT_PUBLIC_TWITTER_HANDLE=` 和注释示例，不需要重复添加。
- **验证**: `curl -s https://pinpointanswertoday.app | grep twitter:site`

---

## Phase 2: 安全加固（P1 — 必须拆为独立 PR）

> v2 写成“可拆为 2-3 个独立 PR”，但实际包含多类互不相关的安全变量。v3 要求每个小节独立 PR，除非评审明确批准合并。

### 2.1 密钥比较改用恒定时间算法

- **涉及文件**:
  - `app/api/revalidate/route.ts`（第 49 行）
  - `app/api/fallback/worker-pinpoint/route.ts`（第 29 行）
  - `app/api/admin/generate-draft/route.ts`（第 624 行）
  - `app/api/admin/validate-draft/route.ts`（第 70 行）
  - `lib/site/admin-auth.ts`
- **方案**: 在 `lib/site/admin-auth.ts` 中添加 `safeEqual` 工具函数并导出:
  ```ts
  import { timingSafeEqual } from "crypto";

  /**
   * 恒定时间字符串比较。
   * 注意：仅适用于 Node.js runtime，Edge Runtime 不支持 crypto.timingSafeEqual。
   */
  export function safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) {
      // 执行一次假比较以消除时序差异，防止攻击者通过响应时间推断密钥长度
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
  ```
- **`admin-auth.ts` 添加 `authenticateAdmin` 函数**:
  ```ts
  export function authenticateAdmin(token: string): boolean {
    return ADMIN_TOKENS.some((t) => safeEqual(token, t));
  }
  ```
  > 注意：`some()` 在第 k 个匹配时返回，响应时间与全部不匹配不同。对于当前场景（低频管理 API、token 列表仅 2-3 项），此差异可接受。若需更高安全等级，可改用 HMAC 对 token 做固定长度哈希后再比较。
- **revalidate/route.ts:49** 改为:
  ```ts
  if (!stored || !safeEqual(secret, stored)) {
  ```
- **worker-pinpoint/route.ts:29** 改为:
  ```ts
  if (expectedSecret && !safeEqual(providedSecret, expectedSecret)) {
  ```
- **generate-draft/route.ts:624** 和 **validate-draft/route.ts:70** 改为:
  ```ts
  if (!token || !authenticateAdmin(token)) {
  ```
- **Edge Runtime 兼容性标注**: 在使用 `safeEqual` 的文件头添加注释，标注此代码仅适用于 Node.js runtime。如果未来路由迁移到 Edge Runtime，需替换实现
- **验证**:
  - 手动调用 `/api/revalidate` 确认认证正常
  - 手动调用 `/api/admin/generate-draft` 确认认证正常
  - `npx tsc --noEmit` 通过
- **回滚方案**: `git revert <sha>`

### 2.2 SSRF 防护：URL scheme/域名白名单（独立 PR）

- **涉及文件**:
  - `lib/puzzles/worker-fallback.ts`（`normalizeCompetitorUrl` 函数）
  - `lib/puzzles/data-sources.ts`（`getGithubRawBase` 函数）
  - `app/api/health/route.ts`（`resolveWorkerHealthUrl` 函数）
  - `app/api/pinpoint/today/route.ts`（`resolveUpstreamUrl` 函数或等效）
  - `lib/puzzles/data/live-worker.ts`（Worker URL 构造）
  - `app/api/feedback/route.ts`（webhook URL 构造）
- **通用校验函数**（提取到 `lib/security/url-allowlist.ts`）:
  ```ts
  type UrlAllowlistRule = {
    allowedSchemes: string[];           // e.g. ["https:"]
    allowedHosts: string[];             // e.g. ["pinpointanswer.today"]
    allowedHostSuffixes: string[];      // e.g. [".githubusercontent.com"]
  };

  export function validateUrlAgainstAllowlist(
    url: URL,
    rule: UrlAllowlistRule,
    label: string,
  ): void {
    if (!rule.allowedSchemes.includes(url.protocol)) {
      throw new Error(`SSRF protection [${label}]: scheme ${url.protocol} not allowed`);
    }
    const hostOk =
      rule.allowedHosts.includes(url.hostname) ||
      rule.allowedHostSuffixes.some((suffix) => url.hostname.endsWith(suffix) && url.hostname !== suffix.slice(1));
    if (!hostOk) {
      throw new Error(`SSRF protection [${label}]: host ${url.hostname} not in allowlist`);
    }
  }
  ```
  > **关键要求**：suffix 匹配必须带点边界。`hostname === "githubusercontent.com" || hostname.endsWith(".githubusercontent.com")` 是安全写法。注意：`evilgithubusercontent.com` 不会匹配 `.githubusercontent.com`，v2 中该示例表述不准确。
- **各调用点配置**:

  | 文件 | 环境变量 | allowedHosts | allowedHostSuffixes |
  |------|----------|-------------|-------------------|
  | `worker-fallback.ts` | `PINPOINT_BASE_URL` | `["pinpointanswer.today"]` | `[]` |
  | `data-sources.ts` | `GITHUB_RAW_BASE` | `["githubusercontent.com"]` | `[".githubusercontent.com"]` |
  | `health/route.ts` | `PINPOINT_WORKER_HEALTH_URL` | `["pinpoint-worker.2296744453m.workers.dev"]` | `[".workers.dev"]` |
  | `today/route.ts` | `PINPOINT_WORKER_HEALTH_URL` | 同上 | 同上 |
  | `live-worker.ts` | `PINPOINT_WORKER_HEALTH_URL` | 同上 | 同上 |
  | `feedback/route.ts` | `FEEDBACK_WEBHOOK_URL` 等 | 待确认 | 待确认 |

- **验证**:
  - 执行前确认生产 `FEEDBACK_WEBHOOK_URL` / `FEISHU_WEBHOOK_URL` / `SLACK_WEBHOOK_URL` / `ALERT_WEBHOOK_URL` 的真实域名清单，避免白名单误杀现有反馈通道
  - 设置非法环境变量（如 `file:///etc/passwd`、`http://githubusercontent.com.evil.test/payload`）验证报错
  - `npx next build` 确认正常 URL 不受影响
- **回滚方案**: `git revert <sha>`

### 2.3 添加 HSTS 安全头（分步启用）

- **文件**: `next.config.ts`，`securityHeaders` 数组中添加
- **第一步**（本次 PR）：不含 preload
  ```ts
  {
    key: "Strict-Transport-Security",
    value: "max-age=300; includeSubDomains",
  },
  ```
- **第二步**（运行 1-2 周确认无子域名被影响后）：加大 max-age
  ```ts
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  ```
- **第三步**（可选，需评估后决定）：添加 `preload`
- **preload 不可逆风险说明**: 一旦加入浏览器 HSTS preload 列表，移除需通过 hstspreload.org 提交请求，生效周期数周到数月。期间所有子域名强制 HTTPS，staging/内网环境如需 HTTP 将不可访问
- **前置检查**: 确认 Vercel 平台层是否已设 HSTS 头，避免响应中出现两个 `Strict-Transport-Security` 头
- **验证**: `curl -I https://pinpointanswertoday.app` 检查 `Strict-Transport-Security` 头存在且仅一个
- **回滚方案**: `git revert <sha>`；注意浏览器已缓存的 HSTS 头在 max-age 过期前仍有效，短期 max-age (300s) 降低了此风险

### 2.4 重定向参数名问题复核（不执行代码修改）

- **文件**: `next.config.ts`（第 158-161 行）
- **当前代码**:
  ```ts
  source: `/${locale}/pinpoint/:number(\\d+)-analysis`,
  destination: "/pinpoint/:number-analysis",
  ```
- **复核结论**: agent 只读验证 Next 15.0.5 会将 `/pinpoint/:number-analysis` 正确解析为参数 `number` + 字面量 `-analysis`，目标为 `/pinpoint/123-analysis`。
- **审批决定**: 不作为修复项执行。
- **保留动作**: 将 `curl -v http://localhost:3004/en/pinpoint/123-analysis` 放入回归验证清单，防止未来 Next 升级后行为变化。

### 2.5 移除 health/today 端点的内部 URL 泄露

- **涉及文件**:
  - `app/api/health/route.ts`（第 41 行）
  - `app/api/pinpoint/today/route.ts`（第 47 行）
- **当前代码**: 错误响应中包含 `workerHealthUrl: workerHealthUrl.toString()`，暴露内部 Cloudflare Worker URL（`pinpoint-worker.2296744453m.workers.dev`）
- **修改**: 错误响应中移除内部 URL，或替换为通用错误消息
  ```ts
  // 修改前
  { error: message, workerHealthUrl: workerHealthUrl.toString() }
  // 修改后
  { error: message }
  ```
- **验证**: `curl https://pinpointanswertoday.app/api/health` 在 Worker 不可用时，响应中不含 `workers.dev` URL
- **回滚方案**: `git revert <sha>`

### 2.6 管理员 API 添加速率限制

- **涉及文件**: `app/api/admin/generate-draft/route.ts`、`app/api/admin/validate-draft/route.ts`
- **方案**: 复用 `app/api/feedback/route.ts` 中已有的速率限制模式（基于内存的滑动窗口），提取为共享模块 `lib/rate-limit.ts`
- **配置建议**: 10 分钟窗口内最多 20 次请求（管理员操作频率较低，但需高于 feedback 的 5 次）
- **验证**: 快速连续发送超过 20 次请求，确认第 21 次返回 429
- **回滚方案**: `git revert <sha>`

---

## Phase 3: SEO 修复（P1 — 独立 PR）

> SEO 修复从原 P2 提升到 P1，因为 impressions 下降 86.5% 是生存级问题。

### 3.1 归档页 ItemList JSON-LD 截断

- **文件**: `lib/seo/archive-structured-data.ts`（第 29-38 行）
- **当前问题**: `ItemList.itemListElement` 对全部 `archiveEntries` 做 `.map()`，无截断。复核时当前 registry 约 292 条，ItemList JSON 约 33KB；截断到 100 条预计约 11KB。修复目标是降低移动端 HTML/JSON-LD 体积和解析成本，不应把“Google 一定放弃解析”写成确定性结论。
- **修改**:
  ```ts
  const ITEM_LIST_DISPLAY_LIMIT = 100;

  // CollectionPage.hasPart 已有 20 条限制（COLLECTION_HAS_PART_LIMIT）
  // ItemList 截断到最近 100 条，用 numberOfItems 声明总数
  {
    "@type": "ItemList",
    numberOfItems: archiveEntries.length,
    itemListElement: archiveEntries.slice(0, ITEM_LIST_DISPLAY_LIMIT).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(withTrailingSlash(routes.detail(item.slug))),
      name: item.title,
    })),
  }
  ```
- **验证**:
  - `curl http://localhost:3004/puzzles | grep 'application/ld+json'` 检查 JSON-LD 体积
  - 确认 `numberOfItems` 正确反映全量条目数
  - `npx next build` 通过
- **回滚方案**: `git revert <sha>`

### 3.2 详情页 OG 图片 URL 格式风险记录

- **当前状态**: 详情页 `socialImagePath` 为 `${puzzleDetailPath}opengraph-image`，生成的 URL 无 `.png` 扩展名
- **风险**: 部分社交平台（LinkedIn、X/Twitter 某些版本）可能因 URL 无图片扩展名而跳过或报错
- **本次操作**: 仅在方案中记录此风险，不修改代码。需验证:
  - 使用 [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) 测试详情页 OG 图片
  - 使用 [X Card Validator](https://cards-dev.twitter.com/validator) 测试
  - 如果验证发现确实有问题，再作为独立 PR 修复
- **验证**: 社交平台调试器可正确抓取详情页 OG 图片

### 3.3 #735/#736/#737 恢复后 index 状态验证

- **操作**: 确认 Phase 0 修复后这些页面返回 `index, follow`（而非误走 not-found 分支）
- **验证**: `curl -s https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-735/ | grep robots` 确认 `index, follow`

---

## Phase 4: 项目维护（P2 — 独立 PR）

### 4.1 提交 3 个未跟踪文档

- **文件**:
  - `docs/gsc-ranking-recovery-plan-2026-05-19.md`
  - `docs/homepage-today-answer-strategy-review-2026-05-19.md`
  - `docs/phase0-seo-integrity-day0-check-2026-05-19.md`
- **操作**: `git add` + `git commit`
- **理由**: 三个文档都是项目核心决策和验证记录，与现有 docs/ 文档体系一致

### 4.2 创建项目级 CLAUDE.md

- **文件**: `CLAUDE.md`（项目根目录，新建）
- **原则**: 仅做索引，不复制内容，避免与 docs/ 不同步
- **内容要点**:
  - 项目简介：LinkedIn Pinpoint 答案站的第二代重构
  - 技术栈：Next.js 15 + React 19 + Tailwind CSS 4 + Zod
  - 核心目录结构说明（app/、lib/、worker/、scripts/、docs/）
  - **索引引用**（非复制内容）:
    - SEO 约束详见 `docs/seo-audit-2026-04-25.md`
    - 发布流程详见 `docs/recommended-commit-plan-2026-03-31.md`
    - 部署检查详见 `docs/deployment-release-checklist-2026-03-13.md`
    - GSC 恢复方案详见 `docs/gsc-ranking-recovery-plan-2026-05-19.md`
  - PR 拆分原则：不混合变量，每 PR 独立可回滚
  - Worker 代码说明：Cloudflare Workers 环境限制导致 worker/src/ 内联了 lib/ 代码

---

## 不在本次修复范围内

| 项目 | 原因 | 排期 |
|------|------|------|
| Worker 代码去重 | 需要构建工具改造（esbuild/tsup），影响范围大 | 独立 PR，本季度内 |
| CSP `script-src` `unsafe-inline` 移除 | 需要 GA 脚本改用 nonce-based | Phase 2 后的下一次迭代，先调研 Next.js nonce-based CSP 方案 |
| Countdown.tsx useEffect 合并 | 功能正确，纯优化 | 随需 |
| `asRecord`/`asString` 去重 | 涉及 generate-draft 路由额外逻辑 | 随需 |
| FAQ Schema 添加 | 需评估富结果风险 | Phase 2 后 14 天，根据 GSC rich result 报告决定是否测试 |
| `resolveDefaultModel` 统一 | 两个版本逻辑不同 | 随需 |
| ESLint 9 → flat config 迁移 | 当前可正常工作 | `eslint-config-next` 升级时处理 |
| 首页 freshness 可见信号 | 属于 GSC 恢复方案 Phase 1 | 详见 `docs/gsc-ranking-recovery-plan-2026-05-19.md` |
| 首页结构化数据增强 | 属于 GSC 恢复方案 Phase 3 实验 | 详见 `docs/gsc-ranking-recovery-plan-2026-05-19.md` |
| E-E-A-T / Trust 页面 | 属于 GSC 恢复方案 Day 11-12 | 详见 `docs/gsc-ranking-recovery-plan-2026-05-19.md` |

> SEO 恢复性修复的完整范围见 `docs/gsc-ranking-recovery-plan-2026-05-19.md` 和 `docs/homepage-today-answer-strategy-review-2026-05-19.md`，不在本审计修复方案范围内。

---

## 执行顺序和发布策略

```
Phase 1b → 独立 PR → 移除硬编码开发密钥，验证脚本和认证
Phase 2.5 → 独立 PR → 移除 health/today 内部 URL 泄露
Phase 2.1 → 独立 PR → 恒定时间密钥比较
Phase 2.2 → 独立 PR → SSRF allowlist，先确认生产 webhook 域名
Phase 2.3 → 独立 PR → HSTS 短 max-age 试运行
Phase 2.6 → 独立 PR → 管理员 API rate limit
Phase 3.1 → 独立 PR → 归档页 ItemList 截断
Phase 1a → 独立 PR → Next.js 安全升级（默认等 Phase 0 观察窗口结束；紧急安全审批例外）
Phase 1c.2 → 独立 SEO 决策 PR → Contact 是否进 sitemap，二次审批后执行
Phase 4 → 独立 PR → 文档和项目索引，无需部署验证
```

**Phase 间依赖**:
- Phase 1b、2、3、4 均不依赖 Phase 1a（Next.js 升级）
- 如果 Phase 1a 延后，其余低风险安全与 SEO 体积修复仍可在 15.0.5 上执行
- Phase 2.1 的 `safeEqual` 使用 `crypto.timingSafeEqual`，在 Node.js runtime 下 15.0.5 和 15.5.18 均可用

---

## 验证清单

### 本地验证

- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx next lint` 零警告
- [ ] `npx next build` 成功
- [ ] `npm audit --omit=dev` 无生产依赖 critical/high
- [ ] `npm audit` 中 Next.js 相关 critical/high 已清零；剩余 dev/transitive high 单独记录
- [ ] 源码中 `admin-secret-dev` 仅出现在 regression 脚本回退值和启动警告中
- [ ] 重定向 `curl -v http://localhost:3004/en/pinpoint/123-analysis` 目标 URL 正确
- [ ] `curl http://localhost:3004/en/pinpoint/123-analysis -I` 确认目标 URL 为 `/pinpoint/123-analysis`
- [ ] 如 Contact sitemap 决策被批准，`curl http://localhost:3004/sitemap.xml | grep contact-us` 确认出现
- [ ] 归档页 JSON-LD 体积 < 20KB
- [ ] 设置非法环境变量验证 SSRF 防护报错
- [ ] SSRF PR 执行前已确认生产 webhook 域名清单
- [ ] 管理员 API 速率限制：连续请求确认 429

### 生产部署后验证

- [ ] Vercel 构建日志无 warning
- [ ] `curl -I https://pinpointanswertoday.app` 确认 `Strict-Transport-Security` 头存在且仅一个
- [ ] `curl -I https://pinpointanswertoday.app` 确认无重复 HSTS 头
- [ ] `curl https://pinpointanswertoday.app/api/health` 错误响应中不含 `workers.dev` URL
- [ ] `curl -s https://pinpointanswertoday.app | grep twitter:site` 确认输出
- [ ] 如 Contact sitemap 决策被批准，`curl -s https://pinpointanswertoday.app/sitemap.xml | grep contact-us` 确认出现
- [ ] 生产 `/api/revalidate` 用真实 secret 测试认证正常
- [ ] #735/#736/#737 页面 `robots` 为 `index, follow`

### SEO 恢复监控（与 GSC 恢复方案联动）

| 维度 | 指标 | 验收标准 | 时间窗口 |
|------|------|----------|----------|
| 抓取 | Googlebot fetch 首页 | URL Inspection Live Test 通过 | Phase 0 后 48h |
| 抓取 | #735/#736/#737 被 Google 发现 | GSC URL Inspection 显示可索引 | Phase 0 后 5 天 |
| Sitemap | sitemap 首页 lastmod | 不早于最新 live puzzle updatedAt | 每日抽查 |
| 结构化数据 | 归档页 JSON-LD 体积 | ItemList JSON-LD < 20KB | Phase 3 部署后 |
| 社交 | 详情页 OG image | LinkedIn/X 共享调试器可正确抓取 | Phase 3 部署后 |
| 排名 | 首页 `pinpoint answer today` position | 回到前 30（中期目标前 20） | Phase 0 后 14-28 天 |
| 曝光 | 首页 mobile impressions | 恢复到 Phase 0 前 7 天均值的 2 倍+ | Phase 0 后 28 天 |

> 完整 SEO 恢复监控方案见 `docs/gsc-ranking-recovery-plan-2026-05-19.md` 第 14 节。

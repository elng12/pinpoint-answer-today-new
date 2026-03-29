# Pinpoint 详情页 PRD 落地检查（截至 2026-03-29）

参考文档：

- `docs/pinpoint-detail-generation-prd-2026-03-26.md`
- `docs/pinpoint-detail-rebuild-prd-2026-03-27.md`

代码口径：

- 以 `origin/main` 为准（2026-03-29）。

## 结论

- **发布口径与可索引面（Phase 0/1）**：核心约束基本已落地，公开站点默认只认正式内容源；未发布状态不会被公开详情页、sitemap、summary 暴露；`/pinpoint/today` 在“还在发布中”时会返回 `503 + Retry-After` 的占位响应。
- **证据链 schema（Phase 2）**：`solvePath / turningPoint / clueRows / faqItems / uniquenessSignals` 已进入数据结构并有校验与守护脚本；但“两段式生成 + repair pass”“跨最近 30 篇重复度 guardrail”“difficultyBand 规则预判 + 模型建议 + 收敛”的细则尚未按 PRD 全量实现。
- **页面结构与模块（方案 C/D）**：目前保持“图1”布局做增量优化；PRD 已更新为“related 分组内链暂不做，只保留 recent list + 前后题导航”。

## 已落地（可直接验收）

- 公开站点默认不吃 live fallback：
  - `lib/puzzles/data.ts` 使用 `DETAIL_PUBLIC_FORMAL_ONLY`（默认 `true`）控制公开读取逻辑。
  - 公开路由（详情页、summary、revalidate、sitemap）均以 `allowLiveWorkerFallback: false` 为主。
- 未发布状态不可发现/不可索引：
  - `lib/puzzles/data.ts` 通过 `isPublicDetailEntry` 过滤 `detailState`，仅允许 `published / fallback_full` 进入公开集合（影响 archive、sitemap、summary、detail）。
- `/pinpoint/today` 发布占位态（避免 `200 + noindex` 反复被缓存/抓取）：
  - `app/(site)/pinpoint/today/route.ts`：当 Worker 报告“新题已出现但未正式发布”时，返回 `503 + Retry-After`，并 `no-store` 禁止缓存。
  - `scripts/check-pinpoint-guardrails.ts`：包含对应的自动化断言。
- revalidate 只允许刷新正式可公开内容：
  - `app/api/revalidate/route.ts`：对 `slug` 进行 authoritative 校验，拒绝未发布/非公开状态。
  - `scripts/check-pinpoint-guardrails.ts`：覆盖“拒绝 live-mode / 未发布 slug”的断言。
- 生产发布脚本把 short mode 当失败：
  - `scripts/release-production.mjs`：`detailState` 必须是 `published / fallback_full`，且 `bodyMode !== short`，否则 release 失败。
- sitemap 不会包含未发布状态：
  - `app/sitemap.ts` → `lib/puzzles/data.ts#getSitemapDetailEntries` → `getDetailEntries()`（内部已按 `detailState` 过滤）。
- Worker 侧的状态与告警基础能力：
  - `worker/src/index.ts`：有 cron heartbeat 记录、`buildCronHeartbeatAlerts`、以及 Feishu/Slack webhook 的通知封装（是否发送取决于环境变量配置）。

## 未落地 / 与 PRD 有差异（需要明确是否继续做）

- related 分组内链：
  - PRD 原本提出“同题型/同难度/相邻日期”分组供数；现已按产品决策调整为**暂不做**（只保留 recent list + 前后题）。
- “正文优先”页面大重排：
  - PRD 方案 C 建议把解释模块整体前移；现阶段为了稳定图1布局，**没有做结构性重排**，只做小范围文案与渲染优化。
- `emergency_minimal` 灾备模式：
  - PRD 提到需要 break-glass 开关；代码中尚未看到对应的 flag 与渲染分支（如需要，需单独实现与验收）。
- `difficultyBand` 的“规则预判 + 模型建议 + 校验收敛”：
  - 现有实现包含 `difficultyBand` 字段与推断逻辑，但没有 PRD 描述的 `preliminaryDifficultyBand / suggestedDifficultyBand / converge` 这套闭环。
- “两段式生成 + repair pass”：
  - 目前生成链路仍以单次生成 + `validateAndFixGeneratedContent` 兜底为主；没有把“结构化证据链先产出，再生成 FAQ/summary/派生正文”的流程拆开，也没有局部重生成的 repair pass。
- “跨最近 30 篇的重复度 guardrail”：
  - `uniquenessSignals` 已存在，但暂未看到对“最近 N 篇”做相似度比对并分级（hard/soft/warn）的落地实现。

## 建议的下一步（只做最有性价比的）

1. 先把“未落地项”变成明确决策：哪些永远不做，哪些延后做，哪些必须补齐（比如 emergency_minimal）。
2. 如果你仍希望提升 SEO，但不想动布局：优先做生成器去模板味（turning point、false start、逐 clue 非显然解释的差异化），这是比 related 分组更直接的增益。


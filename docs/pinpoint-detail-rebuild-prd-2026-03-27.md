# Pinpoint 详情页重构详细 PRD（2026-03-27）

## 受众与假设

本文默认面向产品、工程、内容和 SEO 一起评审。目标不是讨论某一段文案怎么改，而是统一详情页的产品口径、生成链路和发布规则。

## 一句话结论

要避免详情页继续出现“短版抢跑、正文像模板、页面像答案工具页”的问题，我们需要同时做三件事：

- 把公开站点收敛成单一正式内容源，只让正式全文或保底全文上线
- 把生成 schema 从“页面填空字段”改成“解题证据链字段”
- 把详情页改成正文优先、解释优先、相关串联优先

如果只允许做一件事，先做第一件：公开站点只认 `registry.json + detail JSON`，不再让 live fallback 抢跑。

---

## 与 03-26 PRD 的关系

本文不是对 `docs/pinpoint-detail-generation-prd-2026-03-26.md` 的平行补充，而是它的后续收敛版。两份文档的关系分为三类：

- `继续沿用`：03-26 中关于“正式发布不要依赖运行时临场拼稿”“题型分流是必要的”“`articleBlocks` 不能再和历史字段长期双轨”的方向继续保留
- `明确替代`：03-27 用更强的发布状态机、证据链 schema 和单轨公开口径，替代 03-26 里偏页面模式导向的部分设计
- `历史兼容`：03-26 中已进入代码或数据层的字段，不会在首轮上线中强制消失，但不再作为 v2 的长期主字段

为避免评审时把两份文档混读，出现“到底哪个字段还算真相源”的争议，以下概念以 03-27 为最终口径：

| 03-26 概念 | 03-27 口径 | 处理方式 |
| --- | --- | --- |
| `pageMode` (`live_card / quick_guide / full_analysis`) | `detailState` + feature flag + 页面结构 | `pageMode` 不再作为 v2 主字段；发布状态由 `detailState` 表达，页面差异由渲染层和 flag 控制 |
| `bodyMode` (`short / standard / deep`) | `difficultyBand` 驱动内容深度，`detailMode` 仅做兼容 | `bodyMode` 不作为 03-27 主字段继续扩展；历史值可在迁移期参与兼容渲染 |
| `difficulty` | `difficultyBand` | 视为字段改名并收敛语义；历史 `difficultyLevel / difficulty` 在迁移期映射到 `difficultyBand` |
| `questionType` 的旧枚举 | `phrase / category / association / hybrid` | 旧枚举作为迁移来源，新枚举作为 v2 正式枚举；映射规则需在 Phase 2 前拍板 |
| `articleBlocks` 作为正文唯一主来源 | `articleBlocks` 降级为派生渲染字段 | v2 中真实源字段是 `solvePath / turningPoint / clueRows / faqItems`，`articleBlocks` 由这些字段组装得到 |
| `live_card -> quick_guide -> full_analysis` 模式升级链 | `draft / generating / validated / publishing_placeholder / fallback_full / published / failed` | 03-27 以后只讨论发布状态链，不再用页面模式描述公开状态 |

迁移原则：

- 若 03-26 与 03-27 出现术语冲突，以 03-27 为准
- 若历史代码已使用 03-26 字段名，则在 Phase 2 前允许兼容读取，但不继续扩大写入面
- 所有替代关系都以“发布口径先统一，字段再迁移”为顺序执行

---

## 一、背景

过去几天的详情页优化已经修掉了一批硬伤，比如 FAQ 可见内容和结构化数据不一致、phrase fallback 方向写反、正文数据源错位等问题；但更底层的问题还在：

- 同一题上线早期，公开站点仍可能先暴露 `detailMode: "short"` 的临时详情页
- 正式全文虽然能发布，但生成方式仍然偏向“统一壳子换词”
- 页面结构更像“答案工具页”，不是“高价值解析页”

这三件事叠加后，结果不是“站坏了”，而是：

- 用户能看到内容，但第一眼不够像完整解析
- 搜索引擎能抓到页面，但不容易持续把它当高价值页放大
- 团队会反复遇到“今天这页可用，但为什么还是不强”的问题

当前相关实现和文档主要分散在这些文件里：

- `lib/puzzle-generation.ts`
- `lib/puzzles/slot-contract.ts`
- `lib/puzzles/content-contract.ts`
- `lib/puzzles/fallback-copy.ts`
- `lib/puzzles/data.ts`
- `worker/src/index.ts`
- `components/detail/PuzzleDetail.tsx`
- `components/detail/PuzzleFullAnalysis.tsx`
- `app/(detail)/linkedin-pinpoint-answers/[slug]/page.tsx`
- `docs/pinpoint-detail-generation-prd-2026-03-26.md`
- `docs/pinpoint-content-generation-best-practice-2026-03-17.md`

---

## 二、问题定义

### 1. 公开站点存在两条内容源，短版会抢跑

当前正式内容源是 `data/puzzles/registry.json` 和 `data/puzzles/{slug}.json`，但公开查询仍允许回退到 Worker live 数据，进而拼出 `detailMode: "short"`、`detailSource: "fallback"` 的临时详情页，见 `lib/puzzles/data.ts`。  
这意味着首页、当天页、详情页、summary、sitemap 不一定同时看到同一份内容。

### 2. 生成系统缺少“证据链”，只能靠模板补齐

当前 schema 更像组件字段集合，而不是解题过程记录。`lib/puzzles/slot-contract.ts` 要求 hero、connector、turning point、false starts、clue details 等字段，但没有强制记录：

- 最初误判是什么
- 误判为什么看起来合理
- 哪条 clue 打破了误判
- 每条 clue 的非显然解释是什么
- FAQ 分别回答了哪类搜索意图

结果是 `lib/puzzle-generation.ts` 只能继续统一拼接 `overview`、`solutionEmergence`、`articleBlocks`、`lessons`、`faqs`。页面看起来完整，但不同题之间很容易只剩“换词差异”。

### 3. 质量闸门更擅长拦脏词，不擅长拦空信息

当前 `scripts/validate-data.mjs`、`lib/puzzles/content-contract.ts`、`lib/puzzles/semantic-lint.ts` 主要拦的是旧模板短语、字数不足、答案过度重复、HTML 残留、通用 pivot 等问题。  
这能防止明显坏稿上线，但还防不住“格式全对、信息很空”的稿子。

### 4. 页面信息架构更像答案展示页，不像解析页

`components/detail/PuzzleDetail.tsx` 和 `components/detail/PuzzleFullAnalysis.tsx` 目前仍然把不少交互和辅助模块放在正文前。用户和搜索引擎最需要的“答案为什么成立、关键转折 clue 是什么、为什么不是别的答案”没有在首屏正文立住。

### 5. 内链过于通用，详情页缺少主题集群关系

当前详情页主要依赖 recent list 和前后页导航，缺少“同题型”“同套路”“同样靠转折 clue 才解开”的上下文内链。  
这会让页面更像单条记录，而不是一个主题网络里的节点。

---

## 三、目标

### 业务目标

- 每天都能稳定上线完整详情页
- 当天页首次可见时就是正式全文或保底全文
- 详情页从“可用”提升到“有持续权重潜力”

### 用户目标

- 用户进入页面后，30 秒内就能看到答案、关键转折和逐 clue 解释
- obvious 题不再被硬写成复杂复盘
- 中等题和复杂题读起来像真人在讲解，而不是系统在解释

### SEO 目标

- 新详情页的索引口径统一，不再出现短版和正式页并行
- 页面可见内容与 `Article`、`FAQPage` 等结构化数据真实对齐
- 每篇至少提供 2 到 3 个 clue-specific 的长尾搜索价值点

### 工程目标

- 公开站点只读单一正式内容源
- 生成链路以结构化证据链为中心，而不是以共享模板补全为中心
- 发布前质检既能拦坏稿，也能拦“看起来合格、其实没新信息”的空稿

---

## 四、非目标

- 本次 PRD 不要求大改整体视觉设计
- 不以“每篇都写成顶级专栏”为目标
- 不优先解决多语言扩展
- 不把更多 schema 类型堆上页面当成主要方案

### 上线切分与边界

本 PRD 的 Phase 0/1 目标不是提升内容质量，而是先消除公开口径分裂；Phase 2/3 才负责提升正文独特性和 SEO 价值。

为避免评审时把所有改造打包成一次性大改，本方案按上线边界拆成四层：

- `P0，必须一起上线`：关闭公开 live fallback、明确发布状态机、把 `short mode` 首发判为失败、统一 summary/sitemap/detail 的正式口径
- `P1，可在 P0 稳定后上线`：引入 schema v2 字段、建立新旧字段兼容渲染、把 fallback 收敛为 `fallback_full`
- `P2，可独立上线`：正文前移、交互后移、`HowTo` 口径收紧、相关题模块替换 recent list
- `P3，持续收紧`：重复度 guardrail、clue-specific FAQ 规则、相关题供数优化、质量阈值调参

评审和排期时默认遵循以下规则：

- `P0` 是当前 PRD 的阻塞项，没有 `P0` 就不进入内容质量讨论
- `P1` 可以与 `P2` 并行开发，但不得先于 `P0` 上线
- `P2/P3` 的失败不应回滚 `P0` 的单轨发布原则
- 历史页迁移不阻塞 `P0/P1`，默认先兼容渲染，再择机回填

---

## 五、核心产品原则

### 1. 正式全文优先于任何“先可见”

公开站点第一次展示给用户和搜索引擎的内容，必须是正式全文或保底全文，不允许短版临时页先上线、再被正式稿覆盖。

### 2. 固定结构，差异内容

可以保留稳定页面壳子，但正文证据必须按题目变化。统一的是阅读节奏，不是句子库。

### 3. 页面字段必须对应真实解题证据

以后 schema 中每个高价值字段都应该能回答一个真实问题，例如：

- 我为什么一开始会猜错
- 哪条 clue 让方向收窄
- 每条 clue 为什么不是泛泛“属于同一类”
- 用户真正还会继续搜什么

### 4. 质量门槛从“格式对”升级到“信息新”

未来不过线的标准不仅是错、脏、重复，还包括“没有独特解释价值”。

### 5. 公开内容源只能有一个

`registry.json + detail JSON` 是唯一公开真相源。Worker live 数据只保留给后台预览、监控和排障。

---

## 六、方案概览

### 方案 A：发布链路收敛为单轨

目标是让公开链路只剩这一个顺序：

1. 抓到当天题目
2. 生成正式全文草稿
3. 执行质量闸门
4. 不过线时自动重生一次
5. 再不过线时生成模板保底全文
6. 一次性写入 `data/puzzles/{slug}.json` 和 `data/puzzles/registry.json`
7. Git 提交成功后再调用 revalidate
8. 页面、summary、sitemap 同步可见

对应改造重点：

- `lib/puzzles/data.ts` 的公开查询默认关闭 `allowLiveWorkerFallback`
- `worker/src/index.ts` 不再让 `quickPublishToSite()` 成为公开页面的前置轨道
- `app/api/revalidate/route.ts` 只负责刷新正式内容，不再放大 live fallback

### 方案 B：生成 schema 升级为“证据链 schema”

建议新增或重构为以下核心字段组：

- `solvePath`
  - `firstRead`
  - `falseStarts`
  - `whyFalseStartPlausible`
  - `breakingClue`
  - `pivot`
  - `fullBoardConfirmation`
- `turningPoint`
  - `clue`
  - `whyDecisive`
  - `whatChangedAfterIt`
- `clueRows`
  - `clue`
  - `surfaceMisread`
  - `resolvedPhraseOrMember`
  - `nonObviousWhy`
  - `searchableContext`
- `faqItems`
  - `intentType`
  - `question`
  - `answer`
  - `tiedClue`
- `uniquenessSignals`
  - `angle`
  - `relatedEntities`
  - `doNotRepeatPatterns`

这会把当前“页面字段”转成“解题证据字段”，让程序更像渲染器，而不是代写器。

### 方案 C：页面改成正文优先

目标页面结构建议固定为：

1. `H1 + 发布信息 + 80-120 词直接回答导语`
2. `How the pattern emerges`
3. `Turning clue`
4. `Why each clue fits`
5. `Why this answer and not others`
6. `FAQ`
7. `相关题 / 前后题`
8. `share / check-in / 次要 CTA`

原则是把“解释”放到“交互”前面，把“正文”放到“壳子”前面。

### 方案 D：上下文内链替代泛 recent list

详情页底部的内链建议改成三组：

- 同题型：before/after、phrase、broad category
- 同解法：靠某条转折 clue 才锁定答案
- 相邻日期：上一题 / 下一题

同时补齐旧单数路径 `/linkedin-pinpoint-answer/:slug` 到当前 canonical 路径的 301。

---

## 七、详细需求

### 7.1 内容源与发布规则

- 公开站点默认不允许 live fallback 参与内容决策
- 公开详情页只在正式全文或保底全文准备好后上线
- 如果当天题尚未生成正式内容，允许短暂 publishing 占位态，但该状态不得进入 sitemap，不得作为正式页返回
- `scripts/release-production.mjs` 需把“当天页仍为 short mode”判为失败，而不是可接受状态

补充规则：

- 在 `published` 或 `fallback_full` 之前，正式详情页 slug 必须保持不可发现、不可索引：返回 `404`，且不得在首页、related、前后题、summary 或其他公开模块暴露 href
- `/pinpoint/today` 如进入 `publishing_placeholder`，默认返回 `503 Service Unavailable`，并携带 `Retry-After`
- 如因框架或基础设施限制暂时无法返回 `503`，只允许采用临时 `200 + noindex` 兜底，但必须同时满足 `no-store`、不暴露新 slug 链接、且不得作为默认长期方案

### 7.2 生成器规则

- 程序不再默认自动写整段 lessons 和 FAQ
- 程序保留排版职责：字段顺序、段落位置、显示层统一
- 模型或上游生成器负责交付证据链字段
- `fallback-copy.ts` 仅作为最后兜底，且兜底目标是“保底全文”，不是“公开短版”
- `Phase 2` 默认采用“两段式生成 + repair pass”，不要求单次大 JSON 调用一次性产出完全合格结果

补充决策：

- `difficultyBand` 首版采用“规则预判 + 模型建议 + 校验层收敛”的双阶段判定，不由单一来源直接拍板
- 模型可以回传 `suggestedDifficultyBand` 作为建议值；Worker 规则层先给出 `preliminaryDifficultyBand`，再由校验层完成最终收敛
- 当规则层与模型建议冲突且均无高置信时，默认落到 `medium`，并记录 `warning` 供人工抽检
- `questionType` 必须在正文生成前确定；`difficultyBand` 必须在正文生成前存在预判值，并在质检前收敛为正式值

推荐的生成顺序：

1. 先生成 `solvePath / turningPoint / clueRows`
2. 运行一次 schema 与语义初检
3. 再基于通过初检的中间结果生成 `faqItems / summary / derived articleBlocks`
4. 若发生局部结构错误，优先触发 repair pass，而不是整篇重写

### 7.2.1 `fallback_full` 最低公开标准

`fallback_full` 是可公开、可索引状态，因此它必须满足独立于 `published` 的最低内容标准，不能退化为换名字的 `short mode`。

最低标准如下：

- 必须包含完整 `clueRows`，且行数与 clue 数一致
- 必须包含至少 `2` 段可见正文，其中一段解释答案为什么成立，一段解释全盘如何收束
- 必须包含 `3` 条可见 FAQ，且至少 `1` 条绑定具体 clue 或题目实体
- 不允许出现“formal long-form JSON is unavailable”或同类临时占位话术
- 必须生成可公开的 title、description、canonical 和可见首屏导语
- 若不满足以上任一项，则不得进入 `fallback_full`，应继续停留在 `generating` 或转入 `failed`

补充说明：

- `fallback_full` 允许使用轻量 LLM、规则模板或修复链路生成，但它仍然属于“可公开完整页”，不是纯系统灾备页
- 当外部依赖严重故障，导致 `fallback_full` 也无法稳定生成时，系统不得硬凑 `fallback_full`

### 7.2.2 `emergency_minimal` 灾备模式

为防止极端情况下连续停更，系统保留最高级别的人工灾备开关 `emergency_minimal`，但该模式不属于默认发布路径。

触发条件：

- 正式全文、repair pass、`fallback_full` 均连续失败，且超过重试预算
- GitHub、部署平台或主 LLM 供应商出现跨小时级别故障
- 由人工明确开启 break-glass 开关，并记录原因、开启时间和计划关闭时间

最低要求：

- 页面不得白屏，必须有题号、日期、clues、答案和最小解释
- 页面明确标记为临时灾备模式，不输出正常的深度解析承诺
- 不得替代 `fallback_full` 成为常规日更通道
- 故障解除后必须优先恢复到 `fallback_full` 或 `published`

### 7.3 内容质量规则

新增至少以下硬性规则：

- turning point 必须点名具体 clue，不接受空泛转折句
- 每条 clue 解释都必须包含该 clue 的专属语义或实体信息
- FAQ 至少 2 条绑定具体 clue 名词或题目实体
- 与最近 30 篇相比，lesson 标题和 FAQ 问法不得高度重复
- false start 不能是通用桶词，例如“some category of things”

质检后果必须分级，而不是统一叫“不过线”：

| 等级 | 典型问题 | 处理方式 |
| --- | --- | --- |
| `hard fail` | `turningPoint` 缺失但题型为 `medium / hard`；`clueRows` 行数不等于 clue 数；`fallback_full` 低于最低公开标准；答案被缩窄或写错 | 阻塞发布；自动重生 1 次；再次失败则转 `fallback_full` 或 `failed` |
| `soft fail` | 某条 clue 解释过泛；FAQ clue 绑定数量不足；重复度超过预警阈值但未达到禁止阈值 | 不立即阻塞；优先触发自动重生；若连续两次 soft fail 叠加则升级为 `hard fail` |
| `warning` | 风格偏平、实体上下文偏弱、`difficultyBand` 规则判定置信度低 | 允许发布，但写入审计日志，进入每日抽检列表 |

### 7.4 页面结构规则

- 首屏必须先回答“答案是什么、为什么成立、关键转折是什么”
- reveal 卡、share、check-in 不能压过正文首屏
- clue table 是正文证据区，不是正文替代品
- `HowTo` 只在页面存在清晰步骤区时输出
- `FAQPage` 只输出可见 FAQ

### 7.5 SEO 与 URL 规则

- canonical 只保留 `/linkedin-pinpoint-answers/[slug]/`
- 补齐旧路径到 canonical 的永久跳转
- `app/sitemap.ts` 继续只吃正式内容源
- 结构化数据遵循“页面可见内容支撑 schema”，不以类型数量为目标

### 7.6 发布状态机与公开口径

为避免不同系统对“当天页是否已发布”理解不一致，公开链路统一使用下表作为状态机定义：

| 状态 | 数据源 | 公开行为 | 索引 / sitemap | summary | revalidate | 允许转移 |
| --- | --- | --- | --- | --- | --- | --- |
| `draft` | 抓题结果，仅内部可见 | 公开站点不暴露新 slug；`/pinpoint/today` 继续显示上一题 | 不索引，不进 sitemap | 保持上一题 | 否 | `generating` / `failed` |
| `generating` | 生成中的草稿与质检中间态 | 与 `draft` 相同；不返回新题正式页 | 不索引，不进 sitemap | 保持上一题 | 否 | `validated` / `fallback_full` / `failed` |
| `validated` | 已通过质检但尚未提交的正式全文 | 仅内部预览可见；公开站点仍不切题 | 不索引，不进 sitemap | 保持上一题 | 否 | `published` / `failed` |
| `publishing_placeholder` | 仅用于 `/pinpoint/today` 的短暂占位态 | `/pinpoint/today` 默认返回 `503 + Retry-After` 的占位响应；未来 slug 仍返回 `404` | 不索引，不进 sitemap | 保持上一题 | 否 | `published` / `fallback_full` / `failed` |
| `fallback_full` | 已提交仓库的保底全文 | 新题详情页返回 `200`，允许 canonical；正文为保底全文，不是短版 | 可索引，可进 sitemap | 展示新题 | 是 | `published` / `failed` |
| `published` | 已提交仓库的正式全文 | 新题详情页返回 `200`，公开站点全面切题 | 可索引，可进 sitemap | 展示新题 | 是 | `failed` |
| `failed` | 生成、提交或部署失败 | 保持上一题公开状态；不暴露失败中的新题页 | 不索引，不进 sitemap | 保持上一题 | 仅对上一题 | 人工恢复到 `draft` 或 `generating` |

补充规则：

- 公开详情页不允许以 `detailMode: "short"` 作为首发状态
- `publishing_placeholder` 只允许出现在 `/pinpoint/today`，不允许出现在正式详情页 slug
- `fallback_full` 属于可公开状态，`short mode` 不属于可公开状态
- 一旦进入 `published` 或 `fallback_full`，`registry`、detail JSON、summary、sitemap 必须在同一发布轮次内对齐

`publishing_placeholder` 的页面表现也需要固定，避免前端自行发挥：

- 页面默认返回 `503 + Retry-After`
- 可显示“今天的正式解析正在发布，几分钟后刷新查看”这一类中性提示
- 不展示上一题正文，不复用上一题答案卡，不展示 clue table、FAQ、share 模块
- 如果当天题号已知，可显示日期和题号；如果未知，只显示中性发布提示
- 响应必须使用 `no-store` 或等价的禁缓存策略，避免占位态被 CDN 或 Next.js 缓存固化

### 7.7 状态转移触发器

状态机不仅定义“能转去哪”，还需要定义“由谁触发、以什么为准”：

| 转移 | 触发系统 | 进入条件 | 退出条件 |
| --- | --- | --- | --- |
| `draft -> generating` | Worker | 当天 clues 与答案抓取成功，生成任务已创建 | 进入质检或生成失败 |
| `generating -> validated` | 生成器 + 质检脚本 | schema v2 校验通过，`hard fail = 0` | 等待提交仓库 |
| `generating -> fallback_full` | 生成器 | 正式全文生成失败或超时达到重试上限，且 `fallback_full` 自身通过最低公开标准 | 等待提交仓库 |
| `generating -> failed` | Worker | 正式全文与 `fallback_full` 均未通过最低要求，或外部依赖故障超出重试预算 | 人工恢复或下一轮任务 |
| `validated -> publishing_placeholder` | 发布链路 | 达到对外发布时间窗口，但 Git 提交或部署尚未完成 | Git 提交成功后进入 `published`，或 fallback 提交成功后进入 `fallback_full` |
| `validated -> published` | GitHub 提交 + revalidate | detail JSON、registry 提交成功，且发布后检查通过 | 正常运行或故障转 `failed` |
| `fallback_full -> published` | 内容修复链路 | 后续正式全文补齐并通过质检，再次提交仓库成功 | 正常运行或故障转 `failed` |
| `published -> failed` | 监控 / 发布脚本 | 发布后检查发现正式页缺失、summary/sitemap 口径错位、关键页面返回异常 | 人工恢复或回滚 |

补充说明：

- `generating -> validated` 与 `validated -> published` 均为自动转移，不要求人工确认
- 是否触发 `publishing_placeholder` 由发布时间窗口和提交进度共同决定，不作为默认路径
- `fallback_full -> published` 是允许的升级路径，但不是必须路径

### 7.8 可观测性与告警

状态机、降级路径和发布脚本只有在“异常能被及时看见”时才有意义，因此本方案把可观测性视为 `P0/P1` 的配套要求，而不是上线后的附加优化。

最低监控面应覆盖以下四类信号：

| 场景 | 监控项 | 触发条件 | 默认动作 | Owner |
| --- | --- | --- | --- | --- |
| 状态停滞 | `draft / generating / validated / publishing_placeholder` 停留时长 | 任一状态停留超过阈值 | 发送告警并标记当前 puzzle 为需人工关注 | 工程 |
| 连续降级 | `fallback_full` / `emergency_minimal` 触发频率 | 连续多题或多天触发降级 | 通知工程 + 内容，暂停默认信任自动链路 | 工程 / 内容 |
| 非法转移 | 状态机外转移、跳级转移 | 出现未在 7.7 定义表中的转移 | 立即告警，并拒绝写入正式 registry | 工程 |
| 发布后异常 | 缓存未清、summary/sitemap 错位、关键页异常 | 发布后检查失败 | 保持旧公开状态或进入人工回滚流程 | 工程 |

建议的初始阈值如下：

- `draft` 停留超过 `5 分钟`
- `generating` 停留超过 `15 分钟`
- `validated` 停留超过 `10 分钟`
- `publishing_placeholder` 停留超过 `5 分钟`
- `fallback_full` 连续触发 `2` 题或 `2` 天
- `emergency_minimal` 任意一次触发都必须立即通知人工

日志与事件要求：

- 每次状态转移都必须留下结构化事件，至少包含 `puzzleNumber / slug / fromState / toState / ts / trigger / reason`
- `hard fail / soft fail / warning` 结果必须进入同一条审计链路，便于按题号追溯
- 发布后检查必须记录是否成功清理 `registry`、页面 path、`worker-live` 和相关 summary/sitemap 缓存

告警处理原则：

- 告警默认先通知工程 DRI
- 连续 `fallback_full`、重复度异常、低置信 `difficultyBand` 激增时，同时通知内容 DRI
- `emergency_minimal` 只能在人工确认后开启；开启和关闭都必须留痕
- 任何“非法状态转移”都视为 P1 级问题，优先级高于单篇内容质量问题

与验收和回滚的关系：

- 7.8 不是单独系统，它直接支撑第八节的发布验收和第十节的回滚流程
- 若没有结构化状态事件和停滞告警，`P0` 只能算“功能能跑”，不能算“可稳定上线”

---

## 八、验收标准

### 发布验收（上线当天，阻塞项）

以下项目属于发布阻塞项，未满足则本轮不应视为完成上线：

- 新题首发时，公开详情页 `short mode` 命中率必须为 `0%`
- `registry.json / detail JSON / summary / sitemap` 这四个口径的同轮一致率必须 `>= 99%`
- `publishing_placeholder` 不得进入 sitemap，未来 slug 在未发布前必须返回 `404`
- `FAQPage` 仅在页面存在可见 FAQ 时输出，命中率必须 `100%`
- `revalidate` 只能刷新正式内容，不得触发公开短版抢跑
- `publishing_placeholder` 默认返回 `503 + Retry-After`，且发布后缓存清理必须成功

### 内容与页面验收（上线当天，阻塞项）

- obvious 题不得被渲染为“复杂误判 -> 神秘转折 -> 长复盘”的正文结构
- 每篇新题必须包含完整 `clueRows`，且行数与 clue 数一致
- 中等和复杂题至少包含 `1` 个明确 turning clue 和 `2` 个 clue-specific FAQ
- 首屏正文必须在不点击 reveal 的前提下回答“答案是什么、为什么成立、关键转折是什么”
- clue table 在移动端不得出现致命布局溢出

### 效果验收（4-8 周复盘，不阻塞首发）

- 7 天收录率相较 Phase 0 冻结基线提升 `>= 15%`
- clue-specific 查询覆盖相较基线提升 `>= 20%`
- detail-to-detail CTR 相较基线提升 `>= 10%`
- FAQ rich result 仅在可见 FAQ 存在时出现，异常命中率为 `0`
- 最近 30 篇中 lesson 标题和 FAQ 问法的高重复样本占比降至 `<= 5%`

### 验收执行方式

为避免验收标准停留在口头层，执行方式固定如下：

- `CI / 本地脚本`：负责 schema 校验、guardrail 分级、`clueRows` 行数、FAQ 可见性与结构化数据对齐检查
- `release-production` 发布后检查：负责验证 `/pinpoint/today`、正式详情页、summary、sitemap 四口径是否一致，并断言首发 `short mode` 命中率为 `0`
- `人工 smoke check`：每天抽查当天页首屏、`publishing_placeholder`、移动端 clue table 和 related 模块
- `周复盘`：SEO 与产品联合检查 7 天收录率、clue-specific 查询覆盖、detail-to-detail CTR

阻塞项默认由脚本和发布检查自动判定；人工检查用于补足“脚本可通过但体验仍差”的情况，不替代阻塞规则。

---

## 九、成功指标

没有现成可信历史数据的指标，不在本 PRD 中虚构数字。`Phase 0` 启动前必须冻结一份基线快照；未冻结的指标不阻塞 `P0` 上线，但必须在 `Phase 1` 结束前补齐。

| 指标 | 当前基线 | 4 周目标 | 8 周目标 | 数据来源 | Owner |
| --- | --- | --- | --- | --- | --- |
| 24h 公开口径一致率 | 待冻结 | `>= 95%` | `>= 98%` | 发布日志 + 抽样页面检查 | 工程 |
| 首发 `short mode` 命中率 | 当前存在，待冻结 | `0%` | `0%` | 发布日志 | 工程 |
| Publishing Latency P50 | 待冻结 | `<= 5 分钟` | `<= 4 分钟` | 发布日志 | 工程 |
| Publishing Latency P90 | 待冻结 | `<= 10 分钟` | `<= 8 分钟` | 发布日志 | 工程 |
| 7 天收录率 | 待冻结 | 基线 `+15%` | 基线 `+25%` | GSC | SEO |
| clue-specific 查询覆盖 | 待冻结 | 基线 `+20%` | 基线 `+35%` | GSC | SEO |
| detail-to-detail CTR | 待冻结 | 基线 `+10%` | 基线 `+20%` | 站内埋点 | 产品 / SEO |
| 高重复 FAQ / lesson 占比 | 待冻结 | `<= 15%` | `<= 5%` | guardrail 审计脚本 | 内容 |
| 正文滚动深度中位数 | 待冻结 | 基线 `+10%` | 基线 `+15%` | 站内埋点 | 产品 |

---

## 十、实施计划

### DRI 与协作边界

| 模块 | DRI | 协作 | 完成定义 |
| --- | --- | --- | --- |
| 发布链路与状态机 | 工程 | 产品 | 公开站点只认正式内容源，`short mode` 首发归零 |
| 证据链 schema v2 | 产品 / 内容 | 工程 | 新字段 contract、兼容规则、渲染优先级评审通过 |
| guardrail 与重复度规则 | 内容 | 工程 | hard fail / soft fail / warning 规则落地并可跑 |
| 页面结构与 related 模块 | 前端工程 | 产品 / SEO | 正文前移上线，相关题模块接入供数 |
| canonical / redirect / sitemap | SEO | 工程 | 旧路径承接规则上线并通过抽检 |
| 指标冻结与复盘 | SEO / 产品 | 工程 | 基线快照冻结，4 周和 8 周复盘有人负责 |

### Feature Flag 与回滚原则

为避免一次性大改导致全链路回退，本 PRD 推荐按能力拆 flag，而不是只留一个总开关：

- `detail_public_formal_only`：控制公开路由是否只认正式内容源
- `detail_schema_v2`：控制渲染层是否优先读取 schema v2 字段
- `detail_article_first_layout`：控制正文前移的新结构
- `detail_related_clusters`：控制相关题模块与新供数
- `detail_emergency_minimal_mode`：控制最高级别灾备降级，仅允许人工开启

统一回滚原则：

- `P0` 回滚时允许恢复上一版正式全文读取逻辑，但不允许恢复公开 `short mode` 首发
- `schema v2` 若渲染异常，优先回滚渲染优先级，不回滚新字段写入
- 页面结构或 related 模块出问题时，只回滚对应前端 flag，不影响单轨发布
- 回滚后必须重新刷 `summary`、sitemap 和受影响页面缓存，避免口径再次分裂
- `detail_emergency_minimal_mode` 只能在连续失败达到阈值后人工开启，且必须在正式链路恢复后关闭

### Phase 0：冻结错误路径（1 天）

- 关闭公开路由上的 live fallback
- 把 short mode 首发视为发布失败
- 保留内部预览和监控，不影响后台排障

### Phase 1：收敛发布链路（1-2 天）

- 调整 Worker 发布顺序
- 保证正式全文或保底全文先写入仓库，再触发 revalidate
- 对齐 summary、sitemap、详情页读取逻辑

### Phase 2：重构 schema 与生成器（2-4 天）

- 新增证据链 schema
- 降低程序自动代写比例
- 补充 uniqueness guardrails

### Phase 3：改造页面信息架构（2-3 天）

- 调整正文首屏结构
- 重排 reveal / share / CTA
- 改造相关题内链模块

### Phase 4：观测与调优（持续 2-4 周）

- 按题型抽查新页
- 结合 GSC 和页面行为数据复盘
- 根据重复风险和长尾覆盖继续收紧 guardrails

---

## 十一、风险与缓解

### 风险 1：短期内发布速度变慢

因为短版抢跑被拿掉，早期可能出现更短暂的 publishing 占位态。  
缓解方式：优先保证保底全文生成链路稳定，而不是恢复短版公开。

### 风险 2：schema 改造过大，牵动多处逻辑

`worker`、`site`、`scripts` 都会受到影响。  
缓解方式：先加新字段，保留旧字段兼容一段时间，再分阶段下线旧字段。

### 风险 3：质量规则过严导致当天无法发稿

缓解方式：保留“自动重生 1 次 + 保底全文”的双保险，不让“全挂掉”成为风险。

### 风险 4：页面改造后短期指标波动

缓解方式：优先做正文前移和相关题内链，不做大视觉改版，降低同时变化的变量数量。

### 风险 5：状态机与公开返回规则理解不一致

如果 `/pinpoint/today`、未来 slug、summary、sitemap 对 `publishing` 状态理解不同，会再次出现口径分裂。  
缓解方式：以本 PRD 的状态机表为唯一解释源，并在 `release-production` 检查中加入状态断言。

---

## 十二、依赖与开放问题

### 依赖

- Worker 发布链路调整
- detail JSON schema 扩展
- guardrail 脚本补强
- 详情页组件改造
- 301 redirect 补齐

### Phase 2 前必须拍板的前置决策

| 决策项 | 拍板人 | 最晚时间 |
| --- | --- | --- |
| `questionType` 与 `difficultyBand` 是否拆成两个字段，而不是复用同一个维度 | 产品 DRI + 内容 DRI | `Phase 1` 结束前 |
| obvious 题是否允许省略 `turningPoint`，以及省略后页面渲染什么替代模块 | 产品 DRI + 前端工程 DRI | `Phase 1` 结束前 |
| `fallback_full` 是否至少拆为 `phrase / category / obvious / hard` 四类模板 | 内容 DRI + 工程 DRI | `Phase 1` 结束前 |
| 相关题一版是否先只使用规则供数，而不等待 embedding 或人工标签系统 | 产品 DRI + SEO DRI | `Phase 2` 开始前 |

### 开放问题

- `HowTo` 是否直接下线，改为只保留 `Article + FAQPage + BreadcrumbList`
- Phase 3 之后是否有必要为历史高流量页面批量回填 schema v2 字段
- related clusters 的第二版是否引入 embedding 相似度或人工标签

---

## 十三、参考实现与证据

- 发布链路与 live fallback：`lib/puzzles/data.ts`、`worker/src/index.ts`、`app/api/revalidate/route.ts`
- 生成与质检：`lib/puzzle-generation.ts`、`lib/puzzles/slot-contract.ts`、`lib/puzzles/content-contract.ts`、`lib/puzzles/semantic-lint.ts`
- 页面结构与 schema：`components/detail/PuzzleDetail.tsx`、`components/detail/PuzzleFullAnalysis.tsx`、`app/(detail)/linkedin-pinpoint-answers/[slug]/page.tsx`
- 现有文档：`docs/pinpoint-detail-generation-prd-2026-03-26.md`、`docs/pinpoint-content-generation-best-practice-2026-03-17.md`

---

## 附录 A：Schema Contract（v2 草案）

### A.1 设计原则

- `questionType` 负责描述题的结构，不负责描述难度
- `difficultyBand` 负责描述题的阅读和解释深度，不负责描述题型
- `detailState` 负责公开发布状态，不再让 `detailMode` 同时承担“页面模式”和“发布状态”两种含义
- 新字段用于新题写入；旧字段保留历史兼容读取，不要求首轮全量回填

### A.2 推荐字段草案

```json
{
  "questionType": "phrase | category | association | hybrid",
  "difficultyBand": "obvious | medium | hard",
  "detailState": "draft | generating | validated | publishing_placeholder | fallback_full | published | failed",
  "detailMode": "full | short",
  "solvePath": {
    "firstRead": "string",
    "falseStarts": ["string"],
    "whyFalseStartPlausible": ["string"],
    "breakingClue": "string",
    "pivot": "string",
    "fullBoardConfirmation": "string"
  },
  "turningPoint": {
    "clue": "string",
    "whyDecisive": "string",
    "whatChangedAfterIt": "string"
  },
  "clueRows": [
    {
      "clue": "string",
      "surfaceMisread": "string",
      "resolvedPhraseOrMember": "string",
      "nonObviousWhy": "string",
      "searchableContext": "string"
    }
  ],
  "faqItems": [
    {
      "intentType": "definition | clue_background | comparison | solve_strategy | category_context",
      "question": "string",
      "answer": "string",
      "tiedClue": "string | null"
    }
  ],
  "uniquenessSignals": {
    "angle": "string",
    "relatedEntities": ["string"],
    "doNotRepeatPatterns": ["string"]
  }
}
```

### A.3 Required / Optional / Deprecated

| 字段 | 要求 | 说明 |
| --- | --- | --- |
| `questionType` | 新题必填 | `Phase 2` 前必须拍板枚举 |
| `difficultyBand` | 新题必填 | 历史页可由现有 `difficultyLevel` 映射 |
| `detailState` | 新题必填 | 作为公开状态机唯一状态字段 |
| `detailMode` | 兼容保留 | 历史页可继续读取；新题不再用它表达发布状态 |
| `solvePath.firstRead` | 新题必填 | obvious 题也要说明第一眼读法 |
| `solvePath.falseStarts` | 条件必填 | `medium / hard` 至少提供 `0-2` 条；obvious 题可为空数组 |
| `solvePath.whyFalseStartPlausible` | 条件必填 | 仅在 `falseStarts` 非空时必填，长度需与之对应 |
| `solvePath.breakingClue` | `medium / hard` 必填 | obvious 题可为空 |
| `turningPoint` | `medium / hard` 必填 | obvious 题允许省略，但页面必须渲染“quick pattern confirmation”替代块 |
| `clueRows` | 新题必填 | 行数必须等于 clue 数 |
| `faqItems` | 新题必填 | `3-5` 条，至少 `2` 条 `tiedClue` 非空 |
| `uniquenessSignals` | 内部必填 | 不要求前端渲染，但用于 guardrail 审计 |

### A.4 渲染优先级与兼容策略

- 新渲染器优先读取 `detailState`、`questionType`、`difficultyBand`、`solvePath`、`turningPoint`、`clueRows`、`faqItems`
- `articleBlocks` 在 v2 中降级为派生渲染字段：新题由 `solvePath`、`turningPoint`、`clueRows`、`faqItems` 组装得到，用于页面展示和历史兼容，不再作为源字段要求模型直接填写
- 历史页若缺少新字段，继续回退到现有 `articleBlocks`、`fullAnalysis`、`solutionNarrative`、`display.clueTableRows` 等旧字段
- `Phase 2` 上线后，新题必须写新字段；历史页默认兼容渲染，不阻塞上线
- 旧字段是否退场，不在首轮上线中解决；需满足“最近 30 篇已回填 + 14 天零 legacy-only 发布”后再单独评审

### A.4.1 `difficultyBand` 赋值规则

`difficultyBand` 由 Worker 规则层在正文生成前给出预判值，并在生成后由校验层收敛为正式值，作为质检和渲染分流的共同输入。

首版采用“规则预判，模型建议，校验收敛，人工兜底”的顺序：

- 规则层根据 `questionType`、clue 显著性、答案直观性和历史 obvious 样本规则先给出 `preliminaryDifficultyBand`
- 模型可回传 `suggestedDifficultyBand`，用于补足 false starts 复杂度和叙事深度判断
- 校验层对 `preliminaryDifficultyBand` 与 `suggestedDifficultyBand` 做收敛；若两者冲突且均无高置信，则正式写入 `medium`
- 低置信结果必须打 `warning`，进入每日抽检列表
- 人工只在抽检或回补时覆盖，不进入默认日常链路

### A.5 Related 供数第一版规则

为避免 related 模块阻塞主线，一版供数只用确定性规则：

- 同题型：基于 `questionType`
- 同难度：基于 `difficultyBand`
- 相邻日期：基于 `publishDate`

embedding、人工标签和更细的“同解法”关系，放在第二版评审。

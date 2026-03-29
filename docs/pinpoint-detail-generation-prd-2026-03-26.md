# Pinpoint 详情页生成重构 PRD（2026-03-26）

## 一句话结论

要让我们的详情页生成内容不比对手差，核心不是继续修几句文案，而是把整条链路从“字段拼装 + 临时兜底”改成“题型分流 + 模式分流 + 文章优先 + 统一保底 + 发布验收”。

如果只做一句产品决策，就是：

- 没有正式详情内容时，不要伪装成完整分析页
- 有正式详情内容时，正文必须来自文章块，不再靠旧模板说明文拼出来

---

## 背景

过去几天的真实页面暴露出一组连续问题：

- `#690`：答案对，但正文像旧模板说明文
- `#691`：一度连答案方向都写窄了
- `#693`：明显题被硬写成“有转折的复盘长文”
- `#694`：短版页是对的，但通知和构建规则把“合理降级”描述成“失败保底”
- `#695`：short mode 页面可用，但像系统帮助卡，不像内容页

这些问题说明，我们当前的瓶颈不是“模型不够聪明”，而是产品和生成架构没有对齐。

---

## 当前系统架构现状

### 代码仓库结构

```
new-pinpoint-site/
├── data/puzzles/                          # puzzle JSON 数据源（#458 ~ #695）
│   ├── pinpoint-answer-{N}.json           # 每道题一个 JSON 文件
│   └── registry.json                      # 全局题目注册表
├── lib/
│   ├── puzzle-generation.ts               # AI 生成核心（2277 行），含 prompt、API 调用、slot→正文组装
│   └── puzzles/
│       ├── content-contract.ts            # 内容契约验证（332 行），定义字段最低标准和语义检查
│       ├── semantic-lint.ts               # 语义质检规则（569 行），18 条 PUBLISH_BLOCKING 规则
│       ├── slot-contract.ts               # 槽位契约验证（297 行），校验 AI 回传的结构化字段
│       ├── fallback-copy.ts               # 统一 fallback 正文/lessons/FAQ 生成器（153 行）
│       ├── schema.ts                      # Zod schema 定义（puzzleDetailContentSchema 等）
│       ├── schema.shared.mjs              # 跨 worker/site 共享的 schema
│       └── worker-fallback.ts             # Worker 侧 fallback 逻辑
├── worker/src/index.ts                    # Cloudflare Worker 主入口（170K+），cron 调度 + 发布链
├── scripts/
│   ├── check-pinpoint-guardrails.ts       # 预提交卡口脚本
│   ├── run-pinpoint-regression.mjs        # 回归测试运行器
│   └── release-production.mjs             # 生产发布脚本
└── components/detail/                     # 详情页前端组件
    ├── PuzzleDetail.tsx                   # 详情页总入口
    ├── PuzzleFullAnalysis.tsx             # Full Analysis 渲染（15K+）
    ├── PuzzleAnswerReveal.tsx             # 答案揭晓卡片
    └── DetailAnalysis.tsx                 # 分析区块渲染
```

### 当前 Puzzle JSON 数据结构（以 #693 为例）

```jsonc
{
  "puzzleNumber": 693,
  "slug": "pinpoint-answer-693",
  "bodyMode": "short",                     // ← 新增字段，部分旧题没有
  "publishDate": "2026-03-24",
  "clues": ["Mahalo", "Danke", "Arigato", "Merci", "Gracias"],
  "answer": ""Thank you" in different languages",
  "category": ""Thank you" in different languages",
  "wordHints": { /* 每个 clue 的揭晓提示 */ },
  "spoilerHints": { /* 不剧透的提示 */ },
  "articleBlocks": [ /* 正文段落数组 */ ],
  "fullAnalysis": [ /* 与 articleBlocks 内容相同，历史兼容字段 */ ],
  "solutionNarrative": [ /* 解题过程叙述 */ ],
  "lessons": [ { "title": "...", "body": "..." } ],
  "display": {
    "connectorSummary": "...",
    "fastStrategy": "...",
    "clueTableRows": [ { "clue": "...", "examplePhrase": "...", "connectionExplained": "..." } ]
  },
  "faqs": [ { "question": "...", "answer": "..." } ]
}
```

> **注意**：当前 JSON 结构缺少 `pageMode`、`questionType`、`difficulty` 字段，这是本次重构需要新增的核心字段。`fullAnalysis` 和 `articleBlocks` 存在冗余，需统一收口为 `articleBlocks`。

### 当前 AI 生成链路

1. **Prompt 构建**：`puzzle-generation.ts → buildPuzzlePrompt()` 生成约 470 行的结构化 prompt
2. **模型调用**：支持 OpenAI / Anthropic / Zhipu / Azure 四种 provider，默认 `gpt-4.1-mini`
3. **响应解析**：`parseAIResponse()` → JSON 解析 → `ParsedAIResponseSchema` Zod 校验
4. **槽位校验**：`validateSlotContract()` 检查 8 个槽位字段的格式和内容
5. **正文组装**：`composeFromSlots()` 将槽位拼装成 `overview + solutionEmergence + articleBlocks`
6. **内容质检**：`validateContentContract()` + `collectSemanticLintIssues()` 执行 18 条拦截规则
7. **写入发布**：写入 `data/puzzles/pinpoint-answer-{N}.json` → git push → Vercel 部署

### 当前质检规则清单（18 条 PUBLISH_BLOCKING）

| 规则代码 | 含义 | 来源文件 |
| --- | --- | --- |
| `text.localeMarker` | 检测到语言标记残留 `[fr]` `[de]` 等 | `semantic-lint.ts` |
| `text.brokenEntity` | HTML 实体编码残留 | `semantic-lint.ts` |
| `text.leadingEllipsis` | 模板片段前导省略号 | `semantic-lint.ts` |
| `text.englishResidual.unrelated` | 非英文 locale 中残留英文关键词 | `semantic-lint.ts` |
| `mainAnswer.suspiciousCategoryLabel` | 答案标签过度修饰或机器味重 | `semantic-lint.ts` |
| `faqs.firstAnswerMissingExactAnswer` | 第一条 FAQ 未包含准确答案文本 | `semantic-lint.ts` |
| `summary.promotionalTone` | Hero 摘要像营销文案而非内容简介 | `semantic-lint.ts` |
| `copy.temporaryPageLanguage` | 正文出现临时页面话术 | `semantic-lint.ts` |
| `summary.answerSpoiler` | Hero 摘要泄露答案 | `semantic-lint.ts` |
| `overview.leadingAnswerSpoiler` | Overview 首句暴露答案 | `semantic-lint.ts` |
| `sections.overlap` | Overview 与解题叙事重复率 ≥ 60% | `semantic-lint.ts` |
| `sections.sharedPhrasing` | 两段正文连续复用 ≥ 7 个相同词 | `semantic-lint.ts` |
| `answer.overused` | 答案全文出现次数 > 3 | `semantic-lint.ts` |
| `wrongGuesses.machineyGuess` | 错误猜测标签太机器味 | `semantic-lint.ts` |
| `solutionEmergence.genericPivot` | 解题转折是通用模板句而非具体 clue | `semantic-lint.ts` |
| `faqs.genericConnectionAnswer` | 连接类 FAQ 回答太笼统 | `semantic-lint.ts` |
| `clueDetails.genericExplanation` | clue 解释使用通用填充语 | `semantic-lint.ts` |
| `answer.semanticNarrowing` | 正文对答案做了额外限定缩窄 | `semantic-lint.ts` |
| `answer.alternateRestatement` | 正文引入答案的变体说法而非原文 | `semantic-lint.ts` |

### 当前 Content Contract 常量（`content-contract.ts`）

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `overviewMinWords` | 65 | full mode overview 最低字数 |
| `shortOverviewMinWords` | 40 | short mode overview 最低字数 |
| `solutionEmergenceMinWords` | 90 | full mode 解题叙事最低字数 |
| `shortSolutionEmergenceMinWords` | 70 | short mode 解题叙事最低字数 |
| `summaryMinWords` | 20 | 摘要最低字数 |
| `metaDescriptionMinChars` | 115 | SEO 描述最少字符 |
| `metaDescriptionMaxChars` | 165 | SEO 描述最多字符 |
| `clueDetailsRequired` | 5 | clue 详解必须 5 条 |
| `lessonsMin` | 3 | Lessons 最少 3 条 |
| `faqsMin` | 3 | FAQ 最少 3 条 |

### 当前 Slot Contract 常量（`slot-contract.ts`）

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `heroIntroMinWords` | 20 | Hero 开头最少字数 |
| `heroIntroMaxWords` | 45 | Hero 开头最多字数 |
| `connectorSummaryMinWords` | 6 | 连接摘要最少字数 |
| `connectorSummaryMaxWords` | 16 | 连接摘要最多字数 |
| `falseStartsMin` | 1 | 错误方向最少 1 个 |
| `falseStartsMax` | 2 | 错误方向最多 2 个 |
| `difficultyReasonMinWords` | 10 | 难度原因最少字数 |
| `portableTakeawayMinWords` | 6 | 可迁移教训最少字数 |
| `portableTakeawayMaxWords` | 28 | 可迁移教训最多字数 |

### 当前 Fallback 生成器（`fallback-copy.ts`）

支持 5 种模式：`before` / `after` / `typed-category` / `category` / `association`

- `buildSharedFallbackArticleBlocks()` → 生成 6 段 fallback 正文
- `buildSharedFallbackLessons()` → 生成 3 条 fallback lessons
- `buildSharedFallbackFaqs()` → 生成 3 条 fallback FAQ
- `buildSharedFallbackSolutionNarrative()` → 生成 2 段 fallback 解题叙事

> **问题**：fallback 正文虽分 phrase / category 两路，但未按 `obvious / medium / hard` 分级，且 category 分支内 `association` 模式与 `typed-category` 共用同一套文案模板。

---

## 目标

### 业务目标

- 每天都能稳定发布可用详情页
- 明显题不再被硬写成长文复盘
- 中等题和复杂题能读起来像真人在讲解，而不是系统在解释
- 不再出现“正文是 short，SEO 还是 full”或“线上还是旧内容”的状态打架

### 内容目标

- 详情页正文读感不输对手
- 表格不再一行一个模板
- FAQ 不再只是把正文换个说法重复一遍
- fallback（保底内容）也不能像旧模板说明书

### 工程目标

- 正式详情内容、live fallback、worker fallback、admin 修复链统一口径
- 发布后自动验收必须覆盖页面正文和 metadata（页头信息）
- 新旧模板句在提交前就能被校验脚本拦下

---

## 非目标

- 这次 PRD 不追求“每篇都像顶级专栏”
- 不要求模型一次自由发挥直接出完美长文
- 不把重点放在页面视觉改版
- 不优先解决多语言

---

## 用户问题

当前详情页对用户主要有 4 类问题：

### 1. 页面看起来像正式分析，内容却像临时占位

例如：

- `formal long-form JSON is still unavailable`
- `Short mode: compact explanation while the formal long-form JSON is unavailable`

这类话对用户的意思只有一个：页面还没准备好。

### 2. obvious（很明显）题被硬写成“复杂推理题”

例如：

- `Mahalo / Danke / Arigato / Merci / Gracias`

这类题本来一眼就是“谢谢的不同语言”，但系统还会硬写：

- 有误判
- 有 turning point（关键转折）
- 某一个 clue 才让答案变具体

这会让正文显得假。

### 3. 表格和 FAQ 太模板

常见问题：

- 五行表格解释几乎同一句型
- FAQ 只是把答案和连接关系再说一遍
- 没有回答用户真正会问的问题

### 4. 发布状态和页面状态不同步

之前真实发生过：

- 代码部署成功
- 线上页面却还是旧内容
- 正文已经 short mode，metadata（搜索摘要/分享文案）却还是 full mode

---

## 对手详情页的关键做法

基于之前对对手页面和截图的反推，真正值得学的不是样式，而是这 5 件事：

### 1. 对手在写“文章”，不是在拼“说明字段”

它的正文更像：

- 第一反应
- 错误方向
- 后面哪个 clue 打断了错误方向
- 最后如何落到答案

而不是：

- connector
- overview
- explanation

### 2. 它会按题目难度切写法

- 明显题：短、快、直接，不强写误判
- 中等题：有一段误判和一段转折
- 难题：才适合完整复盘

### 3. 它不会把内部生成状态暴露给用户

用户看到的是页面类型，而不是“后台还没生成完”。

### 4. 它的表格和 FAQ 是补价值，不是补字数

- 表格解释最值得解释的 clue
- FAQ 回答真实搜索意图

### 5. 它的详情页是“先有内容，再放进页面壳子”

这点是最关键的：

- 不是页面组件临时把几个字段拼成人话
- 而是先有一篇内容，再渲染到页面

---

## 当前系统根因

### 根因 1：正文来源不够单一

当前正文可能来自：

- 正式 JSON
- live fallback
- worker fallback
- admin 修复链

虽然我们已经做了不少统一，但实际产出时还是会出现：

- 页面模式对了
- 但内容口吻不对

### 根因 2：所有题都在被同一种“解题剧情模板”处理

尤其是：

- before/after（前后词组）题
- category（类别）题
- obvious（明显题）
- hard misdirection（误导强的难题）

现在没有被真正分开处理。

### 根因 3：short mode 现在还是“兜底产品”，不是“正式产品”

它目前更像：

- 页面撑住别空白

而不是：

- 一种有意设计的轻量详情页

### 根因 4：表格和 FAQ 生成逻辑没有题型分流

所以会出现：

- phrase 题写得像 category 题
- obvious 题 FAQ 还在讲 turning point
- 表格每行只是在重复同一个解释器

---

## 产品方案

## 方案总览

将详情页系统拆成两层：

1. `页面模式`
2. `内容模式`

同时增加一个统一决策器，先决定当前页面该走哪种模式，再决定正文该走哪种写法。

### 统一决策器（新增）

判定顺序固定为：

1. 是否存在正式详情 JSON
2. 当前题型（`questionType`）
3. 当前难度（`difficulty`）
4. AI 草稿是否通过质检
5. 决定 `pageMode`、`bodyMode`、回退路径和 metadata（页头信息）

#### 决策表

| 是否有正式详情 JSON | questionType | difficulty | AI 质检结果 | pageMode | bodyMode | 页面结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 否 | 任意 | 任意 | 不适用 | `live_card` | 无 | 只显示答案卡和极短说明 |
| 否 | `before/after phrase` / `obvious category` | `obvious` | 不适用 | `quick_guide` | `short` | 显示短版复盘、精简表格、Compact FAQ |
| 是 | 任意 | `obvious` | 通过 | `quick_guide` | `short` | 显示正式短版详情页 |
| 是 | 任意 | `medium` | 通过 | `full_analysis` | `standard` | 显示标准版正文 |
| 是 | 任意 | `hard` | 通过 | `full_analysis` | `deep` | 显示深度版正文 |
| 是 | 任意 | 任意 | 不通过，但可短版通过 | `quick_guide` | `short` | 降级成正式短版页，不假装长文 |
| 是 | 任意 | 任意 | 不通过，短版也不过 | `live_card` | 无 | 只保留答案卡，不显示完整分析 |

#### 优先级规则

- `正式详情 JSON` 优先于 live fallback（线上实时兜底）。
- `obvious` 题优先走 `short`，即使有正式 JSON，也不强行拉成长文。
- `AI 质检不过` 时，先尝试降级到 `quick_guide`，而不是直接塞一篇假长文。
- metadata（页头信息）必须跟 `pageMode` 同步，不能出现正文 short、页头 full 的状态打架。

---

## 一、页面模式

### Mode A：Live Answer Card

适用场景：

- 当天题刚出
- 只有答案和 clue
- 没有正式详情 JSON

页面只显示：

- clue 卡片
- reveal（揭晓答案）
- 极短说明
- 不显示“完整分析”卡片

目标：

- 先保正确可用
- 不伪装成完整详情页

### Mode B：Quick Guide

适用场景：

- obvious 题
- 或正式长文暂时没过线，但已有可用短版内容

产品定义：

- 这是正式页面模式，不是失败保底
- short mode 的详情页要像一篇短内容，不像占位卡片

页面显示：

- 3 到 4 段短版复盘
- 精简表格
- Compact FAQ

禁止出现：

- `formal long-form JSON is still unavailable`
- `JSON unavailable`
- 任何内部生成状态文案

### Mode C：Full Analysis

适用场景：

- 正式详情 JSON 已生成
- 内容质量通过

页面显示：

- article blocks 正文
- Category
- Words & How They Fit
- Lessons
- FAQ

---

## 二、内容模式

### bodyMode: short

适用：

- obvious 题
- 明显短语题
- 识别后几乎一眼能看出的题

要求：

- 3 到 4 段短版正文
- 不强写误判
- 不强写 turning point
- 表格和 FAQ 走短版模板
- 允许没有单一 turning clue（关键转折线索）

### bodyMode: standard

适用：

- 普通题
- 有轻微误导，但不需要长篇

要求：

- 5 到 8 段正文
- 可有 1 次误判
- 可有 1 个 turning clue

### bodyMode: deep

适用：

- 误导强、转折明显、值得写长文的题

要求：

- 8 到 14 段正文
- 完整 solve story（解题过程）
- 更完整 Lessons 和 FAQ

### 统一 schema / contract（新增）

正文、metadata、fallback 和发布验收都必须消费同一份 contract（数据契约），不允许各走各的字段口径。

#### 顶层字段

| 字段 | 必填 | 说明 | short | standard/deep |
| --- | --- | --- | --- | --- |
| `slug` | 是 | 页面唯一标识 | 是 | 是 |
| `pageMode` | 是 | `live_card / quick_guide / full_analysis` | 是 | 是 |
| `bodyMode` | 条件必填 | `short / standard / deep` | 是 | 是 |
| `questionType` | 是 | 题型分流结果 | 是 | 是 |
| `difficulty` | 是 | `obvious / medium / hard` | 是 | 是 |
| `answer` | 是 | 最终答案 | 是 | 是 |
| `meta.title` | 是 | 页面标题 | 是 | 是 |
| `meta.description` | 是 | SEO/分享描述 | 是 | 是 |
| `articleBlocks` | short/full 条件必填 | 页面正文唯一主来源 | 3-4 段 | 5-14 段 |
| `table.rows` | 是 | 表格行 | 是 | 是 |
| `faq.items` | 是 | FAQ 列表 | 1-2 条 | 2-3 条 |
| `lessons` | full 条件必填 | Lessons 模块 | 否 | 是 |

#### contract 规则

- 页面正文只认 `articleBlocks`
- metadata 不允许自行拼接旧模板摘要
- fallback 也必须返回同一份 contract，只是 `pageMode/bodyMode` 不同
- 详情页组件不再负责“补开头”“补总结”“补 turning point”
- `articleBlocks` 不存在时，页面只能渲染 `live_card`，不能伪装成完整分析页

#### `articleBlocks` block schema（新增）

`articleBlocks` 是正文唯一主来源，因此 block 结构必须写死，不允许前端、生成器、fallback 各自理解。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | 是 | block 唯一 ID，用于渲染和回归定位 |
| `type` | `'paragraph' \| 'heading' \| 'list' \| 'callout'` | 是 | block 类型 |
| `text` | `string` | 条件必填 | `paragraph / heading / callout` 主文本 |
| `items` | `string[]` | 条件必填 | `list` 类型条目数组 |
| `tone` | `'neutral' \| 'transition' \| 'answer' \| 'reflection'` | 否 | 仅供质检和模式判定使用 |
| `order` | `number` | 是 | block 顺序，必须从 `0` 连续递增 |

额外约束：

- `short` 模式只允许：`paragraph`、`list`
- `standard / deep` 模式允许：`paragraph`、`heading`、`list`、`callout`
- 第一条 block 必须是 `paragraph`
- 至少有 1 条 `tone = answer` 的 block，并明确说出答案
- 不允许出现空 block，也不允许 `text` 和 `items` 同时为空

#### 表格 row schema（新增）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `clue` | `string` | 是 | 原 clue 文本，必须与 clue 列表一一对应 |
| `examplePhrase` | `string` | 是 | 具体短语或示例 |
| `connectionExplained` | `string` | 是 | 解释为何该 clue 成立 |
| `rowType` | `'phrase' \| 'category' \| 'association'` | 是 | 行级题型标记 |

额外约束：

- before/after 题的 `examplePhrase` 必须是完整短语
- obvious category 题的 `connectionExplained` 应优先写事实解释，不写模板确认句
- 5 个 clue 必须对应 5 行，不允许缺行或重排

#### 目标 Puzzle JSON 数据结构（重构后）

```jsonc
{
  "puzzleNumber": 695,
  "slug": "pinpoint-answer-695",
  // ===== 新增核心字段 =====
  "pageMode": "quick_guide",               // live_card | quick_guide | full_analysis
  "bodyMode": "short",                     // short | standard | deep
  "questionType": "before/after phrase",   // 题型分流结果
  "difficulty": "obvious",                 // obvious | medium | hard
  // ===== 现有字段保留 =====
  "publishDate": "2026-03-26",
  "clues": ["Tiger", "Plane", "Towel", "Weight", "Clip"],
  "answer": "Words that come after \"paper\"",
  "wordHints": { },
  "spoilerHints": { },
  "articleBlocks": [ /* 正文唯一主来源 */ ],
  // ===== 废弃字段（迁移期保留，渲染不再读取）=====
  // "fullAnalysis": [...],  // 统一为 articleBlocks
  "solutionNarrative": [ ],
  "lessons": [ { "title": "...", "body": "..." } ],
  "display": { },
  "faqs": [ { "question": "...", "answer": "..." } ],
  // ===== 新增 metadata 一致性字段 =====
  "meta": {
    "title": "LinkedIn Pinpoint #695 Answer -- Words after paper",
    "description": "Quick guide for Pinpoint #695..."
  }
}
```

#### 代码变更清单

| 文件 | 变更类型 | 说明 |
| --- | --- | --- |
| `lib/puzzles/schema.ts` | 修改 | 新增 `pageMode` `questionType` `difficulty` `meta` 字段 |
| `lib/puzzles/schema.shared.mjs` | 修改 | 同步新增 schema，确保 worker 和 site 共用 |
| `lib/puzzles/content-contract.ts` | 修改 | 质检规则按 bodyMode 分级调整阈值 |
| `lib/puzzle-generation.ts` | 修改 | 根据 questionType 选择不同 prompt 模板 |
| `lib/puzzles/fallback-copy.ts` | 修改 | fallback 按 difficulty 分级生成 |
| `components/detail/PuzzleFullAnalysis.tsx` | 修改 | 正文只读 articleBlocks |
| `components/detail/PuzzleDetail.tsx` | 修改 | 根据 pageMode 切换渲染组件 |
| `scripts/check-pinpoint-guardrails.ts` | 修改 | 增加 pageMode/bodyMode 一致性检查 |
| `lib/puzzles/question-classifier.ts` | 新增 | 题型自动分类器 |

---

## 三、题型分流

至少分为 4 类：

### 1. before/after phrase

例如：

- `Words that come before "roses"`
- `Words that come after "paper"`

要求：

- 核心是 shared word（共享词）
- 表格解释要写出具体短语，不要重复模板句

### 2. obvious category

例如：

- `Mahalo / Danke / Arigato / Merci / Gracias`
- `Marble / Obsidian / Slate / Granite / Sandstone`

要求：

- 不强行制造戏剧性
- 承认这题很快能看出来
- 重点是把答案说清楚

### 3. medium category / association

要求：

- 可以有误判
- 允许一个明确 turning clue

### 4. hard misdirection

要求：

- 适合完整长文
- 才允许比较完整的复盘结构

### 题型 + 难度映射规则（新增）

| questionType | 默认 difficulty | 默认 bodyMode | 允许升级条件 |
| --- | --- | --- | --- |
| `before/after phrase` | `medium` | `short` 或 `standard` | 只有在误导明显时才升到 `standard` |
| `obvious category` | `obvious` | `short` | 不升到 `deep` |
| `medium category / association` | `medium` | `standard` | turning clue 很强时可保持 `standard` |
| `hard misdirection` | `hard` | `deep` | 默认长文 |

映射原则：

- 明显题默认短，不硬写戏剧性
- 复杂题才给完整复盘权限
- `difficulty` 先决定正文长度，再决定 QA 门槛

### `difficulty` 来源与低置信度规则（新增）

`difficulty` 不能只靠大模型自评，也不能完全靠人工拍脑袋，必须由“规则信号 + 模型判断”共同产生。

#### 输入来源

1. `规则信号`
   - answer pattern（before / after / category / typed-category）
   - clue 是否明显属于同一语义集合
   - 是否存在可识别的错误方向
   - 是否有 clue 会显著收窄答案
2. `模型判断`
   - 输出候选 `difficulty`
   - 输出 `difficultyReason`

#### 判定流程

1. 规则侧先计算：
   - `obviousScore`
   - `misdirectionScore`
2. 模型侧再输出：
   - `difficultyCandidate`
   - `difficultyReason`
3. 统一决策器合并：
   - `obviousScore >= 0.8` 优先判 `obvious`
   - `misdirectionScore >= 0.7` 优先判 `hard`
   - 其余默认 `medium`

#### 低置信度处理

- 如果规则判断和模型判断一致：直接采用
- 如果不一致但一侧分数明显更高（>= 0.8）：采用高分侧
- 如果不一致且两侧都不高：默认降到更保守的 `medium`

#### 代价优先级

- 误把 `hard` 判成 `obvious`：风险最高，必须尽量避免
- 误把 `obvious` 判成 `medium`：成本可接受，只会牺牲一点正文效率
- 因此低置信度时，宁可保守走 `medium / standard`，也不要贸然走 `obvious / short`

### 题型自动分类逻辑（新增 `classifyQuestionType()`）

```
function classifyQuestionType(answer, clues):
  // 第一步：检测答案模式（复用现有 detectAnswerPattern）
  pattern = detectAnswerPattern(answer)
  if pattern.kind == "before" or pattern.kind == "after":
    return { questionType: "before/after phrase", difficulty: "medium" }

  // 第二步：obvious 检测
  if pattern.kind == "typed-category" or pattern.kind == "category":
    obviousScore = computeObviousScore(clues, answer)
    //   - 5 个 clue 中有 >= 3 个能被直接识别为同类 → obvious
    //   - 所有 clue 都是专有名词且属于已知集合 → obvious
    //   - 答案本身是日常常识 → obvious
    if obviousScore >= 0.8:
      return { questionType: "obvious category", difficulty: "obvious" }

  // 第三步：误导强度检测
  misdirectionScore = computeMisdirectionScore(clues, answer)
  //   - 是否有 >= 2 个 clue 容易被归入另一个合理类别
  //   - 是否有明显的错误方向（false starts）
  if misdirectionScore >= 0.7:
    return { questionType: "hard misdirection", difficulty: "hard" }

  // 第四步：默认走 medium
  return { questionType: "medium category / association", difficulty: "medium" }
```

> **实现位置**：新增为 `lib/puzzles/question-classifier.ts`，供 `puzzle-generation.ts` 和 `worker/src/index.ts` 共同调用。

> **真实案例对照**：
> - `#693`（Mahalo/Danke/Arigato/Merci/Gracias）→ `obvious category` + `short`
> - `#695`（Tiger/Plane/Towel/Weight/Clip，answer: "Words that come after paper"）→ `before/after phrase` + `short` 或 `standard`
> - `#689`（medium category）→ `medium category / association` + `standard`

---

## 四、正文生成规则

### 原则

- 正文只认 `articleBlocks`
- 不再把 `overview + solutionEmergence` 当正文主来源
- 不让页面组件负责“临时补文风”

### 正文最低要求

#### short

- 3 到 4 段（对应 `articleBlocks.length` 3~6）
- 每段 1 到 2 句
- 明确答案
- 不写系统话术
- `resolveContentBodyMode()` 自动判定：`articleBlockCount > 0 && articleBlockCount <= 6` → short
- `overview` >= 40 词（`shortOverviewMinWords`）
- `solutionEmergence` >= 70 词（`shortSolutionEmergenceMinWords`）

#### standard

- 5 到 8 段
- 有清晰推进（开头 → 误判 → 转折 → 答案 → 收尾）
- `overview` >= 65 词，`solutionEmergence` >= 90 词
- 不允许明显模板句

#### deep

- 8 到 14 段
- 完整 solve story
- `overview` >= 65 词，`solutionEmergence` >= 90 词
- 更完整 Lessons（>= 3 条）和 FAQ（>= 3 条）

### 禁止句型

以下句型视为高风险模板句（已在 `semantic-lint.ts` 中实现正则拦截）：

- `same category reading`
- `same shared frame`
- `specific enough to trust`
- `one clean set`
- `same shelf`
- `the board started to shift`
- `made the answer feel concrete`
- `fits the same shared connection`（已在 `GENERIC_CLUE_EXPLANATION_PATTERNS` 中）
- `same shared connection that leads to`（已在 `GENERIC_CLUE_EXPLANATION_PATTERNS` 中）
- `points back to that same connection`（已在 `GENERIC_CLUE_EXPLANATION_PATTERNS` 中）

### 本次新增禁止句型（需加入 `semantic-lint.ts`）

| 禁止句型 | 新增规则代码 | 说明 |
| --- | --- | --- |
| `the board felt broad` | `copy.abstractBoard` | 太抽象，不具体 |
| `the frame shifted` | `copy.abstractFrame` | 太抽象，不具体 |
| `the category became specific enough` | `copy.abstractSpecific` | 太抽象，不具体 |
| `this is the hallmark of a well-crafted puzzle` | `copy.flatteryCopy` | 吹捧式文案 |
| `difficulty varies` | `copy.genericDifficulty` | 无信息量 |
| `X connects to...` | `copy.genericConnect` | 通用填充语 |
| `X fits the theme` | `copy.genericFit` | 通用填充语 |
| `the clues all share this connection` | `copy.genericShare` | 通用填充语 |

---

## 五、表格生成规则

### 原则

- 表格不是重复正文
- 表格不是每行一个模子
- 表格优先解释最不 obvious 的 clue

### before/after phrase 题

应写成：

- `paper tiger`: a familiar phrase for a weak threat
- `paper plane`: a folded toy aircraft

不应写成：

- `makes more sense once the board is read through "paper"`

### obvious category 题

应写成事实解释：

- `Mahalo is the Hawaiian word for "thank you".`

不应写成：

- `helps confirm the same answer`

---

## 六、FAQ 规则

### short mode

- 最多 2 个 FAQ
- 必须回答真实问题

例如：

- 为什么答案是 `after paper`
- 哪个 clue 最能确认这个答案

### full mode

- 2 到 3 个 FAQ
- 不能只是正文改写

#### FAQ contract（新增）

- `short mode` FAQ 只回答最短路径问题
- `full mode` FAQ 至少有 1 条补充正文没有明确说过的信息
- 不允许出现“把答案再说一遍”式 FAQ
- FAQ 也纳入旧模板句校验和答案逻辑质检

---

## 七、回退策略

### 当前问题

过去最大的问题不是没有回退，而是：

- 回退太多套
- 回退口吻不一致
- 旧模板会复活

### 新规则

- 只保留一套统一 fallback copy
- fallback 也分 short / standard / deep
- fallback 绝不暴露内部状态
- fallback 不伪装成长文分析

### 降级状态机（新增）

状态流转固定为：

`live_card -> quick_guide -> full_analysis`

#### 升级条件

- `live_card -> quick_guide`
  - 已有答案
  - 题型已识别
  - 至少有可用短版 contract

- `quick_guide -> full_analysis`
  - 正式详情 JSON 已生成
  - 内容质量通过结构、文风、答案逻辑和页面状态质检

#### 降级条件

- `full_analysis -> quick_guide`
  - AI 长文不过线
  - 但 short mode 可用

- `quick_guide -> live_card`
  - short mode 也不过线
  - 或 contract 不完整

#### 状态机原则

- 降级是正式产品行为，不是失败文案
- 用户只看到页面模式，不看到内部失败原因
- 任一状态切换都必须同步 metadata、页头标题、FAQ 口径和按钮文案

---

## 八、质检规则

### 第一层：结构质检

- 必须有答案
- clue 数量匹配
- table 行数匹配
- FAQ 数量匹配

### 第二层：文风质检（对应 `semantic-lint.ts`）

| 检查项 | 对应规则代码 | 状态 |
| --- | --- | --- |
| 老模板句 | `GENERIC_CLUE_EXPLANATION_PATTERNS` | 已实现 |
| 营销语气 | `summary.promotionalTone` | 已实现 |
| 临时页面话术 | `copy.temporaryPageLanguage` | 已实现 |
| 空转折（通用 pivot） | `solutionEmergence.genericPivot` | 已实现 |
| Overview 与 SolutionEmergence 重复 | `sections.overlap` (>= 60%) | 已实现 |
| 连续复用相同措辞 | `sections.sharedPhrasing` (>= 7 词) | 已实现 |
| 通用 FAQ 回答 | `faqs.genericConnectionAnswer` | 已实现 |
| 俏皮话/夸张修辞 | 待新增 `copy.flippantTone` | 待实现 |
| 机械重复（同义句型复读） | 待新增 `copy.mechanicalRepetition` | 待实现 |
| obvious 题强写 turning point | 待新增 `obvious.forcedTurningPoint` | 待实现 |

### 第三层：答案逻辑质检（对应 `semantic-lint.ts`）

| 检查项 | 对应规则代码 | 状态 |
| --- | --- | --- |
| 答案被额外限定缩窄 | `answer.semanticNarrowing` | 已实现 |
| 引入答案变体说法 | `answer.alternateRestatement` | 已实现 |
| 答案过度重复 | `answer.overused` (> 3 次) | 已实现 |
| Hero 泄露答案 | `summary.answerSpoiler` | 已实现 |
| Overview 首句暴露答案 | `overview.leadingAnswerSpoiler` | 已实现 |
| 答案标签机器味 | `mainAnswer.suspiciousCategoryLabel` | 已实现 |
| obvious 题硬写复杂推理 | 待新增 `obvious.forcedComplexReasoning` | 待实现 |
| questionType 与 bodyMode 不匹配 | 待新增 `mode.mismatch` | 待实现 |

### 第四层：页面状态质检（新增规则）

| 检查项 | 代码位置 | 说明 |
| --- | --- | --- |
| metadata 与 pageMode 一致 | `content-contract.ts` 新增 | 校验 `meta.title` / `meta.description` 匹配 `pageMode` |
| full mode title 包含 "Full Analysis" | `content-contract.ts` 新增 | `pageMode === 'full_analysis'` 时强制 |
| pageMode / bodyMode / questionType 完整性 | `check-pinpoint-guardrails.ts` 新增 | 预提交卡口 |
| 发布后线上 HTML 验收 | `release-production.mjs` 新增 | post-deploy 抓取校验 |
| 线上正文首段与 JSON 一致 | `release-production.mjs` 新增 | 防止缓存导致旧内容残留 |
| OG/Twitter description 与 meta 一致 | `release-production.mjs` 新增 | 防止 SEO 状态打架 |

### 回归样本集（新增，扩展自 `docs/pinpoint-content-regression-sample-set.md`）

固定回归样本及预期映射：

| 样本 | 题目类型 | questionType | difficulty | bodyMode | 关键检查点 |
| --- | --- | --- | --- | --- | --- |
| `#689` | medium category / association | `medium category` | `medium` | `standard` | 正文模式正确；表格不模板重复 |
| `#690` | before/after phrase | `before/after phrase` | `medium` | `short` 或 `standard` | 正文不像旧模板说明文；表格有具体短语 |
| `#691` | 答案逻辑易写窄 | `medium category` | `medium` | `standard` | 答案不被缩窄；无 `answer.semanticNarrowing` |
| `#693` | obvious category（谢谢的不同语言） | `obvious category` | `obvious` | `short` | 不强写 turning point；不硬造误判 |
| `#695` | before/after phrase（paper） | `before/after phrase` | `medium` | `short` | 表格有 paper Tiger / paper Plane 等具体短语 |
| `#682` | typed category（Types of dolls） | `medium category` | `medium` | `standard` | category 语言不像 phrase 语言 |
| `#683` | phrase after（Words after "false"） | `before/after phrase` | `medium` | `standard` | Hero 不剧透；turning point 有具体 clue |
| `#684` | phrase before（Words before "roses"） | `before/after phrase` | `medium` | `standard` | clue 解释具体；不退回 `X connects to...` |

每次改动后必须检查：

- `questionType` 和 `difficulty` 是否被正确分类
- `pageMode` 和 `bodyMode` 是否与 `questionType` 映射一致
- turning clue 是否被强行硬写（obvious 题应允许没有）
- 表格是否模板重复（每行 `connectionExplained` 不应只替换 clue 名）
- FAQ 是否只是在复读正文
- `meta.title` 和 `meta.description` 是否与 `pageMode` 一致

运行命令：

```bash
# 快速冒烟
npm run test:pinpoint-regression
# 核心集
npm run test:pinpoint-regression:core
# 全量
npm run test:pinpoint-regression:all
```

---

## 九、发布规则

### 发布前

1. 生成内容
2. 机器质检
3. 不通过则重生
4. 再不通过则切 short fallback 或更稳的 fallback

### 重试、超时与成本上限（新增）

- 同一篇内容最多完整重生 `2` 次
- 第 1 次失败：
  - 保持同模式 prompt
  - 带失败原因重生
- 第 2 次失败：
  - 使用降级 prompt
  - 优先保住正确性和自然度下限
- 单次请求超时：
  - 正文生成：`30s`
  - 质检复判：`20s`
- 单篇内容整条链总耗时上限：`120s`

超过上限后的默认动作：

- 有 `short` 可用：切 `quick_guide`
- `short` 也不可用：退到 `live_card`

成本控制规则：

- 每题最多允许：
  - 1 次主生成
  - 1 次重生
  - 1 次答案逻辑复判
- 禁止为了追求长文质量无限重试
- 每日成本超出预算阈值时，自动提高 `short mode` 优先级

### 发布后

自动验收必须检查：

- 正确答案出现
- 已知错误答案不出现
- 正文模式与 metadata 一致
- 不含旧模板句

---

## 十、验收标准

详情页达到“合格”的最低标准：

- 用户看不出内部生成状态
- 正文不是系统帮助卡
- 表格不再五行一个模子
- FAQ 不是正文复读
- obvious 题不强写复杂推理
- short mode 和 full mode 不打架

达到“接近对手”的标准：

- 正文像一篇短文章
- 每段都在推进
- 句子自然
- 不靠模板句撑字数

---

## 十一、实施优先级

### P0

- short mode 去掉内部状态文案
- short mode / full mode 页头、正文、metadata 完全同步
- phrase 题 short mode 表格单独模板
- 统一决策器落地到代码
- 统一 schema 落地到页面、fallback、发布验收

### P1

- 正文只认 `articleBlocks`
- 按题型 + 难度分流
- fallback 统一成 short / standard / deep 三套
- obvious 题允许没有 turning clue
- FAQ / table contract 接到同一份 schema

### P2

- FAQ 按题型重写
- 表格解释器按题型分流
- 回归样本集固定化（`689/690/691/693/695`）
- 发布后验收扩展到更多线上字段

### Owner 与四周计划（新增）

以下 owner 先按职责写，评审后再替换成具体人名：

| 任务 | Owner 角色 | 输出物 |
| --- | --- | --- |
| 决策器与 schema | 内容生成负责人 | 统一 contract、模式决策实现 |
| 页面模式与组件渲染 | 前端负责人 | short/full 统一渲染与 metadata 同步 |
| fallback 重构 | 内容系统负责人 | 三套 fallback copy 和分流逻辑 |
| 质检与发布验收 | 发布链路负责人 | 结构/文风/答案逻辑/页面状态验收 |

#### 第 1 周

- 决策器表落代码
- contract 字段统一
- 去掉 short mode 内部状态文案

#### 第 2 周

- before/after phrase short 模板
- obvious category short 模板
- FAQ / 表格按题型分流第一版

#### 第 3 周

- 回退状态机统一
- 发布前后验收接入 schema 和页面模式检查
- 固定回归样本跑通

#### 第 4 周

- 调整 deep/standard 文风
- 清理残留旧模板句
- 形成评审后的正式上线标准

### 旧页面迁移与兼容（新增）

迁移原则：

- 旧页面不要求一次性全部重生成
- 但新旧 contract 必须允许一段过渡期内并存
- 迁移期间页面渲染优先级必须固定，不能因为字段缺失回退到旧模板拼装

迁移分 3 步：

1. `兼容期`
   - 旧 JSON 允许保留 `fullAnalysis / solutionNarrative`
   - 页面渲染优先读取 `articleBlocks`
2. `回填期`
   - 优先回填：
     - 固定回归样本集
     - 最近 30 天高流量页面
     - 被质检脚本标红的旧页面
3. `收口期`
   - 停止在新页面里写入 `fullAnalysis` 作为正文主来源
   - 旧字段只作为历史兼容，不再参与新渲染和新验收

迁移验收要求：

- 发布脚本必须能区分：
  - 旧 contract 页面
  - 新 contract 页面
- 不允许因为旧页面尚未回填，就让新页面降级回旧逻辑
- 回归集中的页面在切新 contract 后，必须全部通过 `validate:data` 和线上 HTML 验收

---

## 十二、我建议先做哪三刀

如果只做最值钱的三件事，按顺序应该是：

1. `short mode 产品化`
   - 去掉内部状态
   - 统一页头和正文口径
   - 不再像占位页

2. `before/after phrase 题单独短版模板`
   - 重点解决 `695` 这种题
   - 表格和 FAQ 不再重复

3. `题型 + 难度分流`
   - obvious 题不再强写 turning point
   - 正文模式跟题目真实复杂度匹配

---

## 十三、衡量指标与数据埋点（新增）

### 为什么必须补这一节

当前 PRD 已经说明了：

- 为什么要改
- 改成什么样
- 先做哪几刀

但还缺一个评审时一定会被问的问题：

- 上线之后，怎么证明这次重构真的比旧链路更好？

### North Star（核心指标）

详情页系统重构后，以以下两个指标作为核心衡量：

1. `详情页平均停留时长`
2. `生成内容一次通过率`

解释：

- 停留时长代表用户是否真的在读
- 一次通过率代表系统是否真的变稳，而不是每天靠人工救火

### 质量指标

| 指标 | 定义 | 目标 |
| --- | --- | --- |
| AI 一次通过率 | 不触发 fallback 的正式详情页比例 | `> 90%` |
| obvious 题 short 通过率 | obvious 题直接用 short mode 成功上线的比例 | `> 95%` |
| 错答案拦截率 | 被答案逻辑质检拦下的错误方向稿件占比 | `100% 拦截` |
| 旧模板句残留数 | 上线页面中命中旧模板句的数量 | `0` |
| 正文/metadata 一致率 | 正文模式与 metadata 模式完全一致的页面比例 | `100%` |

### 体验指标

| 指标 | 含义 | 观察窗口 |
| --- | --- | --- |
| 页面平均停留时长 | 用户是否愿意继续往下读 | 上线后 7 天 |
| 跳出率 | 用户是否点进来立刻离开 | 上线后 7 天 |
| Share Rate（分享率） | 用户是否愿意分享详情页 | 上线后 14 天 |

### 运维指标

| 指标 | 含义 |
| --- | --- |
| 生成耗时 | full / short 生成链平均耗时 |
| 超时率 | 大模型请求超时比例 |
| fallback 触发率 | 被迫降级到 quick/live 的比例 |
| 发布后验收失败率 | 部署成功但线上页面未通过验收的比例 |

### 告警阈值与响应机制（新增）

| 指标 | 告警阈值 | 默认动作 | Owner |
| --- | --- | --- | --- |
| AI 一次通过率 | 连续 2 天 `< 80%` | 提高 short mode 优先级，检查 prompt 最近变更 | 内容生成负责人 |
| fallback 触发率 | 单日 `> 40%` | 检查模型稳定性与质检门槛 | 发布链路负责人 |
| 发布后验收失败率 | 单日 `>= 1` 次 | 阻断后续发布，优先修复 | 发布链路负责人 |
| 错答案拦截失败 | 任意一次漏拦 | 视为 P0 事故 | 内容系统负责人 |
| metadata / 正文不一致 | 任意一次命中 | 视为 P1 事故 | 前端负责人 |

SLA（响应时限）：

- `P0`：30 分钟内确认并进入修复
- `P1`：2 小时内确认并给出临时止血方案
- `P2`：1 个工作日内纳入排期

### 数据埋点要求

- 每篇详情页必须记录：
  - `pageMode`
  - `bodyMode`
  - `questionType`
  - `difficulty`
  - 是否触发 fallback
  - 是否命中答案逻辑质检
  - 发布后线上验收是否通过
- 这些字段必须能在后台汇总成日报或周报

---

## 十四、SEO 与缓存风险控制（新增）

### 为什么这是风险点

我们这几天已经真实遇到过：

- 正文已经是 short mode
- metadata 还是 full mode
- 线上页面更新了，但浏览器或缓存层还展示旧内容

这说明 SEO 和缓存不是补充问题，而是页面模式重构的主风险之一。

### 原则

- short mode 和 full mode 都是正式页面模式
- 搜索引擎看到的 title/description 必须和页面真实模式一致
- 不允许出现“正文是 short，SEO 还是 full walkthrough”的状态打架

### TDK（标题/描述/关键词）规则

- `live_card`
  - 使用极简标题和说明
  - 不宣称“完整分析”
- `quick_guide`
  - 明确使用 `Quick Guide / Compact Guide` 口径
  - description 必须是短版说明，不写 `full walkthrough included`
- `full_analysis`
  - 才允许使用 `Answer & Full Analysis / Full Walkthrough` 口径

### 缓存策略要求

- 页面升级为 `full_analysis` 后，发布后自动验收必须重新抓线上 HTML
- 验收对象必须包含：
  - 正文首段
  - metadata description
  - OG/Twitter description
- 如果线上仍返回旧模式文案，发布脚本应继续等待，直到超时或验收通过

### 搜索引擎抓取策略

- short mode 页面允许被抓取，但必须是“真实短版页”，不能是失败占位页
- full mode 上线后，应触发重新验收，确保搜索引擎抓到的是最终模式文案
- 不建议默认使用 `503 Service Unavailable` 作为 short mode 的常规策略
  - short mode 是正式产品模式，不是错误页
  - 重点是保证模式一致，而不是把 short mode 伪装成临时错误状态

### 缓存与浏览器验收口径

- 发布后脚本验收通过，才算发布成功
- 人工查看页面时，默认用以下方式避开本地缓存误判：
  - 强制刷新
  - 无痕窗口
  - 带随机参数 URL

---

## 十五、AI 工作流要求（新增附录）

### 原则

- 不是让模型“自由发挥一篇详情页”
- 而是先决定题型和难度，再让模型走对应内容链
- 负向规则（禁止词）只能做补充，不能代替正向示例

### 推荐工作流

1. `题型分类`
   - 输出 `questionType`
   - 输出 `difficulty`
2. `模式决策`
   - 产出 `pageMode`
   - 产出 `bodyMode`
3. `正文生成`
   - short / standard / deep 走不同 prompt
4. `结构化区块生成`
   - table
   - FAQ
   - lessons
5. `多层质检`
   - 结构
   - 文风
   - 答案逻辑
   - 页面状态

### Prompt 设计要求

- 每种 `questionType + bodyMode` 至少有一套专用 prompt
- prompt 不能只靠“不要这样写”
- 必须给模型正向示例（good examples）和反例（bad examples）

### Few-shot（少量示例教学）要求

至少建立以下示例库：

- `before/after phrase + short`
- `obvious category + short`
- `medium category + standard`
- `hard misdirection + deep`

每个示例库至少包含：

- 1 个好例子
- 1 个坏例子
- 为什么坏
- 这一类题最容易翻车的点

### Few-shot 示例库治理（新增）

- 初版 owner：内容系统负责人
- 审核 owner：内容生成负责人 + 产品负责人
- 每次 prompt 主版本升级时，必须同步检查 few-shot 是否仍匹配当前文风标准
- 示例库必须有版本号，并与 prompt 版本绑定记录
- 任意一次线上事故页面，如果被判定为“本可由示例库避免”，必须在下一轮回顾中补进示例库

### 生成策略

- `short` 不强写 turning clue
- `obvious` 题允许没有误判
- `deep` 才允许完整 solve story（解题复盘）
- 表格和 FAQ 也必须走题型模板，不允许复用通用老模板

### 边界情况处理

- 如果 LLM API（大模型接口）完全不可用：
  - `live_card` 必须可纯本地兜底
- 如果 full 失败但 short 可用：
  - 正式降级为 `quick_guide`
- 如果答案逻辑质检失败：
  - 不发布 AI 稿
  - 回退到更稳的 fallback
  - 并记录失败原因，供后续回归样本使用

### 评审时需要拍板的技术口径

- 页面模式是在后台生成/落库阶段确定，还是在请求时临时计算
- 示例库由谁维护
- fallback 是否和正式内容共用同一套 contract
- obvious 题是否允许完全没有 turning point

---

## 附：本次 PRD 依据

本 PRD 依据以下真实问题和已确认事实整理：

- `#690` 正文像旧模板说明文
- `#691` 曾出现答案方向写窄
- `#693` obvious 题被硬写成长文复盘
- `#694` 出现 short mode 合理但通知/校验误导
- `#695` 当前 short mode 页面像系统帮助卡，不像内容页
- 对手详情页的共性：文章优先、按题型/难度切模式、不暴露内部状态、表格和 FAQ 真正补价值

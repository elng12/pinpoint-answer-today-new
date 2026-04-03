# Pinpoint Fallback 正文加厚与发布前硬校验 PRD（2026-04-01）

> **文档状态**：待审核
> **最后更新**：2026-04-01
> **面向对象**：产品、工程、内容、SEO
> **相关文档**：
> - `docs/pinpoint-701-deploy-recovery-2026-04-01.md`
> - `docs/pinpoint-detail-rebuild-prd-2026-03-27.md`
> - `docs/pinpoint-detail-generation-prd-2026-03-26.md`

## 1. 一句话结论

如果目标是避免再次出现 “Worker 已抓到今天题、GitHub main 也有新 slug、但线上仍停在昨天题号” 的错位，最该做的不是只把 fallback 文案写长一点，而是同时完成两件事：

- 把 fallback 正文从“通用短模板”升级为“固定论证结构模板”
- 把 `fullAnalysis >= 80` 的硬门槛从 Vercel 构建阶段前移到 Worker 发布前

如果这次只做一件事，先做第二件：**任何 `published / fallback_full` 公共内容，在写入 GitHub 之前就必须过同等级字数和结构校验**。

---

## 2. 背景

`2026-04-01` 的 Pinpoint #701 暴露了一个很典型的问题：

- Worker 已抓到当天题目
- `data/puzzles/pinpoint-answer-701.json` 已写入 GitHub `main`
- 但 Vercel 生产部署失败，线上仍显示 `700`

直接原因不是抓取失败，也不是缓存问题，而是 `#701` 的 fallback 正文太短，最终在构建阶段被 `validate:data` 拦住：

```text
pinpoint-answer-701 fullAnalysis is too thin (77 words; expected at least 80).
```

这次事件说明两个更深层的问题：

1. 我们现在的 fallback 正文模板仍然偏“短解释卡片”，不像完整的解析正文
2. 我们虽然已经有 `80` 词门槛，但它真正生效的位置太晚，导致问题先进入 `main`，再由 Vercel 替我们发现

---

## 3. 这份 PRD 要解决什么

本 PRD 不是为了讨论某一篇具体题目的文案怎么润色，而是为了统一以下三件事：

- 对手页值得借鉴的正文结构，到底该如何拆解
- 我们自己的 fallback 正文，应该固定产出哪些内容层
- 发布前的哪一层必须变成“硬拦截”，从而避免再由生产部署来发现问题

同时，这份 PRD 也必须回答另外两件之前写得不够重的问题：

- fallback 详情页在页面层面上，哪些区块必须稳定存在
- 当题目素材不足时，应该如何从“完整分析页”降级为“轻量说明页”，而不是硬凑一套长文

---

## 4. 问题定义

### 4.1 当前 fallback 正文太薄，不像完整解析

当前正文骨架主要来自：

- `lib/puzzles/fallback-copy.ts`
- `worker/src/index.ts` 的 `buildTemplateFallbackPayload()`
- `worker/src/index.ts` 的 `buildWorkerArticleBreakdown()`

它的问题不是“句子有语病”，而是结构过于扁平：

- 开场只有 1 句到 2 句
- 很快就进入 turning point
- 很快就给 answer
- 最后只剩 1 句确认

这类结构对 phrase 类题还能勉强成立，但对 `emoji / icon / symbol / category` 这类题天然容易变薄。

### 4.2 模板缺少“排除其他方向”和“全组验证”两层

对手页面不是单纯因为更啰嗦才显得更厚，而是多了我们现在很缺的两层：

- `为什么不是别的方向`
- `为什么整组 clues 一起成立`

没有这两层时，页面容易变成：

- “我看出来了”
- “答案是 X”
- “别的 clues 也差不多能对上”

这对用户不够像解析，对搜索引擎也不够像高价值解释页。

### 4.3 当前硬门槛出现得太晚

现在的链路是：

1. Worker 生成 fallback payload
2. Worker 直接写 GitHub `main`
3. Vercel 部署时运行 `npm run validate:data`
4. `scripts/validate-data.mjs` 在构建时触发真正的硬校验
5. 生产部署失败

这意味着：

- GitHub `main` 已经被写入了公共内容
- 生产站点却仍旧停在上一版
- 问题暴露位置不是“发布前”，而是“部署时”

这不是理想链路。

需要特别说明的是，`scripts/validate-data.mjs` 并不只是“字数线”：

- 它会校验 `fullAnalysis` 的最低词数
- 也会校验 HTML 标记、遗留模板短语、引号格式等文本卫生问题
- 还会通过 `validateEvidenceContract()` 校验 `questionType / difficultyBand / solvePath / turningPoint / clueRows / faqItems / uniquenessSignals`

所以这次 `#701` 的事故虽然表现为 `fullAnalysis < 80`，但更准确的问题定义应是：

- 现有构建校验已经有一定结构能力
- 只是它出现得太晚，而且还没有覆盖本 PRD 新增的字段与分层状态机

### 4.4 当前 Worker 的“薄内容保护”不是硬拦截

`worker/src/index.ts` 里虽然有：

- `MIN_DETAIL_FULL_ANALYSIS_WORDS = 80`
- `countDetailWords()`
- `resolveThinContentProtectionDecision()`

但它当前更像“已有健康旧内容时尽量别回退”，而不是“新题内容过短时严禁进入 `main`”。

对新题首次发布来说，如果没有旧稿可复用，它仍然会接受 `use-incoming`。

### 4.5 当前问题不只在正文，还在页面级结构定义不完整

这次对手站抽样说明，真正拉开差距的不是单篇正文多 80 词还是 150 词，而是页面有没有形成稳定骨架：

- 页头是否有一句快速摘要和明确的新鲜度信息
- 线索区是否承担“快速满足”功能
- 正文以下是否有 category、词表、lessons、FAQ、recent answers 这类承接块
- 老题页是否有明确导流到最新题的 CTA

如果 PRD 只定义正文 6 模块，而不定义这些页面级必需块，就很容易出现：

- 正文过线了
- 但页面仍然像一张临时说明卡，而不像完整答案页

---

## 5. 对手页面结构模板

根据对手下载站抽样，最值得借鉴的不是某一页的句子，而是“页面层 + 正文层”的双层结构。

### 5.1 页面层结构

对手的 detail 页并不是一上来就把长文正文怼给用户，而是先满足“我只想快速知道答案/确认今天有没有更新”的需求，再承接“我为什么该相信这页”的需求。

稳定页面骨架大致如下：

| 层 | 内容块 | 目标 |
|---|---|---|
| A1 | Hero 标题 + 一句摘要 | 快速告诉用户这页解决什么问题 |
| A2 | 作者 / 发布时间 | 强化新鲜度和可信度 |
| A3 | 固定价值卡片或信任块 | 强化“更新快、解释细、适合保持 streak” |
| A4 | clues 区 + reveal CTA | 先满足快速找答案的人 |
| A5 | 正文以下的承接块 | 把页面从答案卡升级为完整解析页 |

### 5.2 正文层结构

在正文层，对手完整分析页可以拆成 8 层内容结构。

| 层 | 内容块 | 目标 | 主要增加什么 |
|---|---|---|---|
| 1 | 开场钩子 | 先给读者一个判断和阅读理由 | 可读性 |
| 2 | 第一条 clue 的早期判断 | 说明为什么某个 clue 已足够缩小范围 | 说服力 |
| 3 | 错误方向排除 | 展示作者考虑过哪些宽泛方向并排除它们 | 说服力 |
| 4 | 候选答案形成 | 说明答案是怎么第一次成形的 | 结构完整性 |
| 5 | 全组 clues 验证 | 说明剩余 clues 如何一起支持答案 | 说服力 |
| 6 | 序列/集合解释 | 把线索解释成一个完整家族、序列或系统 | 说服力 + 正文字数 |
| 7 | 类别落地 | 明确 category 是什么，为什么不是更宽泛主题 | 收束感 |
| 8 | 表格 + FAQ | 每个 clue 怎么 fit，以及搜索型补充问题 | 证据密度 |

### 5.3 哪些块主要是增加字数

主要拉长正文的块是：

- 开场钩子
- 错误方向排除
- 序列/集合解释

### 5.4 哪些块主要是增加说服力

最有解释价值的块是：

- 第一条 clue 的早期判断
- 错误方向排除
- 全组 clues 验证
- 类别落地

### 5.5 最值得借鉴的不是篇幅，而是论证顺序

对手页最值得借鉴的，不是“多写 200 词”，而是这条顺序：

1. 我先怎么想
2. 哪个 clue 让我缩小范围
3. 为什么不是别的方向
4. 我怎么形成候选答案
5. 整组 clues 如何把这个答案坐实

我们当前 fallback 缺的正是这条顺序。

### 5.6 对手实际是“双层输出”，不是所有题都硬写满

抽样页里至少能看出两种 detail 形态：

- `完整分析页`
  - 具备完整推理正文、category、词表、lessons/takeaways、FAQ、recent answers
- `轻量说明页`
  - 保留题面、答案 reveal、少量说明、recent answers、导流到最新题
  - 不强行把正文写成完整长分析

这点非常重要，因为它说明成熟方案不是“每一页都写长”，而是：

- 有足够推理素材时，进入完整分析层
- 素材不足时，进入可接受的轻量说明层

---

## 6. 我们当前实现与对手结构的差距

### 6.1 当前 fallback 主要依赖短模板

当前正文模板主要在：

- `lib/puzzles/fallback-copy.ts` 的 `buildSharedFallbackArticleBlocks()`

它当前实际上只有两条主分支：

- `before / after` 这类 phrase 题，共用 1 套 `5` 段模板
- 所有非 phrase 题，共用 1 套 `6` 段模板
  - 包括 `typed-category`
  - 包括 `category`
  - 也包括 `association`

也就是说，现在的问题不只是“某个 6 段模板偏薄”，而是：

- 所有非 phrase 题都被塞进同一个 category 风格骨架
- 还没有 `emoji / symbol / icon` 的专用路径
- 也没有 `typed-category` 与普通 `category` 的专用路径

当前这套非 phrase 通用模板的 6 段固定句式大致是：

1. 开头两条 clue 看起来指向不同方向
2. turning point 出现
3. turning point 让答案可测
4. 通过 connectorSummary 重新读整组
5. 答案是什么
6. 最后两条 clue 是确认

这能保证“有正文”，但不能保证“像解析”。

同样的两分法也体现在：

- `buildSharedFallbackLessons()`
- `buildSharedFallbackFaqs()`
- `buildSharedFallbackSolutionNarrative()`

它们也都是 phrase 一套、非 phrase 一套，而不是按题型细分。

### 6.2 当前没有固定的误判层

虽然 `solutionNarrative` 有一定的“误判”意味，但它没有固定要求输出：

- 至少 2 个候选错误方向
- 每个方向为什么看起来合理
- 为什么被当前答案打败

所以不同题之间的“误判层”不稳定，经常退化成一句空泛的 “a broader category guess”。

### 6.3 当前没有固定的全组验证层

当前模板会提到 sampleReads / finalChecks，但没有强制回答：

- 为什么 clue 3、4、5 不是单独成立，而是一起构成一个更强的集合
- 如果是 emoji / symbol 题，它们是不是一个熟悉序列
- 为什么这个答案比更宽的上位概念更精确

### 6.4 当前页面壳子其实能承接更厚的正文

前端消费层已经可以承接更多正文：

- `components/detail/PuzzleDetail.tsx`
- `components/detail/PuzzleFullAnalysis.tsx`

当前页面不会阻止我们生成更长的 `articleBlocks`。问题主要不在渲染，而在供给内容太薄。

---

## 7. 目标

### 7.1 产品目标

- fallback 页读起来像“简版完整解析”，而不是“自动生成的临时说明”
- obvious 题也要有基本论证结构，而不是只给答案和两句解释
- 让正文 first read、误判、验证、收束形成稳定阅读节奏

### 7.2 工程目标

- 任何 `published / fallback_full` 公共内容，在写入 GitHub 前必须通过字数和结构检查
- 不再让 Vercel 生产构建成为“第一次发现正文太短”的地方
- `fallback` 模板本身天然更厚，降低临时补句的频率

### 7.3 SEO 目标

- 每篇 fallback 详情页至少具备 2 层以上 clue-specific 解释价值
- 搜索引擎看到的不只是答案和重复模板，而是“为什么答案成立”的真实正文

### 7.4 页面完整度目标

- fallback 详情页在页面层面上要像“完整答案产品页”，而不是单段文章
- 老题页也要具备最基本的新鲜度、内链和导流能力
- 页面必须兼顾两种用户：只想马上确认答案的人、想看解释过程的人

---

## 8. 非目标

- 本 PRD 不要求大改详情页视觉设计
- 本 PRD 不要求新增独立技巧页或更多相关页
- 本 PRD 不优先解决多语言 fallback
- 本 PRD 不以“无限拉长文章”为目标

重点是：**把正文结构补齐，而不是把每篇都写成超长专题。**

---

## 9. 方案概览

本方案分成三条同时推进的轨道：

- `轨道 A：结构升级`
  - 把 fallback 从 6 句短模板升级成 6 个固定模块
- `轨道 B：页面骨架补齐`
  - 把页面级必需块写成规格，而不是把所有价值都压到正文里
- `轨道 C：校验前移`
  - 把 `80` 词门槛和结构门槛从构建时前移到 Worker 发布前

如果只做 A，不做 B：

- 文案会变好一些
- 但页面仍可能缺少 recent answers、发布日期、导流 CTA 这类关键块

如果只做 B，不做 C：

- 页面完整度会变好
- 但仍然可能由生产部署第一次发现问题

如果只做 C，不做 A / B：

- 可以挡住事故
- 但 fallback 正文和页面完整度仍然会偏薄、偏模板

所以理想状态是三条轨道一起做，且 C 的优先级更高。

---

## 10. 新的 fallback 文案结构模板

建议把当前 fallback 正文统一升级为 6 个固定模块。

### 模块 1：开场误判

**目标**

- 告诉读者为什么这题第一眼会发散

**必须回答**

- 前 2 到 3 个 clues 第一眼像什么
- 为什么它们不立即指向一个唯一答案

**变量**

- `clues.slice(0, 3)`
- `pattern.kind`
- `wrongGuessCandidates`

**最少要求**

- 2 句
- 不可直接给最终答案

### 模块 2：最早缩小范围的 clue

**目标**

- 告诉读者哪个 clue 最早让答案变得可测

**必须回答**

- 为什么这个 clue 比其他 clue 更具体
- 它为什么能起到“类别锚点”作用

**变量**

- `turningPoint`
- `turningPhrase`
- `connectorSummary`

**最少要求**

- 2 句

### 模块 3：错误方向排除

**目标**

- 解释为什么不是几个更宽泛、也看起来说得通的方向

**必须回答**

- 至少 2 个错误方向
- 每个方向为什么一开始看起来合理
- 为什么最终不如当前答案精确

**变量**

- `wrongGuessCandidates`
- `pattern.kind`
- `words`

**最少要求**

- 至少 2 个候选误判
- 每个误判至少 1 句解释

### 模块 4：候选答案形成

**目标**

- 告诉读者答案第一次变得像“可以下注的解”的时刻

**必须回答**

- 什么时候从宽泛主题切换到具体类别
- 为什么此时答案已足够可测

**变量**

- `answer`
- `connectorSummary`
- `turningPoint`

**最少要求**

- 2 句

### 模块 5：全组 clues 验证

**目标**

- 证明不是只靠一个 clue 猜中，而是整组 clues 一起支持

**必须回答**

- 剩余 clues 如何一起成立
- 为什么它们不是零散样本，而是同一个集合

**变量**

- `words`
- `sampleReads`
- `finalChecks`

**最少要求**

- 至少引用 3 个 clues
- 若为 emoji / icon / symbol 题，必须写“它们共同组成什么熟悉序列或家族”

### 模块 6：最终收束

**目标**

- 明确答案是什么，以及为什么不是更宽泛主题

**必须回答**

- 最终 category
- 为什么这个 category 是精确命中
- 为什么不是更松的上位概念

**变量**

- `answer`
- `connectorSummary`
- `wrongGuessCandidates`

**最少要求**

- 至少 2 句

### 10.7 六模块中文文案蓝本与英文句式映射

这一节不是最终线上文案，而是供评审使用的“模板蓝本”。

目的只有两个：

- 让产品和内容能先判断这套 fallback 骨架是否像“真实解析”
- 让工程在落代码时知道每个模块大概要产出什么语气、什么信息密度

原则：

- 中文蓝本负责表达“这一段应该说什么”
- 英文句式负责表达“代码最终应该产出哪一类句子”
- 两者都不是逐字照抄稿，变量位需要由实际题目填充

#### 模块 1：开场误判

**中文蓝本**

> 这题第一眼很容易往几个宽泛方向上想。像 `{{clueA}}`、`{{clueB}}`、`{{clueC}}` 这样的开局，看起来像是在提示 `{{wrongGuess1}}`、`{{wrongGuess2}}`，甚至 `{{wrongGuess3}}`。问题是，这些方向都还太松，暂时还不足以解释整组 clues。

**英文句式方向**

> At first, `{{clueA}}`, `{{clueB}}`, and `{{clueC}}` could have pointed toward a few broader reads, including `{{wrongGuess1}}` and `{{wrongGuess2}}`. At that stage, the board still felt wider than one exact answer.

**备注**

- 这段不能直接给答案
- 这段主要负责把读者带进“题目看起来为什么会发散”

#### 模块 2：最早缩小范围的 clue

**中文蓝本**

> 真正让范围开始收紧的是 `{{turningPoint}}`。它不像前面的 clues 那样只是“看起来有点像”，而是第一次让这个题开始像一个具体类别。关键不只是它本身出现了，而是它让几个宽泛方向一下子变得不够精确。

**英文句式方向**

> The first clue that really narrowed the frame was `{{turningPoint}}`. It felt more specific than the earlier clues and pushed the board away from a loose theme toward a testable category.

**备注**

- 这段要解释“为什么它是锚点”
- 不能只写“`{{turningPoint}}` was the key clue.”

#### 模块 3：错误方向排除

**中文蓝本**

> 我一度考虑过 `{{wrongGuess1}}`，因为 `{{whyPlausible1}}`。`{{wrongGuess2}}` 也短暂成立，因为 `{{whyPlausible2}}`。但一旦把 `{{turningPoint}}` 放回整组里看，这些解释都会显得太宽，或者只能解释部分 clues，没办法像 `{{answerLabel}}` 那样把整组一起收住。

**英文句式方向**

> `{{wrongGuess1}}` was plausible at first because `{{whyPlausible1}}`, and `{{wrongGuess2}}` also had a case because `{{whyPlausible2}}`. But once `{{turningPoint}}` entered the picture, those reads felt too broad to explain the whole board cleanly.

**备注**

- 这一段是最容易被省掉、但最能提升说服力的一段
- 至少要写出 2 个具体误判，不接受泛泛的 “a broader category guess”

#### 模块 4：候选答案形成

**中文蓝本**

> 到这里，我已经开始把答案收紧到 `{{answerLabel}}` 这个方向。因为当 `{{turningPoint}}` 与 `{{connectorSummary}}` 对上时，这个题第一次从“可能像很多东西”变成了“可以真正拿来测试的一个解”。

**英文句式方向**

> That was the point where the board started to look like `{{answerLabel}}` rather than a vague theme. Once `{{turningPoint}}` clicked under `{{connectorSummary}}`, the answer became concrete enough to test across all five clues.

**备注**

- 这段是把“看懂了”推进到“敢下注了”
- 不能一上来直接硬宣布答案，而是要让答案有成型时刻

#### 模块 5：全组 clues 验证

**中文蓝本**

> 剩下的 clues 让这个答案不只是“说得通”，而是越来越稳。`{{clueD}}`、`{{clueE}}`、`{{clueF}}` 不再像零散样本，而是一起组成了 `{{setValidationSummary}}`。如果这是 emoji / symbol 类题，这里必须明确说明它们共同构成的是一个熟悉的视觉集合、序列或梯度。

**英文句式方向**

> The remaining clues made the answer look cleaner, not just possible. `{{clueD}}`, `{{clueE}}`, and `{{clueF}}` worked together as `{{setValidationSummary}}`, which made the board read like one complete set instead of a few lucky matches.

**备注**

- 这段是对手页最强的一层
- 对 `emoji / symbol / icon` 题，这段必须写出“视觉家族 / 序列 / 变化路径”

#### 模块 6：最终收束

**中文蓝本**

> 所以最终答案是 `{{answer}}`。更准确地说，这题命中的不是一个松散主题，而是 `{{categoryPrecisionNote}}`。这也是为什么 `{{answer}}` 比 `{{wrongGuess1}}` 或 `{{wrongGuess2}}` 更准：它不只是能解释一两个 clue，而是能把整组 clues 的边界一起锁住。

**英文句式方向**

> The answer was `{{answer}}`. More importantly, the board resolved as `{{categoryPrecisionNote}}`, not a looser umbrella theme. That is why `{{answer}}` fits better than `{{wrongGuess1}}` or `{{wrongGuess2}}`: it explains the full set without stretching the category.

**备注**

- 这段必须回答“为什么不是更宽的上位概念”
- 不能只停在 “The answer was `{{answer}}`.”

#### 10.8 `emoji / category` 题型专用蓝本

`#701` 这种题最容易把正文写薄，所以这里给出单独蓝本。

**中文蓝本**

> 这题表面上像是一串零散 emoji，但 `{{anchorEmoji}}` 很早就让我把范围缩到熟悉的天气符号。它不像一个抽象情绪图标，而更像是某个稳定视觉家族里的成员。等到 `{{emojiB}}`、`{{emojiC}}`、`{{emojiD}}`、`{{emojiE}}` 也一起出现后，这组线索就不再只是“几个和天气有关的表情”，而更像一条完整的天气变化序列：`{{sequenceSummary}}`。这也是为什么最终答案应当落在 `{{answer}}`，而不是更宽泛的 `{{broaderTheme}}`。

**英文句式方向**

> At first, the board could have looked like a loose set of emojis, but `{{anchorEmoji}}` already felt like part of a familiar weather-symbol family. Once `{{emojiB}}`, `{{emojiC}}`, `{{emojiD}}`, and `{{emojiE}}` joined it, the set read more like `{{sequenceSummary}}` than a random emoji cluster. That is why the board lands on `{{answer}}`, not a broader theme like `{{broaderTheme}}`.

**备注**

- `emoji / category` 模板必须强制写出：
  - 视觉家族
  - 序列或梯度
  - 为什么不是宽泛 emoji 主题

### 10.9 页面级骨架蓝本

除了正文 6 模块，详情页本身也需要稳定骨架。

建议把页面级必需块写成明确规格：

1. `Hero 摘要`
   - 一句话告诉用户今天这题大概在解什么
   - 目标：快速满足和 SEO 摘要承接
2. `作者 / 发布时间`
   - 明确 byline 与 datePublished
   - 目标：新鲜度和可信度
3. `clues + reveal CTA`
   - 允许先看线索、再看答案
   - 目标：满足“先确认答案”的用户
4. `正文区`
   - 完整分析页走 6 模块
   - 轻量说明页走缩减版说明
5. `Category`
   - 明确最终类别和边界说明
6. `Words & How They Fit`
   - 用表格覆盖全部 clues，而不是只覆盖部分样本
7. `Lessons / Takeaways`
   - 输出通用解题经验
8. `FAQ / Side Note`
   - 承接搜索问题或补充说明
9. `Recent Pinpoint Answers`
   - 提供内链和相关题回流
10. `Latest Answer CTA`
   - 对旧题页明确提示去看当天最新题

---

## 11. 专用模板分流

所有题目不应继续共用同一套 fallback 正文骨架。同时，也不应该默认所有题目都进入“完整分析页”。

### 11.0 先分输出层级，再分正文模板

建议先判断当前题目进入哪一层输出：

- `full-analysis`
  - 具备足够推理素材，进入完整分析页
- `light-explainer`
  - 素材不足，但仍需输出合格答案页
  - 保留题面、少量解释、category、recent answers、latest CTA

进入 `full-analysis` 后，再按题型选择正文模板。

建议触发 `light-explainer` 的场景包括：

- turning point 不够具体
- 无法稳定产出至少 2 个可信误判
- 无法产出可读的全组验证层
- 老题补档或信息残缺页

### 11.0.1 触发规则必须机器可判定

上面的描述是产品语言，落代码时必须转成确定性规则。

建议优先采用结构规则，而不是主观判断：

- 若 `difficultyBand` 为 `medium / hard` 且 `wrongGuessCandidates.length < 2`，则不能进入 `full-analysis`
- 若 `difficultyBand` 为 `obvious` 且 `wrongGuessCandidates.length < 1`，则不能进入 `full-analysis`
- 若正文中实际被引用的有效 clues 少于 3 个，则不能进入 `full-analysis`
- 若 `setValidationSummary` 为空，则不能进入 `full-analysis`
- 若 `categoryPrecisionNote` 为空，则不能进入 `full-analysis`
- 若 `turningPoint` 缺失或未出现在 clues 集合中，则不能进入 `full-analysis`

可选地，模型可以返回一个 `confidenceScore` 供日志观察，但它不应作为唯一门槛。

这里要特别说明 `obvious` 难度：

- `obvious` 题不应被默认判定为只能走 `light-explainer`
- 但它们允许采用更低的误判门槛
- 如果连 1 个可信误判也无法产出，再降级到 `light-explainer`

### 11.0.2 发布状态机

Worker 的最终发布决策不应是“通过或抛错”两态，而应是三态状态机：

1. 先尝试生成 `full-analysis`
2. 若不满足 `full-analysis` 的结构 / 字数门槛，则强制降级为 `light-explainer`
3. 只有当 `light-explainer` 的最低门槛也无法满足，或当天核心题面数据缺失时，才允许真正阻断发布

这条规则的目标是：

- 长文质量不过线时，不影响当天题面与答案准时上线
- 只有“题面本身不可信”时，才允许整条链路失败

建议先分 3 套正文模板：

### 11.1 `emoji / symbol / icon` 类模板

适用场景：

- clues 大量是 emoji、图标、符号、视觉标记

必须强调：

- 第一条 clue 为什么已经很具体
- 这 5 个元素是否构成一个熟悉视觉集合或序列
- 为什么它们不是松散 emoji，而是同一类视觉符号

### 11.2 `before / after phrase` 模板

适用场景：

- `Words that come before ...`
- `Words that come after ...`

必须强调：

- 哪个 clue 先产出最不模糊的短语
- 为什么这个 shared word 比其他候选词更自然
- 其余 clues 如何形成常见短语

### 11.3 `typed-category / ordinary category` 模板

适用场景：

- `Types of ...`
- 普通分类题

必须强调：

- 为什么不是更大的上位类别
- 为什么 turning point 让类别从宽泛变精确
- 整组 clues 为什么构成一个清晰 family

---

## 12. 需要新增或明确的变量

为了让模板真正有论证结构，而不是继续填空，建议明确补充以下变量。

### 12.1 `wrongGuessCandidates`

**用途**

- 给模块 1 和模块 3 提供可写内容

**最少要求**

- 数组
- 至少 2 个候选
- 每个候选带 1 个短理由

建议结构：

```ts
type WrongGuessCandidate = {
  label: string;
  whyPlausible: string;
  whyRejected?: string;
};
```

### 12.1.1 `wrongGuessCandidates` 的数据来源策略

这类结构字段不能默认“总会自然生成出来”，必须明确来源优先级。

建议采用以下顺序：

1. `优先使用上游结构化结果`
   - 如果 LLM / 抓取 / enrich 接口已经给出误判候选，则直接消费
2. `其次由 Worker 基于 clues + turningPoint + answer 做有限推断`
   - 只允许在已有 enough context 的前提下补齐最少结构
   - 不能为了凑满字段而编造空泛误判
3. `若仍不足，则触发降级`
   - 当 `wrongGuessCandidates`、`setValidationSummary` 等关键结构字段无法可靠补齐时，不再强行维持 `full-analysis`
   - 直接切换到 `light-explainer`

同样的原则也适用于：

- `setValidationSummary`
- `categoryPrecisionNote`
- 其他新增的结构化解释字段

### 12.2 `setValidationSummary`

**用途**

- 支撑模块 5 的“全组验证”

**最少要求**

- 1 段文字，说明整组 clues 如何构成集合、序列或同一家族

### 12.3 `categoryPrecisionNote`

**用途**

- 支撑模块 6 的“为什么不是更宽泛主题”

**最少要求**

- 1 句，说明 category 的边界

### 12.4 `pageMeta`

**用途**

- 供页面级骨架使用，而不是塞进正文

建议结构：

```ts
type PageMeta = {
  authorName: string;
  publishedDateIso: string;
  freshnessLabel?: string;
};
```

### 12.5 `recentAnswerLinks`

**用途**

- 支撑 `Recent Pinpoint Answers`
- 提供站内回流和老题页内链

**最少要求**

- 至少 3 条链接
- 每条包含题号、标题、URL

### 12.6 `latestAnswerCta`

**用途**

- 供旧题页导流到最新题

建议结构：

```ts
type LatestAnswerCta = {
  enabled: boolean;
  href?: string;
  label?: string;
  reason?: string;
};
```

### 12.7 `clueSupportNotes`

**用途**

- 支撑 clue hover / tap 解释文案
- 把“每个 clue 如何连接答案”从正文里拆出来

**最少要求**

- 与 clues 数量对齐
- 每条 1 句解释

### 12.8 `pageExperienceMode`

**用途**

- 明确当前详情页走 `full-analysis` 还是 `light-explainer`

**最少要求**

- 枚举值
- 由 worker 在生成阶段决定

### 12.9 向后兼容约束

本 PRD 中新增的所有字段，在阶段一都必须视为 `Optional`。

原因很简单：

- 当前仓库中已经存在大量历史 detail JSON
- 它们不具备这些新字段
- 若前端直接把这些字段当必填，会导致旧题页渲染异常甚至白屏

因此需要明确两条约束：

- Schema 层：新字段默认可选
- 前端层：所有新字段都必须有空值分支与合理降级展示

是否追加“全量历史数据跑批补齐”，可以作为后续独立任务评估，但不应阻塞阶段一上线

---

## 13. 字数与结构硬门槛

### 13.1 公开正文目标字数

建议不再只盯住“刚过 80”。

| 模板类型 | 最低可接受 | 推荐目标 |
|---|---|---|
| `emoji / symbol / icon` | 100 词 | 130 到 170 词 |
| `before / after phrase` | 95 词 | 120 到 150 词 |
| `typed-category / category` | 95 词 | 120 到 150 词 |

### 13.2 不只是字数，还要有结构门槛

建议新增这些结构硬约束：

- 必须出现 1 个 `turningPoint`
- `medium / hard` 题必须出现至少 2 个 `wrongGuessCandidates`
- `obvious` 题至少出现 1 个 `wrongGuessCandidate`，否则应降级到 `light-explainer`
- 必须出现 1 段 `setValidationSummary`
- 必须出现 1 段 `categoryPrecisionNote`

如果只满足字数，不满足结构，也不允许发布为 `published / fallback_full`

### 13.3 页面级最低完整度门槛

对于 `full-analysis`：

- 必须有 `pageMeta`
- 必须有 `Category`
- 必须有覆盖全部 clues 的表格
- 必须有 `Lessons / Takeaways`
- 必须有 `FAQ / Side Note`
- 必须有 `Recent Pinpoint Answers`

对于 `light-explainer`：

- 必须有 `pageMeta`
- 必须有题面 + reveal CTA
- 必须有 `Category`
- 必须有至少 1 段简要解释
- 必须有 `Recent Pinpoint Answers`
- 必须有 `Latest Answer CTA`

### 13.4 发布连续性门槛

为了避免“长文不达标导致当天整题断更”，增加以下规则：

- `full-analysis` 不达标时，不直接失败，先尝试降级到 `light-explainer`
- `light-explainer` 至少要保证：题号、日期、clues、answer / mainAnswer、category、pageMeta 可用
- 只有当以上核心数据缺失或不可信时，才允许真正阻断写入 GitHub

---

## 14. 校验前移方案

### 14.1 当前问题

现在真正的硬校验在：

- `scripts/validate-data.mjs`

但它是在：

- `npm run build`
- Vercel 生产构建

时才生效。

这太晚了。

并且这里要准确描述现状：

- 它不是“只有字数门槛”的构建脚本
- 它已经同时承担字数、文本卫生和 evidence contract 校验
- 但它仍然不知道本 PRD 新增的字段，也还没有和 Worker 前移校验共用同一套分层发布规则

### 14.2 新规则

任何将以 `published` 或 `fallback_full` 对外公开的 payload，在 Worker 写 GitHub 前必须通过同等级校验。

但“同等级校验”不等于“必须都是完整长文”。

更准确的规则应是：

- 先校验 `full-analysis` 是否达标
- 若未达标，则自动走 `light-explainer` 规格重新校验
- 只要 `light-explainer` 达标，当天题仍允许发布

### 14.3 建议落点

#### 统一入口守卫应放在 `publishToNewSiteGitHub()` 函数内部

`publishToNewSiteGitHub()` 当前已经是多条发布路径共用的写入入口。

因此 PRD 必须明确：

- 不在各个调用点分别复制“字数 / 结构 / 降级”判断
- 统一守卫逻辑应嵌入 `publishToNewSiteGitHub()` 内部
- 所有调用路径只负责传入 payload，不负责各自重复实现质量门槛

这样做的原因是：

- 调用点多，重复实现容易漏改
- 统一入口更容易保证多条发布路径口径一致
- 后续如果再新增 publish 路径，不会绕过守卫

#### 生成后立即计词

位置：

- `worker/src/index.ts` 的 `buildTemplateFallbackPayload()`

动作：

- 在 `detailRecord` 生成后立即统计 `fullAnalysis`
- 若低于对应模板门槛，不应自由补水文，而应优先补齐缺失结构字段
- 若结构字段补齐后仍不满足 `full-analysis` 门槛，则自动降级尝试生成 `light-explainer`
- 复验时必须同时检查：字数、结构字段、页面级最低块

#### 发布入口做硬拦截

位置：

- `worker/src/index.ts` 的 `publishToNewSiteGitHub()`

动作：

- 如果 `detailState` 属于公共状态
- 且正文低于 floor
- 则先尝试把当前 payload 降级为 `light-explainer`
- 若 `light-explainer` 达标，则允许写入 GitHub
- 只有在轻量页也不达标、或核心题面数据缺失时，才直接抛错并阻断发布

#### 与 `validate:data` 保持同口径

位置：

- `worker/src/index.ts`
- `scripts/validate-data.mjs`

要求：

- 不能出现 Worker 允许、构建却拒绝的双重口径
- 最终应复用同一套最小字数、结构规则和分层发布规则

#### 与现有 `resolveThinContentProtectionDecision()` 的关系

本 PRD 新增的“`full-analysis -> light-explainer -> fail` 状态机”不应替代现有的薄内容保护函数，而应与其分层协作。

建议明确顺序如下：

1. `先跑新状态机`
   - 决定当前这次发布要使用 `full-analysis` 还是降级为 `light-explainer`
   - 这一步解决的是“本次要生成哪种可公开 payload”
2. `再跑 resolveThinContentProtectionDecision()`
   - 这一步解决的是“当前 payload 是否允许覆盖现有 slug 内容”
   - 也就是继续保留 `use-incoming / keep-existing / use-primary` 这层保护

优先级建议：

- 若当前 payload 已降级为 `light-explainer`，也仍要经过 `resolveThinContentProtectionDecision()`
- 若现有分支或主分支已经有更健康的同 slug 内容，则 `keep-existing / use-primary` 优先于覆盖写入
- 新状态机负责“生成层降级”，现有薄内容保护负责“写入层回退”

一句话说清：新状态机解决“生成哪份稿”，旧保护函数解决“能不能覆盖当前线上同 slug 内容”。

---

## 15. 代码改造建议

### 15.1 第一优先级

#### `lib/puzzles/fallback-copy.ts`

目标：

- 从“短模板函数”升级为“模块化正文骨架函数”

建议改造：

- 为 `emoji / symbol / icon` 增加专用正文分支
- 为 `category` 类题加入误判层和全组验证层
- 直接在模板层保底到推荐目标字数，而不是靠后补句

#### `worker/src/index.ts` 的 `buildTemplateFallbackPayload()`

目标：

- 在 payload 生成完成后做本地自校验

建议改造：

- 生成 `wrongGuessCandidates`
- 生成 `setValidationSummary`
- 生成 `categoryPrecisionNote`
- 若不足字数，优先补结构字段，不做自由扩写补水文
- 若结构仍不完整，则显式切换到 `light-explainer`

#### `worker/src/index.ts` 的 `buildPublishedPuzzleDetailRecord()`

目标：

- 把它明确视为所有 detail JSON 路径共用的核心组装出口

建议改造：

- 不只改 `buildTemplateFallbackPayload()`，也要同步改造这里内部的 fallback 分支
- 当 `analysis.detailedBreakdown / sections.overview` 过短时，`buildFallbackAnalysis()` 走出的正文也必须遵守新的模块化模板
- 避免 enrich 路径在短文场景下绕回旧的 fallback 行为，导致新旧模板并存

### 15.2 第二优先级

#### `worker/src/index.ts` 的 `publishToNewSiteGitHub()`

目标：

- 在公共内容真正写入 GitHub 前做硬拦截

建议改造：

- 将质量守卫集中写在函数内部，作为所有发布路径共用入口
- 公共正文过短时先尝试降级，不直接让当天题断更
- 对新 slug 和旧 slug 统一执行最低质量要求
- 只有轻量页也失败时才阻断写入
- 保留 `resolveThinContentProtectionDecision()` 作为写入层回退保护，而不是在调用点重复实现

#### `scripts/validate-data.mjs`

目标：

- 从现有的“字数 + 文本卫生 + evidence contract”校验，扩展为“字数 + 新结构字段 + 页面块 + 分层状态机”校验

建议改造：

- 增加对 `wrongGuessCandidates / setValidationSummary / categoryPrecisionNote` 的校验
- 增加对 `pageExperienceMode` 和页面级必需块的校验
- 明确这些新增校验是扩展现有 evidence contract，还是作为独立校验模块补充在其后

#### `components/detail/PuzzleDetail.tsx` 与 `components/detail/PuzzleFullAnalysis.tsx`

目标：

- 让已有前端承接能力变成 PRD 的明确消费目标

建议改造：

- 按 `pageExperienceMode` 明确区分完整分析页与轻量说明页
- 将 `pageMeta / recentAnswerLinks / latestAnswerCta / clueSupportNotes` 纳入稳定消费
- 不再默认所有 fallback 详情页都走同一种长文展开方式
- 所有新增字段按 `Optional` 处理，旧数据必须可正常渲染

#### `Latest Answer CTA` 的实现约束

目标：

- 避免因为“今天最新题”变化而牵连所有旧页重新静态构建

建议改造：

- `Latest Answer CTA` 不应作为旧题页 SSG 的固定依赖
- 优先通过客户端请求、轻量接口或运行时注入获取最新题链接
- 禁止把“今天的最新题”写死进每一个历史页面的静态产物中

---

## 16. 发布策略建议

理想状态下，Worker 不应直接把公共内容写入 `main`，而应：

1. 生成候选 payload
2. 发布前校验
3. 校验通过后进入发布分支
4. 验证通过后再合入 `main`

若短期内不做分支发布，至少必须做到：

- `publishToNewSiteGitHub()` 前移硬拦截
- “硬拦截”优先阻止劣质长文进入 `full-analysis`，而不是优先阻止当天题上线

否则就仍会出现：

- GitHub `main` 已是今天题
- 但线上仍是昨天题

---

## 17. 分期计划

### Phase 0：先止血

目标：

- 不再让“过短 fallback 正文”进入公共发布链路

范围：

- `buildTemplateFallbackPayload()` 后立即计词
- `publishToNewSiteGitHub()` 增加“先降级、后阻断”的公共内容硬拦截
- 明确 `light-explainer` 的最低发布门槛

### Phase 1：模板升级

目标：

- 让 fallback 至少具备完整页面骨架，并区分两种输出层级

范围：

- 新增 `full-analysis / light-explainer` 双层输出策略
- 写清页面级必需块
- 完整分析页新增 3 套专用正文模板和 6 个固定模块
- 明确旧数据兼容策略与前端空值分支

### Phase 2：结构校验升级

目标：

- 从“字数过线”升级为“正文结构 + 页面完整度”双过线

范围：

- `validate:data` 增加结构字段与页面块检查
- Worker 侧与构建侧共用同口径规则
- 将“结构补齐”替代“自由扩写补字”

### Phase 3：发布链收敛

目标：

- 让错误尽量在 `main` 之外暴露

范围：

- 评估发布分支或 staging 内容分支

---

## 18. 验收标准

### 18.1 工程验收

- 任意 `fallback_full` 正文都不能低于对应模板最低门槛
- Worker 写 GitHub 前即可发现不达标的 `full-analysis`，并先尝试降级到 `light-explainer`
- Vercel 不再是第一次发现正文太短的地方
- `full-analysis / light-explainer` 的分流规则可被日志和数据字段追踪
- 旧题 JSON 在新增字段缺失时不会导致前端报错
- `buildPublishedPuzzleDetailRecord()` 内部的短文 fallback 分支与新模板规则保持一致，不会绕回旧模板

### 18.2 内容验收

- obvious 题也有完整的“误判 -> turning point -> 全组验证 -> 收束”结构
- `emoji / symbol / icon` 题不再只靠 5 到 6 句短模板拼接
- 至少 2 层 clue-specific 解释可在页面正文中直接读到

### 18.3 页面验收

- `full-analysis` 页必须出现：`pageMeta`、正文、`Category`、覆盖全部 clues 的表格、`Lessons / Takeaways`、`FAQ / Side Note`、`Recent Pinpoint Answers`
- `light-explainer` 页必须出现：`pageMeta`、题面 + reveal、简要解释、`Category`、`Recent Pinpoint Answers`、`Latest Answer CTA`
- clue 表格和 FAQ 必须与正文形成承接，而不是单独填充页面长度
- 老题页必须具备明确的最新题导流，不可只停留在“历史答案静态页”
- `Latest Answer CTA` 的实现不得要求全部历史页随“今日题号”变化而重新静态构建

### 18.4 交互验收

- clues 若支持 hover / tap 解释，则每个 clue 都有对应说明
- 页面展开逻辑必须与 `pageExperienceMode` 匹配，不能把轻量说明页强行伪装成长文页
- 作者 / 发布时间必须能被稳定渲染并用于结构化数据
- 新增字段缺失时，页面必须以兼容模式降级展示，而不是报错

---

## 19. 风险与缓解

### 风险 1：模板变厚，但更像“废话”

缓解：

- 结构门槛必须绑定“误判层”和“全组验证层”
- 不能只靠补充形容句拉长字数

### 风险 2：Worker 与构建规则不一致

缓解：

- 最终要共享同一套 floor 与结构规则

### 风险 3：新变量过多，导致 fallback 组装复杂

缓解：

- 先加最小必要变量：`wrongGuessCandidates`、`setValidationSummary`、`categoryPrecisionNote`

### 风险 3.1：新增字段导致历史页兼容性事故

缓解：

- 新字段默认 `Optional`
- 前端必须先按兼容模式消费，再考虑历史数据跑批补齐

### 风险 4：过度模仿对手，失去我们自己的页面节奏

缓解：

- 借鉴的是论证结构，不是对手句子和语气

### 风险 5：双层输出策略引入实现复杂度

缓解：

- 第一阶段只先区分 `full-analysis` 与 `light-explainer`
- 页面级必需块优先复用现有组件，不同时追求大改视觉

### 风险 6：为了过字数门槛而产生低价值水文

缓解：

- 禁止把“自动补扩展段”实现成自由发挥的灌水段落
- 优先补结构字段，不能补出结构时就降级为 `light-explainer`

### 风险 7：`Latest Answer CTA` 牵连所有旧页重构

缓解：

- 将最新题链接设计为运行时获取
- 不把“今日题号”作为所有历史页的静态构建依赖

---

## 20. 评审时需要拍板的 11 个问题

1. `fallback_full` 的最低词数，是否从统一 `80` 提高为按模板分流的不同阈值？
2. 是否明确采用 `full-analysis / light-explainer` 双层输出策略？
3. `emoji / symbol / icon` 是否立即单独做专用模板，而不是继续走普通 `category`？
4. `wrongGuessCandidates` 是否作为公开 JSON 的正式字段保留？
5. `pageMeta / recentAnswerLinks / latestAnswerCta / clueSupportNotes` 是否作为页面正式供给字段保留？
6. Worker 发布前的硬拦截，是否采用“先降级到 `light-explainer`，轻量页也失败才报错”的状态机？
7. 新增字段是否统一按 `Optional` 上线，并要求前端先做向后兼容？
8. `validate:data` 是否升级为“字数 + 结构 + 页面块”三重校验？
9. `Latest Answer CTA` 是否明确采用运行时获取，而不是 SSG 固定依赖？
10. 是否要在中期把 Worker 公共发布从“直接写 main”改成“先写发布分支再合入 main”？
11. `obvious` 难度题进入 `full-analysis` 时，是否明确采用较低的误判门槛（例如 `wrongGuessCandidates >= 1`）？

---

## 21. 推荐决策

如果需要一个最小可行方案，我建议：

1. 立即给 `emoji / symbol / icon` 单独做模板
2. 立即引入 `full-analysis / light-explainer` 双层输出策略
3. 立即把“硬拦截”改成“先降级、后阻断”的状态机
4. 立即新增 `wrongGuessCandidates + setValidationSummary + categoryPrecisionNote + pageMeta + recentAnswerLinks + latestAnswerCta`
5. 立即要求新增字段按 `Optional` 上线，并在前端加兼容分支
6. 立即把 `Latest Answer CTA` 约束为运行时获取
7. 立即把 `obvious` 难度题的 `full-analysis` 门槛设为低于 `medium / hard`
8. 下一阶段再把 `validate:data` 升级为结构与页面校验

这样能最快解决这次 `#701` 暴露出来的两类问题：

- 正文太薄
- 校验太晚

---

## 22. 最终判断

这次不应该把问题理解成“某一篇 fallback 写短了”，而应该理解成：

- 我们当前的 fallback 产品定义本身还不够完整
- 它既缺固定论证结构，也缺页面级骨架与发布前硬门槛

所以这次 PRD 的核心不是“写更多”，而是：

- 让 fallback 从“通用短解释”升级为“有页面层级的答案产品页”
- 让完整分析页与轻量说明页各自有明确边界
- 让发布链在保证连续更新的前提下再做质量控制，而不是一刀切卡死
- 让发布链从“先写 main，再由构建发现错误”升级为“先校验，再允许发布”

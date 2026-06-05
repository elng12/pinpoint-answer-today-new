# Pinpoint Legacy Site Reverse Engineering

Date: 2026-06-04

Source inspected:

`/Users/elng/Downloads/us.sitesucker.mac.sitesucker-pro/pinpointanswer.today`

注意：

这份 SiteSucker 快照不在当前仓库里。

所以报告数字是“本机这份快照可复现”，不是“任何机器天然可复现”。

当前快照指纹：

```text
htmlFileCount: 303
totalBytes: 32303363
sha256: 49b70aa6338c225beead2ad60a402710fab34365a1353dfa1329a40315a10cef
```

## 结论先说

这个目录不是完整源码，而是 SiteSucker 抓下来的旧站静态页面。

所以它不能告诉我们后台怎么抓 LinkedIn、怎么定时发布、怎么调用模型。

但它能告诉我们一件很重要的事：

旧站最终公开出来的页面，内容结构非常稳定。

它不是靠长篇大论赢，而是靠每天稳定生成同一套内容骨架：

1. 先给 5 个 clue。
2. 答案默认隐藏，用户点 reveal 才看。
3. 正文写成解题过程，不是只写答案。
4. 每个 clue 都落到一个具体短语、例子、或成员。
5. FAQ 和 recent links 每页都有。
6. 页面是预渲染 HTML，Google 一打开就能读到正文。

我们应该学它的输出方法，不是照搬它的页面名字、路由、schema 或旧模块标题。

## 批量统计

统计范围：

- 详情页数量：303 页
- 题号范围：`pinpoint-458` 到 `pinpoint-760`
- 页面路径：`/linkedin-pinpoint-answer/pinpoint-{number}/`

统计方法：

```bash
node scripts/analyze-legacy-pinpoint-site.mjs
node scripts/analyze-legacy-pinpoint-site.mjs --json
```

如果 SiteSucker 目录换了，可以这样指定：

```bash
node scripts/analyze-legacy-pinpoint-site.mjs --source /path/to/pinpointanswer.today/linkedin-pinpoint-answer
```

这个脚本只做启发式统计。

它统计的是静态 HTML 里已经能匹配到的内容。

它会先去掉 `script`、`style`、`noscript`，再数页面文字、标题、表格、FAQ、schema 和一些解题语言。

所以这些数字不是靠人工估计，也不是靠 Next.js 内部数据硬猜。

但它也不是完整浏览器渲染审计：

- schema 只是字符串匹配，不是完整解析 JSON-LD。
- FAQ 数量是从 `FAQ` 到 `Recent` 之间数问号。
- 5 行表格是取页面里最大的 table 行数，不是逐格语义解析。
- 词数包含导航、按钮、recent links、隐藏/折叠内容等 HTML 文本。

所以这些数字适合看旧站的大体稳定模式，不适合当成逐页精确审计。

核心启发式统计：

| 项目 | 数量 |
| --- | ---: |
| 详情页总数 | 303 |
| 匹配到 clue card / reveal 交互 | 303 |
| 匹配到 recent links | 303 |
| 匹配到 `NewsArticle` | 303 |
| 匹配到 `BreadcrumbList` | 303 |
| 匹配到 `Game` | 303 |
| 匹配到 `WebSite` / `Organization` | 303 |
| 匹配到 `FAQPage` | 286 |
| 匹配到 `Answer & Full Analysis` 标题 | 286 |
| 匹配到 `Words & How They Fit` 或同类表格 | 291 |
| 表格正好 5 行 clue 内容 | 295 |
| 匹配到 FAQ 标题 | 290 |
| FAQ 大多 3 个问题 | 275 |
| 使用第一人称解题口吻 | 294 |
| 明确写 wrong / trap / decoy / first thought 等错误方向 | 214 |
| 明确写 turning / clicked / breakthrough / pivot 等转折语言 | 238 |
| 明确写 confirmation / confirmed / sealed 等验证语言 | 197 |

HTML 文本词数：

| 指标 | 词数 |
| --- | ---: |
| 中位数 | 801 |
| 最少 | 333 |
| 最多 | 1308 |
| 25 分位 | 767 |
| 75 分位 | 844 |

这说明旧站的正式详情页，整页文本体量大多数不是 2000 词长文。

它的主力形态更像是中等长度的稳定解释页。

因为这个词数口径包含导航、按钮和 recent links，所以不要把它理解成“正文纯文本一定是 750 到 850 词”。

## 异常页

这些异常页说明旧站也不是 100% 完美，但主流页面结构非常稳定。

缺 `Answer & Full Analysis` 标题：

```text
pinpoint-458, pinpoint-459, pinpoint-460, pinpoint-461, pinpoint-462, pinpoint-463, pinpoint-464, pinpoint-465, pinpoint-466, pinpoint-467, pinpoint-468, pinpoint-470, pinpoint-471, pinpoint-472, pinpoint-473, pinpoint-474, pinpoint-729
```

缺 `Words & How They Fit` 或同类表格标题：

```text
pinpoint-458, pinpoint-459, pinpoint-460, pinpoint-461, pinpoint-462, pinpoint-463, pinpoint-464, pinpoint-465, pinpoint-466, pinpoint-467, pinpoint-468, pinpoint-739
```

表格不是 5 行 clue 内容：

```text
pinpoint-458:0, pinpoint-459:0, pinpoint-460:0, pinpoint-461:0, pinpoint-462:0, pinpoint-463:0, pinpoint-464:0, pinpoint-465:0
```

缺 FAQ 标题：

```text
pinpoint-458, pinpoint-459, pinpoint-460, pinpoint-461, pinpoint-462, pinpoint-463, pinpoint-464, pinpoint-465, pinpoint-466, pinpoint-467, pinpoint-468, pinpoint-480, pinpoint-517
```

FAQ 不是 3 个问题：

```text
pinpoint-458:0, pinpoint-459:0, pinpoint-460:0, pinpoint-461:0, pinpoint-462:0, pinpoint-463:0, pinpoint-464:0, pinpoint-465:0, pinpoint-466:0, pinpoint-467:0, pinpoint-468:0, pinpoint-478:4, pinpoint-480:0, pinpoint-517:0, pinpoint-533:4, pinpoint-582:5, pinpoint-584:4, pinpoint-585:4, pinpoint-587:5, pinpoint-589:4, pinpoint-590:5, pinpoint-593:2, pinpoint-594:2, pinpoint-626:4, pinpoint-634:4, pinpoint-728:4, pinpoint-746:4, pinpoint-748:4
```

## 它的页面怎么执行

旧站执行链路是：

```text
后台提前生成内容
-> Next.js build 成静态 HTML
-> 每个题一个 index.html
-> 用户访问 HTML
-> JS 只负责按钮、展开、复制、tooltip、广告等交互
```

不是：

```text
用户打开页面
-> 浏览器调用 API
-> 前端再生成内容
```

证据：

- 没有 `package.json`、`app/`、`src/` 等源码入口。
- 每个详情页都是静态 `index.html`。
- 页面数据已经写在 HTML 和 `self.__next_f.push(...)` 里。
- `_next/static/chunks/app/[locale]/linkedin-pinpoint-answer/[slug]/page-*.js` 只负责 reveal、copy、read more、clue tooltip 等交互。

这点对我们很重要：

正式页应该尽量做到“发布时就已经完整”，不要指望用户访问时再补内容。

## 旧站详情页固定骨架

典型详情页是这样：

1. Title
   - `LinkedIn Pinpoint 760 : Paper, Cut, Feed, Flash, Hump`

2. H1
   - `LinkedIn Pinpoint #760 Answer & Analysis`

3. 首屏问题
   - `What connects "Paper", "Cut", "Feed", "Flash", "Hump"...`
   - 鼓励先看 hints，再 reveal。

4. 三个信任卡片
   - `Daily Updates`
   - `Detailed Explanations`
   - `Continuous Challenge`

5. Clue / reveal 区
   - 5 个 clue card
   - hover / tap 后显示 clue 解释
   - answer 默认隐藏
   - click reveal 后显示答案

6. Full Analysis
   - 第一人称解题过程
   - false start
   - turning clue
   - confirmation clues

7. Category
   - 明确最终答案类别或模式

8. 5 行 clue 表格
   - `Word`
   - `Phrase / Example`
   - `Meaning & Usage`

9. FAQ
   - 通常 3 条

10. Recent answers
   - 给用户和搜索引擎继续爬的路径

## 最值得学的内容方法

### 方法 1: false start 必须具体

旧站不是写：

```text
a loose topic list
standalone clue meanings
```

它会写更像人的错误方向。

例如 #760：

```text
Paper 让我先想到 wood / pulp / office supplies / printable materials。
```

例如 #750：

```text
False, Paper, Nature 先让人往普通词义或自然主题猜。
```

我们当前项目的问题是：

结构已经有了 `wrongGuessCandidates`，但内容有时太空。

当前 #765 就是例子。

它的 clue 是：

```text
White / Pirate / National / Checkered / Capture the
```

答案是：

```text
Words that come before “flag”
```

但 `wrongGuessCandidates` 里还出现了：

```text
a loose topic list
standalone clue meanings
```

这两个不是人的真实猜法，更像占位标签。

更关键的是，它不只是 JSON 里难看。

真实页面链路是：

```text
data/puzzles/pinpoint-answer-765.json
-> buildReasoningArticleDraft()
-> PuzzleFullAnalysis.tsx
-> Answer Reasoning 正文
```

`buildReasoningArticleDraft()` 会把 `solvePath.falseStarts[0]` 写成：

```text
My first read drifted toward "a loose topic list"...
```

所以这是会污染页面正文的问题，不只是后台字段问题。

字段级对照：

| 字段 | 当前问题 | 是否影响页面 | 应该改成 |
| --- | --- | --- | --- |
| `solvePath.falseStarts` | `a loose topic list` / `standalone clue meanings` | 会进 `Answer Reasoning` | `color words` / `chess or surrender read` |
| `wrongGuessCandidates[].label` | 抽象标签 | 会影响修复和复盘文案 | 具体错误方向 |
| `clueRows[].surfaceMisread` | 5 行都写 `a loose topic list` | 会影响后续质量判断 | 每个 clue 的真实误读 |
| `turningPoint.whatChangedAfterIt` | `earlier clues stop feeling broad` | 能过校验但偏空 | `Pirate flag` 带动回查 `White flag` |
| `clueRows[].resolvedPhraseOrMember` | `White flag` 等已经具体 | 这部分是好的 | 保留并用于 board-check |

应该改成：

- 错误猜测必须是具体名词或具体方向。
- 禁止 `loose topic list`、`standalone clue meanings` 这种空标签。
- 错误猜测至少要引用 1 到 2 个真实 clue。

#765 更好的写法应该像这样：

```text
White 先容易让人想到颜色、投降、或者 chess。
Pirate 出现后，可以试 pirate flag。
再回头试 White flag，发现它也能接上。
这时才知道不是颜色主题，也不是海盗主题，而是每个 clue 后面都能接 flag。
```

根因可以说清楚：

```text
上游会生成空标签
-> fallback / auto-repair 可能保留空标签
-> validate:data 主要查字段非空
-> reasoning article 检查主要查结构
-> 最后页面结构过了，但内容仍然像模板
```

所以不是“模板没讨论过”。

是模板有了，但质量门只查了结构，没有查“这个猜法像不像真人会猜”。

好坏段落对照：

| 类型 | 段落 | 问题 / 优点 |
| --- | --- | --- |
| 当前坏例子 | `My first read drifted toward "a loose topic list"...` | 看不出真人会怎么猜，只是模板标签。 |
| 旧站可学写法 | `Paper 让我先想到 wood / pulp / office supplies / printable materials。` | 错误方向具体，而且绑定真实 clue。 |
| #765 应改写法 | `White 先让人想到颜色或投降，Pirate 出现后才值得试 pirate flag，再回头验证 White flag。` | 有误读、有转折、有验证。 |

### 方法 2: turning clue 要像“转折点”

旧站经常用这类标题：

- `Cut Changes Everything`
- `The Second Clue Changes Everything`
- `The Aha Moment`
- `The Word That Changed Everything`
- `The clue that changed everything`

这说明它不是只说“某 clue 很重要”，而是把它写成一个解题转折。

我们当前项目已经有 `turningPoint` 字段，但有时只写：

```text
Capture the is the clue that makes the shared answer concrete enough...
```

这能过校验，但不像人话。

应该改成：

```text
看到 Pirate 时，我先想到 pirate flag。
再回头试 White flag，发现 White 也能接上。
这时才知道不是颜色、不是海盗，而是同一个结尾词。
```

### 方法 3: 5 个 clue 都要有具体落点

旧站表格最有价值。

它不只是说 “这个 clue fits the answer”。

它会给具体落点：

| Clue | Phrase / Example | Meaning |
| --- | --- | --- |
| Paper | Paperback | A book with a flexible paper cover |
| Cut | Cutback | A reduction in spending, size, or scope |
| Feed | Feedback | Information or reactions about performance |
| Flash | Flashback | A sudden memory or scene from the past |
| Hump | Humpback | A whale species known for its curved back |

我们现在已经有 `clueRows` / `display.clueTableRows`，但是页面不再显示旧表格模块。

这没有问题。

重点不是恢复旧标题，而是保证底层数据必须达到这个质量：

- 每个 clue 一个具体 phrase/member。
- 每个 phrase/member 不能只是 clue 原词。
- 每个解释必须说明为什么它成立。
- phrase-pattern 题要特别处理空格，比如 `Paper back` 应该更自然地显示成 `Paperback`，除非原短语本身要分开。

当前页面可以这样承接 5 个 clue 解释：

- `Answer Reasoning` 里的 board-check block 负责展示 5 个具体 phrase/member。
- `What This Pinpoint Teaches` 只放 2 到 3 个当天题的解题经验，不要变成旧表格。
- `clueRows` / `display.clueTableRows` 继续当底层质量数据。

另外要单独注意 clue tooltip。

当前 detail 页面会把 `wordHints` 传给 clue hint。

#765 的 `wordHints` 里已经有 `White flag`、`Pirate flag` 这类答案相关短语。

所以“reveal 前不提前泄露答案”不是现在已经满足的事实，只能作为后续检查项。

不要恢复旧标题。

原因很简单：当前发布检查已经把旧标题当成问题。

### 方法 4: FAQ 要和当天题相关

旧站 FAQ 通常是 3 条：

1. 答案是什么。
2. 这个题为什么容易误导。
3. 遇到类似题怎么解。

好的 FAQ 不是泛泛而谈。

例如 #760：

- Why are compound word puzzles so common in Pinpoint?
- What's the best strategy for spotting before/after word patterns?
- Was "paper cut" a trap in this puzzle?

我们当前项目要避免：

```text
How do the clues confirm the answer?
```

这种太泛的问题可以有，但不能全是这种。

应该要求至少一条 FAQ 绑定具体 clue 或具体 false start。

### 方法 5: 正文不需要特别长，但必须完整

旧站多数页面 750 到 850 词。

它的有效结构是：

```text
开头悬念
-> 第一错误方向
-> 转折 clue
-> 答案模式
-> 剩余 clue 验证
-> 5 行表格
-> 3 条 FAQ
-> recent links
```

所以我们不应该只提高字数。

应该提高“每段有没有承担任务”。

## 我们不能直接复制的地方

### 不复制旧路由

旧站路由：

```text
/linkedin-pinpoint-answer/pinpoint-760/
```

我们当前路由：

```text
/linkedin-pinpoint-answers/pinpoint-answer-760/
```

不能改回旧路由。

### 不恢复旧模块标题

我们当前发布检查已经禁止这些旧标题：

- `Clue Connections`
- `Words & How They Fit`
- `Lessons Learned`
- `Compact FAQ`
- `Quick Take`

所以不能直接把旧模块搬回来。

正确做法是：

保留当前页面形态，但把旧站的 5 行 clue 解释能力吸收进 `Answer Reasoning` 和 `What This Pinpoint Teaches`。

### 不照搬 `FAQPage`

旧站很多页面有 `FAQPage`。

我们当前项目已经采用更谨慎的结构化数据策略：

- Article
- Game
- ItemList
- BreadcrumbList

所以不要为了复制旧站而重新堆 `FAQPage`。

### 不照搬假日记口吻

旧站经常写 “I guessed / I submitted / Correct”。

这有可读性，但也有风险：

- 如果不是用户真实操作，就容易像假经历。
- 如果模型编得太细，可能看起来不可信。

我们应该用“解题复盘口吻”，不要伪装成真实当天操作记录。

不要写：

```text
I submitted the answer.
Correct.
On my second guess, I solved it.
```

可以写：

```text
A solver might first test color words from White.
Pirate then makes pirate flag worth checking.
Once White flag and Pirate flag both work, the safer read is a shared ending word.
```

这还是像人在解题，但不假装我们真的点过 LinkedIn 的提交按钮。

## 对当前项目的具体改法

### 第一层: 加内容黑名单

这些词应该被判为质量问题：

- `a loose topic list`
- `standalone clue meanings`
- `broad topic match`
- `the answer becomes clear`
- `all clues point to the same`
- `shared category`
- `common theme`
- `they all fit`

这些不是绝对不能出现一次，而是不能作为 false start、turning point、clue explanation 的主体。

### 第二层: 加 false start 具体度检查

`wrongGuessCandidates[].label` 应该满足：

- 2 到 6 个词。
- 不能是抽象标签。
- 至少一个 candidate 的 `whyPlausible` 要引用真实 clue。
- `whyRejected` 要引用 turning clue 或某个打破它的 clue。

### 第三层: 加 clueRows 质量检查

每个 `clueRows` 要检查：

- 必须正好 5 行。
- clue 顺序必须和原题一致。
- `resolvedPhraseOrMember` 不能为空。
- `resolvedPhraseOrMember` 不能等于 clue 原词。
- `nonObviousWhy` 不能只写 `fits the same answer`。
- phrase-pattern 题里，resolved phrase 要像自然短语。

### 第四层: 加 reasoning 质量检查

现在 `scripts/check-pinpoint-reasoning-article.ts` 主要检查：

- 有没有 answer block。
- answer block 是否在最后。
- 段落是否太长。
- 有没有过早泄露答案。

它还不够。

应该新增检查：

- first-read block 不能只使用抽象 false start。
- turning-clue block 必须引用具体 clue。
- board-check block 至少列出 5 个具体 phrase/member。
- 非答案部分过度重复 `connector/category/pattern/board/frame` 现在已有 `abstract-term-repeat` warning，但它抓不住 #765 这种空标签。
- #765 这种结构合格但内容泛的页面，应该至少给 warning，最好挡在 full-analysis 发布前。

### 第五层: 发布策略保持静态优先

旧站最稳的一点是：

正式页上线时，HTML 已经完整。

所以我们当前项目也应该坚持：

- 当天正式页必须预渲染出完整 detail HTML。
- 发布检查必须检查真实 build 后的 HTML。
- 不要把核心正文放到访问时再补。

### 第六层: guardrail 先 warning, 再 blocking

我们的第一目标是保护北京时间 15:00 更新窗口。

所以内容质量闸门不能一上来就挡住正式站。

当前真实 cron 窗口是：

```text
北京时间 15:01, 15:03, 15:05, 15:07, 15:10, 15:15, 15:20, 15:25
```

所以更准确的最低目标是：

```text
15:25 前，首页 / detail / API 必须显示当天题。
```

建议分三步：

1. 先 warning。
   - `test:pinpoint-reasoning-article` 和候选分支摘要先报出泛化问题。
   - 不挡当天答案页发布。
   - 第一阶段只能是 `warn` / `info`。
   - 不能放进 `pinpoint:prepublish-gate` 的 `hard` / `review` / `downgrade` 分支。

2. 再考虑 full-analysis 分层。
   - 这一步目前不是现有代码直接支持的流程。
   - 当前 `release:production`、Worker、预发布门都按 `full-analysis` 公开要求检查。
   - 如果要允许轻量内容先公开，必须先改完整的 `answer-first` / `light-explainer` 公开规则。
   - 没改这套规则前，不要在报告或脚本里说“可以先更新当天页但不提升 full-analysis”。

3. 连续稳定几天后再 blocking。
   - 只有当 warning 连续几天都能稳定抓准，才把它变成硬阻断。

这样做的好处是：

- 当天内容不会因为一个新规则卡死。
- 质量问题会被看见。
- 后续如果候选分支机器检查通过，会自动 fast-forward 到 `main`。
- 正式站真正更新，还要等 `main` 部署和公开检查通过。

真实发布链还要注意这些卡点：

- 工作区必须干净，不能带无关改动。
- `validate:data` / `validate:data:auto-repair` 是第一道硬门。
- Vercel 构建失败或超时会卡。
- Cloudflare / Wrangler 部署失败会卡。
- Worker 自动发布被暂停会卡。
- 抓到旧题会跳过。
- GraphQL / fallback 没准备好会影响内容生成。
- 候选分支 CI 失败或超时会卡。
- release queue 遇到部署中、未知状态、短时间重复 push，也可能延迟。
- post-publish audit 如果遇到 Cloudflare 子请求限制，应走 deferred，不应误判成发布失败。

## 下一步建议

下一步不要再写内容模板文档了。

模板已经够多。

下一步应该直接改 guardrail。

建议先做一个小 PR：

1. 在 `lib/puzzles/semantic-lint.ts` 增加泛化短语检查。
2. 通过 `lib/puzzles/content-contract.ts` 进入数据校验链。
3. 在 `lib/puzzles/reasoning-article.ts` 补渲染后文章检查，保证页面正文不会出现 `My first read drifted toward "a loose topic list"`。
4. 在 `scripts/check-pinpoint-reasoning-article.ts` 把这类问题先显示成 warning。
5. 用 `pinpoint-answer-765` 做回归样本，证明现在能抓出 `a loose topic list` 这类空话。
6. 第一阶段不把这个问题接进发布阻断门。
7. 不改首页 SEO 标题和描述。

这样改的好处：

- 不影响今天准时发布主链路。
- 先把“结构过了但内容泛”的问题抓出来。
- 后面再决定是 blocking 还是 warning。

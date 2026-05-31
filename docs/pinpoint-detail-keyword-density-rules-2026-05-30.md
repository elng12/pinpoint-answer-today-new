# Pinpoint 详情页关键词密度规则 - 2026-05-30

这份规则只管 LinkedIn Pinpoint 详情页。

先把规则定好，再去改 `Answer Reasoning` 推理模块。

## 目标

详情页要同时照顾两类词：

1. 站点主词：`pinpoint`、`linkedin`、`answer`
2. 每道题自己的题号词、线索词、答案解释词

页面还是要像正常答案页。不能为了关键词，硬塞假句子。

## 首页和详情页分工

首页负责“今天答案”大词：

- `pinpoint today`
- `pinpoint answer today`
- `linkedin pinpoint answer today`
- `today's pinpoint answer`

详情页负责“具体这一题”的词。

这里的 `760` 只是例子。实际生成内容时必须换成当前题号：

- #760 用 `pinpoint 760`、`pinpoint 760 answer`、`linkedin pinpoint 760 answer`
- #761 就自动换成 `pinpoint 761`、`pinpoint 761 answer`、`linkedin pinpoint 761 answer`
- #762 就自动换成 `pinpoint 762`、`pinpoint 762 answer`、`linkedin pinpoint 762 answer`

线索词也要跟着当前题换。#760 的例子是：

- `paper cut feed flash hump`
- `paper cut feed flash hump answer`
- `words that come before back`

所以详情页不要强行把 `today` 大词压到第一。详情页里可以因为导航、品牌、页脚自然出现这些词，但不能让它们盖过题号词和线索词。

## 以哪个工具为准

最终以浏览器里的 Traffic.cv / AITDK 密度面板为准。

这个插件有一个关键口径：

- 题号数字会被过滤掉。比如 `pinpoint 760 answer` 在插件里会变成 `pinpoint answer`。
- 1 word 会过滤掉 `the`、`and`、`is` 这类虚词。
- 2-5 words 会保留 `and`、`is`、`the` 这类词，只过滤数字。

所以插件面板里不要再追 `pinpoint 760` 第 1。它看不到 `760`。

但页面可见文字里仍然必须有当前题号：

- #760 必须有 `pinpoint 760`、`pinpoint 760 answer`、`linkedin pinpoint 760 answer`
- #761 必须自动换成 `pinpoint 761`、`pinpoint 761 answer`、`linkedin pinpoint 761 answer`
- 不能把 `760` 写死到模板里

本地可以先用这个命令快速估算：

```bash
npm run detail:keyword-audit -- --url http://localhost:3004/linkedin-pinpoint-answers/pinpoint-answer-760/ --top 15
```

本地结果只是预估。如果本地结果和浏览器插件不一样，以浏览器插件为准。

`detail:keyword-audit` 现在按插件口径做快速检查：数字过滤，1 word 过滤虚词，2-5 words 保留虚词。它还会额外检查页面原文里有没有当前题号。

## 排名目标

### 1 Word

前三名固定目标：

1. `pinpoint`
2. `answer`
3. `linkedin`

严格要求：

- `pinpoint` 必须第 1。
- `answer` 必须第 2。
- `linkedin` 必须第 3。
- 不再死卡 `linkedin` 排在 `answer` 前面，因为 GSC 真实查询里 `answer` 需求更大。

不能让这些无关词跑到主词前面：

- `pro`
- `tips`
- `archive`
- `menu`
- 页脚里的普通词

### 2 Words

前三名固定目标：

1. `pinpoint answer`
2. `linkedin pinpoint`
3. 当前题第一个 2 线索组合

以 #760 为例：

1. `pinpoint answer`
2. `linkedin pinpoint`
3. `paper cut`
4. `cut feed`
5. `feed flash`
6. `flash hump`

严格要求：

- 插件口径下，`pinpoint answer` 必须第 1。
- `linkedin pinpoint` 必须第 2。
- 线索双词要紧跟在后面。
- `{number}` 必须在页面原文里跟当前题号同步更新，不能写死 `760`。
- `pinpoint today` 是首页词，详情页不要让它排第 1。
- 页面上不要直接写一堆生硬的 `Pinpoint LinkedIn`。需要这个 2 words 时，优先用 `Pinpoint (LinkedIn)` 或正常句子边界，让人读起来像“LinkedIn 上的 Pinpoint”。

要避免这些垃圾组合排太前：

- `today today`
- `tips past`
- `past puzzles`
- `feedback patches`

### 3 Words

固定目标：

1. 当前题第一个 3 线索组合
2. 当前题第二个 3 线索组合
3. 当前题第三个 3 线索组合
4. `linkedin pinpoint answer` 靠前即可，不抢第 1

以 #760 为例：

1. `paper cut feed`
2. `cut feed flash`
3. `feed flash hump`
4. `linkedin pinpoint answer` 靠前即可

`pinpoint answer today` 是首页词。详情页可以自然出现，但不能比题号词、线索词更强。

以 #760 为例，线索组合是：

- `paper cut feed`
- `cut feed flash`
- `feed flash hump`

第一个 3 线索组合要尽量靠前。最好出现在 clue 区域附近，或者 `Answer Reasoning` 第一段附近。

### 4 Words

固定目标：

1. 当前题第一个 4 线索组合
2. 当前题第二个 4 线索组合

以 #760 为例：

1. `paper cut feed flash`
2. `cut feed flash hump`

`linkedin pinpoint answer today` 是首页词。详情页不要把它当 4 words 第一目标。

以 #760 为例，线索组合是：

- `paper cut feed flash`
- `cut feed flash hump`

第一个 4 线索组合不能被页脚、导航词压到很后面。

### 5 Words

固定目标：

1. 当前题完整 5 线索组合
2. 当前题答案解释长词，只有当这题答案自然形成 5 words 时才强追

以 #760 为例：

- `paper cut feed flash hump`

#760 的 `words come before back` 在本地停用词口径里是 4 words，不是 5 words，所以它应在 4 words 里靠前，不强行放 5 words 第 2。

完整 5 线索组合必须第 1。最适合放在 clue 区域下面的小句子，或者 `Answer Reasoning` 第一段里。

## 页面哪里可以放关键词

优先用这些地方：

1. H1、标题、metadata：放主词和完整 clue 列表
2. 顶部简介：自然写一次 clue 列表
3. Clues 区域：帮 3-5 words 线索组合靠前
4. Answer 卡：题号 + `Pinpoint answer`、answer reveal、最终答案。旧题少用 `today`
5. Answer Reasoning：自然写线索顺序，照顾 3-5 words
6. FAQ：补主词，但不要重复太多
7. Recent links：可以有，但不要让它压过正文关键词

不能用隐藏文字堆关键词。

## 推理模块写法

以后写 `Answer Reasoning`，只学习竞品的正文节奏，不学习它的模块数量。

可以学习：

1. 第一眼怎么想
2. 为什么会猜错
3. 哪个新 clue 推翻旧想法
4. 怎么重新找共同点
5. 最后为什么答案成立

不要恢复这些已经删掉的独立模块：

- `Category`
- `Words & How They Fit`
- `Lessons Learned`
- 大块错猜卡片
- 任何表格版 clue-by-clue 解释

页面结构保持简单：

1. `Answer Reasoning` 正文
2. `What This Pinpoint Teaches`
3. `Related / Recent`

`What This Pinpoint Teaches` 是一个合并总结区，不是两个模块。页面上只显示这个大标题。

里面可以连续放两类内容，但不要再显示两个分组标题：

- Lessons 内容：这题教会玩家什么
- Quick Questions 内容：原 FAQ 问答

不要把它拆成 `Lessons Learned` + `FAQ` 两个独立模块。
也不要在视觉上做成 `Lessons` + `Quick Questions` 两个小组件。
也不要出现前三条带 `Lesson 1/2/3`、后三条没有标签这种断层。
这个区块里的每一条都用同一种结构：标题 + 解释。FAQ 也按同一种条目样式放进去，不再另起一套卡片样式。
数量也要稳定：最多放 3 条 Lessons 内容 + 3 条 Quick Questions，避免某篇文章突然变成长列表。

正文按这个顺序：

1. 开头先自然提线索顺序
2. 能自然读的时候，按原顺序提 3-5 个线索
3. 写第一眼的误判，不要装得一开始就知道答案
4. 再讲哪个 clue 是转折点
5. 答案放后面确认，不要第一句就剧透

排版也要学竞品的阅读节奏，不要把正文堆成一整片长段落：

1. `Answer Reasoning` 仍然只保留一个大模块
2. 模块里面可以拆成短步骤，比如 clue path、first read、turning clue、board check、answer
3. 每个步骤用短标题 + 1 段短解释，避免 300-400 字符的大段白纸
4. 不要为了分块又恢复 `Category`、`Words & How They Fit`、`Lessons Learned` 这些旧模块

好的写法：

```text
In LinkedIn Pinpoint, Paper Cut Feed Flash Hump is the clue path to test before the reveal. At first, Paper and Cut can support a loose read, but Hump changes the shape of the solve. Once Hump lands, Paper back, Cut back, Feed back, Flash back, and Hump back all use the same connector.
```

不好的写法：

```text
The answer is X. X is the answer for LinkedIn Pinpoint answer today. This LinkedIn Pinpoint answer uses answer reasoning.
```

第二种就是硬塞关键词，看起来像垃圾 SEO。

竞品 #759 的正确参考点是“推理节奏”，不是 `Lessons Learned` 模块。#759 实际没有 `Lessons Learned`，它强的是：

第一反应 → 错猜 → 第二个 clue 推翻 → 重新找共同点 → 答案确认。

## 当前 #760 已通过基线

浏览器 Traffic.cv / AITDK 检查页面：

`http://localhost:3004/linkedin-pinpoint-answers/pinpoint-answer-760/`

旧截图确认后的结果：

- 总词数：Traffic.cv 显示 `488`
- 1 word 前排：`pinpoint` 第 1，`answer` 第 2，`linkedin` 第 3
- 2 words 前排：`pinpoint answer` 第 1，`linkedin pinpoint` 第 2
- 3 words 前排：`paper cut feed`、`cut feed flash`、`feed flash hump` 都在前面
- 4 words 前排：`paper cut feed flash` 第 1，`cut feed flash hump` 第 2
- 5 words 前排：`paper cut feed flash hump` 第 1

这份旧截图只能说明 3-5 words 线索组合已经很好，但主词顺序和首页/详情页分工还不够严格。

以后详情页要追这个更严格的效果：

1. 1 word：`pinpoint` 第 1，`answer` 第 2，`linkedin` 第 3
2. 2 words：插件口径下 `pinpoint answer` 第 1，`linkedin pinpoint` 第 2，然后线索 2 词
3. 3 words：线索 3 词排前面，`linkedin pinpoint answer` 靠前即可
4. 4 words：线索 4 词排前面
5. 5 words：完整 5 线索组合第 1
6. 页面原文里仍然必须有当前题号，比如 `pinpoint 760 answer`
7. 不要让导航、页脚、recent links 的组合词抢太多排名

注意：插件会过滤题号，所以插件面板里看不到 `pinpoint 760` 这种词。但页面原文必须自动替换当前题号。以后 #761、#762、#763 都不能继续写 `760`。截图排序如果没达到这个顺序，就继续调。

## 不要盲改

最后判断必须同时看四件事：

1. 浏览器页面看起来正常
2. Traffic.cv / AITDK 排名接近目标
3. 正文读起来像有用的答案页
4. 旧模块不要回来，比如 `Words & How They Fit`、`Compact FAQ`、`Lessons Learned`

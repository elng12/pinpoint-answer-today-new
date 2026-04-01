# Pinpoint 高搜索性题 SOP（2026-04-01）

## 目标

- 复制 `pinpoint-answer-700` 这种“用户直接拿 clue 去搜，然后点进来”的流量。
- 不追求每一题都像 `700`，而是尽快识别“值得重点发”的题，并用同一套流程放大。

---

## 一句话结论

要复制 `700` 的点击，当前最重要的不是先预测哪道题会爆，而是先观察接下来几天的新发布页里，哪些页也真的拿到了点击。

这条路径的核心是：

1. 先连续观察接下来几天的新发布页
2. 找出真正获得点击的页和它们的 query
3. 归纳这些页为什么能获得点击
4. 只把已经验证过的原因复制到以后内容里

> 重要：这份 SOP 只提供判断依据，不直接触发任何后续程序。
> 当前阶段以观察为先，不让预测规则先于数据决定后续动作。

---

## 当前阶段原则

现在这份 SOP 分成两个阶段：

- 阶段 1：观察优先
  - 先看接下来几天的新内容，哪些页真的有点击
  - 不急着把“高搜索性评分”变成每日主流程
- 阶段 2：规则固化
  - 等观察样本足够后，再把共同原因沉淀成可复制规则

当前默认执行的是阶段 1。

---

## 这份 SOP 基于什么数据

`2026-03-05` 到 `2026-04-01` 这 28 天内，最近 60 道题只有 5 页拿到真实搜索点击：

- `#700`: 33 clicks / 96 impressions
- `#698`: 11 clicks / 66 impressions
- `#697`: 5 clicks / 237 impressions
- `#699`: 2 clicks / 58 impressions
- `#688`: 2 clicks / 24 impressions

但这 5 页里，真正值得复制的是 `700` 和 `698`：

- `700` 的点击来自 clue query：
  - `panel one on one pinpoint`
  - `panel one on one behavioral pinpoint`
- `698` 的点击也来自 clue query：
  - `fence moat hedge pinpoint`
  - `fence moat hedge wall clue 5`

反例也很清楚：

- `695` 有 `185` impressions，但 `0` clicks，且大多数展示词不是它自己的 clue，而是 `698` 的 `fence moat hedge...`
- `696`、`697` 也出现过类似“被 Google 拿去试别题 query”的情况

结论：

- 真正能复制的方法，不是“让更多页有 impressions”
- 而是“让对的页吃到对的 query”

---

## 阶段 1：观察优先 SOP

### 观察周期

先连续观察接下来 `3-7` 天的新发布页。

观察对象：

- 每天新发布的 detail 页
- 如果当天有 1 篇以上，就都记

### 每天要看什么

每篇新页只看下面几项：

1. 发布后 `24` 小时：
   - clicks
   - impressions
   - ctr
   - top queries
2. 发布后 `72` 小时：
   - clicks 是否继续增长
   - top queries 是否还是这页自己的 clue
3. 同期对照：
   - 同一天或前后几天的其他新页有没有类似表现

### 观察目标

不是立刻做优化，而是先回答这 3 个问题：

1. 接下来几天的新页里，是否还有别的页也能拿到点击？
2. 拿到点击的页，它们的 query 有没有共同模式？
3. 没拿到点击的页，是完全没展示，还是有展示但 query 不对？

### 当前阶段不要做什么

- 不要因为单个样本就把规则写死
- 不要先按预测分数大规模切模板
- 不要让“看起来像会被搜”代替真实 GSC 数据

### 先确认 URL 对不对

在判断“这页有没有真实点击”之前，先确认 Search Console 里的 URL 是不是这页真正该看的正式详情页。

原因：

- 有些展示不是来自正式 canonical 页，而是来自旧 locale 路径、旧 alias、无尾斜杠版本、或者已经不存在的脏 URL
- 这种记录会出现在高 impression 列表里，但不应该直接当作内容补强候选

推荐命令：

```bash
npm run gsc:pinpoint -- page --credentials /path/key.json --puzzle-number 700
npm run gsc:pinpoint -- find --credentials /path/key.json --puzzle-number 700
```

判断口径：

- `page`
  - 看正式 canonical URL 的点击、展示和 query
- `find`
  - 看同一个 slug 或题号在 GSC 里有没有旧路径、locale 路径、无尾斜杠路径或其他变体

如果 `page` 数据很少，但 `find` 找到一堆旧 URL：

- 先把它当成 URL 异常排查
- 不要立刻推进内容优化
- 优先确认这是历史脏索引、错误外链，还是站内仍有旧入口没有收干净

### 观察记录模板

每天发完后，给当天页面补一段记录：

```md
## Pinpoint #NNN Observation

- Publish date:
- 24h clicks / impressions / ctr / position:
- 72h clicks / impressions / ctr / position:
- Top queries:
- Query type:
  - clue-driven / puzzle-number-driven / mixed / wrong-page testing
- Did the page get real clicks?
- Suspected reason:
- Reusable reason candidate:
```

### Query type 口径

- `clue-driven`
  - 用户直接搜 clue 组合
  - 这是最值得复制的类型
- `puzzle-number-driven`
  - 用户主要搜题号
  - 可参考，但复制价值没那么高
- `mixed`
  - clue 和题号都有
- `wrong-page testing`
  - 这页有展示，但展示词主要是别的题的 clue
  - 不应当拿来当成功样本

### 异常页处理口径

如果一条记录满足下面任一情况，就先归到“异常页”，不进入高搜索性样本池：

- 本地没有对应 detail JSON
- 正式 canonical URL 返回 `404`
- `find` 结果显示主要展示来自旧 locale 路径或旧 alias
- 展示 URL 和当前站点正式承接 URL 不一致

处理顺序：

1. 先查 canonical URL 是否真实存在
2. 再查旧路径是否在被 Google 反复测试
3. 只有正式页存在且 query 正常时，才进入内容分析或回填队列

### 接下来几天最想看到的结果

如果未来几天再出现 2 到 3 个像 `700`、`698` 这种 clue-driven 点击页，就可以开始稳定归纳。

如果没有，说明 `700` 更可能是个案，此时不该过早制度化。

---

## 阶段 2：规则固化（样本够了以后再启用）

当满足下面任一条件时，才进入规则固化阶段：

- 最近 `7` 天内出现至少 `3` 个 clue-driven 点击页
- 或最近 `10` 个新页里，至少 `30%` 的页拿到了真实点击

只有到这个阶段，下面的“高搜索性评分规则”才值得作为日常辅助参考。

## 高搜索性评分规则（仅在阶段 2 使用）

每天拿到新题后，先按下面规则打分，满分 `10` 分。

### 1. 前 2-3 个 clue 连起来像不像真人会直接搜（0-3 分）

- `3`: 很像自然搜索短语
  - 例：`Panel, One-on-one, Behavioral`
  - 例：`Fence, Moat, Hedge`
- `2`: 勉强像，会搜，但不是很稳
- `1`: 只有部分 clue 像搜索词
- `0`: 连起来很不像搜索语句

### 2. clue 组合后是否足够独特（0-2 分）

- `2`: 前 3 个 clue 放一起后，基本只指向这一题
- `1`: 有一定辨识度，但可能撞到别的主题
- `0`: 太泛，容易和很多别题撞车

### 3. clue 是否主要由常见英文词组成（0-2 分）

- `2`: 多数是常见词，用户容易原样输入
- `1`: 一半常见，一半偏冷门
- `0`: 需要大量背景知识、专有名词、缩写或特殊写法

### 4. 是否至少有 1 个“明确短语 clue”（0-1 分）

- `1`: 有，比如 `Phone screen`、`Boundary line`、`Cookie dough`
- `0`: 没有，几乎全是单词

### 5. 是否几乎不依赖括号、emoji、特殊符号（0-1 分）

- `1`: 基本没有
- `0`: 需要靠括号说明或符号才能看懂

### 6. 前 3 个 clue 是否能在搜索结果里形成强记忆点（0-1 分）

- `1`: 是
- `0`: 否

### 分数解释

- `8-10`: 高搜索性题
  - 进入人工优先复核池
- `6-7`: 可观察题
  - 人工决定是否需要额外观察
- `0-5`: 普通题
  - 默认按常规模板处理

### 人工决策门

打分完成后，必须先回答这 2 个问题，再决定要不要继续：

1. 这组 clue 的搜索意图是不是足够明确？
2. 这题值不值得今天优先投入？

只有两个答案都偏“是”，才进入下面的高搜索性处理。

如果答案不明确，就停在评分结果本身，不继续执行后续动作。

### 已有样本

- `#700`: `9/10`
  - 自然 query 强，且 `One-on-one` / `Phone screen` 都像真实搜索词
- `#698`: `8/10`
  - clue 都是常见词，前三个连起来辨识度很高
- `#699`: `7/10`
  - 常见词强，但竞争更高
- `#695`: `3/10`
  - clue 太泛，单词都太短，难形成唯一 query

---

## 规则固化后的发布路径

### A. 发布前

- 先看最近观察样本里，这题是否像已有成功页
- 如有需要，再补评分，确认是否 `>= 8`
- 分数只是提示，不自动决定模板和发布时间
- 需要人工确认后，才把它当作高搜索性题处理
- 没有人确认时，保持原有正常发布流程，不切换到特殊路径

### B. 标题规则

高搜索性题的标题优先保留前 2-3 个 clue。

前提：

- 只有人工确认这题要走高搜索性处理，才改标题策略

推荐格式：

- `LinkedIn Pinpoint NNN Answer: clue1, clue2, clue3`
- 如果长度吃紧，保留最有搜索感的前 3 个 clue

不要做的事：

- 不要把标题只写成 `Pinpoint #NNN Answer`
- 不要把 clue 全删光，只保留答案
- 不要为了“文案更顺”把最有搜索性的 clue 改写掉

### C. 描述规则

描述继续保留：

- 题号
- 前 2-3 个 clue
- 答案
- `spoiler-safe hints` / `walkthrough`

推荐格式：

- `LinkedIn Pinpoint NNN clues: clue1, clue2, and clue3. Spoiler-safe hints and a full walkthrough included. Answer: ...`

### D. FAQ 规则

高搜索性题的 FAQ 不能只回答泛问题，必须照顾真实搜索变体。

前提：

- 只有人工确认后，才补这些 query 导向 FAQ

至少保留：

- `What is the answer to LinkedIn Pinpoint #NNN?`
- `What is the connection in LinkedIn Pinpoint #NNN?`
- 一个高搜索变体问题

高搜索变体问题优先覆盖：

- 连字符 / 不连字符
  - 例：`one-on-one` / `one on one`
- clue 组合搜索
  - 例：`panel one on one behavioral`
- 用户会补的尾词
  - 例：`clue 5`
  - 例：`answer`
  - 例：`linkedin pinpoint`

### E. 首段规则

- 首段继续保持不剧透
- 但要自然复述最有搜索性的 clue 组合
- 目标不是“更文艺”，而是让页面正文和 query 之间的词汇对齐

---

## 观察后的复盘方法

### 先归因，再复制

只有当一页满足下面条件时，才把它当成“可复制样本”：

- 有真实 clicks
- top queries 主要是它自己的 clue
- 排名和点击不是纯偶然单词撞上

### 复制的不是页面本身，而是原因

每个成功页都先写出：

- 用户搜的是什么
- 为什么会搜这个组合
- 页面哪一层接住了这个 query
  - title
  - description
  - faq
  - opening paragraph

然后只复制这些已经验证过的原因，不复制无关表面形式。

---

## 发布后 24-72 小时动作

### 24 小时内建议看一次

前提：

- 只对人工标记为 `high-search` 或 `watch` 的题执行
- 不因为 SOP 存在就默认跑所有题

查单页：

```bash
npm run gsc:pinpoint -- page --credentials /path/key.json --puzzle-number 700
```

看最近题：

```bash
npm run gsc:pinpoint -- recent --credentials /path/key.json --count 30 --detail-limit 15
```

### 怎么判断要不要继续改

#### 情况 1：已经有点击，且 query 就是自己的 clue

- 结论：命中了
- 动作建议：只做小修，不做重写
- 优先补 FAQ 变体，别大改 H1 或段落结构

#### 情况 2：有 impressions，但 CTR 低，排名在 2-5 位

- 结论：有机会页
- 动作建议：
  - 优先改标题前 3 个 clue 的呈现
  - FAQ 补真实 query 变体
  - 保持 canonical / URL 不变

#### 情况 3：有 impressions，但 query 大部分不是自己的 clue

- 结论：Google 在试探，不是命中
- 动作建议：
  - 不要对这页投入太多
  - 先确认是不是别的高搜索性页更应该承接这组 query

#### 情况 4：72 小时后仍几乎无 impressions

- 结论：不是高搜索机会页
- 动作建议：停止额外优化，回到普通维护

---

## 每日最短执行 SOP

每天只做下面 6 步：

1. 正常发布当天新页
2. 24 小时后跑一次 `gsc:pinpoint page`
3. 72 小时后再看一次
4. 标记这页属于 `clue-driven / puzzle-number-driven / mixed / wrong-page testing`
5. 只把 `clue-driven` 页记成成功样本
6. 累积几天后，再归纳共同原因

---

## 推荐记录格式

每天发布后，把下面这段加到 QA 或发布日志里：

```md
## Pinpoint #NNN Search Intent Check

- 24h result:
- 72h result:
- Expected query pattern:
- Actual query pattern:
- Query type:
- 24h GSC result:
- Reusable reason:
- Action:
```

---

## 不要做的事

- 不要把每一题都按 `700` 的标准重做
- 不要因为某页 impressions 高，就误以为它值得投入
- 不要在已经拿到点击后大改整篇结构
- 不要只看题号词；真正有价值的是 clue query
- 不要把“Google 正在试探错误 query”误判成这页本身有潜力
- 不要让评分结果自动触发任何后续程序
- 不要把 `high-search` 当成“必须执行”的机器指令
- 不要在观察样本还不够时，提前把猜测写成固定规则

---

## 当前工具

这套 SOP 现在已经有配套脚本：

- 脚本：`scripts/gsc-pinpoint.mjs`
- npm 命令：`npm run gsc:pinpoint`

常用命令：

```bash
# 查单页
npm run gsc:pinpoint -- page --credentials /path/key.json --puzzle-number 700

# 看最近 30 页
npm run gsc:pinpoint -- recent --credentials /path/key.json --count 30 --detail-limit 15
```

---

## 未来扩展

如果后续这套方法继续有效，再补下面两件事：

1. 把“高搜索性打分”做成半自动脚本
2. 把高搜索性题和普通题分成两套 FAQ / metadata 模板

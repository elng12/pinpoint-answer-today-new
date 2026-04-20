# 首页与归档页 SEO 定位收紧 PRD（执行稿 v2）

> **文档状态**：待复审 / 可执行候选  
> **最后更新**：2026-04-20  
> **目标页面**：`/`、`/puzzles`  
> **本轮范围**：title、description、H1、首屏定位（hero/header）  
> **不在本轮范围**：路由、canonical、404、旧 URL 清理、正文内容大改、列表逻辑改造

---

## 1. 一句话结论

这轮不是“已证明根因后的定点修复”，而是一次**验证型页面身份收紧实验**。

执行原则只有两条：

- 首页 `/` 只服务 `today answer / current puzzle`
- 归档页 `/puzzles` 只服务 `archive / past answers / puzzle lookup`

目标不是靠改文案直接把流量拉起来，而是先把页面对 Google 和用户发出的信号讲清楚，再观察查询结构是否收口。

---

## 2. 当前问题与证据边界

最近 28 天（`2026-03-22` 到 `2026-04-18`）GSC 关键信号：

- 全站约 `81` 点击、`2642` 曝光
- 正式详情页拿走 `79` 点击，占全站约 `97.5%`
- 首页 `/`：`680` 曝光、`2` 点击、CTR `0.3%`、平均排名 `28.80`
- `/puzzles`：`108` 曝光、`0` 点击、CTR `0%`、平均排名 `10.22`

`/puzzles` 当前触发的查询示例更多是：

- `pinpoint 698 answer`
- `goliath bull pinpoint answer`
- `pinpoint answer`
- `pinpoint answer today`

而不是：

- `pinpoint archive`
- `past pinpoint answers`
- `pinpoint puzzle lookup`

### 2.1 已证实的事实

1. 站点级入口页表现弱，详情页在扛全站搜索点击。
2. 首页当前核心问题首先是**排名太低**，不是单纯 CTR 文案问题。
3. `/puzzles` 当前承接到的查询意图更像 `answer`，不像 `archive / lookup`。
4. 首页和 `/puzzles` 的 title、description、H1、首屏文案都存在页面身份混写。

### 2.2 这份 PRD 不声称已经证明的事

1. **不声称**“页面身份散”已经被证明是首页低 CTR 的唯一主因。
2. **不声称**只改 title / description 就会直接改善首页 CTR。
3. **不声称**`/puzzles` 的 `0` 点击已经被证明是 title 太差或 Featured Snippet 抢走点击导致。

### 2.3 本轮工作假设

如果首页和 `/puzzles` 的页面身份被收紧，至少应该先看到下面这些改善之一：

- 首页的 today 类查询和落地页信号更一致
- `/puzzles` 的查询结构更少偏向泛 `answer`，更接近 `archive / lookup`
- 搜索结果文案和落地页首屏终于在讲同一件事

---

## 3. 当前问题是怎么产生的

### 3.1 首页的问题

当前实现里，首页同时在讲：

- `today`
- `hints`
- `yesterday`
- `archive`

现状可见于：

- [metadata.ts](/Users/elng/web/pinpoint-answer-today-new/lib/seo/metadata.ts#L6)
- [HomeHero.tsx](/Users/elng/web/pinpoint-answer-today-new/components/home/HomeHero.tsx#L21)
- [page.tsx](/Users/elng/web/pinpoint-answer-today-new/app/(site)/(home)/page.tsx#L27)

这会让首页更像“站点总览页”，而不是“今天答案就在这里”的单点入口。

### 3.2 `/puzzles` 的问题

当前 `/puzzles` 同时在讲：

- `archive`
- `guides`
- `answer pages`
- `full explanation`

现状可见于：

- [metadata.ts](/Users/elng/web/pinpoint-answer-today-new/lib/seo/metadata.ts#L9)
- [ArchiveHeader.tsx](/Users/elng/web/pinpoint-answer-today-new/components/archive/ArchiveHeader.tsx#L7)

这会让 Google 更容易把它当“泛答案集合页”去试词，而不是一个明确的旧题查找入口。

补充说明：

- 当前页面可见标题文案是 `All Pinpoint Answers`
- 但当前 live HTML 里没有真正的 `<h1>`；该标题目前实际由 `SectionHeading` 默认渲染成 `h2`

---

## 4. 本轮目标

### 4.1 首页目标

首页只做 3 件事：

1. 告诉用户“今天答案在这里”
2. 告诉用户“这是当前题号”
3. 让用户最快进入今天详情页

### 4.2 `/puzzles` 目标

`/puzzles` 只做 3 件事：

1. 告诉用户“这里是归档”
2. 告诉用户“可以按题号或线索查旧题”
3. 让用户最快进入历史详情页

### 4.3 本轮成功定义

本轮优先判断的是**页面身份是否变清楚**，不是立即追求点击暴涨。

---

## 5. 非目标

本轮不做下面这些事：

- 不改 URL
- 不改 canonical
- 不改 sitemap
- 不改 Preview 页定位
- 不重排首页下半部分模块
- 不改 archive 页列表渲染逻辑
- 不扩 schema 类型
- 不改内链体系
- 不重写详情页模板

---

## 6. 核心原则

### 6.1 一页一个主任务

- 首页不能同时主打 `today + archive + yesterday + guides`
- `/puzzles` 不能同时主打 `archive + guides + full explanation`

### 6.2 首屏先服务搜索意图

用户从 Google 落地后，首屏必须立刻让人明白：

- 首页：你来找今天答案，这里就是
- `/puzzles`：你来找旧题归档，这里就是

### 6.3 先做信号收紧，再看数据验证

本轮是**定位收紧实验**，不是“已完成根因锁定之后的最终修复”。

### 6.4 页面边界服从既有站内策略

页面边界继续服从既有增长 PRD 中的分工表：

- 首页主打 `today answer`
- `/puzzles` 主打 `archive / past answers / puzzle number`
- 详情页主打 `#NNN answer / clue + answer`

参考：[pinpoint-seo-growth-prd-2026-03-31.md](/Users/elng/web/pinpoint-answer-today-new/docs/pinpoint-seo-growth-prd-2026-03-31.md#L241)

### 6.5 竞品参考只作为佐证，不改变本轮范围

补充参考：

- [pinpointanswer.today](https://pinpointanswer.today/) 当前首页是典型的 `today answer` 主入口写法
- [pinpointanswers.com/blog](https://pinpointanswers.com/blog) 把历史内容放在明显的博客/归档列表里

这说明同类站点通常会把“今日答案入口”和“历史内容列表”分开表达，而不是在同一入口页里混讲。

---

## 7. 具体改动方案

## 7.1 首页 `/`

### A. title

**当前：**

`LinkedIn Pinpoint Answer Today | Clues, Walkthrough & Archive`

**Phase 1 冻结版本：**

`LinkedIn Pinpoint Answer Today | Current Puzzle, Hints & Answer`

### B. description

**当前：**

`Today's LinkedIn Pinpoint answer is Puzzle #${current.number} — updated daily with spoiler-safe hints, clue explanations, and solutions that protect your streak.`

**当前问题：**

虽然已经是 today-answer 口径，但 `updated daily`、`clue explanations`、`protect your streak` 更像泛功能描述，没有把“current puzzle / verified answer”放到最前面。

**Phase 1 冻结版本：**

`Get today's LinkedIn Pinpoint answer for the current puzzle with spoiler-safe hints, clue help, and a fast path to the final solution.`

### C. H1

**当前：**

`Today's LinkedIn Pinpoint #${puzzle.number} Answer`

**Phase 1 决策：**

**不改。**

理由：

- 这个 H1 已经是 today-answer 方向
- 首页当前主要问题不在 H1，而在 metadata 和首屏辅助文案混写
- 本轮先避免把首页改动面继续扩大

### D. 首屏 kicker

**当前：**

`Today's Pinpoint hints, yesterday's answer, and the archive`

**Phase 1 冻结版本：**

`Today's puzzle answer with spoiler-safe hints`

### E. 首屏 subtitle

**当前：**

`Need today's LinkedIn Pinpoint answer? Find spoiler-safe hints, yesterday's solution, and the full archive for Puzzle #${puzzle.number} in one place.`

**当前问题：**

继续把 today、yesterday、archive 放在一起。

**Phase 1 冻结版本：**

`Need today's LinkedIn Pinpoint answer? Start with spoiler-safe hints for Puzzle #${puzzle.number}, then open the verified solution when you're ready.`

### F. 首屏 CTA

**当前：**

- `Open today's answer`
- `Play on LinkedIn`
- `Open full archive`

**Phase 1 决策：**

- 保留 3 个按钮
- 不改按钮结构
- 只把第三按钮文案收紧为：`Browse past puzzles`

### G. 首页动态 description / 结构化数据口径

**当前：**

- 动态 description：  
  `Today's LinkedIn Pinpoint answer is Puzzle #${current.number} — updated daily with spoiler-safe hints, clue explanations, and solutions that protect your streak.`
- `Organization.description` / `WebSite.description`：  
  `Get today's LinkedIn Pinpoint answer with spoiler-safe hints, clear clue-by-clue walkthroughs, yesterday's answer, and the full archive, all in one place.`

**Phase 1 冻结版本：**

- 动态 description：  
  `Today's LinkedIn Pinpoint answer is Puzzle #${current.number}. Get spoiler-safe hints, clue help, and the verified solution for the current puzzle.`
- `Organization.description` / `WebSite.description`：  
  `Get today's LinkedIn Pinpoint answer for the current puzzle with spoiler-safe hints, clue help, and a fast path to the final solution.`

**执行要求：**

- `app/(site)/(home)/page.tsx` 里的动态 description 必须按上面的精确文案改
- 首页结构化数据里 `Organization` 和 `WebSite` 的 `description` 必须按上面的精确文案改
- 这两处文案不允许再出现 `archive`、`yesterday`

---

## 7.2 `/puzzles`

### A. title

**当前：**

`LinkedIn Pinpoint Archive & Guides | Pinpoint Answer Today`

**Phase 1 冻结版本：**

`LinkedIn Pinpoint Archive | Past Answers by Puzzle Number`

### B. description

**当前：**

`Browse LinkedIn Pinpoint walkthroughs, clue guides, archive pages, and past answers. Open the latest recap fast or revisit older puzzles in one place.`

**当前问题：**

像内容集合，不像查找入口。

**Phase 1 冻结版本：**

`Browse past LinkedIn Pinpoint answers in one archive. Search by puzzle number or clue, then open the matching answer page fast.`

### C. 可见标题 / H1

**当前：**

- 可见标题文案：`All Pinpoint Answers`
- live HTML 中当前未发现真实 `<h1>`

**Phase 1 决策：**

**必须改。**

**Phase 1 冻结版本：**

`LinkedIn Pinpoint Archive`

补充说明：

- 这一步不是“重命名现有 H1”
- 这一步实际上是“把当前可见标题改为 `LinkedIn Pinpoint Archive`，并确保它作为真实 `<h1>` 输出”

### D. 首屏说明文案

**当前：**

`Use the archive as the clean history hub: grouped by month, searchable by clue or puzzle number, and linked into full explanation pages.`

**Phase 1 冻结版本：**

`Search past LinkedIn Pinpoint answers by puzzle number or clue, then jump into the matching answer page.`

### E. 首屏 chips

**当前：**

- `${totalCount} indexed puzzles`
- `English-only archive`
- `Direct links to full analysis`

**Phase 1 冻结版本：**

- `${totalCount} archived puzzles`
- `Search by clue or number`
- `Open the matching answer page`

---

## 8. 本轮唯一执行范围

Phase 1 只改下面 4 个文件，而且**作为一个完整包一起提交**：

原因：

- 避免 metadata 和首屏文案在抓取窗口里短暂分裂
- 避免上线后无法判断是 title、description 还是首屏信号造成波动
- 让回滚可以直接对应到一个完整 commit

- `lib/seo/metadata.ts`
  - 首页 title / description 常量
  - `/puzzles` title / description 常量

- `app/(site)/(home)/page.tsx`
  - 首页动态 description
  - 首页结构化数据 description 文案

- `components/home/HomeHero.tsx`
  - kicker
  - subtitle
  - archive CTA 文案

- `components/archive/ArchiveHeader.tsx`
  - H1
  - 首屏说明
  - chips 文案

### 8.1 Phase 1 明确不做

- 不拆成“先 metadata、后 H1”两段执行
- 不把 `ArchiveHeader` 延后到第二个 commit
- 不调整首页主次按钮顺序
- 不改首页 H1
- 不改页面布局和组件结构

---

## 9. 上线前基线冻结（must-do）

这部分是执行门槛，不是附加项。

上线前必须记录：

1. 生产环境 `/` 当前 `title`、`description`、H1、首屏截图
2. 生产环境 `/puzzles` 当前 `title`、`description`、H1、首屏截图
3. 改前 28 天 GSC 页面级数据导出
4. 上线 commit SHA
5. 上线时间戳（北京时间）
6. 变更说明链接

### 9.1 `/puzzles` 额外预检

为了避免把 `0` 点击原因写死，执行前补 3 项轻量核查：

1. 把 `/puzzles` 前 `10-20` 个查询按 `archive / answer / clue / other` 分组
2. 把 `/puzzles` 曝光按 `1-3 / 4-10 / 11-20` 排名分桶
3. 人工看前 `5` 个高曝光查询的 SERP，确认：
   - 是否有 Featured Snippet
   - 是否有 PAA 等强占位模块
   - Google 是否改写标题

### 9.2 负责人、工具与输出物

- 负责人：`SEO / 增长 DRI`
- 工具：
  - GSC 页面级拉数：`npm run gsc:pinpoint`
  - SERP spot check：无痕窗口人工检查
- 基线输出文件：  
  `docs/home-archive-seo-tightening-baseline-YYYY-MM-DD.md`
- 预检输出文件：  
  `docs/home-archive-seo-tightening-precheck-YYYY-MM-DD.md`

### 9.3 阻塞规则

- 如果基线文件未生成，**不得上线**
- 如果 `/puzzles` 预检文件未生成，**不得上线**
- 输出文件中必须包含：执行人、执行时间、原始命令、关键截图链接或说明、结论摘要

### 9.4 上线前 SERP / 锚文本 QA（非阻塞，但必须记录）

这部分不作为上线门禁，但必须记录在预检文件中：

1. 用 SERP 预览工具检查首页和 `/puzzles` 的新 title 像素宽度
2. 确认首页核心词 `Today / Answer`、归档页核心词 `Archive / Past Answers` 不会在预览里被明显截断
3. 记录 Header / Footer 中指向首页与 `/puzzles` 的主锚文本；如果发现明显与 `Today vs Archive` 定位冲突的标签，记录为后续优化项

---

## 10. 风险与缓解

### 风险 1：首页 CTR 没明显变化

**判断：**

这是高概率事件，因为首页当前平均排名 `28.8`，CTR 低首先是排名问题。

**缓解：**

- 不把 CTR 作为首页首要成功指标
- 先看 today 类查询的曝光和平均排名是否更集中

### 风险 2：`/puzzles` 短期损失一部分 answer-like 曝光

**判断：**

可能发生，但从页面职责上是可接受的。

**缓解：**

让详情页继续承接 explanation / answer 型查询。

### 风险 3：Google 改写标题或 SERP 形态截走点击

**判断：**

这会干扰对文案效果的判断。

**缓解：**

把 SERP spot check 纳入 14 天复查，不只盯 GSC 表格。

### 风险 4：上线后出现明显负向信号但没有退出条件

**判断：**

如果不预设暂停 / rollback 条件，后续很容易在噪音数据里争论不休。

**缓解：**

见下方 `10.1 暂停与 rollback 规则`。

### 10.1 暂停与 rollback 规则

本节只定义**上线后 SEO 表现观察**触发的复核与 rollback，不处理发布门禁失败。  
发布门禁失败见 `11.2 上线放量门禁`。

#### D+14 复核触发条件

以下情况不立即回滚，但必须在 D+14 进入复核：

1. 首页 today 类主查询的平均排名较基线恶化 `>= 5` 位
2. 首页 today 类主查询曝光较基线下降 `>= 30%`
3. `/puzzles` 页面总曝光较基线下降 `>= 30%`
4. `/puzzles` 既没有出现更稳定的 `archive / lookup` 类查询，同时原有 answer 类曝光也明显下滑

#### D+14 后 rollback 条件

如果 D+14 和 D+28 两次复核都满足下列条件之一，且排除了 GSC 延迟、抓取异常、节假日波动等外部因素，则执行 rollback：

- 首页 today 类查询持续恶化，且页面信号收紧后没有带来任何查询结构改善
- `/puzzles` 总曝光持续明显下滑，且查询结构没有向 `archive / lookup` 收口

#### rollback 操作

1. 回滚本轮 4 文件完整提交
2. 重新部署生产环境
3. 在观察记录文件里补记 rollback 时间、触发条件、复核结论

---

## 11. 验收标准

上线后至少确认下面 18 件事：

1. 首页 title **精确等于**  
   `LinkedIn Pinpoint Answer Today | Current Puzzle, Hints & Answer`
2. [metadata.ts](/Users/elng/web/pinpoint-answer-today-new/lib/seo/metadata.ts#L7) 里的 `HOME_SEO_DESCRIPTION` 常量 **精确等于**  
   `Get today's LinkedIn Pinpoint answer for the current puzzle with spoiler-safe hints, clue help, and a fast path to the final solution.`
3. 首页 H1 仍为当前 today-answer 结构
4. 首页 kicker 不包含 `archive`、`yesterday`
5. 首页 kicker **精确等于**  
   `Today's puzzle answer with spoiler-safe hints`
6. 首页 subtitle 不包含 `archive`、`yesterday`
7. 首页主按钮仍直达当天详情页
8. 首页动态 description **精确等于**  
   `Today's LinkedIn Pinpoint answer is Puzzle #${current.number}. Get spoiler-safe hints, clue help, and the verified solution for the current puzzle.`
9. 首页结构化数据里 `Organization.description` **精确等于**  
   `Get today's LinkedIn Pinpoint answer for the current puzzle with spoiler-safe hints, clue help, and a fast path to the final solution.`
10. 首页结构化数据里 `WebSite.description` **精确等于**  
   `Get today's LinkedIn Pinpoint answer for the current puzzle with spoiler-safe hints, clue help, and a fast path to the final solution.`
11. 首页 subtitle **精确等于**  
   `Need today's LinkedIn Pinpoint answer? Start with spoiler-safe hints for Puzzle #${puzzle.number}, then open the verified solution when you're ready.`
12. `/puzzles` title **精确等于**  
   `LinkedIn Pinpoint Archive | Past Answers by Puzzle Number`
13. `/puzzles` description **精确等于**  
   `Browse past LinkedIn Pinpoint answers in one archive. Search by puzzle number or clue, then open the matching answer page fast.`
14. `/puzzles` H1 **精确等于** `LinkedIn Pinpoint Archive`
15. `/puzzles` 首屏说明 **精确等于**  
   `Search past LinkedIn Pinpoint answers by puzzle number or clue, then jump into the matching answer page.`
16. `/puzzles` chips 三条文案 **精确等于**：
   - `${totalCount} archived puzzles`
   - `Search by clue or number`
   - `Open the matching answer page`
17. 本轮提交未引入 robots、canonical、索引可见性变化
18. `/` 与 `/puzzles` 在 Rich Results Test 中没有新增 critical error；首页 FAQ、归档页 `CollectionPage / ItemList` 结果与当前页面结构一致

### 11.1 验收方法

- `source check`：检查 `HOME_SEO_DESCRIPTION` 等冻结常量
- `rendered HTML / view-source`：检查 title、description、H1
- `rendered JSON-LD`：检查 `Organization.description`、`WebSite.description`
- `Rich Results Test`：检查 FAQ、`CollectionPage`、`ItemList` 是否仍有效，且没有新增 critical error
- `本地或预发首屏截图`：检查 hero/header 文案
- `点击检查`：确认首页主 CTA 仍指向今天详情页

补充说明：

- 验收首页动态 description 时，先读取当天 puzzle 编号，再把 `${current.number}` 替换成实际题号后与 rendered HTML / view-source 对比
- 验收前先绕过缓存再看结果，至少使用一次未命中过缓存的请求复核（例如附加一次性 query 参数，并用 `curl` 或浏览器网络面板确认拿到最新响应）

### 11.2 上线放量门禁

以下 5 条不是“上线后 rollback 条件”，而是**发布验收 gate**。任一不通过，禁止放量：

1. 生产环境 `/` 或 `/puzzles` 的 rendered HTML 与冻结 title / description / H1 不一致
2. 首页主 CTA 不再指向当天详情页
3. 首页结构化数据 `Organization.description` 或 `WebSite.description` 未按冻结文案落地
4. 本轮提交意外引入 robots、canonical、索引可见性变化
5. `/` 或 `/puzzles` 在 Rich Results Test 中出现新增 critical error，或 FAQ / `CollectionPage / ItemList` 的结果与当前页面结构不一致

---

## 12. 上线后观察计划

### 12.1 观察窗口

- `14 天`：看抓取、标题改写、查询是否明显跑偏
- `28 天`：才做效果判断

计时规则：

- `D0` 以生产部署完成时间（北京时间）为准
- GSC 同日数据默认不完整，不作为正式观察日
- `D+14`、`D+28` 都以“完整自然日”窗口拉数
- 如果部署后执行了 URL Inspection / Request Indexing，单独记录请求时间，但**不**用它替代 `D0`

### 12.2 观察维度

GSC 观察默认至少拆下面两个维度：

- 设备：`Mobile / Desktop`
- 地区：`US` 作为主 GEO

如果 `US` 单独样本过薄，再补一个英语市场合并盘：

- `US + UK + CA + AU`

全局汇总仍然保留，但只作为背景噪音参考，不作为主判断盘。

### 12.3 首页观察口径

重点看：

- `linkedin pinpoint answer today`
- `pinpoint answer today`
- `today's pinpoint answer`

判断标准：

- 这类 today 查询对首页的曝光不恶化
- 这类 today 查询的平均排名不明显变差
- 如果首页平均排名仍高于 `20`，CTR 只作辅助指标，不作主要成败判断

### 12.4 `/puzzles` 观察口径

重点看：

- `pinpoint archive`
- `past pinpoint answers`
- `pinpoint answer yesterday`
- `pinpoint 698 answer` 这类题号查询

判断标准：

- `/puzzles` 的查询结构不再只剩泛 `answer`
- 开始出现更稳定的 `archive / lookup` 类查询
- 如果仍是 `8-12` 位且 `0` 点击，结合 SERP 复查，不直接把失败归给文案

### 12.5 本轮不预设硬性绝对 CTR 目标

原因：

- 当前样本太薄
- 首页排名过低，CTR 不是最稳的主指标
- `/puzzles` 的首要目标是查询结构收口，不是先赌 CTR 数字

本轮采用“冻结基线后做相对比较”的方式判断。

### 12.6 辅助行为指标（GA4，非主判定）

这轮可以补 GA4 对照，但**不**把 `Bounce Rate` 或 `Time on Page` 设为主指标。

原因：

- answer-site 的合理用户行为本来就可能是“快速拿到答案后离开”
- 当前 GA 脚本是延迟加载，快速离开用户可能低估，直接看跳出和停留时间会有偏差

更合适的辅助行为指标是：

1. Organic Search 落地首页 `/` 后，是否继续进入详情页
2. Organic Search 落地 `/puzzles` 后，是否触发 `archive_search`
3. Organic Search 落地 `/puzzles` 后，是否继续进入详情页
4. 作为补充信号，可记录首页 `search_by_number` 与详情页 `answer_revealed`

这些指标只用于辅助判断“页面身份收紧后，用户是否更容易走到下一步”，不替代 GSC 的主观测盘。

### 12.7 负责人、拉数方式与输出物

- 负责人：`SEO / 增长 DRI`
- 拉数时间：
  - `D+14`：首次观察
  - `D+28`：效果判断
- 拉数方式：
  - 用固定 query 集合复跑 GSC 页面级查询
  - 设备至少拆 `Mobile / Desktop`
  - 地区至少拆 `US`
  - 首页与 `/puzzles` 分开记录
  - 同步补一轮 SERP spot check
  - 如有 GA4 数据权限，同步补一轮 Organic landing -> next action 行为检查
- 观察输出文件：  
  `docs/home-archive-seo-tightening-observation-YYYY-MM-DD.md`

输出文件必须包含：

1. 拉数时间窗口
2. 原始命令
3. 设备与 GEO 拆分结果
4. 首页 today 类查询结果
5. `/puzzles` query intent 分组结果
6. SERP 标题改写 / Featured Snippet / PAA 观察
7. 如可用，Organic landing -> next action 的 GA4 结果
8. 是否触发 `10.1` 的复核或 rollback 条件

---

## 13. 建议执行顺序

1. 冻结基线快照
2. 完成 `/puzzles` 查询分组和 SERP spot check
3. 完成 title 像素预览和导航 / 页脚锚文本记录
4. 一次性改完 metadata + 首屏文案
5. 做渲染后 HTML 检查、Rich Results Test 和首屏截图检查
6. 上线并记录时间戳
7. 在 GSC 对 `/` 和 `/puzzles` 做 URL Inspection；如可用，则提交 `Request Indexing`
8. 记录 `Request Indexing` 时间，但仍按 `14 / 28 天` 双窗口复盘

---

## 14. 冻结决策

这 6 条不再作为开放问题讨论：

1. 首页 title 去掉 `Archive`
2. 首页 description 去掉 `archive / yesterday`
3. 首页 H1 **Phase 1 不改**
4. `/puzzles` title 去掉 `Guides`
5. `/puzzles` H1 **Phase 1 必改为** `LinkedIn Pinpoint Archive`
6. `/puzzles` 首屏说明不再把 `full explanation` 当第一承诺

---

## 15. 审查通过标准

这份文档只有两种有效结论：

### A. 通过并执行

- 按本稿冻结文案落地
- 不再保留并行方案

### B. 不通过并另起方案

如果仍希望：

- 首页继续承担站点总入口角色
- `/puzzles` 继续兼任 guide 列表页

那就不该继续沿用这份 PRD，而应该另写“混合入口策略”方案。

---

## 16. 当前建议

**建议执行。**

但要带着两个前提去执行：

1. 把这轮定义成“页面身份收紧实验”，不是“首页 CTR 修复”
2. 先以查询结构和页面信号对齐作为首要验收，再看 CTR

一句话说完：

这轮值得做，但要把预期管理写进文档，避免后面出现“改了文案却没立刻涨 CTR，所以方案无效”的误判。

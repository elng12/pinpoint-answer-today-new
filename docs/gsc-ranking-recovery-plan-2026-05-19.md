# Pinpoint Answer Today GSC 排名下降修复方案

> 文档状态：审查版  
> 生成日期：2026-05-19  
> 目标站点：`https://pinpointanswertoday.app`  
> GSC 属性：`sc-domain:pinpointanswertoday.app`  
> 主要问题窗口：`2026-05-12` 到 `2026-05-18`  
> 对比窗口：`2026-05-05` 到 `2026-05-11`  
> 审查目标：确认修复优先级、范围、验收标准，再进入实现

---

## 1. 一句话结论

这次下降不是 `robots`、`noindex`、canonical 错配或完全未索引导致的硬技术故障。

最直接的表现是：Google 对 `pinpoint answer today`、`linkedin pinpoint answer today`、`pinpoint today` 这组核心查询重新排序，首页 `/` 在移动端的主要曝光几乎消失，剩余曝光更多来自低位桌面结果，导致全站平均排名显著恶化。

但代码和数据链路里存在两个必须立即修复的技术风险：

1. 首页和归档页 sitemap `lastmod` 长期停留在 2026-04-01 / 2026-03-31，与每日更新的实际内容不一致。
2. `#735`、`#736`、`#737` 详情 JSON 文件存在，但 `registry.json` 缺失，导致生产 404、sitemap 漏页、归档漏页和旧路径失效。

这两个问题不是已证实的 5 月 12 日触发器。它们被列为 P0 的原因是：它们是当前可验证、可修复、会削弱近期连续性/新鲜度/可靠性的生产问题。P0 修复应单独发布和监控，不能和首页大改版混在同一个发布窗口里，否则无法判断恢复或恶化来自哪一类变更。

---

## 2. 已证实数据

### 2.1 全站趋势

| 周期 | Clicks | Impressions | CTR | Avg position |
| --- | ---: | ---: | ---: | ---: |
| 2026-05-05 到 2026-05-11 | 3 | 1,978 | 0.15% | 10.94 |
| 2026-05-12 到 2026-05-18 | 2 | 268 | 0.75% | 28.28 |

解释：

- Impressions 下降约 86.5%。
- Avg position 从 10.94 掉到 28.28。
- Clicks 样本极小，不能作为主要判断依据。
- 这是排名和展示资格变化驱动的曝光损失，不是单纯 CTR 问题。

### 2.2 首页是主要损失来源

| URL | 周期 | Clicks | Impressions | Avg position |
| --- | --- | ---: | ---: | ---: |
| `/` | 2026-05-05 到 2026-05-11 | 2 | 1,646 | 11.66 |
| `/` | 2026-05-12 到 2026-05-18 | 2 | 147 | 45.02 |

首页 impressions 下降约 91.1%，贡献了全站曝光下降的大部分。

### 2.3 核心查询断崖式下滑

| Query | Before impressions | Before pos | After impressions | After pos |
| --- | ---: | ---: | ---: | ---: |
| `pinpoint answer today` | 1,046 | 9.51 | 15 | 48.40 |
| `linkedin pinpoint answer today` | 145 | 10.08 | 10 | 61.70 |
| `pinpoint today` | 115 | 10.44 | 11 | 44.55 |

这三组查询合计减少约 1,270 impressions，占全站曝光损失约 74%。

### 2.4 移动端是最大缺口

首页设备表现：

| Device | 2026-05-05 到 2026-05-11 | 2026-05-12 到 2026-05-18 |
| --- | --- | --- |
| Mobile | 1,442 impressions / pos 9.34 | 16 impressions / pos 14.31 |
| Desktop | 133 impressions / pos 34.76 | 105 impressions / pos 55.49 |

解释：

- Before 周期里，首页移动端贡献约 87.6% 首页曝光。
- After 周期里，首页移动端曝光几乎消失。
- After 移动端只剩 16 impressions，平均排名不稳定；更准确的说法不是“移动端从第 9 名掉到第 14 名”，而是“首页在移动 SERP 上大面积不再进入可产生 impression 的结果集”。

### 2.5 4 月底出现过类似波动

| 周期 | 首页 impressions | 首页 avg position |
| --- | ---: | ---: |
| 2026-04-20 到 2026-04-28 | 5,448 | 9.80 |
| 2026-04-29 到 2026-05-04 | 330 | 22.85 |
| 2026-05-05 到 2026-05-11 | 1,646 | 11.66 |
| 2026-05-12 到 2026-05-18 | 147 | 45.02 |

解释：

- 这不是第一次波动。
- Google 可能在这个 query cluster 上反复测试或重算排名。
- 5 月 12 之后的问题更严重，因为核心查询 position 也明显恶化。

---

## 3. 已排除或低概率根因

### 3.1 不是 robots/noindex 阻断

URL Inspection 抽查结果：

- 首页 `/`：`Submitted and indexed`
- `/puzzles`：`Submitted and indexed`
- `/linkedin-pinpoint-answers/pinpoint-answer-741/`：`Submitted and indexed`
- `/linkedin-pinpoint-answers/pinpoint-answer-742/`：`Submitted and indexed`
- `/linkedin-pinpoint-answers/pinpoint-answer-743/`：`Submitted and indexed`

共同状态：

- `robotsTxtState`: `ALLOWED`
- `indexingState`: `INDEXING_ALLOWED`
- `pageFetchState`: `SUCCESSFUL`
- `googleCanonical` 与 `userCanonical` 正常
- `crawledAs`: `MOBILE`

### 3.2 不是已公开的 5 月 Google Search 事故

Google Search Status Dashboard 没有 2026-05-12 附近公开的 ranking/indexing/crawling 事故。最近公开的 Ranking 事件是 March 2026 core update，时间为 2026-03-27 到 2026-04-08，和本次下跌不完全重合。

参考：

- [Google Search Status Dashboard](https://status.search.google.com/summary)
- [March 2026 core update](https://status.search.google.com/incidents/7eTbAa2jWdToLkraZj5y)

### 3.3 不是单纯搜索需求下降

如果只是用户搜索量下降，核心 query 的 average position 不应从 9-10 跌到 44-62。当前是曝光减少和排名恶化同时发生。

---

## 4. 根因假设与时间线补强

### 4.1 关键修正：P0 技术问题不是已证实根因

本方案将 sitemap `lastmod` 和 `#735/#736/#737` registry 缺失列为 P0，是因为它们是明确的生产缺陷，不是因为它们已经被证明直接触发了 2026-05-12 的下滑。

必须保留这个边界：

- sitemap 首页 lastmod 停在 2026-04-01，问题早于 5 月 12 日，不能单独解释“为什么 5 月 12 日断崖”。
- `#735/#736/#737` 的 puzzle 日期是 2026-05-05 到 2026-05-07，但 registry 缺失由 `f5a67b8 fix: deprecate fullAnalysis field, migrate all data to articleBlocks` 在 2026-05-07 21:38:12 +0800 移除，流量在 5 月 8-9 仍有恢复表现，所以它也不能单独解释 5 月 12 日断崖。
- 因此 P0 修复的预期是“消除明显负面信号和生产 404”，不是“修完必然恢复排名”。

### 4.2 根因假设矩阵

| 假设 | 当前证据 | 反证/缺口 | 当前判断 | 对应动作 |
| --- | --- | --- | --- | --- |
| Google 对 today query cluster 重新排序 | 核心查询 position 从 9-10 跌到 44-62；首页移动曝光几乎消失 | 需要 SERP 历史快照证明谁上位 | 最可能主因 | SERP 快照、竞品结构对照、内容/首页定位补强 |
| 首页 freshness / trust 信号不足 | sitemap lastmod 过期；首页每日变化但 sitemap 静态；SERP snippet 可能滞后 | lastmod 早就过期，不能解释精确日期 | 重要放大因素 | P0 修 sitemap，P1 可见日期/验证信息 |
| registry 缺页破坏近期连续性 | #735-#737 生产 404、sitemap 漏页、日期/数字 alias 失效 | 5 月 8-9 仍恢复过，不能单独解释 5 月 12 | 明确生产缺陷，非唯一根因 | P0 恢复 registry |
| 移动端性能/CWV 事故 | 下滑主要来自移动端曝光消失 | 本地 Lighthouse 移动性能良好，尚无 CrUX 证据 | 暂无证据支持，但必须专项排查 | PageSpeed/CrUX、Googlebot Smartphone render、移动 SERP |
| 竞争格局变化 | 当前 SERP 有多个专门站和强媒体站承接该意图 | 缺少 5 月 11 前 SERP 对照 | 高优先级外部假设 | 固定 SERP 快照和竞品分析 |
| 4 月底同类波动自然回弹 | 4/29-5/4 掉，5/5-5/11 恢复 | 本次跌幅更深，核心词 position 更差 | 可参考但不能照搬 | 分阶段发布，避免过度改动 |

### 4.3 为什么会在 2026-05-12 附近触发

当前最合理解释不是单点故障，而是多因素叠加：

1. 4 月底已经出现一次 query cluster 波动，说明 Google 对这个主题的排序本来就不稳定。
2. 5 月 7 日的大规模内容字段迁移移除了 `#735/#736/#737` registry entries，但 5 月 8-9 仍出现短期恢复，说明缺页不是唯一触发器。
3. 5 月 12 日发布 `#742`，并有 `Refresh Pinpoint content and legacy routing` 相关提交；同日开始首页核心 query 的移动曝光消失，桌面残留低位展现增加。
4. 当前 SERP 里多家竞品把“今日答案 + 日期 + clues + reveal/author/更新时间”放在首屏，本站首页在 freshness、首屏意图和 trust 表达上弱于这些结果。

因此当前根因链应表述为：

```text
Google 重新评估 today query cluster
→ 首页移动端不再稳定进入可产生 impression 的结果集
→ 过期 sitemap lastmod、近期 registry 断层、模板化内容和弱首屏信号放大了重新评估的不利结果
```

---

## 5. 移动端专项检查

### 5.1 已跑的移动性能基线

PageSpeed Insights API 在本机访问超时，因此先使用本地 Lighthouse 移动模拟作为可复现基线。该结果不是 CrUX 真实用户数据，不能替代 PageSpeed/CrUX。

| URL | Lighthouse mobile perf | FCP | LCP | CLS | TBT | Speed Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 0.98 | 1.3s | 2.2s | 0 | 20ms | 3.3s |
| `/linkedin-pinpoint-answers/pinpoint-answer-748/` | 0.98 | 1.2s | 2.0s | 0 | 0ms | 3.7s |

初步判断：

- 本地 Lighthouse 不支持“移动性能事故导致排名断崖”的假设。
- 仍需用 PageSpeed Insights 或 CrUX 获取真实用户维度的 mobile CWV，尤其是 LCP、INP、CLS。

### 5.2 必须补的移动排查任务

P0 技术修复发布后，单独执行：

1. PageSpeed Insights mobile：
   - `/`
   - 最新详情页
   - `#742`
   - `/puzzles`
2. CrUX / field data：
   - origin-level mobile LCP / INP / CLS
   - URL-level mobile data，如有样本
3. Googlebot Smartphone render：
   - 首屏是否可见 puzzle number、日期、clues、hint/reveal 区块
   - answer 文本是否在 SSR HTML 中可见或可被 Google 渲染
   - mobile nav 是否隐藏关键内链
4. 移动 SERP：
   - 美国、英国、印度至少三地分别记录 `pinpoint answer today`、`linkedin pinpoint answer today`
   - 标记是否有 AI overview、featured snippet、Top Stories、People also ask、视频或论坛结果

如果 PageSpeed/CrUX 显示 mobile CWV fail，则移动性能修复优先级提升到 P0.5，并暂停首页结构改版。

---

## 6. 当前 SERP / 竞品快照

> 快照时间：2026-05-19  
> 方法：搜索工具的非个性化查询快照，不等同于正式 rank-tracking；需要后续用固定地区、固定设备、无登录环境复测。

### 6.1 `pinpoint answer today` 可见竞争者

当前可见结果中，强相关竞品包括：

- [pinpointanswer.today](https://pinpointanswer.today/)
- [The Word Finder - LinkedIn Pinpoint Answers](https://www.thewordfinder.com/linkedin-pinpoint-answers/)
- [Try Hard Guides - LinkedIn Pinpoint Answer Today](https://tryhardguides.com/linkedin-pinpoint-answer-today/)
- [linkedinpinpointanswer.today](https://linkedinpinpointanswer.today/)
- [pinpointanswertoday.online](https://pinpointanswertoday.online/)
- [PC Gamer 的 daily answer 类页面](https://www.pcgamer.com/games/puzzle/linked-in-pinpoint-answer-today/)

搜索工具快照按返回顺序的前列结果是：

1. `pinpointanswer.today`
2. `The Word Finder`
3. `Try Hard Guides`

这不是正式 rank-tracking 结果，但足以说明：当前 SERP 不是空白市场，本站需要和多个专门页/强站争夺同一个 today-answer 意图。

初步观察：

- 竞品多采用“今日 puzzle 编号/日期 + clues + reveal/answer + recent answers”的首屏结构。
- The Word Finder、Try Hard Guides 这类站点通常有明显作者/更新时间/编辑信号。
- 若本站首页在当前 top visible set 中不可见，说明修复不能只看内部技术项；需要把首页重新对齐“今日答案”意图。

### 6.2 SERP 快照要固定化

后续每次复盘必须记录：

| Query | Device | Country | Top 3 | Top 10 中是否有本站 | 结果类型变化 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `pinpoint answer today` | Mobile | US | 待记录 | 待记录 | 待记录 |  |
| `linkedin pinpoint answer today` | Mobile | US | 待记录 | 待记录 | 待记录 |  |
| `pinpoint today answer` | Mobile | US | 待记录 | 待记录 | 待记录 |  |
| `pinpoint answer today` | Desktop | US | 待记录 | 待记录 | 待记录 |  |

如果 top 3 被竞品固定占据，技术修复只能消除负面信号，真正恢复需要内容/首屏/信任结构升级。

---

## 7. 4 月底波动与 5 月 12 下滑对比

### 7.1 4 月底掉量后为何恢复

4 月 29 到 5 月 4 的下滑与 5 月 12 后的下滑不同。

4 月底表现：

- 首页 impressions 下降到 330。
- 首页 avg position 为 22.85。
- `pinpoint answer today` 在移动端仍能零散保持 7-15 名左右的结果。
- 5 月 1 附近有多次内容/SEO 修复提交：
  - `094fa68 fix: unblock daily pinpoint publish data`
  - `968be84 feat: make spoiler hints and answer labels include specific clue/answer text`
  - `11bd4c9 fix: remove unsupported rich result markup`
  - `bae6180 fix: align sitemap and structured data guardrails`
- 但无法证明恢复由这些提交直接触发，可能是自然回弹、query cluster 测试结束、或内容更新共同作用。

5 月 12 后表现：

- 首页 impressions 下降到 147，avg position 恶化到 45.02。
- 核心 query 的 after position 进入 48-62 区间。
- 移动端首页曝光几乎清零，剩余主要是桌面低位结果。
- 这是比 4 月底更深的下滑，不应假设会自然恢复。

### 7.2 可利用的判断

如果 P0 技术修复后 7-14 天出现类似 5 月 5-11 的自然回弹，说明站点仍有被 Google 重新测试的机会。

如果 P0 技术修复后 14-28 天仍无 mobile impressions 恢复，则应判定为结构性竞争/意图匹配问题，而不是继续等待。

---

## 8. 风险分级

### P0：立即修复的技术风险

#### P0-1 修复 sitemap 首页/归档 lastmod 数据源

当前问题：

- [app/sitemap.ts](/Users/elng/web/pinpoint-answer-today-new/app/sitemap.ts:15) 使用 `getStaticRouteLastModified(routes.home)` 生成首页 lastmod。
- [data/static-page-metadata.json](/Users/elng/web/pinpoint-answer-today-new/data/static-page-metadata.json:4) 中 `/` 的 `lastModified` 仍是 `2026-04-01T02:12:46.000Z`。
- 生产 sitemap 中首页 `<lastmod>` 仍输出 `2026-04-01T02:12:46.000Z`。
- `/puzzles` 的 lastmod 也停在 `2026-03-31T12:59:06.000Z`。

为什么重要：

- 首页每天承接当前 puzzle，但 sitemap 却告诉 Google 首页已经 1 个多月没更新。
- 这会和页面 title/H1/正文中每日变化的信号冲突。
- Google 不保证一定使用 sitemap `lastmod`，但错误的 `lastmod` 仍是可避免的低质量抓取信号。

修复方向：

- 首页 `/` lastmod 取当前 live puzzle 的 `updatedAt`，fallback 到 `publishDate`。
- `/puzzles` lastmod 取最新公开 puzzle 的 `updatedAt`，fallback 到最新公开 puzzle 的 `publishDate`。
- `/next-pinpoint-preview` lastmod 取 preview 数据的更新时间；如果 preview 无更新时间，则用当前 live puzzle 的更新时间作为保守 fallback。
- 静态 trust/legal 页面继续使用 `static-page-metadata.json`。

建议实现位置：

- 修改 [app/sitemap.ts](/Users/elng/web/pinpoint-answer-today-new/app/sitemap.ts:12)。
- 复用现有 `getCurrentPuzzle()`、`getArchiveEntries()`、`getNextPreview()` 或底层 registry helper。

验收标准：

- `/sitemap.xml` 中 `/` 的 `<lastmod>` 不早于最新 live puzzle 的 `updatedAt`。
- `/sitemap.xml` 中 `/puzzles` 的 `<lastmod>` 不早于最新公开 puzzle 的 `updatedAt`。
- 最新 10 个详情页仍输出各自 `updatedAt`。
- sitemap 不包含未发布、未验证或未来 puzzle 页面。

#### P0-2 恢复 #735/#736/#737 registry 条目

当前问题：

- `data/puzzles/pinpoint-answer-735.json` 存在。
- `data/puzzles/pinpoint-answer-736.json` 存在。
- `data/puzzles/pinpoint-answer-737.json` 存在。
- 但 [data/puzzles/registry.json](/Users/elng/web/pinpoint-answer-today-new/data/puzzles/registry.json:193) 从 `#738` 直接跳到 `#734`。

生产表现：

- `/linkedin-pinpoint-answers/pinpoint-answer-737/` 返回 404。
- `/puzzles/737` 返回 404。
- `/pinpoint/2026-05-07` 返回 404。
- sitemap 有 `#738` 和 `#734`，但缺 `#737/#736/#735`。

为什么重要：

- 这是正式页面不可用，不只是 sitemap 漏报。
- 这些页面处于 2026-05-05 到 2026-05-07，正好在下降前的近期连续区间。
- 缺页会破坏 archive 连续性、内部链接连续性、日期路径和数字路径解析。

修复方向：

- 从对应 JSON 文件恢复 registry entries。
- 状态应为 `published` 或 `archived`，不要标记为 draft。
- 确保 `number`、`slug`、`publishDate`、`updatedAt`、`clues`、`answer` 和 category 信息与 JSON 一致。

验收标准：

- `/linkedin-pinpoint-answers/pinpoint-answer-735/` 返回 200。
- `/linkedin-pinpoint-answers/pinpoint-answer-736/` 返回 200。
- `/linkedin-pinpoint-answers/pinpoint-answer-737/` 返回 200。
- `/puzzles/735`、`/puzzles/736`、`/puzzles/737` 正确跳转到 canonical detail URL。
- `/pinpoint/2026-05-05`、`/pinpoint/2026-05-06`、`/pinpoint/2026-05-07` 正确跳转到 canonical detail URL。
- sitemap 包含 `#735/#736/#737`。

### P1：防回归工程健康度

#### P1-1 增加数据完整性 CI

当前问题：

- 仓库允许 `data/puzzles/pinpoint-answer-*.json` 存在但 registry 缺条。
- 当前 validation 没有阻断这种上线风险。
- 这是防止未来复发的工程健康度措施，不是恢复当前排名的直接修复，因此不占用 Day 1 的 P0 发布窗口。

修复方向：

增加数据校验：

1. 所有公开 detail JSON 都必须在 `data/puzzles/registry.json` 中存在。
2. registry 中的公开条目必须有对应 JSON 文件。
3. 最新 N 天 puzzle 编号和日期不能出现缺口，除非显式 allowlist。
4. sitemap 生成结果必须包含所有公开 registry detail。
5. 首页 sitemap lastmod 不得早于当前 live puzzle `updatedAt`。

建议接入位置：

- 现有 `npm run validate:data`。
- 或新增 `scripts/check-seo-data-integrity.ts`，再挂到 build 前。

验收标准：

- 删除 registry 中任意公开条目时，CI fail。
- 删除公开 JSON 文件时，CI fail。
- 首页 sitemap lastmod 回退到静态日期时，CI fail。

---

## 9. 首页修复方案

### 9.1 首页定位

首页应该从“站点总览/guide landing page”收紧为“今日 Pinpoint 答案实时入口”。

页面主任务：

1. 明确告诉用户今天的 puzzle 编号和日期。
2. 明确告诉用户答案、线索和 hint 在这里。
3. 快速引导到今日详情页。
4. 保留 archive 和 guide，但不要抢占首屏主意图。

### 9.2 首屏结构建议

建议顺序：

1. H1
2. 今日状态条
3. 今日 clues + hint/reveal answer 区块
4. Full breakdown CTA
5. Yesterday / recent 7 days
6. How we verify today’s answer
7. What is LinkedIn Pinpoint / FAQ / archive / trust content

建议 H1：

```text
LinkedIn Pinpoint Answer Today — Puzzle #748, May 18, 2026
```

注意：

- 日期必须来自已验证 puzzle 数据。
- 不要提前写未来日期或未来 puzzle。
- 时区应明确，例如 `Last verified: May 18, 2026, 07:08 UTC` 或站点统一时区。

### 9.3 Title 和 description

当前 title：

```text
LinkedIn Pinpoint Answer Today | Hints & Solution
```

建议动态 title：

```text
LinkedIn Pinpoint Answer Today #748 — May 18, 2026 Hints & Answer
```

备选短版：

```text
LinkedIn Pinpoint #748 Answer Today — May 18, 2026
```

建议 description：

```text
Get today's LinkedIn Pinpoint #748 answer for May 18, 2026 with five clues, spoiler-safe hints, and a verified explanation before opening the full breakdown.
```

原则：

- 包含 `LinkedIn Pinpoint`、`answer today`、puzzle number、日期。
- 不要堆重复关键词。
- 不要把答案本身直接放进 meta description，避免 zero-click 风险；答案应在页面可见 HTML 中存在。

### 9.4 今日答案卡

首屏今日答案卡应包含：

- Puzzle number
- Published date
- Last updated / verified time
- 5 clues
- Spoiler-safe hint ladder
- Reveal answer control
- One-line answer logic
- Link to full breakdown

答案是否应该在 SSR HTML 中存在：

- 可以用 reveal 控制视觉剧透。
- 但答案文本应存在于初始 HTML 或服务端渲染结构中，避免 Googlebot 只能看到空交互壳。

### 9.5 移除或下沉首页噪音

当前首页底部有大量 directory badge / featured badge。

修复建议：

- 从首页移除 `FooterBadgeWall`，或下沉到 About/Press 页面。
- 首页只保留和 daily answer 意图直接相关的 trust 信号。
- 外链目录 badge 不应作为 E-E-A-T 主要证明。

验收标准：

- 首页首屏不再像工具目录展示页。
- Googlebot 和用户在首屏立即看到当前 puzzle 编号、日期、clues、hint/reveal 区块。
- 首页 title/H1/visible date/structured data 的日期一致。

### 9.6 首页改版风险控制

首页 H1、title、首屏顺序和模块权重都属于高影响 SEO 变更。当前 impressions 已经下降 86.5%，不应把首页大改版和 P0 技术修复放在同一个生产发布窗口。

推荐发布策略：

1. 第一批只发布 P0 技术修复：sitemap lastmod、registry 恢复、必要 revalidate。
2. 观察至少 5 个完整自然日，记录核心 query、首页 mobile impressions、最新详情页 impressions。
3. 如果 P0 后没有明显恶化，再单独发布首页首屏/metadata 改版。
4. 首页改版 PR 必须包含 before/after HTML 快照、mobile screenshot、Lighthouse mobile baseline 和 SERP 监控计划。

首页改版短期风险：

- Google 重新理解页面主意图期间，title link 和 snippet 可能短期波动。
- 如果 answer 文本、日期或验证信息实现不一致，可能进一步削弱 trust。
- 如果首屏过度堆关键词，可能从“意图收紧”变成“关键词堆砌”。

回滚条件：

- 改版发布后 7 天内首页 mobile impressions 继续下降超过 50%，且最新详情页没有对应增长。
- GSC 显示首页核心 query average position 继续恶化 20 名以上。
- Google URL Inspection 渲染 HTML 缺失核心内容。

---

## 10. 每日详情页修复方案

### 10.1 优先修复范围

优先重写：

1. `#742` 到最新页，因为下降从 2026-05-12 开始。
2. `#735/#736/#737`，因为当前 registry 缺失导致生产不可用。
3. 最近 30 天页面，因为它们对 `today`、`yesterday`、近期长尾和 archive 连续性影响最大。

### 10.2 推荐页面结构

每日详情页结构：

1. H1：`LinkedIn Pinpoint #748 Answer & Hints — May 18, 2026`
2. Puzzle facts：日期、编号、difficulty、turning clue、answer type。
3. Quick answer box：答案、简短解释、spoiler control。
4. Hint ladder：Hint 1 / Hint 2 / Hint 3。
5. Clue-by-clue table：每个 clue 的具体解释。
6. Wrong answer traps：常见误判和为什么不对。
7. Full explanation：从线索到 category 的推理过程。
8. Verification block：验证人、验证时间、数据来源说明。
9. Correction history：如果修正过，记录修正时间和内容。
10. Previous / next / archive 内链。

### 10.3 内容质量要求

每页必须避免只替换 clue 的模板化表达。

不合格表达示例：

```text
Scale and Beaker both fit several loose themes, so it is better to wait for a more specific word.
```

合格表达应写具体推理：

```text
Scale can first suggest weight, music, or measurement. Beaker narrows the board toward lab equipment, and pH meter makes the chemistry-lab reading much stronger than a general measurement category.
```

每页至少补充：

- 1 个 turning clue。
- 2 个 plausible wrong answers。
- 每个 clue 的具体 fit reason。
- 1 段“为什么最终答案比其他候选更好”。

### 10.4 结构化数据

详情页当前已有 Article/Game/ItemList/BreadcrumbList，方向基本正确。

需要补强：

- `datePublished` 与页面可见 Published 一致。
- `dateModified` 与页面可见 Updated/Verified 一致。
- Breadcrumb 可见文本与 JSON-LD 一致。
- Author/Publisher 信息稳定。

参考：

- [Google publication dates](https://developers.google.com/search/docs/appearance/publication-dates)
- [Google structured data general guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

---

## 11. Trust / E-E-A-T 修复方案

### 11.1 新增或强化页面

建议新增或强化：

- `/about-us`
- `/contact-us`
- `/how-we-verify`
- `/corrections`
- `/editorial-policy`

### 11.2 Verification 文案统一

当前页面可能混用：

- `verified puzzle data`
- `human editor`
- `compact explainer`

建议统一成：

```text
Verified by Pinpoint Answer Today editors after checking the live LinkedIn Pinpoint puzzle clues and answer.
```

如果没有真实人工验证，不要写 `human editor`。

### 11.3 Corrections 机制

每个详情页底部增加：

- `Last verified`
- `Corrections`
- `Report an issue`

示例：

```text
Last verified: May 18, 2026, 07:08 UTC.
Correction history: No corrections recorded for this puzzle.
```

如果修正：

```text
Correction history:
- May 18, 2026, 09:12 UTC: Updated the clue explanation for "Vindaloo" to clarify the category.
```

### 11.4 不建议把 directory badges 当 trust 主体

目录站 badge 可以放在 About/Press 页面，但不应在首页作为主要信任证明。

原因：

- 它们和用户搜索 `LinkedIn Pinpoint answer today` 的意图不直接相关。
- 它们可能稀释首页主题。
- 部分目录链接如果是互换或推广性质，应审查是否需要 `nofollow` 或 `sponsored`。

---

## 12. 内链与信息架构修复方案

### 12.1 首页内链

首页应优先链接：

- 今日详情页：`LinkedIn Pinpoint #748 answer`
- 昨日详情页：`LinkedIn Pinpoint #747 answer`
- 最近 7 天答案
- Archive
- How we verify

避免泛锚文本：

- `Open`
- `View`
- `Read more`

推荐锚文本：

- `Open LinkedIn Pinpoint #748 answer`
- `View yesterday's Pinpoint #747 answer`
- `Browse past LinkedIn Pinpoint answers`

### 12.2 Archive 内链

Archive 应支持：

- 按 puzzle number 搜索。
- 按 clue 搜索。
- 按月份浏览。
- 最近 30 天优先展示。

Archive 页主意图应是旧题查找，不要和首页抢 `today answer`。

### 12.3 Legacy route

当前 legacy redirect 大方向正确，但 registry 缺条会导致旧数字/date 路径 404。

修复 registry 后需要抽查：

- `/puzzles/737`
- `/pinpoint/2026-05-07`
- `/linkedin-pinpoint/737`
- `/pinpoint-answer-737`

验收标准：

- 所有存在的近期 puzzle number/date alias 最终都到 canonical detail URL。
- 不存在的 puzzle 返回干净 404。
- 不产生 3 跳以上重定向链。

---

## 13. 2 周执行路线图

### 发布原则

本轮必须拆成至少两个发布窗口：

1. P0 技术修复单独发布。
2. 首页结构/metadata 改版另开 PR，和 P0 至少间隔 5 个完整自然日。

这样做的目的是保留归因能力：如果 P0 发布后恢复，可以确认明显生产缺陷修复有贡献；如果 P0 后无恢复，首页改版和内容升级才进入下一阶段。

### Day 0：审查与冻结范围

推荐决策：

- 批准 P0 技术修复立即实现。
- 推迟首页首屏改版，另开 PR。
- 推迟 badge wall 迁移，和首页改版同 PR 或 trust PR 处理。
- 批准 SERP 快照和移动专项检查。
- 批准 `#742` 到最新页的内容重写，但不要和 P0 同日发布。

输出：

- 确定 P0 PR 只包含 sitemap lastmod、registry 恢复、必要 revalidate 验证。
- 明确首页改版、内容重写、trust 页、CI 防回归均不进入 P0 PR。

### Day 1：P0 技术修复 PR

任务：

- 恢复 `#735/#736/#737` registry entries。
- 修改 sitemap lastmod 数据源。
- 本地跑 validation/build。
- 生成 preview，抽查 sitemap 和缺失页面。

验收：

- `npm run validate:data` 通过。
- `npm run build` 通过。
- Preview sitemap 中首页 lastmod 正确。
- `#735/#736/#737` detail 路由可访问。
- `/puzzles/737` 和 `/pinpoint/2026-05-07` 正确跳转。

### Day 2：P0 发布与重新抓取

任务：

- 部署生产。
- 触发 on-demand revalidate。
- 在 GSC URL Inspection 请求重新抓取：
  - `/`
  - `/sitemap.xml`
  - `/linkedin-pinpoint-answers/pinpoint-answer-742/`
  - `/linkedin-pinpoint-answers/pinpoint-answer-737/`
  - 最新 puzzle detail

验收：

- 生产 sitemap 正确。
- 生产 `#735/#736/#737` 返回 200。
- `/puzzles/737` 与 `/pinpoint/2026-05-07` 正确跳转。
- 记录 P0 发布前后 48 小时 GSC baseline。

### Day 3-4：只监控，不做首页大改

任务：

- 固定记录 GSC 核心 query、首页 mobile impressions、最新详情页 impressions。
- 补移动专项：
  - PageSpeed Insights mobile / CrUX
  - Googlebot Smartphone render
  - mobile SERP snapshot
- 补 SERP 竞品表：US mobile / US desktop 至少各一次。

验收：

- 得到可复核的移动 SERP top 10。
- 得到 PageSpeed 或 CrUX mobile field/lab 数据。
- 得到 Googlebot Smartphone 渲染 HTML 检查结果。

### Day 5-7：P1 防回归与近期详情页内容 PR

任务：

- 增加 registry/JSON/sitemap 一致性 CI。
- 重写 `#742` 到最新页。
- 补 `turning clue`、wrong answer traps、具体 clue table。
- 统一 verification block。
- 补 correction history。

验收：

- CI 能拦截 registry 缺条。
- 每页没有明显模板句。
- 每页至少 2 个 wrong-answer explanations。
- 每个 clue 都有具体解释。
- 答案文本 SSR 可见。

### Day 8-10：首页改版 PR

进入条件：

- P0 发布后没有技术回归。
- 移动专项没有发现 CWV P0 问题。
- SERP 快照确认 today intent 需要更强首屏承接。

任务：

- 动态 title 加入 puzzle number 和日期。
- H1 加入 puzzle number 和日期。
- 添加 visible `Published / Last verified / Updated`。
- 今日答案卡上移。
- `How we verify` 摘要上移。
- badge wall 移出首页或下沉到 About/Press。

验收：

- Googlebot Smartphone 抓取 HTML 中能看到当前 puzzle number、日期、clues、answer/hint 区块。
- title/H1/可见日期/schema 日期一致。
- 首屏不再被 archive 或 badge 内容稀释。
- 改版 PR 自带 before/after screenshot 和 Lighthouse mobile baseline。

### Day 11-12：Trust 层补强

任务：

- 新增或强化 `/how-we-verify`。
- 新增或强化 `/corrections`。
- About 页说明编辑流程。
- Contact 页反馈路径清晰。
- 详情页底部链接到 verification/corrections。

验收：

- 用户和 Google 都能看到内容如何验证。
- 每页都有可见的反馈/修正入口。
- 不做虚假作者或虚假验证声明。

### Day 13-14：Archive 和内链收紧

任务：

- Archive 强化按日期/编号/线索检索。
- 首页到今日/昨日/最近页的锚文本具体化。
- 详情页 previous/next/archive 锚文本具体化。

验收：

- 内链能明确表达页面主意图。
- Archive 不和首页抢 `today answer`。

### Day 14：复盘决策

判断：

- 如果首页 mobile impressions 恢复，继续内容质量优化。
- 如果首页仍无恢复但详情页上升，考虑让今日详情页成为主承接页，首页转为 strong hub。
- 如果整体继续下滑，进入 28 天应急路径，不继续“再等等”。

---

## 14. 监控方案

### 14.1 GSC 维度

固定查询：

- `date + query + page + device + country`

固定周期：

- 最近 7 天 vs 前 7 天。
- 最近 28 天 vs 前 28 天。
- 下跌窗口 `2026-05-12` 到当前 vs `2026-05-05` 到 `2026-05-11`。

核心查询：

- `pinpoint answer today`
- `linkedin pinpoint answer today`
- `pinpoint today`
- `pinpoint today answer`
- `linkedin pinpoint answer`
- `pinpoint #748 answer`

核心 URL：

- `/`
- `/puzzles`
- 最新 10 个 detail URLs
- `#742` 到最新页
- `#735/#736/#737`

### 14.2 技术监控

每天抽查：

- `/sitemap.xml`
- `/robots.txt`
- 首页 status/header
- 最新详情页 status/header
- 近期 legacy aliases
- Googlebot smartphone rendered HTML

### 14.3 成功指标

短期，7 天内：

- `#735/#736/#737` 404 清零。
- sitemap 首页/归档 lastmod 正确。
- 首页重新抓取成功。
- 最新详情页重新抓取成功。

中期，14-28 天：

- 首页 mobile impressions 开始恢复。
- `pinpoint answer today` ranking 从 40+ 回到前 20。
- 最新详情页长尾 impressions 增加。
- Archive 漏页问题不再出现。

长期，30-60 天：

- 首页和详情页形成稳定分工。
- 泛 today query 不再完全依赖首页单点。
- 最近 30 天 detail pages 能承接更多 clue-specific 查询。

### 14.4 28 天无恢复应急路径

如果 P0 技术修复发布 28 天后仍满足以下任一条件：

- 首页 mobile impressions 未恢复到 P0 前 7 天均值的 2 倍以上。
- `pinpoint answer today` 仍稳定在 40 名以后。
- 最新详情页长尾 impressions 没有增长。
- 当前 SERP top 10 中本站仍不可见。

则不再继续等待，进入应急分支：

1. 重新定义主承接页：
   - A 方案：首页继续承接 `answer today`。
   - B 方案：最新详情页承接 `#NNN answer today`，首页改为 hub。
   - 用 GSC query/page 数据决定，不凭直觉。
2. 做竞品内容差距表：
   - top 5 竞品首屏模块。
   - 日期/作者/验证/答案呈现方式。
   - 是否有 featured snippet 或 PAA 占位。
3. 做内容质量抽样审计：
   - 最新 30 页。
   - 找重复句、薄解释、无 wrong-answer 分析、无验证说明的页面。
4. 决定是否进行更大范围信息架构改造：
   - 首页与 latest detail 的 canonical/内部链接分工。
   - Archive 分层。
   - 今日页/日期页是否需要独立稳定入口。
5. 如 SERP 被强媒体/官方/AI overview 固定占据：
   - 降低首页泛词恢复预期。
   - 把增长目标转向 clue-specific、puzzle-number-specific、archive lookup 查询。

---

## 15. 不建议做的事

不要做：

- 不要提前发布未验证的未来 puzzle。
- 不要只改 `Last updated` 制造新鲜感。
- 不要批量生成低差异页面。
- 不要复制竞品内容再改写同义词。
- 不要在首页堆砌 `pinpoint answer today / linkedin pinpoint answer / hints today`。
- 不要大规模迁移 URL。
- 不要删除 archive。
- 不要把 directory badge 或 AI 工具站互链当 E-E-A-T。
- 不要承诺 `100% accurate` 或 `all valid solutions`，除非有真实验证机制。

---

## 16. 审查决策清单

请按推荐立场审查：

| 决策项 | 推荐 | 理由 |
| --- | --- | --- |
| 立即修复 sitemap lastmod 数据源 | 批准 | 明确错误信号，修复范围小，可独立验证 |
| 恢复 `#735/#736/#737` registry entries | 批准 | 当前生产 404，影响 sitemap、archive、legacy alias |
| P0 技术修复单独发布 | 批准 | 保留归因能力，避免与首页大改版混淆 |
| 增加 registry/JSON/sitemap 一致性 CI | 推迟到 P1 | 防复发重要，但不是当前排名恢复直接手段 |
| 首页 H1/title/首屏结构改版 | 推迟到 P0 后至少 5 天 | 大改版会触发重新评估，应单独 PR |
| 把首页 badge wall 移到 About/Press | 推迟到首页 PR | 属于页面意图/信任结构调整，不进 P0 |
| 重写 `#742` 到最新页 | 批准，但不与 P0 同日发布 | 内容质量必须补，但要和技术修复分离 |
| 新增 `/how-we-verify` 和 `/corrections` | 批准为 P2 | 强化 trust，但不阻塞 P0/P1 |
| SERP 快照和移动专项检查 | 批准 | 填补根因分析外部视角和移动端缺口 |

---

## 17. 参考资料

Google 官方：

- [Debug traffic drops in Google Search](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops)
- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Influencing title links in Google Search](https://developers.google.com/search/docs/appearance/title-link)
- [Control your snippets in search results](https://developers.google.com/search/docs/appearance/snippet)
- [Influence your byline dates in Google Search](https://developers.google.com/search/docs/appearance/publication-dates)
- [Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [Google Search Status Dashboard](https://status.search.google.com/summary)

本地相关文件：

- [app/sitemap.ts](/Users/elng/web/pinpoint-answer-today-new/app/sitemap.ts)
- [data/static-page-metadata.json](/Users/elng/web/pinpoint-answer-today-new/data/static-page-metadata.json)
- [data/puzzles/registry.json](/Users/elng/web/pinpoint-answer-today-new/data/puzzles/registry.json)
- [app/(site)/(home)/page.tsx](/Users/elng/web/pinpoint-answer-today-new/app/(site)/(home)/page.tsx)
- [components/home/HomeHero.tsx](/Users/elng/web/pinpoint-answer-today-new/components/home/HomeHero.tsx)
- [components/home/HomeRevealSection.tsx](/Users/elng/web/pinpoint-answer-today-new/components/home/HomeRevealSection.tsx)
- [lib/seo/metadata.ts](/Users/elng/web/pinpoint-answer-today-new/lib/seo/metadata.ts)
- [app/api/revalidate/route.ts](/Users/elng/web/pinpoint-answer-today-new/app/api/revalidate/route.ts)

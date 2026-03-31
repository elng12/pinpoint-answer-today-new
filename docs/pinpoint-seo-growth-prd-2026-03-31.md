# Pinpoint SEO 增长 PRD（2026-03-31）

> **文档状态**：⚠️ 待执行确认（归档代码已改待部署；角色级 DRI 已补，开工前需替换为具体姓名）
> **最后更新**：2026-03-31
> **审核人**：核心团队 + 外部 SEO 顾问（两轮终审）
> **注意**：执行前必须先读 §6.5（页面边界）、§9.4（short mode 决策）和 §12.2（风险与硬阈值）

---

## 1. 一句话结论

如果目标是先追平 `https://pinpointanswer.today/`，再逐步超越它，最该做的不是继续补零碎 SEO 小修，而是把站点升级成 **4 层流量结构闭环**：

| 层级 | 页面 | 主要意图 | 现状 |
|------|------|---------|------|
| 分发层 | 首页 | today answer、品牌词 | ✅ 已有，需优化分发 |
| 放量层 | 归档页 `/puzzles` | archive、past answers、puzzle 编号 | ⚠️ 内链覆盖不足 |
| 长尾层 | 详情页 `/linkedin-pinpoint-answers/[slug]` | clue+answer+explanation | ⚠️ 内容模板味重 |
| 常青层 | Preview 页 `/next-pinpoint-preview` | tips、how to solve、patterns | ❌ noindex，内容被浪费 |

技术底座继续保持现有"干净口径"，不为了追量破坏索引信号一致性。

---

## 2. 背景

### 2.1 这份 PRD 解决什么问题

当前站点已经具备一套比对手更干净的技术 SEO 基础，但自然流量增长仍然受限，核心原因不是"技术不够"，而是：

- **页面矩阵不完整**：preview 页 noindex，常青内容被浪费；tips 类词几乎零覆盖
- **归档页内链覆盖不足**：首屏仅 24 条 HTML 链接，700+ 历史题目对 Google 基本不可见
- **详情页内容同质化**：验收通过但没有差异化；模板味过重，无法拉开与对手的差距
- **sitemap/noindex 口径打架**：法律页同时在 sitemap + noindex，信号矛盾
- **策略已定但未落地**：文档里多轮确认的方向，实际代码仍未实施

这导致 Google 更容易把站点理解成"一个当天答案站"，而不是"有今天答案、历史归档、解题知识和可信编辑流程的完整内容站"。

### 2.2 对手站分析（抽样时间：2026-03-31）

**参考 URL：**

- 首页：<https://pinpointanswer.today/>
- `robots.txt`：<https://pinpointanswer.today/robots.txt>
- `sitemap.xml`：<https://pinpointanswer.today/sitemap.xml>
- 归档页：<https://pinpointanswer.today/linkedin-pinpoint-answer/>
- 预览页：<https://pinpointanswer.today/next-pinpoint-preview/>
- 详情页：<https://pinpointanswer.today/linkedin-pinpoint-answer/pinpoint-485/>

**对手关键优势（已验证）：**

| 维度 | 对手做法 | 我们现状 |
|------|---------|---------|
| 归档页 | **全量渲染 240+ 条历史记录**（纯 HTML，无 Load More） | 首屏 24 条，其余客户端加载 |
| Preview 页 | tips + patterns 全量 indexable，导航入口叫 "Pro Tips" | noindex，内容被浪费 |
| 详情页 | 解释型文章结构，答案后置 | 答案工具页结构 |
| 内链密度 | 导航、页脚、CTA 形成完整闭环 | 存在重复 label，入口不清晰 |

**对手明显不如我们的点（不要模仿）：**

- Schema.org 数据不完整（缺 `dateModified`、`publisher`）
- `sitemap` 口径较粗放
- 内容质检机制弱

---

## 3. 当前项目现状

### 3.1 已有技术优势（不动）

| 功能 | 关键文件 | 状态 |
|------|---------|------|
| canonical + www→apex + 尾斜杠一致性 | `middleware.ts`, `lib/seo/metadata.ts`, `next.config.ts` | ✅ |
| 公开站点只读正式内容，屏蔽 live fallback | `lib/puzzles/data/public.ts` | ✅ |
| 发布中时 503 + Retry-After + noindex | `app/(site)/pinpoint/today/route.ts` | ✅ |
| 详情页 ISR（86400s）+ On-Demand Revalidation | `app/(detail)/linkedin-pinpoint-answers/[slug]/page.tsx:29` | ✅ |
| 首页 ISR（86400s） | `app/(site)/(home)/page.tsx:23` | ✅ |
| 详情页 Schema.org（Article + QAPage + BreadcrumbList） | `app/(detail)/linkedin-pinpoint-answers/[slug]/page.tsx:99-232` | ✅ |
| Schema 已含 `author`、`datePublished`、`dateModified`、`publisher` | 同上，第 106-120 行 | ✅ |
| On-Demand Revalidation API | `app/api/revalidate/route.ts`，覆盖 `/`、`/puzzles`、`/pinpoint/today`、`/next-pinpoint-preview` | ✅ |
| IndexNow 支持 | `app/api/revalidate/route.ts:6-22` | ✅ |

### 3.2 当前最影响增长的问题（优先级排序）

#### P0：立即损害 SEO 信号

**① sitemap 与 noindex 口径打架**

同时出现在 sitemap 且输出 `noIndex: true` 的页面：

| 文件 | noIndex 位置 | 是否在 sitemap（`app/sitemap.ts`） |
|------|------------|----------------------------------|
| `app/(site)/privacy/page.tsx` | `generateMetadata` 第 12 行 | ✅ 在 legalRoutes |
| `app/(site)/terms/page.tsx` | `generateMetadata` 第 12 行 | ✅ 在 legalRoutes |
| `app/(site)/disclaimer/page.tsx` | `generateMetadata` 第 12 行 | ✅ 在 legalRoutes |
| `app/(site)/contact-us/page.tsx` | `generateMetadata` 第 14 行 | ✅ 在 legalRoutes |

**② Preview 页 noindex，内容被浪费**

`app/(site)/next-pinpoint-preview/page.tsx` 包含：
- 10 个内容模块，共约 696 行代码
- 覆盖：tips、patterns、glossary、FAQ、playbook
- 比对手 preview 页更丰富，但 `noIndex: true`，Google 完全看不到

**③ 归档页全量 HTML 内链缺失（代码已改，待部署）**

- 原来：`INITIAL_ARCHIVE_LIMIT = 24`，只有 24 个详情页链接在 HTML 中
- 现状：代码截断逻辑已删除（2026-03-31），**尚未推送生产，待 Phase 1 部署**
- `puzzles/page.tsx` 已修复，添加了 `export const revalidate = 86400`

**④ 归档页 ISR 漏配（代码已改，待部署）**

- 首页、详情页均有 `export const revalidate = 86400`
- 归档页之前没有，全量渲染后每次请求都会实时扫一遍 700 条数据
- **代码层已修复**：`app/(site)/puzzles/page.tsx` 第 16 行加入 `export const revalidate = 86400`，**待推送生产**

#### P1：制约增长上限

**⑤ 导航/页脚入口重复+label 不统一**

- `NavBar.tsx`：同一 URL 出现 "Next puzzle" 和 "Pro Tips" 两个入口
- `Footer.tsx`：同一 URL 出现 "Next puzzle" 和 "Next Preview" 两个入口
- 结论：Google 通过内链判断页面主题时，会看到混乱信号

**⑥ 详情页 visible 可信信号偏弱**

`components/detail/PuzzleDetail.tsx` 当前有：
- ✅ `Published on ${date}`（第 94 行）
- ✅ `verificationLabel`（"Verified by Human Editor" 或 auto，第 92 行）
- ❌ `Updated on` 字段——数据层有 `puzzle.updatedAt`，但视觉层未展示
- ❌ 具体作者名/byline——只有"Verified by"标签，无具体编辑署名

---

## 4. 目标

### 4.1 业务目标

- 将站点从"today answer 工具页集合"升级为"today + archive + tips + explanation"的完整内容矩阵
- 在不破坏现有索引口径的前提下，扩大可收录页面的长尾覆盖面
- 让首页 → 归档页 → 详情页 → Preview 页形成明确的导流闭环

### 4.2 SEO 目标（按优先级）

1. **开放 Preview 页收录**：承接 `linkedin pinpoint tips`、`how to solve linkedin pinpoint`、`common pinpoint answer patterns` 类常青词
2. **归档页全量 HTML 内链**：让 Google 能通过一个页面发现 700+ 历史详情页（已完成代码修改）
3. **统一 sitemap/noindex/robots/内链口径**：消除矛盾信号
4. **提升详情页 clue+explanation 长尾覆盖**：让旧题也能稳定获得流量

### 4.3 内容目标

- 每篇详情页至少包含 2-3 个 clue-specific 的非显然解释点
- 最近 20-30 篇高价值旧文完成去模板味回填
- 建立"重复度"和"空信息"双重守门机制

### 4.4 非目标（明确不做）

- 不大改视觉风格
- 不继续扩张 schema 类型（现有已足够）——** Schema 层已有 `author`、`datePublished`、`dateModified`、`publisher`，无需补新字段**
- 不放开 live fallback 换取"更快上线"
- 不新建独立技巧页（preview 页内容已足够丰富，避免站内竞争）
- 不做 URL 分页（全量 SSR 优于分页，对手已验证）

---

## 5. 核心产品原则

### 5.1 保留干净口径

现有 canonical、redirect、public formal only、publishing placeholder 这些底座不动。追量不能以索引信号混乱为代价。

### 5.2 页面职责清晰（允许合理复合）

Preview 页同时承担"技巧常青内容"和"当前题目导流"是可接受的合理复合——对手已验证此策略有效。

**不可接受的**：站内两个页面争抢同一批关键词（如同时存在 preview 页和独立技巧页）。

### 5.3 正式可收录页必须值得被长期留在索引里

决定页面是否值得收录的核心：

- 页面是否明显回答了一个搜索意图
- 页面是否有真实解释价值（不是模板填空）
- 页面是否与站内其他页形成清晰分工

### 5.4 内容工作流要从"拦坏稿"升级到"拦空稿"

旧标准：错、脏、薄、重复句式。
新标准增加：**没有新信息、没有 clue-specific 解释价值**。

---

## 6. 新的流量结构

```
用户搜索
    │
    ├─ "pinpoint answer today" / "pinpoint #NNN"
    │         └→ 首页（今日答案）→ reveal → Archive / Tips CTA
    │
    ├─ "pinpoint archive" / "pinpoint #600 answer"
    │         └→ 归档页 → 详情页入口（全量 HTML 内链，700+ 条）
    │
    ├─ "linkedin pinpoint clue1 clue2 answer"
    │         └→ 详情页（长尾词，解释型文章）
    │
    └─ "how to solve linkedin pinpoint" / "pinpoint tips"
              └→ Preview 页（tips + patterns + glossary）→ 反哺 Today / Archive
```

### 6.1 首页：分发层

**目标意图**：`today answer`、品牌词  
**核心分发出口**：Today → Archive → Tips（三向等权重）

首页保留 preview 页入口，但不作为"唯一"出口，需与 Archive 同等突出。

### 6.2 归档页：放量层

**目标意图**：`archive`、`past answers`、`puzzle number`、`old clue lookup`

归档页要从"可搜索列表页"升级为"搜索引擎可理解的流量仓"。

**关键改变**（已执行）：
- 全量服务端渲染所有 700+ 历史题目卡片（PHP 级打法，暴力有效）
- 客户端搜索/筛选只控制 DOM 显隐，不影响 HTML 中的链接结构
- On-Demand ISR：每日发布后由 `/api/revalidate` 触发刷新

### 6.3 详情页：长尾层

**目标意图**：`pinpoint NNN answer`、`clue1 clue2 clue3 answer`、`why this answer`、`how each clue fits`

详情页要更像解释型文章，而不是通用答案模板。

### 6.4 Preview 页：常青层

**目标意图**：`linkedin pinpoint tips`、`how to solve linkedin pinpoint`、`common pinpoint answer patterns`、`pinpoint clue types`

内容已包含 10 个模块（696 行），比对手更丰富，无需新建页面。

### 6.5 页面边界与关键词归属表

> 这张表用于避免站内自己和自己抢词。执行时，标题、H1、首屏文案、导航 label、CTA 锚文本都要服从此表。

| 页面 | 主要用户 | 主意图 / 主词 | 首要动作 | 可以承接的辅词 | 禁抢词 / 禁止写法 |
|------|---------|--------------|---------|---------------|------------------|
| 首页 `/` | 当天就想拿答案的即时用户；搜品牌词回站的用户 | `linkedin pinpoint answer today`、品牌词 | 打开当天详情页；次要分发到 Archive / Tips | `today clues`、`today hints` | 不把 `tips` / `patterns` / `archive` 写成首页 title 或 H1 主轴；不让首页承担通用教程页角色 |
| 归档页 `/puzzles` | 查旧题、记得题号、想快速回看历史题的人 | `linkedin pinpoint archive`、`pinpoint past answers`、`pinpoint #NNN archive` | 打开某一题详情页 | `old clue lookup`、`past puzzles` | 不把 `today answer` 写成主标题；不把 `tips/how to solve` 写成归档页核心承诺 |
| 详情页 `/linkedin-pinpoint-answers/[slug]` | 已知题号或线索组合，想确认答案并看解释的人 | `linkedin pinpoint #NNN answer`、`clue + answer + explanation` | 展开答案并继续看分析 | `why this answer`、`how each clue fits` | 不把自己写成“全站归档入口”或“通用技巧页”；不抢 `archive`、`tips` 这类 hub 词 |
| Preview 页 `/next-pinpoint-preview` | 等明天题、想学方法、还没进入具体某题的人 | `linkedin pinpoint tips`、`how to solve linkedin pinpoint`、`pinpoint answer patterns` | 先看技巧内容，再分发到 Today / Archive | `clue types`、`glossary`、`common patterns` | 不把 `pinpoint #NNN answer`、`today answer` 写成 title/H1 主词；不直接承诺“今日答案页” |

### 6.6 内链锚文本统一规则

- 指向 Preview 页的导航/页脚入口统一叫 `Pro Tips`，不要再混用 `Next puzzle`、`Next Preview`
- 指向归档页的主入口统一优先使用 `Archive`、`Full Archive`、`Past Answers`
- 指向当天详情页的入口统一使用 `Today's Answer` 或 `LinkedIn Pinpoint #NNN Answer`
- 同一 URL 在同一导航层级里只保留一个主 label，避免 Google 从站内链接读到混乱主题

---

## 7. 方案总览

### 7.1 方案 A（已采纳）：开放 Preview 页为 indexable

**决策依据**：对手 `pinpointanswer.today/next-pinpoint-preview/` 已开放收录，且是其 Pro Tips 导航入口。我们的 preview 页内容比对手更丰富，现在唯一缺的就是去掉 noindex。

**需要做的事（按顺序执行）**：

1. **第一步（必须先做）**：修改 preview 页 title 标签
   - 文件：`app/(site)/next-pinpoint-preview/page.tsx`
   - 当前 title 含 "Coming Soon"，必须在开放收录前改掉
   - 新 title 示例：`LinkedIn Pinpoint Tips & Patterns – Next Pinpoint Preview`
   - 确保含 `tips`、`patterns`、`how to solve` 等关键词

2. **第二步**：删除 noIndex
   - 文件：`app/(site)/next-pinpoint-preview/page.tsx`
   - 删除 `generateMetadata` 中的 `robots: { index: false }` 或 `noIndex: true`

3. **第三步**：将 preview 页加入 sitemap
   - 文件：`app/sitemap.ts`
   - 在 `primaryRoutes` 或独立的路由组中加入 `/next-pinpoint-preview`

4. **验证**：部署后检查
   - ⚠️ **注意**：本项目使用 Next.js `metadata.robots` 字段，输出的是 HTML `<meta name="robots">` 标签，**不是** HTTP 响应头。`curl -I` 无法验证 noindex 状态。
   - **正确验证方式**：`curl -s https://pinpointanswertoday.app/next-pinpoint-preview/ | grep -i 'name="robots"'`，确认 content 不含 `noindex`
   - 访问 `https://pinpointanswertoday.app/sitemap.xml` 确认 preview URL 存在

### 7.2 方案 B（已放弃）：新建独立技巧页

~~建议新增可收录页面~~ → **不采纳**。原因：
- 对手未验证此策略
- 与 preview 页内容高度重叠，造成站内关键词竞争
- 违反 KISS 原则：去掉一行代码可解决的事

### 7.3 方案 C：首页重构为更强分发页

**现有首页结构**（保留，调整优先级）：

```
HomeHero         → 今日答案（保留，不动）
HomeRevealSection → today + yesterday 卡片，第三张卡→ Archive 或 Tips（调整）
HomeRecentAnswers → 最近答案列表（提升可见性）
HomeWhatIs       → 解释模块（保留）
HomeBenefitsFaq  → FAQ（保留）
```

**需要调整**：
- `HomeRevealSection` 第三张卡的 label 和 href：当前指向 preview 但 label 混乱
- 确保 Archive 和 Tips 两个入口在首页都有明显曝光

### 7.4 方案 D：归档页全量渲染（取代分页）

**决策过程**：
- 方案一（改常量 24→100）：治标不治本
- 方案二（URL 分页 `/puzzles/page/2`）：工程量大，且破坏现有搜索 UX
- **方案四（全量 SSR）**：一行代码，对手已验证，采纳 ✅

**对手做法（已核实）**：归档页 HTML 771 行，从 #700 到 #458 全部渲染，包含题号、所有 clue、答案和日期，纯 HTML，无 Load More。

**我方实施**（已完成代码修改）：

```diff
// app/(site)/puzzles/page.tsx

- const INITIAL_ARCHIVE_LIMIT = 24;
- function getInitialArchiveGroups(groups) { /* 截断逻辑 */ }
- const initialGroups = getInitialArchiveGroups(groups);
+ export const revalidate = 86400;   // 新增：对齐首页和详情页 ISR 策略
+ const initialGroups = groups;      // 全量：所有月份分组直接传给组件
```

**注意事项**：
- `searchParams` 的读取不影响服务端全量 HTML 输出——Googlebot 命中 `/puzzles`（无 `?q=`）时看到全部 700+ 链接
- 客户端 `ArchiveExplorer` 的搜索/筛选只是控制 DOM 显隐，不增删 HTML 链接
- On-Demand Revalidation 已覆盖 `/puzzles`（`app/api/revalidate/route.ts:100`）

### 7.5 方案 E：详情页升级为可信解释页

**现有基础**：
- Schema.org 已含 `author`、`datePublished`、`dateModified`、`publisher`（代码第 106-120 行）
- `Published on` 已显示
- `verificationLabel`（"Verified by Human Editor" or "Auto-generated"）已显示

**待补充**：

| 信号 | 位置 | 优先级 | 实现方式 |
|------|------|-------|---------|
| `Updated on` 可见 | `PuzzleDetail.tsx` | P1 | `puzzle.updatedAt` 已在 Schema，补到 UI 层 |
| 具体 byline 署名 | `PuzzleDetail.tsx` | P2 | 如"Reviewed by Pinpoint Answer Today Editorial Team" |
| "How we verify" 链接 | `PuzzleDetail.tsx` | P2 | 链接至 about-us 页面的验证说明章节 |
| 悬念型导语 | `buildDetailSummary()` | P1 | **已部分实现**，确认不前置答案 |

**Opening paragraph 原则**（关键）：

> 悬念导语应该**不直接揭示答案**，而是：
> - 描述题目的挑战性（"Five clues that seem to point everywhere at once"）
> - 给出解题价值承诺（"This guide walks through each clue, the turning point, and exactly why X fits"）
> - 引导用户继续向下滚动

反例（不要做）：`"The answer to Pinpoint #700 is Types of interviews. Here's why..."`

### 7.6 方案 F：信任页口径统一

**最终口径决策**：

| 页面 | noIndex | sitemap | 理由 |
|------|---------|---------|------|
| `privacy` | ❌ 去掉 | ✅ 保留 | E-E-A-T 信任信号 |
| `terms` | ❌ 去掉 | ✅ 保留 | E-E-A-T 信任信号 |
| `disclaimer` | ❌ 去掉 | ✅ 保留 | E-E-A-T 信任信号 |
| `contact-us` | ✅ 保留 noIndex | ❌ 从 sitemap 移除 | 功能支持页，不承担搜索意图 |
| `about-us` | ❌ 不加 noIndex | ✅ 保留 | 升级为编辑政策+验证流程页 |

---

## 8. 页面级详细需求

### 8.1 首页 PRD

#### 页面目标

- 主词：`linkedin pinpoint answer today`、`pinpoint answer`
- 核心分发：Today Answer → Archive → Tips（三向等权导流）
- 让 Google 理解站点有多个内容维度，不只是当天答案

#### 导航入口改造（具体改法）

**NavBar.tsx 当前状态（问题）：**
```
"Next puzzle"  → routes.preview   // 重复！
"Pro Tips"     → routes.preview   // 重复！
```

**NavBar.tsx 目标状态：**
```
"Pro Tips"     → routes.preview   // 保留一个，统一用此 label
```

**Footer.tsx 当前状态（问题）：**
```
"Next puzzle"  → routes.preview   // 重复！
"Next Preview" → routes.preview   // 重复！
```

**Footer.tsx 目标状态：**
```
"Pro Tips"     → routes.preview   // 保留一个，label 与 NavBar 统一
```

#### HomeRevealSection 改造

**当前**：第三张卡 label 为 `"Tomorrow's preview (Puzzle ${preview.number})"` → 指向 preview，侧重"明天"的概念

**目标**：第三张卡调整为指向 Archive 或把 preview 卡的 label 改为 "Pro Tips & Next Puzzle" 降低"Coming Soon"的感知

#### 页面结构（不变）

1. 今日答案 Hero（`HomeHero`）
2. 今日 reveal 与 hints（`HomeRevealSection`）
3. 最近答案列表（`HomeRecentAnswers`）—— 提升可见性
4. 解题说明模块（`HomeWhatIs`）
5. FAQ（`HomeBenefitsFaq`）

#### 影响文件

- `components/layout/NavBar.tsx`
- `components/layout/Footer.tsx`
- `components/home/HomeRevealSection.tsx`

#### 验收标准

- [ ] NavBar 中 preview 入口只有一个，label 为 "Pro Tips"
- [ ] Footer 中 preview 入口只有一个，label 与 NavBar 一致
- [ ] 首页有清晰可见的 Archive 入口（与 Tips 入口同等级别）
- [ ] 首页至少包含一组最近答案内链（≥5 条）

---

### 8.2 Preview 页 PRD（升级为可收录的技巧+归档复合页）

#### 页面目标

- 主词：`linkedin pinpoint tips`、`how to solve linkedin pinpoint`、`pinpoint answer patterns`
- 角色：常青知识中枢 + 当前题目入口
- 反哺：为首页、归档页、详情页导流

#### 现有内容模块（结构不变）

| 组件 | 内容 | SEO 价值 |
|------|------|---------|
| `PreviewHero` | 当前题目入口 | 动态，每日更新 |
| `PreviewValueProps` | 站点价值主张 | 品牌词、信任信号 |
| `PreviewQuickLinks` | 最近 6 条题目链接 | 内链 |
| `PreviewCountdown` | 倒计时 | UX |
| `PreviewHowItWorks` | 玩法说明 | `how to play pinpoint` |
| `PreviewCommonPatterns` | 6 种题型攻略 | `common pinpoint patterns` |
| `PreviewPlaybook` | 解题心法 | `how to solve pinpoint` |
| `PreviewTipLibrary` | 技巧库 | `pinpoint tips` |
| `PreviewGlossary` | 术语表 | `pinpoint glossary` |
| `PreviewFaq` | FAQ | 结构化问答 |

#### 具体修改（app/(site)/next-pinpoint-preview/page.tsx）

**Step 1 - 修改 title**（必须先做，在删 noindex 之前）：

```typescript
// 当前（有问题）：
title: `LinkedIn Pinpoint ${puzzleLabel} Preview — Coming Soon`

// 目标：
title: `LinkedIn Pinpoint Tips, Patterns & Next Puzzle Preview`
// 或：
title: `How to Solve LinkedIn Pinpoint – Pro Tips & Clue Patterns`
```

**Step 2 - 删除 noIndex**：

```diff
- robots: {
-   index: false,
- },
```

**Step 3 - 补充 description（如果当前较弱）**：

```typescript
description: "Master LinkedIn Pinpoint with pro tips, common answer patterns, a full glossary, and a preview of tomorrow's puzzle. Updated daily."
```

#### 将 preview 页加入 sitemap（app/sitemap.ts）

```typescript
// 在 primaryRoutes 或新的 tipsRoutes 中加入：
{
  url: absoluteUrl(routes.preview),
  lastModified: new Date().toISOString(),
  changeFrequency: 'daily',
  priority: 0.8,
}
```

#### 验收标准

- [ ] `curl -s https://pinpointanswertoday.app/next-pinpoint-preview/ | grep -i 'name="robots"'` 确认 content **不含** `noindex`（⚠️ 不要用 `curl -I`，实现是 HTML meta 标签而非响应头）
- [ ] `curl -s https://pinpointanswertoday.app/sitemap.xml | grep 'next-pinpoint-preview'` 返回非空
- [ ] `curl -s https://pinpointanswertoday.app/next-pinpoint-preview/ | grep '<title>'` 包含 `tips` 或 `patterns`，不含 `Coming Soon`
- [ ] 导航中保留指向 preview 的入口

---

### 8.3 归档页 PRD

#### 页面目标

- 主词：`linkedin pinpoint archive`、`pinpoint past answers`、`pinpoint #NNN answer`
- 角色：旧题入口仓，PageRank 下发给所有历史详情页

#### 已完成的代码修改（2026-03-31）

```typescript
// app/(site)/puzzles/page.tsx

// ✅ 已加：ISR 配置
export const revalidate = 86400;

// ✅ 已删：24 条截断逻辑
// - const INITIAL_ARCHIVE_LIMIT = 24;
// - function getInitialArchiveGroups(...) { ... }

// ✅ 已改：直接用全量 groups
const initialGroups = groups;
```

#### 架构说明（重要）

```
服务端（每 24h 或 On-Demand 刷新）
  └ getArchiveEntriesGrouped()
        └ 所有月份分组 → 传给 ArchiveExplorer 作为 initialGroups
              └ 全量 HTML 输出到客户端（700+ <a href> 链接）

客户端（实时）
  └ ArchiveExplorer（useMemeo 搜索过滤）
        └ 只控制 DOM 显隐，不会减少 HTML 中的 <a> 链接数量
        └ Load More 按钮仍存在，但对 Googlebot 无意义（已不需要）
```

#### On-Demand 缓存刷新（已覆盖）

`app/api/revalidate/route.ts` 第 100 行已有：

```typescript
revalidatePath("/puzzles");
```

每日新题发布后，Cloudflare Worker 调用此 API → 归档页缓存自动刷新。

#### 页面结构建议

1. Archive header（`ArchiveHeader`）
2. **全量服务端卡片组**（无条数限制，全部 HTML 输出）
3. 客户端搜索/筛选（`ArchiveExplorer`，控制显隐）
4. 各卡片包含：题号、标题、分组月份标签、clue 摘要、答案
5. 归档页底部或侧边：指向 Today 和 Tips 的 CTA

#### 验收标准

- [ ] `curl -s https://pinpointanswertoday.app/puzzles/ | grep -c 'href.*linkedin-pinpoint-answers'` 返回 700+
- [ ] 页面不含 `INITIAL_ARCHIVE_LIMIT` 常量
- [ ] `export const revalidate = 86400` 存在
- [ ] 归档页有链接指向 Today 和 Tips

---

### 8.4 详情页 PRD

#### 页面目标

- 主词：`linkedin pinpoint #NNN answer`、clue 组合查询
- 角色：长尾词主承接页，解释型文章
- 额外任务：通过 visible 信号增强 E-E-A-T

#### 现有基础（已完成，无需重做）

| 信号 | 位置 | 状态 |
|------|------|------|
| Schema `author` | `page.tsx:109-113` | ✅ 已有 |
| Schema `datePublished` | `page.tsx:107` | ✅ 已有 |
| Schema `dateModified` | `page.tsx:106` | ✅ 已有（`puzzle.updatedAt`） |
| Schema `publisher` | `page.tsx:114-120` | ✅ 已有 |
| Breadcrumb | `PuzzleDetail.tsx` | ✅ 已有 |
| `Published on` 显示 | `PuzzleDetail.tsx:94` | ✅ 已有 |
| verification label | `PuzzleDetail.tsx:92` | ✅ 已有 |
| ISR 86400s | `page.tsx:29` | ✅ 已有 |

#### 待补充的 visible 信号

**① Updated on 时间（P1）**

```tsx
// components/detail/PuzzleDetail.tsx
// 在 Published on 下方加一行：
{puzzle.updatedAt && puzzle.updatedAt !== `${puzzle.isoDate}T00:00:00Z` && (
  <p className="legacy-detail-updated">
    {`Updated on ${formatLegacyDate(puzzle.updatedAt.split('T')[0])}`}
  </p>
)}
```

**② 编辑链接（P2）**

```tsx
// 在 verificationLabel 后加链接
<Link href="/about-us#editorial-process" className="legacy-detail-verify-link">
  How we verify →
</Link>
```

#### Opening Paragraph 规范

`buildDetailSummary()` 函数（`PuzzleDetail.tsx:30-55`）的输出必须符合以下原则：

| ✅ 良好 | ❌ 禁止 |
|--------|--------|
| "Five clues that seem unrelated until one word clicks into place" | "The answer is Types of interviews." |
| "This guide walks through the turning point and why X fits all five clues" | "Pinpoint #700 answer: Types of interviews. Here's why each clue works." |
| "Scroll down for spoiler-safe hints before the full reveal" | 在导语位置直接给出答案 |

#### 页面内链要求

详情页底部/侧边栏必须包含：
- `adjacentPrev` / `adjacentNext` 上一题/下一题（已有）
- `recentPuzzles` 最近题目列表（已有）
- Archive CTA（链接到归档页，已有）
- Tips CTA（链接到 preview 页）—— **当前有，但 label 尚未统一**

#### 埋点要求（Phase 2）

为了验证"导语悬念化/答案后置"效果，需在以下节点加 GA4 埋点：

```typescript
// components/detail/PuzzleAnswerReveal.tsx
// 用户点击展开答案时触发：
trackClientEvent('answer_revealed', {
  puzzle_number: puzzleNumber,
  scroll_depth_percent: window.scrollY / document.body.scrollHeight * 100,
})
```

#### 验收标准

- [ ] 页面头部可见 `Published on` + （如有）`Updated on`
- [ ] opening paragraph 不在第一句话中出现答案
- [ ] 每页 ≥2 个 clue-specific 解释点
- [ ] 详情页有指向 preview/tips 页的内链
- [ ] GA4 埋点方案有具体实现排期

---

### 8.5 About / Legal / Contact PRD

#### 页面目标

- 完成信任层分工，作为 E-E-A-T 锚点
- 消除 sitemap/noindex 矛盾信号

#### 具体修改清单

**① 去掉法律页的 noIndex（privacy、terms、disclaimer）**

```diff
// app/(site)/privacy/page.tsx
// app/(site)/terms/page.tsx
// app/(site)/disclaimer/page.tsx

- robots: {
-   index: false,
- },
// 删掉这段，不加替换（默认 indexable）
```

**② contact-us 从 sitemap 移除**

```diff
// app/sitemap.ts

const legalRoutes = [
  routes.privacy,
  routes.terms,
  routes.disclaimer,
  routes.about,
- routes.contact, // 删掉
];
```

contact-us 页面保留 `noIndex: true`，继续存在但不进 sitemap。

**③ about-us 升级为编辑政策页**

`app/(site)/about-us/page.tsx` 需要新增以下章节（可用 id 供内链锚点 `#editorial-process`）：

```markdown
## Our Editorial Process  {#editorial-process}

Each Pinpoint answer page is a combination of:
1. **Live puzzle data**: clues and answers are pulled directly from the LinkedIn Pinpoint game API.
2. **Human editorial review**: analysis, turning points, and explanations are written and verified by our editorial team.
3. **Automated quality checks**: scripts validate data integrity before publication.

Pages marked "Verified by Human Editor" have been reviewed by a member of our team.
Pages marked "Auto-generated quick guide" are algorithmically generated from live puzzle data and may not include extended analysis.

## Corrections Policy

If you spot an error, please contact us via the contact page. Corrections are applied within 24 hours and the page's "Updated on" date is refreshed.
```

#### 验收标准

- [ ] `privacy`、`terms`、`disclaimer` 三页删掉 `noIndex: true` 后重新部署
- [ ] `sitemap.xml` 中不含 `contact` URL
- [ ] `about-us` 页面包含 `#editorial-process` 锚点章节
- [ ] 详情页的 "How we verify →" 链接指向 `/about-us#editorial-process`

---

## 9. 内容工作流 PRD

### 9.1 当前工作流能拦住的问题

`scripts/validate-data.mjs` 当前覆盖：

- ✅ HTML 残留（标签、转义字符）
- ✅ 旧模板短语（特定词语黑名单）
- ✅ 正文字数过低
- ✅ hint 与 clue 不对齐

### 9.2 当前工作流无法识别的问题

| 问题类型 | 症状 | 为什么脚本无法拦 |
|---------|------|----------------|
| "空稿" | turning point 写的是显然结论，没有 puzzle-specific 洞察 | 需要语义理解 |
| 同质化 | 最近 30 篇 FAQ 结构/措辞几乎一样 | 相似度比较需要 embedding |
| 意图错配 | FAQ 回答的是"常识"，不是用户实际搜索的 long-tail 问题 | 需要 GSC 数据参照 |
| 无 turning clue | 解释了"什么是答案"但没解释"哪个线索是破局关键" | 需要语义评估 |

### 9.3 新增工作流要求

#### A. 重复度 Guardrail（Phase 3）

**短期（人工）**：每周随机抽取最近 5 篇，比对 FAQ 结构、lesson 模块、turning point 段落是否过于相似。

**长期（自动化）**：

```bash
# 伪代码方向：
# 1. 对每篇的 FAQ、lesson、turning point 字段做 embedding
# 2. 与最近 30 篇历史做余弦相似度计算
# 3. 超过阈值（如 0.85）触发软告警
node scripts/check-similarity.mjs --new-slug pinpoint-answer-700 --compare-recent 30
```

#### B. 内容价值抽检 Checklist（Phase 1 起人工执行）

每日发布后，对当天文章执行以下检查（5 分钟内可完成）：

```markdown
## 内容价值抽检 Checklist

### 基础完整性
- [ ] turning point 段落存在且具体（不只是"因为这个词符合所有线索"）
- [ ] 至少 2 个 clue 有 clue-specific 的非显然解释
- [ ] "why not other answers" 存在且举了具体反例

### FAQ 质量
- [ ] 至少 1 个 FAQ 问题对应真实搜索意图（参考 GSC top queries for 近期题目）
- [ ] FAQ 答案不是通用模板，有本题独有的信息

### 导语规范
- [ ] opening paragraph 不含答案词
- [ ] opening paragraph 长度 ≥ 2 句，≤ 5 句
- [ ] 有明确的"继续阅读"动机

### 内链
- [ ] 详情页底部有 Archive 和 Tips 两个出口
```

#### C. 样本回归固定化（Phase 2）

改动以下模块时必须跑回归：
- FAQ 生成规则变更
- `clueRows` / `solvePath` / `turningPoint` 字段变更
- `obvious` / `phrase` / `category` / `hybrid` 题型的写法规则变更

回归方式：从已有题库中选取各题型 2-3 个代表样本，确认新规则不让它们退步。

#### D. LLM 质检（Phase 3，自动化）

当人工抽检规则稳定后，可接入 LLM API 做批量评分：

```typescript
// 伪代码
const prompt = `
  You are a content quality checker for a puzzle answer site.
  Given this article about Pinpoint #${number}:
  - Does the turning_point explain WHY this specific clue is the key? (yes/no + reason)
  - Is the FAQ answering real search queries, or generic placeholders? (score 1-5)
  - Is the opening paragraph spoiler-free and engaging? (yes/no)
  
  Article content: ${articleContent}
`;
// 使用 Gemini Flash / GPT-4o-mini，成本 < $0.01/篇
```

#### E. 高价值旧文回填（Phase 3）

**选文标准**（按以下顺序优先）：
1. GSC 排名在第 2-10 位但 CTR 偏低的旧题（点击/展示比低于平均）
2. 最近 90 天内有搜索展示但点击率 < 2% 的题目
3. 数字题型（有明显类别感，如"乐器"、"颜色"）

**回填内容标准**：
- turning point 段落具体化
- 加 "why not other answers" if missing
- FAQ 至少 1 条对应真实 search query

#### F. 发布后抽检执行机制（Phase 1 起）

> Checklist 不是“看心情执行”的建议项，而是发布流程的一部分。下面这张表定义谁看、什么时候看、没过怎么处理。

| 场景 | 必检范围 | DRI | 时限 | 未通过时的处理 |
|------|---------|-----|------|---------------|
| 每日正常发布 | 当天 live 题详情页 1 篇 | 内容 DRI | 发布后 4 小时内 | P0 factual error 当天修复并重新触发 revalidate；P1 内容空洞 24 小时内补齐 |
| 改了 FAQ / prompt / 模板 | 当天 live 题 + 最近 2 篇代表旧题 | 内容系统 DRI | 同日 | 任一代表样本退步则回滚规则或暂停继续发布 |
| 改了详情页渲染 / CTA / 导语 | 当天 live 题 + 最近 2 篇旧题 | 工程 DRI | 上线当日 | UI/内链回归不通过则立即修复；必要时回滚前端改动 |
| 周度复盘 | 最近 5 篇 + GSC 新增查询样本 | SEO / 增长 DRI | 每周一次 | 把高价值旧文回填候选加入 Phase 3 backlog |

- 抽检记录统一沉淀到 `docs/content-qa-checklist.md` 或等价表格，不允许只在聊天里口头确认
- P0 问题定义：答案错误、线索解释反向、FAQ 与正文冲突、noindex / sitemap 口径错误
- P1 问题定义：缺 turning point、FAQ 明显模板味、导语提前剧透答案、缺 Archive / Tips 出口
- 如果一周内连续 2 次抽检出现同类 P1 问题，暂停继续放量，先修生成规则或模板

### 9.4 `short mode` 口径决策（P0 阻塞项，**已结论**）

**结论：发布脚本已经做出了决策，PRD 现在跟进统一。**

`release-production.mjs` 第 258-262 行已有硬性拦截：

```js
if (bodyMode === "short") {
  throw new Error(
    `... Production release only allows formal full detail pages.`
  );
}
```

这意味着 **选项 B 已经在代码层生效**：`short mode` 不允许进生产。PRD 现统一跟进此决策：

- ✅ **已决定（选项 B）**：`short mode` 仅作为本地调试/暂存态，**不允许作为正式发布内容**上线
- `short mode` 内容必须在发布前完成升级为 `full mode`，否则 release 脚本会在本地 preflight 阶段报错并终止
- 生成器和内容工作流文档需同步此约束：生成 `short mode` 是可以的，但发布前必须转化
- **不需要**为 `short mode` 单独建立内容质检标准（因为它不会出现在生产）

> ⚠️ **执行注意**：如果当前 registry 中有 `bodyMode=short` 的 live 题目，发布脚本会在本地 preflight 阶段就报错并终止，需先将其升级为 full mode 再发布。

---

## 10. 成功指标

> **前置条件**：Scroll Depth 和内链 attribution 类指标依赖 GA4 埋点，而 GA4 埋点是 Phase 2 的待做项（§11 Phase 2 ⑤）。**Phase 1 阶段主要看 GSC 数据**，不要在埋点未上线前把 GA4 指标纳入周报。

### 10.1 站点级指标（Google Search Console）

> **基准待填**：下表基准列需在首次部署后 7 天内从 GSC 实际导出填入，不允许保留"当前值"空占位上线汇报。

| 指标 | 基准（待填） | 4 周目标 | 8 周目标 | 数据来源 |
|------|------------|---------|---------|--------|
| 总 impressions | — | +20% | +50% | GSC 效果 - 查询 |
| 流量来源集中度（today 词占比） | — | 下降 5pp | 下降 15pp | GSC 效果 - 按查询分组 |
| archive 页 impressions | — | +30% | +100% | GSC 网址 - `/puzzles/` |
| tips/preview 页 impressions | 0（当前 noindex） | 有首批展示 | 稳定榜上有名 | GSC 网址 - preview URL |

### 10.2 指标与归因表

> 此表明确每个指标的事件字段、分组方式和数据来源，供看板搭建和周期复盘使用。

| 指标 | 数据来源 | GA4 事件 / GSC 维度 | 分组方式 | 可用阶段 | 负责人 |
|------|---------|-------------------|---------|---------|-------|
| 总 impressions | GSC | — | 全站汇总 | Phase 1 起 | SEO / 增长 DRI |
| today 词流量占比 | GSC | — | 按 query 过滤含 "today" | Phase 1 起 | SEO / 增长 DRI |
| archive 页 impressions | GSC | — | page = `/puzzles/` | Phase 1 起 | SEO / 增长 DRI |
| preview/tips 页首次收录 | GSC 收录报告 | — | page = `/next-pinpoint-preview/` | Phase 1 开放后 | SEO / 增长 DRI |
| 用户点击展开答案 | GA4 | `answer_revealed` (`puzzle_number`, `scroll_depth_percent`) | 按题号分组 | **Phase 2 埋点上线后** | 数据 / 工程 DRI |
| Scroll Depth 到答案区 | GA4 | `answer_revealed.scroll_depth_percent` | 中位数 > 50% | **Phase 2 埋点上线后** | 数据 / 增长 DRI |
| 旧题通过归档页发现 | GA4 | `page_view` + 自定义 `source_slot=archive` 更稳；临时可看 `page_referrer` | 按 landing_page 分组 | **Phase 2 埋点上线后** | 数据 / 增长 DRI |
| 内容抽检通过率 | 人工 Checklist | — | 月度汇总 | Phase 2 起 | 内容 DRI |

### 10.3 关键改动实验设计

> 这些不是“上线后随便看看”，而是必须带假设、观察窗口和回滚阈值的变更。

| 改动 | 核心假设 | 主观察指标 | 观察窗口 | 回滚 / 暂停条件 | 负责人 |
|------|---------|-----------|---------|----------------|-------|
| Preview 页开放收录 | Preview 能拿到 tips/patterns 曝光，且不明显抢首页主词 | GSC preview impressions；首页 today 词占比 | 上线后 14 / 28 天 | Preview 仍以 `Coming Soon` 片段被收录；或首页主词点击连续 14 天显著下滑且确认被 preview 抢词 | SEO / 增长 DRI |
| 归档页全量 SSR | 归档页成为旧题发现入口，详情页被发现率提升 | `/puzzles/` impressions；详情页被抓取覆盖；TTFB/LCP | 上线后 7 / 14 天 | TTFB、LCP、HTML 体积任一超过 §12.2 硬阈值 | 工程 DRI |
| 首页分发优化 | Archive / Tips 曝光提升，不伤害 today 主路径 | CTA 点击占比；today reveal 点击量 | 上线后 7 / 14 天 | Archive / Tips 点击没起量，且 today 主路径点击显著下滑 | 产品 / 增长 DRI |
| 详情页导语悬念化 | 用户更愿意往下滚并展开答案，旧题 CTR 不恶化 | `answer_revealed`、scroll depth、中高位次页面 CTR | 上线后 14 / 28 天 | answer reveal 率下降明显，或旧题 CTR 连续 28 天恶化 | 内容 / 增长 DRI |

### 10.4 页面级指标目标

**首页**：
- Archive CTA 点击率出现稳定占比（GA4 Phase 2 后可量化）
- Tips CTA 点击率 > 0（之前几乎为 0）

**归档页**：
- 归档页 impressions 提升（GSC，Phase 1 可看）
- 旧题详情页通过归档页发现的比例提升（GA4 attribution，Phase 2 可看）

**Preview/Tips 页**：
- 4 周内获得独立 impressions（GSC，Phase 1 开放后可看）
- 有向 archive 和 detail 的反向导流数据（GA4，Phase 2 可看）

**详情页**：
- `clue + answer + explanation` 类查询词 impressions 提升（GSC，Phase 1 可看）
- Scroll Depth > 50%（**Phase 2 埋点上线后才可量化**）
- 旧题页 CTR 改善（GSC，排名第 3-5 位目标 ~3% -> ~5%，Phase 1 可看）

### 10.5 质量指标

- 每月内容抽检通过率 > 90%（对照 §9.3 Checklist）
- 最近 30 篇重复度告警 < 5 篇触发
- 高价值旧文回填完成数量 >= 20 篇（Phase 3 完成时）
---

## 11. 分阶段执行

### 责任与上线闸门表

> 每个 Phase 的任务必须满足上线闸门条件才能进入下一 Phase。下面先给出角色级 DRI，开工前再替换成具体姓名。

| Phase | 任务 | DRI | 上线闸门（满足才能进入下一 Phase） |
|-------|------|-----|---------------------------------|
| 1 | 归档页部署 | 工程 DRI | `curl /puzzles/` 内含 700+ href，TTFB <= 0.8s |
| 1 | sitemap/noindex 口径统一 | 工程 DRI | privacy/terms/disclaimer meta robots 不含 noindex |
| 1 | Preview title 先行 | SEO / 内容 DRI | title 不含 "Coming Soon" |
| 1 | Preview 页开放收录 | 工程 DRI | sitemap 含 preview URL，meta robots 不含 noindex |
| 1 | 导航 label 统一 | 产品 / SEO DRI | NavBar/Footer preview 入口各只有一个 "Pro Tips" |
| 2 | 详情页可见信号 | 工程 DRI | Updated on 可见 |
| 2 | About 页升级 | 内容 DRI | `#editorial-process` 锚点存在 |
| 2 | GA4 埋点上线 | 数据 / 工程 DRI | GA4 后台可见 `answer_revealed` 事件含 `puzzle_number` |
| 2 | 指标基准填入 §10.1 | SEO / 增长 DRI | §10.1 表格无"—"占位 |
| 3 | 旧文回填 | 内容 DRI | >=20 篇完成，GSC CTR 有数据对照 |
| 3 | 重复度检测 | 内容系统 DRI | 脚本可运行，初版报告已出 |

---

### Phase 1：本周必须做（工期：3-5 天）

**① 归档页全量渲染 + ISR（代码已改，待部署）**

- [x] 删除 `INITIAL_ARCHIVE_LIMIT = 24` 截断逻辑
- [x] 添加 `export const revalidate = 86400`
- [ ] **待部署**：将代码修改推送到生产环境
- [ ] 部署后验证：`curl -s https://pinpointanswertoday.app/puzzles/ | grep -c 'href.*linkedin-pinpoint-answers'` 返回 700+
- [ ] 归档页性能实测：`curl -o /dev/null -s -w "TTFB: %{time_starttransfer}s" https://pinpointanswertoday.app/puzzles/`，TTFB 须 <= 0.8s；超标时回退至 200 条（回退后需重新评估全量内链 SEO 假设）

**② sitemap/noindex 口径统一**

- [ ] `privacy/page.tsx`：删除 `noIndex: true`（或 `robots: { index: false }`）
- [ ] `terms/page.tsx`：同上
- [ ] `disclaimer/page.tsx`：同上
- [ ] `sitemap.ts`：从 `legalRoutes` 中移除 `routes.contact`
- [ ] 验证：`curl -s https://pinpointanswertoday.app/privacy/ | grep -i 'name="robots"'`，确认 content **不含** `noindex`（⚠️ 实现是 HTML meta 标签，不要用 `curl -I`）

**③ Preview 页 title 先行**（必须在删 noIndex 前完成）

- [ ] `next-pinpoint-preview/page.tsx`：修改 `title` 去掉 "Coming Soon"，加入 tips 关键词
- [ ] 验证：`curl -s https://pinpointanswertoday.app/next-pinpoint-preview/ | grep '<title>'` 确认不含 "Coming Soon"

**④ Preview 页开放收录**（在 ③ 完成后执行）

- [ ] 删除 `noIndex: true`
- [ ] `sitemap.ts`：加入 preview 页 URL

**⑤ 导航/页脚 label 统一**

- [ ] `NavBar.tsx`：删除 "Next puzzle" 入口，保留 "Pro Tips" 入口（同一 URL）
- [ ] `Footer.tsx`：删除重复入口，保留一个 "Pro Tips" label

### Phase 2：两周内做（工期：1-2 周）

**① 详情页可见信号补充**

- [ ] `PuzzleDetail.tsx`：在 "Published on" 下方加 "Updated on"（条件显示：仅当 updatedAt ≠ isoDate）
- [ ] `PuzzleDetail.tsx`：在 verification label 旁加 "How we verify →" 链接

**② About 页升级**

- [ ] `about-us/page.tsx`：新增 `#editorial-process` 章节（见 8.5 节模板）

**③ 首页分发优化**

- [ ] `HomeRevealSection.tsx`：调整第三张卡的 label，确保 Archive 和 Tips 同等曝光

**④ 启动内容抽检 Checklist**

- [ ] 整理 Checklist 为可执行文档（可放在 `docs/content-qa-checklist.md`）
- [ ] 第一次人工抽检执行，建立基准

**⑤ GA4 Scroll Depth 埋点方案**

- [ ] 确定埋点节点（建议：答案卡片展开事件 + 滚动到 FAQ 区域）
- [ ] 实现并验证数据在 GA4 中有记录

### Phase 3：本月内（工期：2-4 周）

- [ ] 高价值旧文回填 ≥ 20 篇（优先选 GSC 排名 2-10 但 CTR 低的题目）
- [ ] 重复度 Guardrail 初版实现（相似度脚本或人工机制）
- [ ] 同步清理生成器 / 内容文档中的 `short mode` 历史口径，确保不再把它写成可发布状态
- [ ] 评估 LLM 质检接入方案（成本、频率、Prompt 设计）
- [ ] 根据 GSC 数据调优 archive / tips / detail 三层入口分发

---

## 12. 风险与取舍

### 12.1 不建议直接复制对手的点

| 对手做法 | 我们的判断 | 理由 |
|---------|---------|------|
| 新建独立技巧页 | ❌ 不做 | 与 preview 页内容重叠，站内竞争 |
| 归档页把答案写进卡片 HTML | 可选 | 对手这样做，但我们 archive 卡片本身信息已足够 |
| 放开 live fallback 到公开站 | ❌ 不做 | 破坏内容质量底线 |
| 继续新增 schema 类型 | ❌ 不做 | Schema 已完整，继续加边际效益低 |

### 12.2 主要风险及对策

| 风险 | 概率 | 对策 |
|------|------|------|
| Preview 页 title 未先修好就开放 indexable → 被 Google 以 "Coming Soon" 收录 | 高 | ⚠️ 强制顿序：先改 title，部署验证，再删 noindex |
| 归档页全量渲染后首次访问速度慢 | 中 | ISR 已配置（86400s），On-Demand Revalidation 已覆盖，CDN 缓存后问题消失 |
| 全量渲染的 HTML 体积过大 | 中 | **硬阈值**：部署后实测（不靠估算）。可接受：TTFB <= 0.8s，LCP <= 2.5s，HTML gzip 后 <= 2MB。超任一阈值回退至 200 条；回退后 §6.2 全量 HTML 内链的 SEO 假设不成立，需重新评估。实测：`curl -o /dev/null -s -w "TTFB: %{time_starttransfer}s" /puzzles/` |
| 内容质检 Checklist 流于形式 | 中 | Phase 2 目标：将 Checklist 内嵌进发布审批流程，不完成不能发布 |
| `short mode` 口径 | 已决 | §9.4 已明确选项 B（发布脚本硬拦截），无需再讨论 |

---

## 13. 验收标准汇总

> **重要**：本项目 noindex 状态通过 Next.js `metadata.robots` 输出为 HTML `<meta name="robots">` 标签，**不是** HTTP 响应头。所有 noindex 检查必须用 `curl -s {url} | grep -i 'name="robots"'`，**不得**用 `curl -I`。

### 技术验收

| 检查项 | 验证命令 | 状态 |
|-------|---------|------|
| `privacy/terms/disclaimer` 无 noindex | `curl -s https://pinpointanswertoday.app/{path}/ \| grep -i 'name="robots"'` content 不含 `noindex` | ⬜ 待做 |
| `contact` 不在 sitemap | `curl -s https://pinpointanswertoday.app/sitemap.xml \| grep 'contact'` 无结果 | ⬜ 待做 |
| Preview 页 title 无 "Coming Soon" | `curl -s https://pinpointanswertoday.app/next-pinpoint-preview/ \| grep '<title>'` | ⬜ 待做 |
| Preview 页无 noindex | `curl -s https://pinpointanswertoday.app/next-pinpoint-preview/ \| grep -i 'name="robots"'` content 不含 `noindex` | ⬜ 待做 |
| Preview 页在 sitemap | `curl -s https://pinpointanswertoday.app/sitemap.xml \| grep 'next-pinpoint-preview'` | ⬜ 待做 |
| 归档页 HTML 内含 700+ 详情页链接 | `curl -s https://pinpointanswertoday.app/puzzles/ \| grep -c 'href.*linkedin-pinpoint-answers'` >= 700 | ⬜ 代码已改，待部署后验证 |
| 归档页 TTFB <= 0.8s | `curl -o /dev/null -s -w "%{time_starttransfer}" https://pinpointanswertoday.app/puzzles/` | ⬜ 待部署后实测 |
| 归档页 `revalidate = 86400` | 代码审查 | ✅ 已做 |
| NavBar/Footer preview 入口统一 label | UI 验证：各只有一个"Pro Tips"入口 | ⬜ 待做 |
| sitemap/noindex/robots 口径一致 | 全面审查 | ⬜ 待做 |
| 首页、归档、详情、preview 四层闭环内链成立 | 逐页点击验证 | ⬜ 待做 |

### 产品验收

| 检查项 | 状态 |
|-------|------|
| 首页用户可看到 today、archive、tips 三种路径 | ⬜ 待做 |
| 归档页渲染全量历史题目（无 Load More 才加载） | ⬜ 代码已改，待部署验证 |
| 详情页 "Updated on" 可见 | ⬜ 待做 |
| 详情页 "How we verify →" 链接存在 | ⬜ 待做 |
| `about-us` 页面有 `#editorial-process` 章节 | ⬜ 待做 |
| Preview 页作为 tips hub 可被索引且导航入口统一为 "Pro Tips" | ⬜ 待做 |

### 内容验收

| 检查项 | 状态 |
|-------|------|
| `docs/content-qa-checklist.md` 或等价抽检记录页已建立 | ⬜ 待做 |
| 第一次人工抽检已执行且有留档 | ⬜ 待做 |
| 发布后抽检机制已按 §9.3 F 落地，不再靠口头确认 | ⬜ 待做 |
| 生成器 / 内容文档已同步 `short mode` 不可发布的最终口径 | ⬜ 待做 |
---

## 14. 实施触点速查表

### Phase 1 代码改动文件

| 文件 | 改动内容 | 状态 |
|------|---------|------|
| `app/(site)/puzzles/page.tsx` | 删截断逻辑 + 加 revalidate | ✅ 已改（待部署） |
| `app/(site)/next-pinpoint-preview/page.tsx` | 改 title → 再删 noIndex | ⬜ |
| `app/sitemap.ts` | 加 preview，删 contact | ⬜ |
| `app/(site)/privacy/page.tsx` | 删 noIndex | ⬜ |
| `app/(site)/terms/page.tsx` | 删 noIndex | ⬜ |
| `app/(site)/disclaimer/page.tsx` | 删 noIndex | ⬜ |
| `components/layout/NavBar.tsx` | 统一 label，删重复入口 | ⬜ |
| `components/layout/Footer.tsx` | 统一 label，删重复入口 | ⬜ |

### Phase 2 代码改动文件

| 文件 | 改动内容 | 状态 |
|------|---------|------|
| `components/detail/PuzzleDetail.tsx` | 加 Updated on + verify 链接 | ⬜ |
| `app/(site)/about-us/page.tsx` | 加 editorial process 章节 | ⬜ |
| `components/home/HomeRevealSection.tsx` | 调整第三张卡 label/href | ⬜ |
| `components/detail/PuzzleAnswerReveal.tsx` | GA4 scroll depth 埋点 | ⬜ |

### Phase 3 文件

| 文件 | 改动内容 | 状态 |
|------|---------|------|
| `scripts/validate-data.mjs` | 加重复度检测逻辑 | ⬜ |
| `docs/content-qa-checklist.md` | 创建人工抽检 Checklist | ⬜ |

---

## 15. 一句话收尾

**追平对手**，要学它的页面矩阵、全量内链密度和导流闭环——这些技术改动本周内可完成。

**超越对手**，要靠文档里已定下的方向真正落地：

- 证据链内容（turning clue + why not others）
- 去模板味（clue-specific 解释，而非通用句式）
- 更硬的内容质检门槛（从拦坏稿升级到拦空稿）
- 数据驱动迭代（GA4 Scroll Depth + GSC 旧题 CTR 监控）

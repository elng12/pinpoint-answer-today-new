# 首页关键词密度工具包需求文档

状态：草稿 v6
日期：2026-05-29
页面：首页 `/`
用途：用命令行脚本把首页关键词密度检查、调整、留证据这套流程固定下来，方便以后反复用

## 1. 为什么要做

首页关键词密度以后还会反复调。

现在流程太靠手工：

1. 打开本地预览。
2. 看 AITDK / TDK 插件。
3. 跑本地脚本。
4. 手动对比。
5. 改首页文案和结构。
6. 再检查。
7. 再手动写记录。

这样很容易漏步骤，也容易每次判断标准不一样。

所以要做一个固定工具包，让以后每次都按同一套流程走。

## 2. 最重要的规则

AITDK / TDK 浏览器插件是最终标准。

本地脚本只是提前预估。

如果本地脚本和插件结果不一样，以插件为准。

工具每次输出报告时，都必须提醒这句话。

### 2.1 产物形态

第一版做成项目里的命令行脚本。

它不是独立软件，也不是浏览器插件。

第一版最终产物是：

1. 一份关键词配置 JSON。
2. 一个检查命令。
3. 一份 markdown 报告。
4. 一份 JSON sidecar 数据报告。
5. 一套测试 fixtures。

第一版不要做这些：

1. 不做桌面软件。
2. 不做 SaaS 后台。
3. 不做浏览器插件。
4. 不做登录、账号、项目管理。
5. 不做可视化编辑器。

原因很简单：现在最重要的是先把关键词统计、排序判断、报告留证据这几件事跑准。

如果以后用得很多，再做第二版网页面板。

第二版可以考虑：

1. 上传或粘贴关键词方案。
2. 选择网站和页面。
3. 展示密度表和排序表。
4. 对比修改前后报告。
5. 管理多个网站的配置。

浏览器插件暂时不做。

因为 AITDK / TDK 插件已经是最终验收工具，我们这个工具只负责提前预估、整理证据和辅助调整，不替代插件。

## 3. 终极目标和修改权限

这个工具包的终极目标，不是单纯检查数字。

它真正要服务的是：给网站首页安排合适的关键词密度和关键词排名，让 AITDK / TDK 里的结果达到我们想要的效果。

所以首页的一切设计和结构，都要为这个目标让路。

如果为了达到关键词目标，需要调整下面这些内容，都可以改：

1. 首页文案。
2. 首页模块数量和顺序。
3. 首页标题层级。
4. 首页样式和布局。
5. 首页内部链接和按钮文案。
6. 首页相关设置。
7. 首页 title、description、schema 等 SEO 相关内容。

但最终结果必须同时满足两点：

1. AITDK / TDK 里的关键词密度和排名达到要求。
2. 首页看起来合理、自然、能正常帮用户找今天答案。

不能为了数字把页面做得很怪，也不能为了保留旧设计而放弃关键词目标。

## 4. 工具目标

这个工具包要做到：

1. 快速检查首页关键词密度。
2. 自动对照用户提供的目标关键词和排序方案。
3. 告诉我们哪些词太高、太低、缺失、顺序不对。
4. 标出奇怪的高频词，避免它们排到前面。
5. 每次检查都能生成一份记录。
6. 修改前和修改后可以对比。
7. 以后不再靠聊天记录猜规则。

## 5. 第一版不做什么

第一版检查脚本本身不要做这些事：

1. 不在用户没确认时自动改首页文案。
2. 不在用户没确认时自动改 title、description、schema、canonical、sitemap、robots。
3. 不自动猜新的关键词顺序。
4. 不把本地脚本结果当最终结论。
5. 不为了堆词新增假模块。
6. 本轮不调 5 词密度，因为这次没有合适的 5 词目标词，不是工具永远不支持 5 词。

这里说的“不自动改”，只是限制检查脚本不要自己偷偷写文件。

不代表首页不能改。

执行优化时，如果报告和插件结果说明确实需要改，可以改首页文案、结构、样式和相关设置。

## 6. 关键词方案输入规则

这个工具不能内置固定关键词。

每个网站、每个首页、每一轮 SEO 目标都可能不同。

正确流程是：用户先给关键词和排序要求，工具再围绕这份要求检查密度、排序、奇怪词和修改方向。

用户输入至少要包含：

| 输入项 | 说明 |
| --- | --- |
| `page` | 要检查的页面，比如 `/`。 |
| `targets` | 本轮目标关键词表。每个词要写清楚组别、目标排名、是否启用。 |
| `densityBands` | 每组参考密度区间。可以用默认值，也可以由用户指定。 |
| `disabledGroups` | 本轮不安排的组别，比如没有合适 5 词目标，就关闭 5 词。 |
| `blockedPhrases` | 明确不希望排到前面的词。 |
| `suggestedEditAreas` | 这个网站可优先检查的文件、模块、页面区域。 |

工具不负责猜关键词。

如果用户只给了一堆关键词，但没给排序方案，工具可以先生成一份候选排序草案让用户确认，确认后才能进入正式配置。

如果用户给了明确排序方案，就必须按用户方案生成目标配置文件。当前默认配置文件放在 `/Users/elng/web/关键词密度脚本/config/homepage-keyword-density-targets.json`。

### 6.1 本项目 Pinpoint 示例

下面这张表只是 Pinpoint 当前首页这一轮的示例。

它不是工具默认词表，也不能用于别的网站。

| 组别 | 目标排名 | 目标词 |
| --- | ---: | --- |
| 1 词 | 1 | `pinpoint` |
| 1 词 | 2 | `linkedin` |
| 1 词 | 3 | `answer` |
| 2 词 | 1 | `pinpoint today` |
| 2 词 | 2 | `pinpoint answer` |
| 2 词 | 3 | `linkedin pinpoint` |
| 2 词 | 4 | `todays pinpoint` |
| 2 词 | 5 | `pinpoint linkedin` |
| 3 词 | 1 | `pinpoint answer today` |
| 3 词 | 2 | `linkedin pinpoint answer` |
| 3 词 | 3 | `todays pinpoint answer` |
| 3 词 | 4 | `pinpoint answer linkedin` |
| 4 词 | 1 | `linkedin pinpoint answer today` |
| 4 词 | 2 | `pinpoint linkedin answer today` |
| 4 词 | 3 | `pinpoint answer today linkedin` |

Pinpoint 这轮 5 词不安排，因为这次没有合适的 5 词目标。别的网站如果用户给了 5 词目标，可以启用 5 词。

注意：

1. `pinpoint answer linkedin` 是 3 词，不是 4 词。
2. `linkedin pinpoint answer today` 是 4 词，不是 5 词。
3. AITDK / TDK 插件会把 `today's` 显示成 `todays`，所以本工具也按插件口径合并。
4. `today’s`、`today's`、`todays` 在统计时都归一成 `todays`。
5. 因为插件无法把 `today's pinpoint` 和 `todays pinpoint` 分开排名，所以本轮 2 词只保留 `todays pinpoint` 一个目标，`today's pinpoint` 只放到 alias 里。
6. 本轮 3 词只安排前 4 个目标；旧的 3 词第 5-11 位不安排，也不要报 missing。

## 7. 目标配置 JSON 格式

新增文件：

- `/Users/elng/web/关键词密度脚本/config/homepage-keyword-density-targets.json`

下面是 Pinpoint 当前首页这一轮的完整配置示例。

真实开发时，`targets` 必须来自用户输入的关键词和排序方案。

不要把这个 Pinpoint 示例写进工具默认逻辑，也不要把它用于别的网站。

```json
{
  "profileName": "pinpoint-homepage-2026-05-29",
  "page": "/",
  "toolOfRecord": "AITDK / TDK browser plugin",
  "minimumTotalWords": 700,
  "rankRules": {
    "allowedRankOffset": 0
  },
  "stopWords": {
    "remoteUrl": "https://extension.aitdk.com/stop-words.json",
    "fallbackWords": [
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "but",
      "by",
      "for",
      "from",
      "has",
      "have",
      "he",
      "her",
      "his",
      "i",
      "in",
      "is",
      "it",
      "its",
      "of",
      "on",
      "or",
      "our",
      "she",
      "that",
      "the",
      "their",
      "this",
      "to",
      "was",
      "we",
      "with",
      "you",
      "your"
    ]
  },
  "densityBands": {
    "1": { "enabled": true, "min": 0.06, "max": 0.07, "label": "6%-7%" },
    "2": { "enabled": true, "min": 0.03, "max": 0.035, "label": "3%-3.5%" },
    "3": { "enabled": true, "min": 0.015, "max": 0.018, "label": "1.5%-1.8%" },
    "4": { "enabled": true, "min": 0.01, "max": 0.015, "label": "1%-1.5%" },
    "5": {
      "enabled": false,
      "reason": "本轮没有合适的 5 词目标词，所以不安排"
    }
  },
  "rankingSort": [
    "count:desc",
    "firstOccurrenceIndex:asc",
    "phrase:asc"
  ],
  "targets": [
    {
      "phrase": "pinpoint",
      "aliases": [],
      "words": 1,
      "targetRank": 1,
      "enabled": true
    },
    {
      "phrase": "linkedin",
      "aliases": [],
      "words": 1,
      "targetRank": 2,
      "enabled": true
    },
    {
      "phrase": "answer",
      "aliases": [],
      "words": 1,
      "targetRank": 3,
      "enabled": true
    },
    {
      "phrase": "pinpoint today",
      "aliases": [],
      "words": 2,
      "targetRank": 1,
      "enabled": true
    },
    {
      "phrase": "pinpoint answer",
      "aliases": [],
      "words": 2,
      "targetRank": 2,
      "enabled": true
    },
    {
      "phrase": "linkedin pinpoint",
      "aliases": [],
      "words": 2,
      "targetRank": 3,
      "enabled": true
    },
    {
      "phrase": "todays pinpoint",
      "aliases": ["today's pinpoint"],
      "words": 2,
      "targetRank": 4,
      "enabled": true
    },
    {
      "phrase": "pinpoint linkedin",
      "aliases": [],
      "words": 2,
      "targetRank": 5,
      "enabled": true
    },
    {
      "phrase": "pinpoint answer today",
      "aliases": [],
      "words": 3,
      "targetRank": 1,
      "enabled": true
    },
    {
      "phrase": "linkedin pinpoint answer",
      "aliases": [],
      "words": 3,
      "targetRank": 2,
      "enabled": true
    },
    {
      "phrase": "todays pinpoint answer",
      "aliases": ["today's pinpoint answer"],
      "words": 3,
      "targetRank": 3,
      "enabled": true
    },
    {
      "phrase": "pinpoint answer linkedin",
      "aliases": [],
      "words": 3,
      "targetRank": 4,
      "enabled": true
    },
    {
      "phrase": "linkedin pinpoint answer today",
      "aliases": [],
      "words": 4,
      "targetRank": 1,
      "enabled": true
    },
    {
      "phrase": "pinpoint linkedin answer today",
      "aliases": [],
      "words": 4,
      "targetRank": 2,
      "enabled": true
    },
    {
      "phrase": "pinpoint answer today linkedin",
      "aliases": [],
      "words": 4,
      "targetRank": 3,
      "enabled": true
    }
  ],
  "suggestedEditAreas": [
    "components/home/HomeRecentAnswers.tsx",
    "components/home/HomeWhatIs.tsx",
    "components/home/HomeBenefitsFaq.tsx",
    "components/home/HomeCtaFooter.tsx",
    "homepage search path / title map module",
    "homepage title / description / schema",
    "homepage styles and layout files"
  ],
  "strangePhraseRules": {
    "scanTopLimit": 30,
    "topNonTargetLimit": 10,
    "warnWhenNonTargetAboveTarget": true,
    "warnWhenDensityReachesBandMin": true,
    "blockedPhrases": [
      "tips archive patches",
      "pinpoint answer today today",
      "tomorrowland linkedin pinpoint"
    ]
  }
}
```

字段说明：

| 字段 | 意思 |
| --- | --- |
| `profileName` | 当前关键词方案名称。不同网站、不同轮次应该不同。 |
| `phrase` | 标准目标词。 |
| `aliases` | 插件会合并的写法可以放这里，比如 `today's` 和 `todays`。第一版只允许 alias 归一后词数和主词一致。 |
| `words` | 几词短语，只能是 1、2、3、4、5。 |
| `targetRank` | 希望它在同组里排第几。不是死线，但要用来提醒顺序风险。 |
| `enabled` | 是否参与本轮检查。 |
| `min` / `max` | 参考密度区间。不是死线。 |
| `blockedPhrases` | 明确不希望冲到前面的词。 |
| `minimumTotalWords` | 总有效词数低于这个值时提醒。第一版先用 700。 |
| `stopWords.remoteUrl` | AITDK stop words 的远程来源。 |
| `stopWords.fallbackWords` | 远程加载失败时使用的兜底词表。 |
| `rankRules.allowedRankOffset` | 排名允许轻微浮动多少位。当前这轮排序要求严格，用 0。 |
| `rankingSort` | n-gram 排名排序规则。 |
| `suggestedEditAreas` | 报告固定输出的可排查范围，避免写死在脚本里。 |

### 7.1 配置校验规则

配置读取后必须先校验。

下面任一情况都返回 `CONFIG_INVALID`：

1. `targets[].phrase` 为空。
2. `targets[].words` 不是 1-5。
3. `targets[].targetRank` 不是正整数。
4. 同一 `words` 组内 `targetRank` 重复。除非用户明确允许同排名，否则不允许。
5. 同一 `words` 组内 `phrase` 重复。
6. `phrase` 按同一 tokenizer 处理后的实际词数不等于 `words`。
7. `densityBands[group].enabled = true` 时缺少 `min` 或 `max`。
8. `densityBands[group].enabled = true` 时 `min >= max`。
9. enabled target 的 `words` 对应 density band 没有启用。
10. `aliases` 不是字符串数组，或者 alias 归一后的词数和 `words` 不一致。
11. `blockedPhrases` 不是字符串数组。

`blockedPhrases` 比较前必须用同一 tokenizer 归一化，避免大小写、标点、弯引号导致漏判。

## 8. 参考密度和判断原则

下面这张表不是死线。

它只是工具先用来提醒风险的参考范围。

真正目标是：

1. 首页文案数量合适，不为了堆词硬加废话。
2. 用户要求的关键词排序先在 AITDK / TDK 里跑出来。
3. 关键词密度再接近我们想要的区间。
4. 页面读起来仍然自然，不能像关键词堆砌。

判断优先级：

1. 先看目标关键词排序有没有达到用户给的顺序。
2. 再看每组密度有没有接近目标区间。
3. 最后看有没有奇怪词、噪音词抢到前面。

如果数字达标了，但文案明显变差，也不能算通过。

如果文案自然、目标词排名正确，但某个密度数字略微超出范围，应该先看插件整体结果和页面阅读感受，不要机械改字。

| 组别 | 参考密度区间 |
| --- | --- |
| 1 词 | 6%-7% |
| 2 词 | 3%-3.5% |
| 3 词 | 1.5%-1.8% |
| 4 词 | 1%-1.5% |
| 5 词 | 本轮不安排，因为这次没有合适的目标词 |

排名靠前的词，应该是目标词，不应该是乱七八糟的词。

## 9. 计算口径

这一节必须写清楚，否则本地脚本和插件结果永远对不上。

### 9.1 输入来源

工具要支持这些输入：

| 来源 | 参数 | 用途 |
| --- | --- | --- |
| 服务器 HTML | `--url http://localhost:3005/` | 快速预估。抓到的是 Next.js 服务端 HTML，不一定等于浏览器最终页面。 |
| 已保存 HTML | `--html ./tmp/home-rendered.html` | 用浏览器导出的 HTML 检查。更接近插件。 |
| 纯文本 | `--text "..."` | 调试用。 |
| 修改前后报告 | `--before old.json --after new.json` | 对比用，读取 JSON sidecar。 |

第一版不强制自动打开浏览器。

但报告必须写清楚本次来源是 `server-html`、`rendered-html` 还是 `raw-text`。

如果页面有客户端渲染内容，最终判断不能只看 `--url` 抓到的服务器 HTML，必须再看 AITDK / TDK 插件。

### 9.2 渲染后 HTML 怎么来

如果需要更接近插件，可以这样生成 `--html` 输入：

1. 用浏览器打开本地首页。
2. 等页面完整加载。
3. 取 `document.documentElement.outerHTML` 保存成 `tmp/home-rendered.html`。
4. 跑：

```bash
npm run homepage:keyword-audit -- --html ./tmp/home-rendered.html --source-mode rendered-html --save
```

以后可以再加自动浏览器模式，比如 `--rendered-url http://localhost:3005/`。

如果实现自动浏览器模式，优先用 Playwright；但仓库现在没有把 Playwright 作为直接依赖，所以这不是第一版硬要求。

### 9.3 文本提取规则

默认只统计页面 body 里的可读文本。

默认排除这些内容：

1. `script`
2. `style`
3. `iframe`
4. `textarea`
5. `select`
6. `noscript`
7. `title`
8. `meta`
9. `link`
10. `svg`
11. `canvas`
12. `picture`
13. `template`
14. `object`
15. `embed`
16. `input`

第一版默认不统计图片 `alt`、元素 `title` 属性、meta description。

原因：AITDK / TDK 插件的 Density 面板更接近页面可见文本，本地脚本先按可见文本做预估。

如果后面发现插件会统计属性文本，再新增 `--include-attributes` 模式。

### 9.4 分词规则

本地脚本按下面方式分词：

1. HTML entity 先解码，比如 `&amp;` 变成 `&`。
2. 全部转小写。
3. 英文撇号直接去掉，不切开单词，比如 `today’s` / `today's` 变成 `todays`。
4. 连字符直接去掉，不切开单词，比如 `spoiler-safe` 变成 `spoilersafe`，`clue-by-clue` 变成 `cluebyclue`。
5. 其他标点变成空格。
6. 连续空格合并。
7. 多位纯数字可以进入密度分母，比如 `759`、`2026`；单个数字不进入密度分母，比如 clue 序号 `1`、`2`。
8. 纯数字不进入 1-5 词候选短语表。
9. 1 词统计里去掉 AITDK stop words。
10. 2-4 词统计保留 stop words，再按连续词窗口生成短语。
11. `today's` 和 `todays` 按插件口径合并成 `todays`。

密度计算公式：

```text
密度 = 该词出现次数 / densityDenominatorWords
```

报告里展示成百分比。

`densityDenominatorWords` 是统一分母，1-4 词都用它。

这个分母的口径是：

1. 从 body 可读文本提取。
2. 解码 HTML entity。
3. 转小写。
4. 英文撇号和连字符直接去掉，不切词。
5. 保留多位纯数字，去掉单个数字。
6. 不移除 stop words。

也就是说，1 词表里会把 stop words 和纯数字从候选词里过滤掉，但密度分母仍然用 `densityDenominatorWords`。

这样做是为了贴近插件截图里的口径：

1. `today's` 在插件里显示为 `todays`。
2. `clue-by-clue` 不会拆成两个 `clue`。
3. 多位数字会影响 Total，所以不能再简单把所有纯数字都从分母里删掉。

报告里不要只写一个模糊的 `Total valid words`，要写：

```text
Density denominator words: 812
1-word candidate words after stop-word filter: 530
Stop words source: remote / fallback
```

### 9.5 Stop Words 来源

AITDK stop words 第一版按现有脚本的来源处理：

```text
https://extension.aitdk.com/stop-words.json
```

请求头：

```text
Referer: https://extension.aitdk.com/
User-Agent: Mozilla/5.0 AITDK-density-local-check
```

如果远程加载失败，就用目标配置文件里的 `stopWords.fallbackWords`。

报告必须写清楚本次用的是：

1. `remote`
2. `fallback`

如果用的是 fallback，报告要提醒：本地结果可能和 AITDK / TDK 插件更容易不一致。

JSON sidecar 里还要记录 stop words 版本信息：

```json
{
  "stopWords": {
    "source": "remote",
    "count": 123,
    "hash": "sha256-xxxx",
    "loadedAt": "2026-05-29T18:30:00+08:00"
  }
}
```

如果 `--before` 和 `--after` 的 stop words hash 不一样，对比报告必须提醒：

```md
Warning: stop words hash changed between before and after reports. Density comparison may not be fully comparable.
```

### 9.6 n-gram 排名排序规则

1-4 词短语表必须按下面顺序排序，`actualRank` 也按这个结果计算：

1. `count` 降序。
2. `count` 相同时，按 `firstOccurrenceIndex` 升序。
3. 如果还相同，按 `phrase` 字母序升序。

说明：

1. 同一组里的 density 分母一样，所以 count 相同时 density 也一样，不用再拿 density 排序。
2. `firstOccurrenceIndex` 指短语第一次出现在清洗后 token 列表里的位置，从 0 开始。
3. 排名从 1 开始。

### 9.7 目标词状态判定

报告必须先输出“排序检查”，再输出密度统计。

排序检查要按组展示：

1. 用户要求的目标排序。
2. 当前实际目标排序。
3. 是否有目标词缺失。
4. 是否有目标词掉出允许范围。
5. 是否有目标词整体顺序错位。

每个目标词也要输出一个 `status` 和一个 `issues` 数组。

允许的 status：

| status | 意思 |
| --- | --- |
| `pass` | 当前没有明显问题。 |
| `warning` | 有问题，但默认不让命令失败。 |
| `missing` | 目标词没出现。 |

issues 可以包含：

| issue | 判定规则 |
| --- | --- |
| `missing` | `count = 0` 或找不到 `actualRank`。 |
| `low` | `density < densityBands[group].min`。 |
| `high` | `density > densityBands[group].max`。 |
| `rank-warning` | `actualRank > targetRank + rankRules.allowedRankOffset`。 |

判定优先级：

1. `count = 0` 或 `actualRank` 为空：`status = missing`，`issues = ["missing"]`。
2. 否则按 `low`、`high`、`rank-warning` 逐个判断，把命中的 issue 放进 `issues`。
3. 如果 `issues` 为空：`status = pass`。
4. 如果 `issues` 不为空：`status = warning`。

例子：

| 情况 | status | issues |
| --- | --- | --- |
| 目标词缺失 | `missing` | `["missing"]` |
| 密度达标但排名掉太多 | `warning` | `["rank-warning"]` |
| 密度略低但排名正确 | `warning` | `["low"]` |
| 密度偏高且排名掉太多 | `warning` | `["high", "rank-warning"]` |
| 全部满足 | `pass` | `[]` |

这些状态仍然只是本地提醒。最终是否通过，看 AITDK / TDK 插件和页面阅读感受。

## 10. 奇怪词定义

“奇怪词”不能靠感觉判断，要有规则。

满足下面任一条件，就标记为奇怪词：

1. 非目标词进入该组 `strangePhraseRules.topNonTargetLimit`，第一版是前 10 名。
2. 非目标词在该组前 `strangePhraseRules.scanTopLimit` 内，且排名高于该组任意 enabled target phrase。第一版 `scanTopLimit` 是 30。
3. 非目标词密度达到对应组 `densityBands[group].min`。
4. 命中 `blockedPhrases`。

同一个 strange phrase 如果命中多个原因，报告只展示一行。

JSON 里用 `reasons` 数组保存原因：

```json
{
  "phrase": "tips archive patches",
  "words": 3,
  "rank": 2,
  "count": 12,
  "density": 0.0148,
  "reasons": ["top-10-non-target", "above-target", "blocked-phrase"]
}
```

报告不要直接说“必须删除”，只说“优先检查来源”。

下面这种不能让脚本自动判断：

- 多个无关 clue 词。
- 历史题词。
- footer 拼接词。
- 日期编号拼接词。

这些只能作为人工备注，或者后续明确加入 `blockedPhrases` / `blockedPatterns` 后再让脚本判断。

第一版不要写一个假的“智能判断噪音词”。

## 11. 现有脚本怎么复用

当前工具文件夹：

- `/Users/elng/web/关键词密度脚本/`

当前已有：

- `/Users/elng/web/关键词密度脚本/check-aitdk-density.ts`
- 命令：`npm run check:aitdk-density`

新工具不要复制一大份重复逻辑。

公共逻辑放在：

- `/Users/elng/web/关键词密度脚本/aitdk-density-core.ts`

这个文件导出：

| 导出内容 | 用途 |
| --- | --- |
| `extractAitdkTextContent()` | 从 HTML 提取可统计文本。 |
| `decodeHtmlEntities()` | 解码 HTML entity。 |
| `loadStopWords()` | 加载 AITDK stop words，失败时用 fallback。 |
| `tokenizeForDensity()` | 按统一口径分词。 |
| `analyzeDensity()` | 生成 1-5 词密度表。 |
| `buildPhraseTable()` | 生成某个词数组的密度表。 |
| `DensityRow` | 统一结果类型。 |

然后：

1. `/Users/elng/web/关键词密度脚本/check-aitdk-density.ts` 继续当旧命令入口。
2. `/Users/elng/web/关键词密度脚本/audit-homepage-keywords.ts` 引用 `aitdk-density-core.ts`。
3. 这样旧命令不坏，新工具也不会重复造一套算法。

## 12. 命令设计

新增 package 命令：

```json
{
  "homepage:keyword-audit": "tsx /Users/elng/web/关键词密度脚本/audit-homepage-keywords.ts"
}
```

常用命令：

```bash
npm run homepage:keyword-audit -- --url http://localhost:3005/ --save
npm run homepage:keyword-audit -- --html ./tmp/home-rendered.html --source-mode rendered-html --save
npm run homepage:keyword-audit -- --text "raw text to test"
npm run homepage:keyword-audit -- --before docs/seo-evidence/old.json --after docs/seo-evidence/new.json
```

参数说明：

| 参数 | 用途 |
| --- | --- |
| `--url` | 抓服务器 HTML，快速预估。 |
| `--html` | 读取保存好的 HTML。 |
| `--text` | 直接检查一段文本。 |
| `--source-mode` | 写清楚来源：`server-html`、`rendered-html`、`raw-text`。 |
| `--top` | 每组输出前多少个词，默认 20。 |
| `--save` | 同时保存 markdown 报告和 JSON sidecar。 |
| `--before` / `--after` | 对比两份报告。 |

`--top` 只控制报告里每组展示多少条。

它不影响完整 n-gram 表计算。

`actualRank`、target status、strange phrase 判断都必须基于完整短语表，不能只看 top 20。

第一版不实现 `--strict`。后续如果要接 CI 阻断，再单独加。

运行模式互斥规则：

1. `audit mode`：必须且只能传入 `--url`、`--html`、`--text` 之一。
2. `compare mode`：必须同时传入 `--before` 和 `--after`。
3. `compare mode` 下不能同时传 `--url`、`--html`、`--text`。
4. 同时传多个输入来源，比如 `--url` 加 `--html`，命令必须失败。

source mode 自动推断：

| 输入 | 推断 source mode |
| --- | --- |
| `--url` | `server-html` |
| `--html` | `rendered-html` |
| `--text` | `raw-text` |
| `--before` + `--after` | `compare` |

如果用户手动传入的 `--source-mode` 和输入类型冲突，命令必须失败。

例子：

```bash
npm run homepage:keyword-audit -- --url http://localhost:3005/ --source-mode rendered-html
```

上面这条必须失败，因为 `--url` 只能是 `server-html`。

运行环境：

1. 使用仓库已有 `tsx`。
2. Node 版本按当前 Next.js 项目要求，至少 Node 18。
3. 第一版不新增浏览器依赖。

## 13. 报告格式

报告保存到：

- `docs/seo-evidence/homepage-keyword-audit-YYYY-MM-DD-HHMM.md`
- `docs/seo-evidence/homepage-keyword-audit-YYYY-MM-DD-HHMM.json`

报告必须包含：

1. 检查时间。
2. 检查来源。
3. source mode。
4. `densityDenominatorWords`。
5. 1 词排名。
6. 2 词排名。
7. 3 词排名。
8. 4 词排名。
9. 目标词状态。
10. 奇怪词提醒。
11. 建议优先查看的首页模块。
12. AITDK / TDK 人工确认区。

Markdown 给人看。

JSON 给 `--before` / `--after` 对比功能读取。

对比功能不能解析 markdown 表格，因为 markdown 格式稍微一改就容易坏。

示例格式：

```md
# Homepage Keyword Audit

Date: 2026-05-29 18:30
Source: http://localhost:3005/
Source mode: server-html
Tool rule: local report is only an approximation; AITDK / TDK browser plugin is final.

## Summary

- Density denominator words: 812
- 1-word candidate words after stop-word filter: 530
- Stop words source: remote
- 1-word status: warning
- 2-word status: pass
- 3-word status: warning
- 4-word status: warning

## Target Status

| Group | Target phrase | Target rank | Actual rank | Count | Density | Status | Issues |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 2 | pinpoint today | 1 | 1 | 25 | 3.08% | pass |  |
| 4 | linkedin pinpoint answer today | 1 | 4 | 8 | 0.99% | warning | low, rank-warning |

## Strange Phrases

| Group | Phrase | Rank | Count | Density | Reasons |
| --- | --- | ---: | ---: | ---: | --- |
| 3 | tips archive patches | 2 | 12 | 1.48% | top-10-non-target, blocked-phrase |

## Suggested Edit Areas

- First check the target phrase order.
- If a phrase is too high, remove or soften it from one visible block.
- If a phrase is too low, add it naturally to one visible block.
- First version does not locate the exact component automatically.

## Plugin Confirmation

- AITDK / TDK checked: yes / no
- Screenshot saved: yes / no
- Plugin result close to local report: yes / no
- Final decision: pass / continue editing
- Notes:
```

JSON sidecar 最少要包含：

```json
{
  "version": 1,
  "timestamp": "2026-05-29T18:30:00+08:00",
  "source": "http://localhost:3005/",
  "sourceMode": "server-html",
  "densityDenominatorWords": 812,
  "oneWordCandidateWords": 530,
  "stopWords": {
    "source": "remote",
    "count": 123,
    "hash": "sha256-xxxx",
    "loadedAt": "2026-05-29T18:30:00+08:00"
  },
  "targets": [
    {
      "phrase": "pinpoint today",
      "words": 2,
      "targetRank": 1,
      "actualRank": 1,
      "count": 25,
      "density": 0.0308,
      "status": "pass",
      "issues": []
    }
  ],
  "strangePhrases": [
    {
      "phrase": "tips archive patches",
      "words": 3,
      "rank": 2,
      "count": 12,
      "density": 0.0148,
      "reasons": ["top-10-non-target", "blocked-phrase"]
    }
  ]
}
```

`timestamp` 必须写进 JSON，不要靠解析文件名获取时间。

JSON 里不要重复保存 `stopWordsSource`。

Markdown 报告里的 `Stop words source` 从 JSON 的 `stopWords.source` 渲染。

## 14. 修改前后对比

`--before` / `--after` 必须真的有输出标准，不能只是占位命令。

对比功能读取 `.json` sidecar，不解析 markdown。

例如：

```bash
npm run homepage:keyword-audit -- --before docs/seo-evidence/old.json --after docs/seo-evidence/new.json
```

对比报告要包含：

1. `densityDenominatorWords` 变化。
2. 每个目标词的排名变化。
3. 每个目标词的次数变化。
4. 每个目标词的密度变化。
5. 奇怪词新增了哪些。
6. 奇怪词消失了哪些。
7. 哪些目标从 warning 变成 pass。
8. 哪些目标从 pass 变成 warning。

这里的变化结果不要叫 `Status`，避免和目标词自己的 `status` 混在一起。

对比里的 `Change` 允许这些值：

1. `improved`
2. `worsened`
3. `fixed`
4. `regressed`
5. `changed`

第一版对比报告只展示有变化的目标词。

完全没变化的目标词不进入 `Changed Targets` 表，避免报告太长。

示例：

```md
# Homepage Keyword Audit Compare

Before: docs/seo-evidence/old.json
After: docs/seo-evidence/new.json
Before timestamp: 2026-05-29T14:30:00+08:00
After timestamp: 2026-05-29T16:00:00+08:00

## Changed Targets Only

| Phrase | Rank before | Rank after | Density before | Density after | Status before | Status after | Change |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| linkedin pinpoint answer today | 4 | 1 | 0.99% | 1.18% | warning | pass | improved |

## Strange Phrase Changes

- Removed: `tips archive patches`
- Added: none
```

## 15. 提醒和失败规则

报告要提醒这些情况：

1. 非目标词排在目标词前面。
2. 某个词密度明显偏高。
3. 某个词密度明显偏低。
4. 目标词缺失。
5. 页面 `densityDenominatorWords` 低于 700。
6. 页面打不开。
7. 页面能打开，但样式或主要内容明显不对。
8. 只看了本地脚本，还没看插件。
9. source mode 是 `server-html`，但页面有明显客户端渲染内容。

密度判断标准：

1. `density > densityBands[group].max`：明显偏高，状态记为 `warning`。
2. `density < densityBands[group].min`：明显偏低，状态记为 `warning`。
3. 这些是提醒，不是死线；最终仍看 AITDK / TDK 插件和页面阅读感受。

人工检查项：

1. “页面能打开，但样式或主要内容明显不对”第一版只作为人工检查项。
2. 第一版不接 Playwright，不做截图判断，不自动判断样式坏没坏。
3. 报告里保留人工确认字段，让检查人填写。

命令退出规则：

1. 页面打不开、配置文件坏了、报告读不了：`exit code = 1`。
2. 参数错误、source mode 冲突、配置校验失败：`exit code = 1`。
3. 只是密度 warning、missing、rank-warning：默认 `exit code = 0`。
4. 第一版不实现 `--strict`。后续如果要让 warning 阻断 CI，再单独加。

输出流规则：

1. 正常报告输出到 `stdout`。
2. 对比报告输出到 `stdout`。
3. 错误 JSON 输出到 `stderr`。

错误输出格式：

失败时必须输出 JSON，至少包含：

| 字段 | 意思 |
| --- | --- |
| `errorCode` | 稳定错误码。 |
| `message` | 人能看懂的错误说明。 |
| `source` | 当前输入来源。 |
| `sourceMode` | 当前 source mode；如果还没推断成功，可以为空。 |
| `suggestedFix` | 建议怎么修。 |

示例：

```json
{
  "errorCode": "PAGE_FETCH_FAILED",
  "message": "Failed to fetch http://localhost:3005/",
  "source": "http://localhost:3005/",
  "sourceMode": "server-html",
  "suggestedFix": "Check whether the local dev server is running."
}
```

第一版至少支持这些错误码：

| errorCode | 触发场景 |
| --- | --- |
| `INVALID_ARGUMENTS` | 参数互斥规则不通过。 |
| `SOURCE_MODE_CONFLICT` | 手动 `--source-mode` 和输入类型冲突。 |
| `PAGE_FETCH_FAILED` | URL 抓取失败。 |
| `HTML_READ_FAILED` | HTML 文件读取失败。 |
| `CONFIG_READ_FAILED` | 目标配置读取失败。 |
| `CONFIG_INVALID` | 目标配置字段不合法。 |
| `REPORT_READ_FAILED` | before / after JSON 读取失败。 |
| `REPORT_INVALID` | before / after JSON 格式不合法。 |

## 16. 可以提示修改范围

第一版工具不要假装知道具体是哪一个组件出了问题。

报告里从目标配置文件的 `suggestedEditAreas` 读取“可优先排查范围”。

不要把组件路径写死在脚本里。

执行优化时，可以按关键词目标去改这些地方，而且不只限这些地方。

当前建议配置：

1. `components/home/HomeRecentAnswers.tsx`
2. `components/home/HomeWhatIs.tsx`
3. `components/home/HomeBenefitsFaq.tsx`
4. `components/home/HomeCtaFooter.tsx`
5. 首页 search path / title map 模块
6. 首页 title / description / schema 等 SEO 设置
7. 首页样式和布局文件

固定提示文案：

- "先看目标词是否排到前面。"
- "如果词太高，先从一个可见模块里少写一次。"
- "如果词太低，可以自然加到一个可见模块里。"
- "如果奇怪词排太高，先找它从哪里重复出来的。"
- "第一版不会自动定位到具体组件。"

## 17. 标准使用流程

以后正常这样用：

1. 准备本轮关键词配置 JSON。
2. 启动本地预览。
3. 跑工具包命令。
4. 用浏览器打开同一个地址。
5. 看 AITDK / TDK 插件。
6. 对比插件和工具报告。
7. 优先改最小的可见文案块。
8. 如果小改不够，就调整首页结构、样式、模块顺序或相关设置。
9. 再跑工具包。
10. 再看插件。
11. 保存最终报告。

不能只凭本地报告就发布。

## 18. 第一版验收标准

第一版做到下面这些，才算完成：

1. `npm run homepage:keyword-audit -- --url <local-url>` 能跑。
2. `npm run homepage:keyword-audit -- --html <file>` 能跑。
3. 能检查 1-4 词密度。
4. 能从 `/Users/elng/web/关键词密度脚本/config/homepage-keyword-density-targets.json` 读取默认目标词，也能用 `--config` 读取其他网站的目标词。
5. JSON 配置里的 `targets` 来自用户确认过的关键词和排序方案。
6. 能按插件口径把 `today’s` / `today's` / `todays` 合并成 `todays`。
7. 能输出目标词排名、次数、密度、状态。
8. 能按第 10 节规则输出奇怪词。
9. 能同时保存 markdown 报告和 JSON sidecar。
10. `--before` / `--after` 能读取 JSON sidecar 并输出对比报告。
11. 报告里明确写 AITDK / TDK 是最终标准。
12. 报告里明确写本次 source mode。
13. 报告里明确写 `densityDenominatorWords`、`oneWordCandidateWords`、`stopWords.source`。
14. JSON sidecar 里明确写 `timestamp`。
15. 偏高偏低按 `densityBands[group].min/max` 判断。
16. 对比报告只展示有变化的目标词。
17. n-gram 排名按 count、firstOccurrenceIndex、phrase 排序。
18. audit mode 和 compare mode 参数互斥。
19. source mode 冲突时返回失败。
20. fixtures 覆盖第 19 节列出的测试场景。
21. 检查脚本默认不会直接修改首页代码。
22. `scripts/README.md` 和 `/Users/elng/web/关键词密度脚本/README.md` 有用法说明。
23. 旧命令 `npm run check:aitdk-density` 继续可用。
24. 第一版产物是命令行脚本和配置文件，不是独立软件，也不是浏览器插件。

## 19. 测试 Fixtures

第一版必须加测试样例，避免以后改脚本时把规则改坏。

建议新增：

```text
fixtures/keyword-audit/simple.html
fixtures/keyword-audit/todays-vs-todays-apostrophe.html
fixtures/keyword-audit/stopwords.html
fixtures/keyword-audit/blocked-phrases.html
fixtures/keyword-audit/compare-before.json
fixtures/keyword-audit/compare-after.json
```

当前实际位置是 `/Users/elng/web/关键词密度脚本/fixtures/keyword-audit/`。

必须覆盖这些测试：

1. `today’s` 会归一成 `todays`。
2. `today's` 会归一成 `todays`。
3. 多位纯数字计入 `densityDenominatorWords`，但不进入候选短语表。
4. 1 词候选表过滤 stop words。
5. 2-4 词短语保留 stop words。
6. blocked phrase 一定进入 strange phrases。
7. strange phrase 命中多个原因时只输出一行，`reasons` 是数组。
8. before / after 只输出变化项。
9. source mode 冲突会失败并输出 `SOURCE_MODE_CONFLICT`。
10. 同时传 `--url` 和 `--before` 会失败并输出 `INVALID_ARGUMENTS`。
11. n-gram 排名按 count、firstOccurrenceIndex、phrase 排序。
12. 目标词缺失时输出 `status = missing` 和 `issues = ["missing"]`。
13. 第一版不会要求安装浏览器插件以外的新插件，也不会启动独立软件界面。

## 20. 实施步骤

### 第一步：拆公共算法

新增：

- `/Users/elng/web/关键词密度脚本/aitdk-density-core.ts`

把旧脚本里的提取、分词、统计逻辑拆出来。

### 第二步：做目标配置文件

新增：

- `/Users/elng/web/关键词密度脚本/config/homepage-keyword-density-targets.json`

把用户确认过的关键词方案写进去。

Pinpoint 示例只用于本项目这一轮，不是工具默认配置。

### 第三步：做主检查脚本

新增：

- `/Users/elng/web/关键词密度脚本/audit-homepage-keywords.ts`

它读取目标配置，调用公共算法，输出目标状态和奇怪词。

第一版只通过命令行运行，不做网页界面，也不做浏览器插件。

### 第四步：加报告保存

支持：

- `--save`

报告保存到：

- `docs/seo-evidence/`

同时保存 `.md` 和 `.json`。

### 第五步：加修改前后对比

支持：

- `--before`
- `--after`

读取 `.json` sidecar，输出第 14 节定义的对比报告。

### 第六步：加测试 fixtures

新增：

- `/Users/elng/web/关键词密度脚本/fixtures/keyword-audit/`

覆盖第 19 节的测试场景。

### 第七步：补文档和命令

更新：

1. `package.json`
2. `scripts/README.md`

把命令和例子写清楚。

## 21. 已决定的问题

这些问题不要再留给执行人猜：

1. 工具第一版不自动打开本地页面。
2. 报告里保留截图字段，但截图路径人工填写。
3. JSON 配置文件默认放 `/Users/elng/web/关键词密度脚本/config/homepage-keyword-density-targets.json`，其他网站可以用 `--config` 指定另一份配置。
4. 密度 warning 默认不让命令失败。
5. 5 词不是永久不支持，只是本轮没有合适目标词，所以关闭。
6. 第一版默认不统计 meta、title、图片 alt 和元素属性。
7. 最终判断必须看 AITDK / TDK 插件。
8. `today's` 和 `todays` 按插件口径合并成本轮同一个目标，不能再分开排名。
9. 对比功能读取 JSON sidecar，不解析 markdown。
10. 页面词数过少阈值先定为 `densityDenominatorWords < 700`。
11. 第一版不做自动组件定位，只输出固定排查范围。
12. 第一版不自动判断样式是否坏掉，样式和主要内容检查是人工项。
13. JSON sidecar 必须包含 `timestamp`。
14. 对比报告只展示变化项，不展示 unchanged 目标词。
15. JSON 配置必须包含当前用户方案的完整 targets，不能只放部分示例。
16. 目标词状态按第 9.7 节判定。
17. n-gram 排名按 count、firstOccurrenceIndex、phrase 排序。
18. audit mode 和 compare mode 参数互斥。
19. source mode 由输入类型自动推断，冲突时失败。
20. suggested edit areas 从配置读取，不写死在脚本里。
21. 第一版必须有 fixtures 覆盖核心规则。
22. 第一版产物是命令行脚本，不是软件，也不是浏览器插件。

## 22. 推荐第一版做法

第一版先保守一点：

1. 先做命令行脚本，不做软件，不做插件。
2. 检查脚本不自动改文案。
3. 不自动发布。
4. 密度提醒不让命令失败。
5. 只有加 `--save` 才保存 markdown 报告和 JSON sidecar。
6. 最终结论仍然看 AITDK / TDK 插件。

这样工具能帮我们省时间，但不会在没有确认时乱改首页。

真正执行首页优化时，目标优先级是：用户要求的关键词排序达标第一，关键词密度接近目标区间第二，页面合理自然第三，旧设计保留第四。

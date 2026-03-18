# 切站后 SEO 简版说明（2026-03-12）

## 1. 这份说明给谁看

这是一份给运营、SEO、项目协作方看的简版说明。

目的只有一个：

- 用最短的话说明这次切站后，哪些搜索入口已经收口，哪些旧链接已经承接，哪些点还需要持续观察

---

## 2. 当前结论

新站已经正式接管：

- `https://pinpointanswertoday.app`

搜索信号当前已确认：

- 正式 sitemap 已切到新站
- canonical 已切到新站
- 默认分享图和详情页分享图已恢复
- 反馈页、旧归档入口、旧数字题号入口已开始承接

---

## 3. 这次已经修好的重点

### A. 分享图恢复

之前问题：

- 链接分享到社交平台时，预览图存在 `404`

现在状态：

- 首页默认分享图正常
- 详情页分享图正常

影响：

- 链接分享时的品牌露出和点击表现更稳

### B. sitemap / 页面收录信号收口

现在已经确认：

- `sitemap.xml` 只继续喂正式页面
- `/featured`
- `/feedback`
- `/next-pinpoint-preview`

这些边缘或特殊页面不再继续出现在 sitemap 里。

另外：

- `/privacy`
- `/terms`
- `/disclaimer`

仍在 sitemap 中，但页面本身不再输出 `noindex`，避免相互打架。

### C. 高价值旧入口已承接

当前已确认的承接关系：

- `/feedback` → `/contact-us`
- `/featured` → `/about-us`
- `/linkedin-pinpoint-answers` → `/puzzles`
- `/puzzles/681` → 对应正式详情页
- `/pinpoint/archive` → `/puzzles`
- `/pinpoint/today` → 当前最新详情页
- 旧 locale 前缀下的一批高频入口 → 英文正式页

---

## 4. 现在最值得优先关注的 3 个页面

建议优先在 GSC 请求抓取这 3 个：

1. 首页  
   `https://pinpointanswertoday.app/`

2. 归档页  
   `https://pinpointanswertoday.app/puzzles`

3. 当前最新详情页  
   `https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-681`

原因很简单：

- 首页负责 today 入口
- `/puzzles` 负责 archive 入口
- `681` 负责当前最核心的单题解释页

这 3 个页面一起，基本就覆盖了切站后最关键的搜索入口。

---

## 5. 当前仍属正常的 404

不是所有 `404` 都是问题。

下面这类当前保留 `404` 是合理的：

- 根本不存在的题号，比如 `/puzzles/9999`
- 没有对应承接数据的极老历史别名
- 第一版明确退休的边缘内容家族

例如：

- `/pinpoint/534-analysis`

当前仍是 `404`，因为新站数据里没有可承接的对应题号。

---

## 6. 接下来 3 到 7 天要看什么

重点盯这几件事：

1. GSC 是否成功读取新 sitemap
2. 首页和 `681` 是否开始被重新抓取
3. 是否出现新的重定向错误
4. 是否出现大批“已抓取但未编入索引”
5. 旧入口流量是否开始向新正式页收口

---

## 7. 一句话总结

这次切站后，搜索入口的大头已经收住了。

现在最重要的不是继续大改结构，而是：

- 让 Google 尽快重新抓首页、归档页和当前最新详情页
- 继续观察 3 到 7 天内的新索引和旧链接迁移情况


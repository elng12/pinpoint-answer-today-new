# GSC 切站后检查清单（2026-03-12）

## 1. 这份清单是干什么的

这份清单只服务一个目标：

- 新站已经接管 `https://pinpointanswertoday.app` 后，尽快把 Google Search Console（Google 搜索控制台，简称 GSC）里的信号收口到新站正式 URL

适用时间：

- 正式切站当天
- 切站后 `24` 小时内
- 切站后 `3-7` 天内复查

---

## 2. 现在这次切站的已知正确口径

当前正式站线上已确认：

- 正式域名：`https://pinpointanswertoday.app`
- 主 sitemap：`https://pinpointanswertoday.app/sitemap.xml`
- 首页 canonical：`https://pinpointanswertoday.app/`
- 归档页 canonical：`https://pinpointanswertoday.app/puzzles`
- 最新详情页 canonical：`https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-681`
- 法律页保留在 sitemap 中，且不再输出 `noindex`
- `/next-pinpoint-preview` 继续 `noindex`，且不进入 sitemap

---

## 3. 切站当天要做的事

### A. 在 GSC 重新提交 sitemap

只提交这一个：

- `https://pinpointanswertoday.app/sitemap.xml`

提交前快速肉眼确认：

- sitemap 返回 `200`
- sitemap 里是正式域名
- sitemap 里不再包含 `/featured`
- sitemap 里不再包含 `/feedback`
- sitemap 里不包含 `/next-pinpoint-preview`

### B. 做 3 个 URL Inspection（URL 检查）

优先检查这 3 个：

1. `https://pinpointanswertoday.app/`
2. `https://pinpointanswertoday.app/puzzles`
3. `https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-681`

每个 URL 重点看：

- Google 看到的是不是 `200`
- canonical 是不是它自己
- 是否允许编制索引
- 页面是不是可抓取
- 页面是不是引用正式域名资源

如果 GSC 提供 “Request Indexing”（请求编入索引）按钮：

- 首页点一次
- 最新详情页点一次
- `/puzzles` 视情况点一次

### C. 删除或停用旧的 sitemap 提交

如果 GSC 里还留着旧的多语言或旧结构 sitemap，优先清掉：

- 旧 locale sitemap
- 旧测试或历史 sitemap
- 任何还在喂 `/featured`、`/feedback`、旧非正式路径的 sitemap

目标很简单：

- GSC 里只保留当前正式站主 sitemap

---

## 4. 切站当天的手工核对项

打开下面这些地址，确认肉眼结果正确：

### 必看页面

- `/`
- `/puzzles`
- `/contact-us`
- `/privacy`
- `/terms`
- `/disclaimer`
- `/linkedin-pinpoint-answers/pinpoint-answer-681`

### 必看旧入口

- `/feedback` 应永久跳到 `/contact-us`
- `/featured` 应永久跳到 `/about-us`
- `/linkedin-pinpoint-answers` 应永久跳到 `/puzzles`

### 必看资源

- `/robots.txt`
- `/sitemap.xml`
- `/og-image.png`
- `/linkedin-pinpoint-answers/pinpoint-answer-681/opengraph-image`

---

## 5. 切站后 24 小时内要复查什么

### GSC 里看 4 件事

1. sitemap 是否成功读取，没有报错
2. 首页和最新详情页的 URL Inspection 是否显示可编入索引
3. 是否出现新的重定向错误或软 404（soft 404，意思是“页面看起来存在，但 Google 觉得它像空页”）
4. 是否开始抓取新详情页和归档页

### 线上再抽样一次

建议再抽样这几条：

- 最新题 `681`
- 前一题 `680`
- 一个更老的题，比如 `669`
- 一个不存在的题，比如 `9999`

你要看到的结果应该是：

- 真实存在的题返回 `200`
- 不存在的题返回 `404`
- 不应该再出现错误分享图、错 canonical、或旧入口裸 `404`

---

## 6. 切站后 3 到 7 天内看什么

### GSC 关注指标

- 已提交 sitemap 的读取状态
- 新详情页是否进入 “已发现” 或 “已抓取”
- 覆盖率里有没有新出现的大量 “重定向错误”
- 覆盖率里有没有大量 “已抓取但未编入索引”
- 旧页面异常是否继续放大

### 表现层面

重点看：

- 首页查询词有没有明显断崖
- 最新题详情页有没有开始拿到 impressions（展示）
- `/puzzles` 有没有开始承接 archive 类词

---

## 7. 当前这次切站的建议提交顺序

按这个顺序做最稳：

1. 提交 `sitemap.xml`
2. 检查首页 URL Inspection
3. 检查 `681` 详情页 URL Inspection
4. 请求抓取首页
5. 请求抓取 `681`
6. 记录一次截图或文字留痕

---

## 8. 当前版本的已知正确结果

这是 2026-03-12 这次切站后，线上已经核实过的结果：

- `https://pinpointanswertoday.app/og-image.png` 返回 `200`
- `https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-681/opengraph-image` 返回 `200`
- `/feedback` 返回永久跳转到 `/contact-us`
- `/featured` 返回永久跳转到 `/about-us`
- `/linkedin-pinpoint-answers` 返回永久跳转到 `/puzzles`
- `/privacy`、`/terms`、`/disclaimer` 仍在 sitemap，但页面已不再输出 `noindex`

---

## 9. 如果 GSC 里看到异常，优先怀疑什么

优先排查这 5 类：

1. 正式域名别名是不是已经指向最新生产部署
2. `NEXT_PUBLIC_SITE_URL` 是否仍是正式域名
3. sitemap 是否被缓存住了旧版本
4. 某些旧外链入口是否还没补跳转
5. 详情页分享图或 canonical 是否被旧部署缓存

---

## 10. 这次检查对应的站点地址

- 正式站：`https://pinpointanswertoday.app`
- 主 sitemap：`https://pinpointanswertoday.app/sitemap.xml`


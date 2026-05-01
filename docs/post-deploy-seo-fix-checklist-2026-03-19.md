# 2026-03-19 SEO 修复上线后验证清单

## 这次要验证什么

这份清单只验证 2026-03-19 这一轮 SEO 修复：

- 归档页补了独立 `ItemList` 结构化数据
- 归档页带搜索参数时，canonical 和 hreflang 不丢
- 详情页结构化数据与当前 Google 富结果口径一致，不再输出 `FAQPage` / `HowTo`

对应提交：

- `659dcd83`：归档页结构化数据增强
- `1cf8b269`：详情页 FAQ Schema 保护

---

## 上线后先看 3 个地址

- 归档页：`https://pinpointanswertoday.app/puzzles`
- 带搜索参数的归档页：`https://pinpointanswertoday.app/puzzles?q=test`
- 任意一个详情页：`https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-687/`

---

## A. 验证归档页 ItemList

打开 `/puzzles`，在浏览器控制台执行：

```js
const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
const parsed = scripts.map((s) => JSON.parse(s.textContent || "{}"));
const itemList = parsed.find((p) => p["@type"] === "ItemList" && Array.isArray(p.itemListElement));
const collectionPage = parsed.find((p) => p["@type"] === "CollectionPage");

console.log({
  scriptCount: scripts.length,
  numberOfItems: itemList?.numberOfItems,
  itemListLength: itemList?.itemListElement?.length,
  firstItemType: itemList?.itemListElement?.[0]?.item?.["@type"],
  hasDatePublished: !!itemList?.itemListElement?.[0]?.item?.datePublished,
  firstItemUrl: itemList?.itemListElement?.[0]?.item?.url,
  collectionHasPartUrl: collectionPage?.hasPart?.[0]?.url,
});
```

预期结果：

- 页面里能找到独立 `ItemList`
- `numberOfItems` 和 `itemListElement.length` 一致
- 第一条 `item["@type"]` 是 `Article`
- 第一条有 `datePublished`
- `firstItemUrl` 和 `collectionHasPartUrl` 都是带尾斜杠的详情页 URL

---

## B. 验证带搜索参数时 canonical 和 hreflang

打开 `/puzzles?q=test`，在控制台执行：

```js
const canonical = document.querySelector('link[rel="canonical"]')?.href;
const hreflangEn = document.querySelector('link[rel="alternate"][hreflang="en"]')?.href;
const hreflangDefault = document.querySelector('link[rel="alternate"][hreflang="x-default"]')?.href;

console.log({ canonical, hreflangEn, hreflangDefault });
```

预期结果：

- `canonical` 里不带 `?q=test`
- `hreflang="en"` 存在
- `hreflang="x-default"` 存在
- 这 3 个值都应指向同一个归档页正式 URL

---

## C. 验证详情页结构化数据类型

打开任意一个详情页，在控制台执行：

```js
const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
const parsed = scripts.map((s) => JSON.parse(s.textContent || "{}"));
const topLevelTypes = parsed.map((p) => p["@type"]);

console.log({
  topLevelTypes,
  hasFaqPage: topLevelTypes.includes("FAQPage"),
  hasHowTo: topLevelTypes.includes("HowTo"),
});
```

预期结果：

- 当前详情页应输出 `Article`、`Game`、`ItemList`、`BreadcrumbList`
- 页面里不应输出 `FAQPage`
- 页面里不应输出 `HowTo`

---

## D. Google 工具复查

建议上线后用 Google Rich Results Test 复查两类页面：

- `/puzzles`
- 任意一个详情页

预期结果：

- 归档页能识别到 `ItemList`
- 详情页的 `Article`、`Game`、`ItemList`、`BreadcrumbList` 正常
- 详情页不应出现 `FAQPage` / `HowTo` 相关警告

---

## E. 这轮通过的判定标准

以下 5 条都满足，就可以认为这轮 SEO 修复已验收完成：

1. `/puzzles` 页面里能读到独立 `ItemList`
2. `ItemList` 里的条目数和归档总量一致
3. `/puzzles?q=test` 的 canonical 不带查询参数，且 hreflang 还在
4. 正常详情页不输出 `FAQPage` / `HowTo`
5. Rich Results Test 没有新增错误

---

## F. 2026-03-19 实际验收记录

验收方式：

- 直接抓取正式站 HTML 源码并解析 `link` 标签和 `application/ld+json`
- 这样看到的是搜索引擎最接近的服务端输出，不依赖浏览器本地状态

验收页面：

- `https://pinpointanswertoday.app/puzzles`
- `https://pinpointanswertoday.app/puzzles?q=test`
- `https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-687/`

实际结果：

- 归档页 `/puzzles`
- 找到 `3` 个 `JSON-LD` 脚本
- 独立 `ItemList` 已上线
- `numberOfItems = 230`
- `itemListElement.length = 230`
- 第一条 `item["@type"] = "Article"`
- 第一条包含 `datePublished`
- `ItemList` 和 `CollectionPage.hasPart` 中的首条详情页 URL 都是带尾斜杠的正式地址

- 搜索参数页 `/puzzles?q=test`
- `canonical = https://pinpointanswertoday.app/puzzles`
- `hreflang="en" = https://pinpointanswertoday.app/puzzles`
- `hreflang="x-default" = https://pinpointanswertoday.app/puzzles`
- 已确认 canonical 没有把查询参数带进去

- 详情页 `/linkedin-pinpoint-answers/pinpoint-answer-687/`
- `Article` Schema 存在
- `datePublished = 2026-03-18T00:00:00Z`
- `FAQPage` Schema 曾在本轮历史验收中存在；当前 2026-05-01 口径已下线
- canonical 为带尾斜杠的正式详情页 URL

当前结论：

- A、B、C 三项线上源码验收通过
- 本轮代码修复已经在线上生效，没有发现回归
- D 项中的 Google Rich Results Test 还需要人工到 Google 工具页面补一次最终复查

2026-05-01 补充口径：

- `FAQPage` rich results 当前主要限于权威政府/健康站点，本项目不再输出 `FAQPage`
- `HowTo` rich results 已被 Google 下线，本项目不再输出 `HowTo`
- 详情页当前保留 `Article`、`Game`、`ItemList`、`BreadcrumbList`

---

## G. 2026-03-19 补充修复记录（Rich Results Test 非严重问题）

触发原因：

- 在 Google Rich Results Test 中，归档页 `ItemList` 下的每条 `Article` 被提示 2 个非严重问题：
- 缺少 `image`
- `author` 下缺少 `url`

修复提交：

- `6bee67db`：为归档页 `ItemList` 中的 `Article` 补齐 `image` 和 `author.url`

修复后本地验证：

- 本地渲染的 `/puzzles` 页面中，首条 `Article` 已包含：
- `image = https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-687/opengraph-image`
- `author.url = https://pinpointanswertoday.app/`

修复后线上复核：

- 正式站 `/puzzles` 源码已确认首条 `Article` 包含：
- `image = https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-687/opengraph-image`
- `author.url = https://pinpointanswertoday.app/`

当前判断：

- 这 2 个 Rich Results Test 非严重问题的根因已经修复并上线
- 下一步只需要重新跑一次 Google Rich Results Test，确认旧截图里的警告已消失

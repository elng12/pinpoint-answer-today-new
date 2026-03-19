# 2026-03-19 SEO 修复上线后验证清单

## 这次要验证什么

这份清单只验证 2026-03-19 这一轮 SEO 修复：

- 归档页补了独立 `ItemList` 结构化数据
- 归档页带搜索参数时，canonical 和 hreflang 不丢
- 详情页只在有 FAQ 数据时才输出 `FAQPage`

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

## C. 验证详情页 FAQ Schema

打开任意一个详情页，在控制台执行：

```js
const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
const parsed = scripts.map((s) => JSON.parse(s.textContent || "{}"));
const faqPage = parsed.find((p) => p["@type"] === "FAQPage");

console.log({
  hasFaqPage: !!faqPage,
  faqCount: faqPage?.mainEntity?.length ?? 0,
});
```

预期结果：

- 当前正常详情页一般应存在 `FAQPage`
- `faqCount` 应大于 `0`

如果后续出现一个没有 FAQ 的详情页，再补做一次反向验证：

- 页面里不应输出 `FAQPage`
- 不应出现 `mainEntity: []`

---

## D. Google 工具复查

建议上线后用 Google Rich Results Test 复查两类页面：

- `/puzzles`
- 任意一个详情页

预期结果：

- 归档页能识别到 `ItemList`
- 详情页的 `Article`、`BreadcrumbList`、`HowTo` 正常
- 有 FAQ 的详情页不应出现 FAQ 空数组警告

---

## E. 这轮通过的判定标准

以下 5 条都满足，就可以认为这轮 SEO 修复已验收完成：

1. `/puzzles` 页面里能读到独立 `ItemList`
2. `ItemList` 里的条目数和归档总量一致
3. `/puzzles?q=test` 的 canonical 不带查询参数，且 hreflang 还在
4. 正常详情页的 FAQ Schema 非空
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
- `FAQPage` Schema 存在
- `faqCount = 3`
- canonical 为带尾斜杠的正式详情页 URL

当前结论：

- A、B、C 三项线上源码验收通过
- 本轮代码修复已经在线上生效，没有发现回归
- D 项中的 Google Rich Results Test 还需要人工到 Google 工具页面补一次最终复查

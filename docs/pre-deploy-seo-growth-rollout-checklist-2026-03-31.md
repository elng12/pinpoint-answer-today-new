# 2026-03-31 SEO 增长改动上线前检查清单

## 这份清单覆盖什么

这份清单只服务本轮 2026-03-31 的 SEO 增长改动上线，不覆盖其他历史修复。

本轮范围：

- 归档页继续沿用全量 HTML 内链方案
- Preview 页从 `noindex` 改为可收录，并进入 sitemap
- `privacy`、`terms`、`disclaimer` 去掉 `noindex`
- `contact-us` 从 sitemap 移除
- 导航和页脚里指向 Preview 的入口统一叫 `Pro Tips`
- 详情页新增 `Updated on` 与 `How we verify`
- `about-us` 新增 `#editorial-process`

## 本轮建议一起上线的文件

- `app/(site)/puzzles/page.tsx`
- `app/sitemap.ts`
- `app/(site)/next-pinpoint-preview/page.tsx`
- `app/(site)/privacy/page.tsx`
- `app/(site)/terms/page.tsx`
- `app/(site)/disclaimer/page.tsx`
- `components/layout/NavBar.tsx`
- `components/layout/Footer.tsx`
- `components/detail/PuzzleDetail.tsx`
- `app/(detail)/detail.css`
- `app/(site)/about-us/page.tsx`

说明：

- `app/(site)/puzzles/page.tsx` 不是这次新改的，但它承载了 PRD 里已经确认要上线的“归档页全量 HTML 内链 + revalidate”改动；如果这次 rollout 要完整闭环，建议一起带上
- `docs/` 下的 PRD 和这份 checklist 不需要跟着正式部署，但建议一起提交留档

## 本地预检

上线前先在本地跑这 3 条，全部通过才进入部署：

```bash
npm run typecheck
npm run test:pinpoint-seo
npm run build
```

当前这次本地已验证结果：

- `npm run typecheck`：通过
- `npm run test:pinpoint-seo`：通过
- `npm run build`：通过

## 部署前口径确认

部署前只确认 4 件事：

1. `NEXT_PUBLIC_SITE_URL` 仍是 `https://pinpointanswertoday.app`
2. 本次 deploy 确实包含 `app/(site)/puzzles/page.tsx`
3. 没有把 `contact-us` 误从页面本身删掉，删掉的只是 sitemap 入口
4. 旧的历史文档里如果写着 “Preview 页继续 noindex”，这次不要照旧执行；本轮目标是让 Preview 可收录

## 上线后立刻跑的命令

### A. sitemap 口径

```bash
curl -s https://pinpointanswertoday.app/sitemap.xml | grep 'next-pinpoint-preview'
curl -s https://pinpointanswertoday.app/sitemap.xml | grep 'contact-us'
```

预期结果：

- 第一条返回非空，说明 Preview 已进 sitemap
- 第二条没有结果，说明 `contact-us` 已从 sitemap 移除

### B. Preview 页索引口径

```bash
curl -s https://pinpointanswertoday.app/next-pinpoint-preview/ | grep '<title>'
curl -s https://pinpointanswertoday.app/next-pinpoint-preview/ | grep -i 'name="robots"'
```

预期结果：

- `<title>` 不含 `Coming Soon`
- `robots` meta 不含 `noindex`

说明：

- 本项目的索引口径走的是 HTML `<meta name="robots">`
- 不要用 `curl -I` 验 `noindex`

### C. 法务页索引口径

```bash
curl -s https://pinpointanswertoday.app/privacy/ | grep -i 'name="robots"'
curl -s https://pinpointanswertoday.app/terms/ | grep -i 'name="robots"'
curl -s https://pinpointanswertoday.app/disclaimer/ | grep -i 'name="robots"'
```

预期结果：

- 3 页都存在 `robots` meta
- 3 页的 content 都不含 `noindex`

### D. 详情页可信信号

先选一条最近有过更新的详情页，再选一条未更新过的详情页。

需要肉眼确认：

- 已更新页面头部能看到 `Published on` 和 `Updated on`
- 未更新页面不会硬塞一条空的 `Updated on`
- 详情页验证标签旁边有 `How we verify`
- 点击后跳到 `/about-us#editorial-process`

### E. about-us 锚点

```bash
curl -s https://pinpointanswertoday.app/about-us/ | grep 'editorial-process'
```

预期结果：

- 返回非空，说明锚点章节已上线

### F. 归档页能力

```bash
curl -s https://pinpointanswertoday.app/puzzles/ | grep -c 'href.*linkedin-pinpoint-answers'
curl -o /dev/null -s -w 'TTFB: %{time_starttransfer}s\n' https://pinpointanswertoday.app/puzzles/
```

预期结果：

- 第一条结果 >= `700`
- 第二条 `TTFB` <= `0.8s`

如果 `TTFB` 超标：

- 暂停继续提交 GSC 动作
- 先判断是否需要把归档页回退到 `200` 条方案

## UI 抽样检查

上线后至少肉眼点 5 个地方：

1. 首页导航：只看到一个 `Pro Tips`
2. 任意详情页导航：只看到一个 `Pro Tips`
3. 首页页脚：只看到一个 `Pro Tips`
4. 详情页页脚：只看到一个 `Pro Tips`
5. Preview 页、Archive 页、详情页之间能互相跳转，不出现死链

## GSC 后续动作

本轮和 2026-03-12 那次切站不同，重点新增 2 个动作：

1. 重新提交 `https://pinpointanswertoday.app/sitemap.xml`
2. 对 `https://pinpointanswertoday.app/next-pinpoint-preview/` 做一次 URL Inspection，确认页面允许编入索引

前 7 天重点看：

- Preview 页是否开始出现 impressions
- 首页 today 词流量是否异常下滑
- `/puzzles` 是否继续承接 archive 类词

## 这轮 go / no-go 标准

满足下面 6 条，才算可以把这轮视为“上线完成”：

1. 本地 `typecheck`、SEO 检查、build 全部通过
2. Preview 在 sitemap 中，且页面不再 `noindex`
3. `contact-us` 不在 sitemap 中
4. `privacy`、`terms`、`disclaimer` 都不再 `noindex`
5. 详情页能看到可信信号，`How we verify` 能跳到 `about-us#editorial-process`
6. `/puzzles` 仍有 700+ 详情页链接，且 TTFB 没超阈值

## 这轮最容易忘的 3 件事

- 不要只改 Preview 页 `title`，忘了把它加进 sitemap
- 不要只看 `curl -I`，那样验不到 `metadata.robots`
- 不要漏掉 `app/(site)/puzzles/page.tsx`，否则这轮“放量层”不会真的一起上线

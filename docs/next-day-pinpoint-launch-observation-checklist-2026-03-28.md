# Next-Day Pinpoint Launch Observation Checklist

适用场景：

- 新版详情页、worker 状态机、`/pinpoint/today` 发布中占位已经上线
- 想在第二天首发后，用 2 分钟确认“今天这题有没有正常发布”

一句话目标：

- 先看“今天这题是不是已经对外可见”
- 再看“worker 有没有卡住”
- 最后看“详情页正文是不是和当天答案一致”

---

## 1. 先看公开口径是否一致

### 1.1 看摘要接口

```bash
curl -sS https://pinpointanswertoday.app/api/puzzles/summary
```

通过标准：

- `latest.slug` 是今天那一题
- `status` 是 `live`

如果不对，白话就是：

- 首页和详情页对外口径还没切到今天这题

### 1.2 看 `/pinpoint/today`

```bash
curl -sSI https://pinpointanswertoday.app/pinpoint/today
```

通过标准分两种：

- 已正式发布：返回 `307`，并跳到今天那题的详情页
- 还在发布中：返回 `503`，并带 `retry-after`

如果看到别的结果，白话就是：

- 当天入口逻辑不对，可能跳错题、提前露出、或者没切换成功

---

## 2. 看 worker 有没有正常拿到今天题目

### 2.1 看健康页

```bash
curl -sS https://pinpoint-worker.2296744453m.workers.dev/health
```

通过标准：

- `puzzleDate` 是今天
- `answers` 有 5 个词
- `source` 正常情况下优先看见 `graphql`

如果这里不对，白话就是：

- worker 还没抓到今天题，或者抓到了但数据不完整

### 2.2 看监控页

```bash
curl -sS https://pinpoint-worker.2296744453m.workers.dev/monitor/cron-status
```

重点看这 4 个位置：

- `latest.outcome`
- `latest.quickPublish.status`
- `latest.enrich.status`
- `alerts`

通过标准：

- `latest.outcome = "succeeded"`
- `alerts` 是空数组

正常但不一定代表有问题的情况：

- `quickPublish.status = "skipped"` 且原因是今天已经发过
- `enrich.status = "skipped"` 且原因是今天已经 enrich 完成

需要警惕的情况：

- `alerts` 不是空
- `detailState` 长时间停在 `generating` 或 `validated`
- `outcome = "failed"`

---

## 3. 看今天详情页正文是不是对上

先把今天的 slug 从摘要接口里拿出来，比如 `pinpoint-answer-697`。

### 3.1 最低人工检查

直接打开：

- `https://pinpointanswertoday.app/linkedin-pinpoint-answers/<today-slug>/`

至少看这 5 件事：

- 标题是不是今天那题
- 5 个 clue 对不对
- 答案是不是今天那题的答案
- 正文有没有明显跑题、重复段、空白段
- FAQ 和 clue 表是不是还能读通

### 3.2 这轮新版最该多看两项

如果今天这题是新版详情结构，还要顺手确认：

- 页面里有没有 `Solve path snapshot`
- 页面里有没有 `Clue-by-clue evidence`

如果没有，白话就是：

- 详情页可能退回了旧壳子，或者 v2 字段没被正确消费

---

## 4. 快速判断结果

### 绿色

满足下面这些就算正常：

- 摘要接口是今天那题
- `/pinpoint/today` 正常跳今天详情页
- worker `/health` 是今天这题，且 5 个 clue 完整
- `/monitor/cron-status` 没告警
- 详情页正文、答案、FAQ、证据表都对得上

### 黄色

可以先观察，但要记一笔：

- `quickPublish` / `enrich` 显示 `skipped`
- 监控里是成功，但今天详情页看起来还是旧正文
- 页面能打开，但 `Solve path snapshot` 或 `Clue-by-clue evidence` 没出现

### 红色

需要立刻处理：

- `/api/puzzles/summary` 不是今天这题
- `/pinpoint/today` 既不是 `307` 也不是 `503`
- `/health` 不是今天题，或者 clue 不满 5 个
- `alerts` 非空
- 详情页答案或正文明显错题

---

## 5. 推荐的最短执行顺序

如果你只想花 2 分钟，按这个顺序看：

1. `summary`
2. `/pinpoint/today`
3. `worker /health`
4. `worker /monitor/cron-status`
5. 今天详情页人工看一眼

---

## 6. `2026-03-28` 基线参考

这次上线后，正常状态长这样：

- `summary.latest.slug = pinpoint-answer-697`
- `/pinpoint/today` 返回 `307` 到 `pinpoint-answer-697`
- worker `/health` 返回 `2026-03-28`，`source = "graphql"`
- `/monitor/cron-status` 的 `alerts = []`
- 最新详情页已出现：
  - `Solve path snapshot`
  - `Clue-by-clue evidence`

如果下次你看到的结果和这组基线差很远，优先按异常处理，而不是先猜“是不是缓存没刷新”。

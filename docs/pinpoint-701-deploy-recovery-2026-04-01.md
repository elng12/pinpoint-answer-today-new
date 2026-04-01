# Pinpoint #701 发布故障运行记录 - 2026-04-01

## 一句话结论

`2026-04-01` 这天站点首页一度还显示 `700`，不是缓存问题，而是 `Pinpoint #701` 的生产部署失败，导致线上仍停在上一版。

## 现象

- 首页标题仍显示 `Today's LinkedIn Pinpoint #700`
- `/api/puzzles/summary` 返回的最新题仍是 `700`
- `/pinpoint/today` 返回 `503` 发布中占位
- 但 `/api/pinpoint/today` 已经返回 `2026-04-01` 的当天题数据，且有 5 个 clues

这组现象说明：

- Worker 已经抓到今天题
- 但正式站点还没有把今天题发布成功

## 根因

Vercel 在构建提交 `4a45caa`（`feat: publish Pinpoint #701`）时失败。

直接报错是：

```text
pinpoint-answer-701 fullAnalysis is too thin (77 words; expected at least 80).
```

白话就是：

- `data/puzzles/pinpoint-answer-701.json` 已经写进 GitHub 了
- 但这篇 fallback 正文太短，没过构建校验
- 所以整次 production deploy 被拦下
- 线上继续保留上一版，自然还是 `700`

## 处理动作

本次实际处理分 2 步：

1. 在远端最新 `main` 上补齐 `pinpoint-answer-701.json` 的 `fullAnalysis` 长度，让它超过 80 词
2. 同时把 `lib/puzzles/fallback-copy.ts` 的 fallback 模板略微加厚，降低后续同类题再次因为“正文太短”挂构建的概率

相关提交：

- `137fed3` - `fix(pinpoint): unblock Pinpoint #701 deploy`
- `d12a10d` - `docs(content-qa): add observation window guidance`

## 修复后核对

修复完成后，线上口径恢复一致：

- `/api/puzzles/summary` → `701`
- `/pinpoint/today` → `307` 跳转到 `pinpoint-answer-701`
- `/linkedin-pinpoint-answers/pinpoint-answer-701/` → `200`
- 首页标题 → `Today's LinkedIn Pinpoint #701`
- `/api/pinpoint/today` 仍返回 `2026-04-01`，`answers.length = 5`，`source = graphql`

## 下次 2 分钟排查顺序

如果以后再出现“今天还是昨天题号”，按这个顺序看：

1. `curl -sS https://pinpointanswertoday.app/api/puzzles/summary`
2. `curl -sSI https://pinpointanswertoday.app/pinpoint/today`
3. `curl -sS https://pinpointanswertoday.app/api/pinpoint/today`
4. 查对应 GitHub 提交的 Vercel 状态
5. 如果 Vercel 失败，先看是否又是 `fullAnalysis` / 构建校验没过

## 这次最重要的经验

- 当 `/api/pinpoint/today` 已经是当天题，但首页和 summary 还停在昨天，优先怀疑“正式部署失败”，不要先猜缓存
- `data/puzzles/*.json` 已进 GitHub，不代表线上一定已经切换成功；Vercel 构建失败时，线上会继续保留旧版本
- fallback 正文虽然是兜底页，也必须满足构建下限，否则会直接挡住当天发布

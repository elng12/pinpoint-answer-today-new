# 2026-03-13 正式环境发布清单

## 结论

本次正式环境发布已完成，线上域名 `https://pinpointanswertoday.app` 现在运行的是本次收口后的版本。

这次发布不是直接从当前脏工作区整体上线，而是从 `HEAD` 导出的干净副本中，只拷入本次需要上线的修复后发布。

## 建议提交顺序

### Commit 1

提交信息建议：

`fix: repair puzzle hint data and enforce content validation`

建议纳入文件：

- `data/puzzles/pinpoint-answer-560.json`
- `data/puzzles/pinpoint-answer-567.json`
- `data/puzzles/pinpoint-answer-568.json`
- `data/puzzles/pinpoint-answer-581.json`
- `data/puzzles/pinpoint-answer-588.json`
- `data/puzzles/pinpoint-answer-590.json`
- `data/puzzles/pinpoint-answer-592.json`
- `data/puzzles/pinpoint-answer-593.json`
- `data/puzzles/pinpoint-answer-605.json`
- `data/puzzles/pinpoint-answer-609.json`
- `data/puzzles/pinpoint-answer-617.json`
- `data/puzzles/pinpoint-answer-625.json`
- `data/puzzles/pinpoint-answer-626.json`
- `data/puzzles/pinpoint-answer-631.json`
- `data/puzzles/pinpoint-answer-634.json`
- `data/puzzles/pinpoint-answer-637.json`
- `data/puzzles/pinpoint-answer-639.json`
- `data/puzzles/pinpoint-answer-640.json`
- `data/puzzles/pinpoint-answer-644.json`
- `data/puzzles/pinpoint-answer-646.json`
- `data/puzzles/pinpoint-answer-647.json`
- `data/puzzles/pinpoint-answer-648.json`
- `data/puzzles/pinpoint-answer-652.json`
- `data/puzzles/pinpoint-answer-653.json`
- `data/puzzles/pinpoint-answer-655.json`
- `data/puzzles/pinpoint-answer-656.json`
- `data/puzzles/pinpoint-answer-660.json`
- `data/puzzles/pinpoint-answer-661.json`
- `data/puzzles/pinpoint-answer-662.json`
- `data/puzzles/pinpoint-answer-670.json`
- `scripts/validate-data.mjs`
- `lib/puzzles/schema.shared.d.mts`

### Commit 2

提交信息建议：

`fix: harden public routes and polish fallback UX`

建议纳入文件：

- `app/api/feedback/route.ts`
- `app/api/revalidate/route.ts`
- `app/error.tsx`
- `app/not-found.tsx`
- `app/globals.css`
- `app/privacy/page.tsx`
- `app/robots.ts`
- `app/terms/page.tsx`
- `app/disclaimer/page.tsx`
- `components/layout/Footer.tsx`
- `lib/seo/metadata.ts`
- `next.config.ts`

## 已随本次发布上线的内容

- 数据修复：`#560` 题目线索修正，4 个 `fullAnalysis` HTML 污染清理，30 个详情 JSON 的 `wordHints` 键名对齐
- 校验加固：数据验证脚本现在会拦截 clue 和 hint 不匹配、HTML 标签混入、分析内容过薄
- 工程修复：`lint` 已恢复可运行
- 安全加固：基础安全响应头、`/api/` 的 `robots` 屏蔽、`revalidate` header 鉴权兼容、反馈接口基础限流和日志脱敏
- 体验补丁：品牌化 `404/500` 页面、全局键盘 focus 样式、Footer 文案和 key 修复、法律页更新时间修正
- 首页热修：`components/shared/Countdown.tsx` 改为客户端挂载后再计算倒计时和时区，避免 hydration 不一致
- 首页热修：`components/shared/RecentAnswerCard.tsx` 与 `lib/utils/date.ts` 改为稳定的字符串日期格式化，避免 `toLocaleDateString()` 在不同运行环境下产出不一致

## 当前工作区里仍未随本次发布上线的本地改动

以下文件在你当前工作区仍有变更，但没有被带进这次正式环境发布：

- `.env.example`
- `app/contact-us/page.tsx`
- `app/layout.tsx`
- `components/analytics/AnalyticsScripts.tsx`
- `components/contact/ContactFeedbackForm.tsx`
- `components/detail/PuzzleAnswerReveal.tsx`
- `components/detail/PuzzleFullAnalysis.tsx`
- `components/layout/NavBar.tsx`
- `components/preview/PreviewCountdown.tsx`
- `components/shared/AnswerReveal.tsx`
- `components/shared/Countdown.tsx`
- `components/shared/RecentAnswerCard.tsx`
- `data/puzzles/pinpoint-answer-681.json`
- `data/puzzles/registry.json`
- `lib/utils/date.ts`
- `docs/` 目录下的本地文档

## PR 描述建议

标题建议：

`Fix puzzle data quality issues and harden public-facing routes`

描述建议：

1. 修正一批详情页谜题数据错误，补上内容校验防线，避免错误 hints 再次进入生产。
2. 增加基础安全响应头、API 爬虫屏蔽、反馈接口限流与日志脱敏，降低公开端点被滥用风险。
3. 补齐 404/错误页、全局 focus 样式、Footer 和法律页细节，改善品牌一致性与可用性。

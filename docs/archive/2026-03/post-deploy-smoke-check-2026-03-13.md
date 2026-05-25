# 2026-03-13 正式站上线后巡检

## 巡检范围

- 首页：`https://pinpointanswertoday.app/`
- 详情页：`https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-560`
- 联系页：`https://pinpointanswertoday.app/contact-us`
- 法律页：`https://pinpointanswertoday.app/privacy`
- 404 页：`https://pinpointanswertoday.app/this-page-should-not-exist`
- OG 图片：`https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-560/opengraph-image`
- 旧链接重定向（后续补充）：`https://pinpointanswertoday.app/linkedin-pinpoint`（应跳转到 `/puzzles`）
- 旧链接重定向（后续补充）：`https://pinpointanswertoday.app/en/linkedin-pinpoint`（应跳转到 `/puzzles`）

## 结果概览

- 首页：可访问，返回 `200`
- 详情页 `#560`：可访问，返回 `200`
- 联系页：可访问，表单字段正常渲染
- Privacy 页面：可访问，`Last updated: March 12, 2026` 已生效
- 404 页面：可访问，返回 `404`，品牌化文案已生效
- 详情页 OG 图片：可访问，返回 `200`
- 旧链接重定向 `/linkedin-pinpoint`：返回 `308`，跳转到 `/puzzles`（2026-03-30 复核通过）
- 旧链接重定向 `/en/linkedin-pinpoint`：返回 `308`，跳转到 `/puzzles`（2026-03-30 复核通过）
- `robots.txt`：已包含 `Disallow: /api/`
- 安全响应头：首页、详情页、OG 图片已带 `Content-Security-Policy`、`X-Frame-Options`、`X-Content-Type-Options` 等

## 最终状态

本文件中最初记录的首页 React hydration 报错，已在同日后续热修中解决。

最终热修包含：

- `components/shared/Countdown.tsx`
- `components/shared/RecentAnswerCard.tsx`
- `lib/utils/date.ts`

热修后复查结果：

- 正式站首页桌面端控制台：0 errors
- 正式站首页移动端等效视口：本地生产验证为 0 errors
- 首页最近答案日期已稳定显示为固定格式，例如 `03/12/2026`

## 巡检发现

### P1 - 首页存在 React 客户端报错

现象：

- 首页桌面端和移动端都稳定出现 1 条 React 控制台报错
- 报错形式为 React 最小化错误 `#418`
- 详情页、联系页、法律页没有同类报错

影响：

- 用户表面上仍能正常浏览首页
- 但这代表首页存在“服务端先渲染的内容”和“浏览器接手后重新计算的内容”不一致的问题
- 这类问题会让前端交互和后续调试变得不稳定，也可能影响首屏体验

高概率原因：

- `components/shared/Countdown.tsx` 在初始渲染阶段直接使用 `Date.now()` 计算剩余时间
- 同一个组件还在初始渲染阶段读取 `Intl.DateTimeFormat().resolvedOptions().timeZone`
- 这两个值在服务器和用户浏览器里天然可能不同，因此首页 hydration 会不一致
- 首页通过 `components/home/HomeNextUnlock.tsx` 引用了这个倒计时组件，所以问题集中出现在首页

建议修复方向：

- 倒计时和用户时区信息先在客户端挂载后再显示
- 或者服务端先输出稳定占位，再在 `useEffect` 后刷新真实时间
- 修完后重新巡首页桌面端和移动端控制台

## 结论

这次正式发布主目标已经达成，线上关键页面、分享图、`robots` 和安全头都正常。

原先唯一明确需要继续跟进的首页 hydration 报错，现已在后续热修中关闭。

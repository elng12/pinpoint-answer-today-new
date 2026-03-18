# Pinpoint Answer Today 新站修订版审评结论

日期：2026-03-12
结论：原报告有参考价值，但不能直接照单执行。当前代码里存在几条已修复或误报项，同时漏掉了一个更系统的数据一致性问题。

## 一、确认属实且应优先处理

### P0 数据正确性

1. `#560` 的 `wordHints` 与题目 clues 完全串题
   - 文件：`data/puzzles/pinpoint-answer-560.json`
   - 现象：详情 JSON 中 `wordHints` 是 `Anchor/Ship/Sail/Harbor/Captain`，但注册表 clues 是 `Lab/House/Pea/Rain/Trench`
   - 影响：详情页逐条解释失真，属于内容正确性问题

2. 4 个详情 JSON 含 HTML 标签
   - 文件：
     - `data/puzzles/pinpoint-answer-560.json`
     - `data/puzzles/pinpoint-answer-567.json`
     - `data/puzzles/pinpoint-answer-568.json`
     - `data/puzzles/pinpoint-answer-590.json`
   - 现象：`fullAnalysis` 中含 `<p>`、`<strong>`、`<ul>` 等标签
   - 影响：当前 React 按纯文本渲染，会直接显示原始标签

3. `wordHints` 键名错配不是孤例，而是系统性问题
   - 范围：至少 27 个题目存在 clue 与 `wordHints` key 不完全匹配
   - 代表例子：
     - `pinpoint-answer-590`：`Fare thee` 被写成 `Fair thee`
     - `pinpoint-answer-605`：`Chang’e` 与 `Chang'e` 不一致
     - `pinpoint-answer-653`：带括号说明的 clue 与 hint key 被截短
   - 影响：页面会退回通用提示，用户看不到原本准备的逐条说明

4. 缺少内容级校验，现有校验只能保证“结构合法”
   - 文件：`scripts/puzzles/validate-data.mjs`
   - 现象：当前校验能通过上述错误数据
   - 影响：后续导入时同类问题还会重复进入线上

### P1 安全与滥用

5. 缺少安全响应头
   - 文件：`next.config.ts`
   - 现象：没有统一设置 `Content-Security-Policy`、`X-Frame-Options`、`X-Content-Type-Options` 等
   - 影响：点击劫持、资源加载约束、防嗅探等基础防护不足

6. 反馈 API 没有限流
   - 文件：`app/api/feedback/route.ts`
   - 影响：公开端点可能被刷，导致 webhook 滥用或噪音告警

7. revalidate secret 通过 URL query 传递
   - 文件：`app/api/revalidate/route.ts`
   - 影响：secret 更容易进入访问日志、代理日志、监控系统

8. 反馈 API 日志记录了个人信息
   - 文件：`app/api/feedback/route.ts`
   - 现象：`console.info` 包含 `email`、`phone`、`message`
   - 影响：日志侧存在隐私合规风险

9. `robots.txt` 未屏蔽 `/api/*`
   - 文件：`app/robots.ts`
   - 影响：搜索引擎可能探测 API 端点

### P1 体验与品牌一致性

10. 缺少自定义 `not-found.tsx` 与 `error.tsx`
    - 位置：`app/`
    - 影响：404 和服务端错误落回 Next 默认页，品牌感和可恢复性较差

11. Footer 中 `&apos;` 会按字面显示
    - 文件：`components/layout/Footer.tsx`
    - 影响：页面文案出现 `today&apos;s`

12. Footer support links 使用重复 key
    - 文件：`components/layout/Footer.tsx`
    - 影响：React 控制台会给出重复 key 警告

13. 缺少统一的全局 focus 可见样式
    - 文件：`app/globals.css`
    - 现状：只有少数搜索输入框定义了 `:focus`
    - 影响：键盘导航可用性和无障碍体验不足

14. 根布局每页都异步拉 recent entries
    - 文件：`app/layout.tsx`
    - 影响：不是阻断级问题，但让全站布局依赖数据层，增加耦合

## 二、原报告中不应继续按“当前问题”处理的项

1. `C1` 详情页 OG 图片路由缺失
   - 结论：误报
   - 说明：`app/linkedin-pinpoint-answers/[slug]/opengraph-image/route.tsx` 存在，且 `next build` 已生成对应路由

2. `C2` 默认 OG 静态图缺失
   - 结论：误报
   - 说明：`public/og-image.png` 存在

3. `H3` 首页 canonical 硬编码
   - 结论：当前代码不成立
   - 说明：首页已使用 `generateMetadata()` 和 `buildPageMetadata()`

4. `H10` Zod schema 重复且不一致
   - 结论：当前代码不成立
   - 说明：校验脚本已复用 `lib/puzzles/schema.shared.mjs`

5. `L2` OG 图片逻辑重复
   - 结论：当前代码不成立
   - 说明：根图和详情图都复用 `lib/seo/social-image.tsx`

## 三、成立但建议降级处理的项

1. `H4` 根布局 metadata 缺少 canonical
   - 建议：从高优先级降到中优先级
   - 原因：主要页面本身已有 canonical，这更像一致性补完

2. `M5` `NavBar/Footer` 使用 `use client`
   - 建议：保留为性能优化项
   - 原因：确实会增加客户端 JS，但不是功能缺陷

3. `M6` `AnswerReveal` 与 `PuzzleAnswerReveal` 重复
   - 建议：保留为重构项
   - 原因：技术债真实存在，但不影响当前线上正确性

4. `M9` 暗色模式变量未启用
   - 建议：保留为可选能力，不算 bug

5. `M10` 导航缺少移动端菜单
   - 建议：从高风险表述降为 UX 优化
   - 原因：当前导航已 `flex-wrap`，未看到必然溢出证据

6. `M12` 根布局异步获取数据会影响所有页面
   - 建议：弱化表述
   - 原因：数据层已有本地文件和 bundled fallback，不是“数据源故障即全站挂”

7. `M15` 题号连续性缺口
   - 建议：改列为内容 backlog
   - 原因：这是内容覆盖范围问题，不是工程缺陷

## 四、原报告漏掉的重要项

1. `npm run lint` 当前失败
   - 文件：`lib/puzzles/schema.shared.d.mts`
   - 影响：会拖慢后续修复和 CI 稳定性

2. 多个法律页“最后更新日期”仍是 2025-10-16
   - 文件：
     - `app/privacy/page.tsx`
     - `app/terms/page.tsx`
     - `app/disclaimer/page.tsx`
   - 影响：会削弱用户对页面时效性的信任

3. 版权年份硬编码为 2026
   - 文件：`components/layout/Footer.tsx`
   - 影响：后续年份切换时容易遗忘

## 五、建议执行顺序

### 第一批：先修线上正确性

1. 修 `#560` 错误 hints
2. 清理 `560/567/568/590` 的 HTML 标签
3. 修正其余 `wordHints` 键名错配
4. 在 `validate-data.mjs` 增加内容级校验
   - clue 与 `wordHints` key 必须一一对应
   - 禁止 HTML 标签混入纯文本字段
   - 可选增加最小内容质量规则

### 第二批：补安全底座

1. 在 `next.config.ts` 增加基础安全响应头
2. 为 `app/api/feedback/route.ts` 增加限流
3. 将 `app/api/revalidate/route.ts` 的 secret 改为 header 读取
4. 删除或脱敏反馈日志中的 PII
5. 在 `app/robots.ts` 中加入 `/api/*` 的 `Disallow`

### 第三批：修用户可见体验

1. 新增 `app/not-found.tsx`
2. 新增 `app/error.tsx`
3. 修 Footer 文案中的 `&apos;`
4. 修 Footer 重复 key
5. 增加统一 `:focus-visible` 样式
6. 更新法律页日期和版权年份处理

### 第四批：再做优化和重构

1. 评估升级到最新稳定 `Next.js 15.x`
2. 优化 `NavBar/Footer` 的客户端化范围
3. 合并 `AnswerReveal` / `PuzzleAnswerReveal`
4. 将 `HomePuzzleSearch` 改为使用 `routes.detail()`
5. 清理未使用文件与空 layout

## 六、我建议你们内部同步时的结论话术

可直接这样说：

“原审查报告总体方向是对的，但有几条已经被当前代码修掉，不能原样照单执行。真正最急的是数据正确性和内容校验缺失，其次才是安全加固，再往后才是 SEO/重构优化。我们已经确认分享图路由、默认 OG 图、首页 canonical 都不是当前阻塞项。” 

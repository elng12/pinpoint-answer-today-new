# 2026-03-31 当前改动提交建议

## 结论

这批改动建议拆成 `3` 个 commit。

这样拆的好处：

- 第一提交只解决“收录口径 + 页面入口 + 归档放量”，适合直接对应本轮 SEO rollout
- 第二提交只解决“详情页信任信号”，回滚时不会误伤 sitemap 和 Preview 收录口径
- 第三提交只留文档，避免代码上线和文档留档互相缠在一起

## Commit 1

提交信息建议：

`feat: roll out archive and preview SEO growth fixes`

建议纳入文件：

- `app/(site)/puzzles/page.tsx`
- `app/sitemap.ts`
- `app/(site)/next-pinpoint-preview/page.tsx`
- `app/(site)/privacy/page.tsx`
- `app/(site)/terms/page.tsx`
- `app/(site)/disclaimer/page.tsx`
- `components/layout/NavBar.tsx`
- `components/layout/Footer.tsx`

这组改动解决的问题：

- 归档页全量 HTML 内链 + `revalidate`
- Preview 页改为可收录
- Preview 页进入 sitemap
- `contact-us` 从 sitemap 移除
- `privacy` / `terms` / `disclaimer` 去掉 `noindex`
- 导航和页脚里 Preview 入口统一为 `Pro Tips`

说明：

- `app/(site)/puzzles/page.tsx` 虽然不是这次新写的，但它是本轮 rollout 的组成部分，建议和这组一起提交，不要单独遗留

## Commit 2

提交信息建议：

`feat: add visible trust signals to detail pages`

建议纳入文件：

- `components/detail/PuzzleDetail.tsx`
- `app/(detail)/detail.css`
- `app/(site)/about-us/page.tsx`

这组改动解决的问题：

- 详情页新增 `Updated on`
- 详情页新增 `How we verify`
- `about-us` 新增 `#editorial-process`
- `about-us` 新增 corrections policy

这组单独拆开的好处：

- 如果上线后 SEO 收录口径没问题，但详情页信任文案还想继续润色，可以只回滚或继续改这一组

## Commit 3

提交信息建议：

`docs: document seo growth rollout and verification steps`

建议纳入文件：

- `docs/pinpoint-seo-growth-prd-2026-03-31.md`
- `docs/pre-deploy-seo-growth-rollout-checklist-2026-03-31.md`
- `docs/recommended-commit-plan-2026-03-31.md`

这组改动解决的问题：

- PRD 从“方向文档”变成“可执行文档”
- 上线前 checklist 可直接给同事照着走
- 当前提交拆分思路有留档

## 如果你想压缩成 2 个 commit

也可以这么做：

### Commit 1

`feat: roll out archive and preview SEO growth fixes`

- 带上上面 Commit 1 的全部代码文件

### Commit 2

`feat: add trust signals and rollout docs for seo growth`

- 带上上面 Commit 2 的代码文件
- 再加上全部 `docs/` 文档

适用场景：

- 你更想减少 commit 数量
- 这批就是要一起评审、一起上线

## 我当前更推荐哪种

我更推荐 `3` 个 commit。

原因：

- 代码上线面更清楚
- 文档不会混进可执行代码 diff 里
- 你后面如果要 cherry-pick 或回滚，风险更小

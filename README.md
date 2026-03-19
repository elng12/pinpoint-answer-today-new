# New Pinpoint Site Starter

这是一个给第二代纯英文站准备的最小骨架。

## 目标

- 先把新站的 4 个核心页面立起来
- 保持结构轻
- 需要什么能力，再从旧站搬什么模块

## 当前包含

- 首页 `/`
- 预告页 `/next-pinpoint-preview`
- 归档页 `/puzzles`
- 详情页 `/linkedin-pinpoint-answers/[slug]`
- 基础信任页
- `robots` 和 `sitemap`
- `JSON registry + 每题独立 JSON` 数据结构
- 基础 GA4 统计接入（沿用旧站环境变量口径）

## 当前已复用的旧站思路

- `answer-reveal` 的核心交互与事件口径
- `GA4 + gtag` 的基础环境变量命名
- 详情页 FAQ / 长解释 / 提示块的数据结构

## 运营备注

- `public/startupranking1371053120245110.html` 是 `Startup Ranking` 认领验证文件。
- 后续发版时不要删除、改名或移动它，线上需要继续保留 `/startupranking1371053120245110.html`。

## 运行

```bash
cd new-pinpoint-site
npm install
npm run dev
```

如需开启 GA4：

```bash
cp .env.example .env.local
```

然后把 `NEXT_PUBLIC_ENABLE_GA` 改成 `true`，再填入 `NEXT_PUBLIC_GA_ID`。

## 内容回归检查

以后只要改了下面任一类内容，发布前都建议跑一次回归：

- `lib/puzzle-generation.ts`
- `app/api/admin/generate-draft/route.ts`
- `lib/puzzles/content-contract.ts`
- `lib/puzzles/semantic-lint.ts`
- 发布门槛、自动修补、answer reveal 相关逻辑

常用命令：

```bash
npm run test:pinpoint-regression
npm run test:pinpoint-regression:core
npm run test:pinpoint-regression:all
```

使用建议：

- 日常小改动：先跑 `npm run test:pinpoint-regression`
- 准备合并或发布前：跑 `npm run test:pinpoint-regression:core`
- 大改生成器或质检规则：再补跑 `npm run test:pinpoint-regression:all`

样本集说明见：

- `docs/pinpoint-content-regression-sample-set.md`
- `docs/pinpoint-content-generation-best-practice-2026-03-17.md`

## 正式发布

如果这次改动会同时影响站点和 `worker/`，不要只做 `git push`。

现在推荐统一用这条命令收口：

```bash
npm run release:production
```

这条脚本会按顺序做这些事：

- 确认当前分支是 `main`，而且工作区干净
- 先跑 `test:pinpoint-guardrails`、`typecheck`、`validate:data`、`worker` 的 `typecheck`
- 推送 `origin/main`
- 等这次提交对应的 Vercel 部署成功
- 单独部署生产 Cloudflare Worker
- 最后检查首页、`/api/puzzles/summary` 和 Worker `/health`

如果你只想先演练不真正发布：

```bash
npm run release:production -- --dry-run
```

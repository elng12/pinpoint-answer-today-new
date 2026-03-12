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

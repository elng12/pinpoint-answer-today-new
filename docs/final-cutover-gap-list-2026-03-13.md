# 2026-03-13 彻底脱钩收尾清单

## 结论

新仓库已经接管主生产链路，但还不适合宣布“完全迁移完成、彻底不再依靠父仓库”。

当前更准确的状态是：

- 正式域名、页面、数据写入、revalidate 主链路已在新仓库
- 仍处于观察期
- 父仓库仍保留回滚和部分兜底意义

---

## 还差 5 项

### 1. ✅ 统一迁移状态文档口径（2026-03-13 已完成）

现状：

- `docs/single-repo-migration-todo-2026-03-13.md` 写的是阶段 C 已执行，当前在 `2026-03-13` → `2026-03-20` 观察期
- `worker/README.md` 已更新为”主链路已切到新仓库，当前处于观察期”

完成标准：

- ✅ 团队不再因为文档冲突误判当前生产入口

### 2. ✅ 明确 `/api/graphql` 与 `/api/fallback/worker-pinpoint` 的最终归属（2026-03-13 已完成）

现状：

- 新仓库 Worker 配置仍指向：
  - `https://pinpointanswertoday.app/api/graphql`
  - `https://pinpointanswertoday.app/api/fallback/worker-pinpoint`
- 这两个接口源码目前只在父仓库中找到，新仓库里未找到对应 route 文件
- `2026-03-13` 现场检查结果：
  - 新仓库本地未找到 `app/api/graphql/route.ts`
  - 线上 `https://pinpointanswertoday.app/api/graphql` 对 `GET` 返回 `404`
  - 线上 `https://pinpointanswertoday.app/api/graphql` 对 `POST` 也返回 `404`
  - 线上 `https://pinpointanswertoday.app/api/fallback/worker-pinpoint` 对 `POST` 也返回 `404`

这说明当前正式域名下的 `/api/graphql` 和 `/api/fallback/worker-pinpoint` 并不是“已由新仓库正常承接但文档没写”，而是大概率根本没有部署到当前站点里。

风险分级补充：

- 从仓库默认配置看，Worker 抓取时优先使用 `VOYAGER_GRAPHQL_ENDPOINT=https://www.linkedin.com/voyager/api/graphql`，所以 `/api/graphql` 缺失未必会立刻打断当前主抓取
- 但 `/api/fallback/worker-pinpoint` 缺失会让“主抓取失败后的站内兜底”失效
- 因此这不是“主链路立即全挂”的证据，但已经是一个真实的降级能力缺口

动作：

- 二选一：
  1. 把这两个接口迁入新仓库并纳入正式维护
  2. 把 Worker 配置改为真正独立的上游 / 兜底地址，不再让父仓库源码成为隐性依赖

执行顺序补充：

- 在真正开始第 2 项之前，先确认 Worker 生产环境是否还实际依赖 `GRAPHQL_ENDPOINT=https://pinpointanswertoday.app/api/graphql`
- 如果生产实际依赖这个地址，那么这项应提升为高优先级阻塞项，不能等到观察期后再处理

完成标准：

- ✅ `GRAPHQL_ENDPOINT` 已清空（`VOYAGER_GRAPHQL_ENDPOINT` 直连 LinkedIn，`GRAPHQL_ENDPOINT` 从未被调用）
- ✅ `FALLBACK_WEBHOOK` 已清空（原指向 404 接口，现在直接抛错触发告警）
- ✅ 新仓库代码与线上配置已自圆其说
- ✅ 生产 Worker 已重新部署（Version ID `3107a0db`）

### 3. 清理或隔离旧发布链路代码

现状：

- 新仓库 Worker 里仍保留 `getLegacySiteBaseUrl`、`quickPublishToSite`、`loadEnrichedPayloadFromSite` 这类旧链路分支
- 现在主要靠 `SITE_BASE_URL=\"\"` 让它默认不生效

动作：

- 观察期结束后，删除旧发布口分支，或至少把它明确标为仅限紧急回退使用

完成标准：

- 不会因为配置误填而重新打通旧链路
- 代码阅读时能一眼看出当前唯一正式发布路径

### 4. 调整回滚方案，不再把父仓库源码回滚当成默认首选

现状：

- 当前 runbook 仍允许通过父仓库恢复 Cron 回滚
- 但父仓库 `src/index.ts` 仍保留旧版 enrich / i18n 发布逻辑，与新仓库当前逻辑并不完全一致

动作：

- 推荐把“同服务名回滚到上一版 Worker”作为第一回滚方案
- 父仓库回滚保留为第二方案，并注明功能差异

完成标准：

- 回滚方案与当前生产逻辑尽量等价
- 值班时不会误以为“回父仓库”就是无损回退

### 5. 观察期后正式归档父仓库

现状：

- 迁移文档已写明：连续 7 天无异常后归档父仓库

动作：

- 删除或禁用父仓库生产 Cron
- 在父仓库 README 首行写明“生产 Worker 已迁移到新仓库”
- 将父仓库改为只读 / 归档口径

完成标准：

- 父仓库不再被误认为生产主入口
- 新需求默认只在新仓库开始

---

## 不算阻塞的问题

以下内容目前不算“仍依赖父仓库”：

- 旧 URL 的 301 永久跳转
- 旧页面别名路由保留
- 组件 / 样式里保留 `legacy-*` 命名

这些更偏向兼容层或命名历史，不等于运行时还靠老站活着。

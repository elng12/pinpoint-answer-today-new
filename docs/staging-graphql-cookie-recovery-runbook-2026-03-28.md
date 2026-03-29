# Staging GraphQL Cookie Recovery Runbook

适用场景：`pinpoint-worker-staging` 或 `pinpoint-worker-shadow` 的 `/admin/preflight-linkedin` 返回 `graphql 401`，但生产 `pinpoint-worker` 的同一预检仍然正常。

一句话判断：这通常不是发布链路坏了，而是演练环境的 `GRAPHQL_COOKIE` 过期了。

## 这份 runbook 解决什么

- 修复 `staging` / `shadow` 的 LinkedIn 直连抓取鉴权
- 尽量不碰生产配置
- 尽量不去追 Cloudflare 里读不出来的旧 secret 原值

## 先决条件

- 本机浏览器里当前已登录 LinkedIn
- 本机可以运行 `npx wrangler`
- 已拿到 `ADMIN_SECRET`

## 不要先做的事

- 不要先改生产 `pinpoint-worker`
- 不要先去追 Cloudflare 里旧的 `GRAPHQL_TOKEN` / `GRAPHQL_CSRF_TOKEN` 原值
- 不要把浏览器 cookie 明文贴到日志、文档或聊天工具里

## 标准修复步骤

### 1. 先确认是演练环境问题，不是上游整体故障

```bash
export ADMIN_SECRET='<your-admin-secret>'

curl "https://pinpoint-worker.2296744453m.workers.dev/admin/preflight-linkedin?secret=$ADMIN_SECRET&date=2026-03-28"
curl "https://pinpoint-worker-staging.2296744453m.workers.dev/admin/preflight-linkedin?secret=$ADMIN_SECRET&date=2026-03-28"
curl "https://pinpoint-worker-shadow.2296744453m.workers.dev/admin/preflight-linkedin?secret=$ADMIN_SECRET&date=2026-03-28"
```

预期口径：

- 如果生产返回 `ok: true` 且 `source: "graphql"`，而 `staging` / `shadow` 返回 `graphql 401`，优先怀疑演练环境 `GRAPHQL_COOKIE` 过期

### 2. 从本机浏览器提取一份新的 LinkedIn cookie

优先使用当前仍保持登录的浏览器配置。`2026-03-28` 实测里，Edge 配置可直接取到 `li_at` 和 `JSESSIONID`。

```bash
python3 - <<'PY' >/tmp/linkedin_edge_cookie.txt
import browser_cookie3

jar = browser_cookie3.edge(domain_name='linkedin.com')
seen = set()
parts = []
for c in jar:
    if c.name in seen:
        continue
    seen.add(c.name)
    parts.append(f"{c.name}={c.value}")
print('; '.join(parts), end='')
PY
```

快速确认这份 cookie 是否够用：

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/tmp/linkedin_edge_cookie.txt').read_text()
print('li_at=' in text)
print('JSESSIONID=' in text)
PY
```

预期输出：两行都应为 `True`

### 3. 只更新演练环境，不改生产

```bash
cd /Users/elng/web/pinpointanswertoday/new-pinpoint-site/worker
npx wrangler secret put GRAPHQL_COOKIE --env staging < /tmp/linkedin_edge_cookie.txt
npx wrangler secret put GRAPHQL_COOKIE --env shadow < /tmp/linkedin_edge_cookie.txt
```

### 4. 重新跑预检

```bash
export ADMIN_SECRET='<your-admin-secret>'

curl "https://pinpoint-worker-staging.2296744453m.workers.dev/admin/preflight-linkedin?secret=$ADMIN_SECRET&date=2026-03-28"
curl "https://pinpoint-worker-shadow.2296744453m.workers.dev/admin/preflight-linkedin?secret=$ADMIN_SECRET&date=2026-03-28"
```

成功标志：

- 返回 `ok: true`
- `source` 变成 `"graphql"`
- 返回 5 个 clue / answers

### 5. 如需继续做完整发布演练

如果当天已经跑过一次，需要先清掉当天的 enrich 完成标记，再重新手动触发：

```bash
cd /Users/elng/web/pinpointanswertoday/new-pinpoint-site/worker
npx wrangler kv key delete 'publish:2026-03-28:enrich_done' --env staging --binding PP_DATA --remote
```

然后再跑：

```bash
export ADMIN_SECRET='<your-admin-secret>'

curl "https://pinpoint-worker-staging.2296744453m.workers.dev/admin/run?secret=$ADMIN_SECRET&publish=1&force=1&i18n=0&date=2026-03-28"
curl "https://pinpoint-worker-staging.2296744453m.workers.dev/monitor/cron-status?secret=$ADMIN_SECRET"
```

成功标志：

- `/admin/run` 返回 `source: "graphql"`
- `/monitor/cron-status` 最终 `outcome: "succeeded"`
- `enrich.detailState` 允许是 `published` 或 `fallback_full`

## 收尾

临时 cookie 文件用完就删：

```bash
rm -f /tmp/linkedin_edge_cookie.txt
```

## 如果还是失败

按这个顺序继续查：

1. 先确认浏览器里是否真的还有 LinkedIn 登录态
2. 换另一个浏览器配置重新提取 cookie
3. 再看 `staging` / `shadow` 是否还缺 `GRAPHQL_TOKEN`
4. 最后才考虑去重建或补录额外 token

## `2026-03-28` 实测结论

- 生产预检正常，`staging` / `shadow` 初始返回 `graphql 401`
- 仅刷新 `GRAPHQL_COOKIE` 后，`staging` / `shadow` 的 `/admin/preflight-linkedin` 都恢复为 `source: "graphql"`
- 当前 worker 会从 `GRAPHQL_COOKIE` 里的 `JSESSIONID` 自动拼 `csrf-token`
- 因此这类故障的首要排查项是 `GRAPHQL_COOKIE`，不是 `GRAPHQL_CSRF_TOKEN`

# 旧仓库可忽略目录清单（2026-03-16）

这份清单只服务一个目的：

- 以后看到旧仓库 `/Users/elng/web/pinpointanswertoday` 很脏时，知道哪些内容可以直接忽略
- 不再把旧站历史遗留和当前新项目混在一起看

## 已做的本地忽略

- 已在旧仓库本地忽略规则里屏蔽 `new-pinpoint-site/`
- 这是本地忽略，不会改远端仓库规则
- 作用只是避免旧仓库把嵌套的新项目目录继续显示成未跟踪项

## 旧仓库里可以直接忽略的内容

1. `/Users/elng/web/pinpointanswertoday/new-pinpoint-site/`
   - 含义：新项目目录被放进旧仓库后的本地嵌套副本
   - 处理建议：直接忽略，不当作旧项目内容

2. `/Users/elng/web/pinpointanswertoday/data/locales/`
   - 含义：旧站多语言内容残留
   - 处理建议：默认视为历史数据，不再逐个处理

3. `/Users/elng/web/pinpointanswertoday/data/puzzles/`
   - 含义：旧站题目数据残留
   - 处理建议：默认视为历史数据，不再逐个处理

4. `/Users/elng/web/pinpointanswertoday/output/`
   - 含义：本地截图和调试产物
   - 处理建议：只在明确需要回看截图时再打开

## 旧仓库里暂不处理的历史内容

1. `/Users/elng/web/pinpointanswertoday/automation-script/`
   - 含义：旧自动化链路的本地开发残留
   - 处理建议：先不救回，也先不删除

2. `/Users/elng/web/pinpointanswertoday/scripts/`
   - 含义：旧站脚本实验和校验残留
   - 处理建议：只有在回看旧发布链路时再处理

3. `/Users/elng/web/pinpointanswertoday/tests/`
   - 含义：旧站测试残留
   - 处理建议：默认不继续迁移到新项目

## 该看哪边

- 当前继续维护：优先看新项目 `/Users/elng/web/pinpointanswertoday/new-pinpoint-site`
- 旧仓库历史文档：看 `legacy-old-repo-reference-list-2026-03-16.md`
- 旧仓库其余脏改动：默认按历史遗留处理

# 后端减量清单

目标：在不损坏现有后端逻辑和功能的前提下，优先通过提炼重复装配、收缩超长函数、合并纯辅助逻辑来减少代码量。

## 高优先级

### 1. `admin.go` 抽出统一的管理态响应装配 helper

- 目标：合并重复的 `State.Snapshot()`、`session_ready`、`resin_proxy_token_set`、`map[string]any` 拼装
- 建议：提炼 `buildAdminRuntimeSummary(...)`、`buildSessionSummary(...)`、`hasResinProxyToken(...)`
- 定位：
  - `internal/app/admin.go:391`
  - `internal/app/admin.go:429`
  - `internal/app/admin.go:749`
- 风险：低
- 验证：`go test ./internal/app`

### 2. `admin.go` 抽出统一的 JSON 输出与 no-store header helper

- 目标：减少 `writeJSON` 前后的重复 header 设置
- 建议：提炼 `writeNoStoreJSON(...)`，统一处理 `Cache-Control: no-store, must-revalidate`
- 定位：
  - `internal/app/admin.go:863`
  - `internal/app/admin.go:876`
- 风险：低
- 验证：`go test ./internal/app`

### 3. `admin_accounts.go` 合并登录相关 handler 的公共前后处理

- 目标：减少“解析请求 -> 查状态 -> 校验 -> 输出 JSON”的重复代码
- 建议：提炼请求解析、账户定位、统一错误输出、统一成功响应 helper
- 定位：
  - `internal/app/admin_accounts.go:749`
  - `internal/app/admin_accounts.go:841`
  - `internal/app/admin_accounts.go:909`
- 风险：中低
- 验证：`go test ./internal/app`

### 4. `config.go` 收缩配置归一化逻辑

- 目标：压缩默认值填充、字符串清洗、列表规范化、env fallback 的重复分支
- 建议：把 `normalizeConfig` 拆成 `normalizeProxyConfig`、`normalizeStorageConfig`、`normalizePromptConfig` 等小 helper
- 定位：
  - `internal/app/config.go:359`
  - `internal/app/config.go:477`
  - `internal/app/config.go:551`
- 风险：低
- 验证：`go test ./internal/app`

## 中优先级

### 5. `main.go` 只拆超长 streaming 函数的内部私有 helper

- 目标：缩短单函数长度，不改 handler 对外行为
- 建议：抽出 chunk 写出、错误收尾、usage 写出、流结束事件写出等私有 helper
- 定位：
  - `internal/app/main.go:2053`
  - `internal/app/main.go:2246`
  - `internal/app/main.go:2528`
- 风险：中
- 验证：`go test ./internal/app`

### 6. `main.go` 收缩 chat/responses handler 的共同前置流程

- 目标：减少 `handleResponses` 与 `handleChatCompletions` 的重复校验和准备代码
- 建议：抽出共享的请求预处理、上下文初始化、模型与会话预检查 helper
- 定位：
  - `internal/app/main.go:1632`
  - `internal/app/main.go:1854`
- 风险：中
- 验证：`go test ./internal/app`

### 7. `notion_client.go` 先收缩 payload 与附件辅助逻辑，不碰 transport 策略

- 目标：压缩纯数据构造代码
- 建议：拆 `buildInferencePayload`、`saveContinuationScaffold`、`loadAttachmentData` 为更小的内部 builder/helper
- 定位：
  - `internal/app/notion_client.go:3002`
  - `internal/app/notion_client.go:3469`
  - `internal/app/notion_client.go:3595`
- 风险：中
- 验证：`go test ./internal/app`

## 暂缓项

### 8. 暂缓合并 `browser` / `surf` / `login` transport 实现

- 原因：这里属于 fallback 与兼容边界，省代码容易引入行为回归
- 定位：
  - `internal/app/notion_client_browser_transport.go:1`
  - `internal/app/notion_client_surf_transport.go:1`
  - `internal/app/notion_client_login_transport.go:1`

### 9. 暂缓重写会话续写与对话恢复主流程

- 原因：相关函数虽然长，但状态一致性要求高，减量收益不如 admin/config 明显
- 定位：
  - `internal/app/main.go:1330`

### 10. 暂缓大改 `sqlite_store.go`

- 原因：存储层分支语义细，删行收益有限，回归成本高
- 定位：
  - `internal/app/sqlite_store.go:1`

## 建议执行顺序

1. `admin.go` 响应装配收缩
2. `admin_accounts.go` 公共 handler 收缩
3. `config.go` 归一化收缩
4. `main.go` 长 streaming 函数内拆分
5. `notion_client.go` payload 与附件辅助逻辑收缩

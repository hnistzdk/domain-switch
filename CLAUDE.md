# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

自动化工具，用于在 Cloudflare 托管的域名到期时，批量更新所有 Worker 和 Pages 应用的域名映射。

**核心功能：**
1. 接收旧域名和新域名
2. 自动获取所有使用旧域名的 Worker 和 Pages 应用
3. 批量替换为新域名
4. 配置新域名的 DNS 托管和 SSL

## 技术栈

- **语言：** Node.js + TypeScript
- **核心依赖：**
  - `cloudflare` - 官方 SDK，用于 API 调用
  - `commander` - CLI 参数解析
  - `dotenv` - 环境变量管理

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式（TypeScript 实时编译）
npm run dev

# 构建
npm run build

# 运行
npm start -- --old-domain example.com --new-domain newdomain.com

# 或直接运行 TypeScript（开发时）
npm run dev -- --old-domain example.com --new-domain newdomain.com
```

## 核心架构

```
index.ts          # CLI 入口，三步流程
    ↓
switcher.ts       # 核心业务逻辑
    ├─ prepareNewDomain()      # 步骤 1: 新域名托管 + SSL 配置
    ├─ findAffectedApps()      # 步骤 2: 扫描受影响的应用
    └─ switchDomain()          # 步骤 3: 批量替换域名
    ↓
cloudflare.ts     # API 封装（薄层）
```

**执行流程：**
1. **准备新域名**：检查是否已托管 → 未托管则创建 → 复制旧域名的 SSL 配置
2. **扫描应用**：获取所有 Worker 路由和 Pages 项目 → 过滤出使用旧域名的
3. **执行替换**：逐个更新 Worker 路由和 Pages 域名 → 记录成功/失败

**设计原则：**
- **最小化复杂度：** 不使用类、不过度抽象，纯函数式流程
- **错误优先：** 所有 API 调用都要处理失败情况
- **幂等性：** 重复运行不会造成重复操作或错误状态
- **确认机制：** 执行替换前必须列出受影响的应用，等待用户确认

## 关键实现点

### 1. Cloudflare API 认证

使用 API Token（推荐）而非 Global API Key：
```typescript
const cf = new Cloudflare({
  apiToken: process.env.CF_API_TOKEN
});
```

### 2. 核心数据流（3 步流程）

```typescript
// 步骤 1: 准备新域名（幂等）
const newZoneId = await prepareNewDomain(client, accountId, oldZoneId, newDomain);
// 内部流程：
//   - ensureZone(): 检查新域名是否已托管，未托管则创建
//   - getSSLSettings(): 获取旧域名的 SSL 模式（off/flexible/full/strict）
//   - getUniversalSSLStatus(): 获取旧域名的 Universal SSL 状态
//   - setSSLMode(): 复制 SSL 模式到新域名
//   - setUniversalSSL(): 复制 Universal SSL 状态到新域名

// 步骤 2: 扫描受影响的应用
const affected = await findAffectedApps(client, accountId, oldZoneId, oldDomain);
// 内部流程：
//   - getWorkerRoutes(): 获取旧域名的所有 Worker 路由
//   - listPages(): 获取所有 Pages 项目
//   - 过滤出包含旧域名的路由和项目

// 步骤 3: 批量替换（用户确认后）
await switchDomain(client, accountId, newZoneId, oldDomain, newDomain, affected);
// 内部流程：
//   - 对每个 Worker 路由：updateWorkerRoute()
//   - 对每个 Pages 项目：updatePageDomain()（先删除旧域名，再添加新域名）
//   - 记录成功/失败数量
```

### 3. 错误处理策略

- API 429（速率限制）→ 自动重试，指数退避
- API 4xx（客户端错误）→ 立即失败，打印详细错误
- API 5xx（服务端错误）→ 重试 3 次后失败
- 部分失败 → 记录成功/失败的应用，允许重新运行

### 4. 配置文件格式

`.env` 示例：
```bash
CF_API_TOKEN=your_token_here
CF_ACCOUNT_ID=your_account_id
CF_ZONE_ID=your_old_zone_id  # 旧域名的 Zone ID（不是新域名）
```

**重要：** `CF_ZONE_ID` 必须是旧域名的 Zone ID，工具会自动处理新域名的托管和配置。

## 关键 API 端点

**域名和 SSL 管理：**
- `GET /zones?name={domain}` - 查询域名是否已托管
- `POST /zones` - 添加新域名到 Cloudflare
- `GET /zones/{zone_id}/settings/ssl` - 获取 SSL 模式
- `PATCH /zones/{zone_id}/settings/ssl` - 设置 SSL 模式
- `GET /zones/{zone_id}/ssl/universal/settings` - 获取 Universal SSL 状态
- `PATCH /zones/{zone_id}/ssl/universal/settings` - 设置 Universal SSL

**Worker 和 Pages：**
- `GET /accounts/{account_id}/workers/scripts` - 列出所有 Workers
- `GET /accounts/{account_id}/pages/projects` - 列出所有 Pages
- `GET /zones/{zone_id}/workers/routes` - 获取 Worker 路由
- `PUT /zones/{zone_id}/workers/routes/{route_id}` - 更新路由
- `DELETE /accounts/{account_id}/pages/projects/{project_name}/domains/{domain_name}` - 删除 Pages 域名
- `POST /accounts/{account_id}/pages/projects/{project_name}/domains` - 添加 Pages 域名

## 开发注意事项

1. **幂等性设计：** 所有操作都可以重复执行而不产生错误
   - `ensureZone()` 会先检查域名是否已托管
   - SSL 配置会直接覆盖，不会重复申请
   - Worker 路由更新是替换操作，不是追加
   - Pages 域名更新会先删除旧域名再添加新域名

2. **错误信息要详细：** 当 API 调用失败时，打印完整的错误信息

3. **部分失败处理：** 如果 10 个应用中第 5 个失败，前 4 个不会回滚，可以重新运行跳过已成功的

4. **DNS 和 SSL 延迟：**
   - 新域名添加后，需要在域名注册商处修改 NS 记录
   - Universal SSL 证书申请需要几分钟，工具只负责启用配置
   - 不要在工具中等待 SSL 证书生效（异步过程）

5. **不要过度设计：** 这是运维工具，不需要进度条、日志文件、配置热重载等功能

## Cloudflare SDK 参考

官方文档：https://developers.cloudflare.com/api/
Node.js SDK：https://github.com/cloudflare/cloudflare-typescript

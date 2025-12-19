# domain-switch

[English](#english) | [中文](#中文)

---

## 中文

### 项目简介

Cloudflare 域名批量切换工具 - 自动化迁移所有 Worker 和 Pages 应用的域名映射。

当你的域名在注册商处到期需要更换时，手动修改每个 Worker、Pages 应用的域名映射过于繁琐。本工具只需提供 Cloudflare API 凭据、旧域名和新域名，即可自动完成：

- ✅ 新域名托管（Free 计划）
- ✅ SSL 配置复制（模式 + Universal SSL）
- ✅ Worker 路由批量更新
- ✅ Pages 自定义域名批量更新

### 核心特性

- **幂等性设计**：可重复运行，不会产生重复操作
- **安全确认**：执行前列出所有受影响的应用，等待用户确认
- **详细日志**：每一步操作都有清晰的进度提示
- **部分失败容错**：单个应用失败不影响其他应用，可重新运行
- **零依赖数据库**：纯 CLI 工具，无需额外服务

### 快速开始

#### 1. 安装依赖

```bash
npm install
```

#### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# Cloudflare API Token (必须)
# 在 https://dash.cloudflare.com/profile/api-tokens 创建
# 需要权限:
#   - Account: Workers Scripts (Read, Edit), Pages (Read, Edit), SSL and Certificates (Read, Edit)
#   - Zone: Workers Routes (Read, Edit), Zone (Read, Edit), Zone Settings (Read, Edit), SSL and Certificates (Read, Edit)
CF_API_TOKEN=your_api_token_here

# Cloudflare Account ID (必须)
# 在 Cloudflare Dashboard 右侧边栏可以找到
CF_ACCOUNT_ID=your_account_id_here

# 旧域名的 Zone ID (必须)
# 在旧域名的 Cloudflare Dashboard 右侧边栏可以找到
CF_ZONE_ID=your_old_zone_id_here

# 旧域名 (可选,可通过 --old-domain 参数覆盖)
OLD_DOMAIN=old.com

# 新域名 (可选,可通过 --new-domain 参数覆盖)
NEW_DOMAIN=new.com
```

#### 3. 运行工具

**方式一: 使用环境变量 (推荐)**

在 `.env` 文件中配置好所有参数后,直接运行:

```bash
# 调试模式
npx tsx src/index.ts --dry-run

# 实际执行
npx tsx src/index.ts
```

**方式二: 使用命令行参数**

命令行参数会覆盖 `.env` 中的配置:

```bash
# 调试模式
npx tsx src/index.ts --old-domain zaiolos.fun --new-domain zaiolos.vip --dry-run

# 实际执行
npx tsx src/index.ts --old-domain zaiolos.fun --new-domain zaiolos.vip
```

**调试模式**会：
- ✅ 验证 API Token 和环境变量配置
- ✅ 检查旧域名 Zone 信息和 SSL 配置
- ✅ 查询新域名托管状态
- ✅ 列出所有将被修改的 Worker 和 Pages 应用
- ❌ 不会执行任何修改操作

**生产模式**：

```bash
# 先编译
npm run build

# 使用 .env 中的域名
node dist/index.js --dry-run  # 先测试
node dist/index.js            # 实际执行

# 或使用命令行参数
node dist/index.js --old-domain zaiolos.fun --new-domain zaiolos.vip
```

### 执行流程

```
步骤 1: 准备新域名
  ├─ 检查新域名是否已托管
  ├─ 未托管则创建 (Free 计划)
  ├─ 获取旧域名的 SSL 配置
  └─ 复制 SSL 配置到新域名

步骤 2: 扫描受影响的应用
  ├─ 扫描所有 Worker 路由
  ├─ 扫描所有 Pages 项目
  └─ 过滤出使用旧域名的应用

步骤 3: 用户确认
  └─ 列出所有受影响的应用，等待输入 y 确认

步骤 4: 执行域名替换
  ├─ 批量更新 Worker 路由
  ├─ 批量更新 Pages 域名
  └─ 输出成功/失败统计
```

### 重要说明

1. **DNS 配置**：执行完成后，需要在域名注册商处将 NS 记录指向 Cloudflare
2. **DNS 传播**：DNS 记录生效可能需要几分钟到 48 小时
3. **SSL 证书**：Universal SSL 证书申请需要几分钟，工具会启用配置但不会等待证书生效
4. **幂等性**：可以安全地重复运行，已完成的操作会被跳过

### 技术栈

- **Node.js + TypeScript**：类型安全，开发高效
- **Cloudflare SDK**：官方 SDK，API 调用稳定
- **Commander.js**：CLI 参数解析
- **dotenv**：环境变量管理

### 项目结构

```
domain-switch/
├── src/
│   ├── index.ts          # CLI 入口，三步流程
│   ├── switcher.ts       # 核心业务逻辑
│   └── cloudflare.ts     # Cloudflare API 封装
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 常见问题

**Q: 如何获取 API Token？**
A: 访问 https://dash.cloudflare.com/profile/api-tokens ，创建 Token，需要以下权限：

**Account 级别权限：**
- Workers Scripts: Read, Edit
- Pages: Read, Edit
- SSL and Certificates: Read, Edit

**Zone 级别权限（应用于"所有区域"）：**
- Workers Routes: Read, Edit
- Zone: Read, Edit
- Zone Settings: Read, Edit
- SSL and Certificates: Read, Edit

**Q: 遇到 403 权限错误怎么办？**
A: 检查 API Token 是否包含所有必需权限，特别是 **Zone Settings: Read, Edit** 权限。缺少此权限会导致无法读取 SSL 配置。

**Q: 执行失败了怎么办？**
A: 工具支持幂等性，可以直接重新运行，已成功的操作会被跳过。

**Q: 会删除旧域名吗？**
A: 不会，工具只负责新域名的配置和应用迁移，旧域名需要手动删除。

**Q: 支持多个域名批量迁移吗？**
A: 目前不支持，需要逐个执行。

### 开源协议

MIT License

---

## English

### Introduction

Cloudflare Domain Batch Switch Tool - Automate domain migration for all Workers and Pages applications.

When your domain expires at the registrar and needs replacement, manually updating domain mappings for each Worker and Pages app is tedious. This tool automates the entire process by simply providing Cloudflare API credentials, old domain, and new domain:

- ✅ New domain hosting (Free plan)
- ✅ SSL configuration replication (mode + Universal SSL)
- ✅ Batch Worker route updates
- ✅ Batch Pages custom domain updates

### Key Features

- **Idempotent Design**: Safe to run multiple times without duplicating operations
- **Safe Confirmation**: Lists all affected apps before execution, requires user confirmation
- **Detailed Logging**: Clear progress output for every operation
- **Partial Failure Tolerance**: Single app failure doesn't affect others, supports re-run
- **Zero Database Dependency**: Pure CLI tool, no additional services required

### Quick Start

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` file:

```bash
# Cloudflare API Token (required)
# Create at https://dash.cloudflare.com/profile/api-tokens
# Required permissions:
#   - Account: Workers Scripts (Read, Edit), Pages (Read, Edit), SSL and Certificates (Read, Edit)
#   - Zone: Workers Routes (Read, Edit), Zone (Read, Edit), Zone Settings (Read, Edit), SSL and Certificates (Read, Edit)
CF_API_TOKEN=your_api_token_here

# Cloudflare Account ID (required)
# Found in Cloudflare Dashboard sidebar
CF_ACCOUNT_ID=your_account_id_here

# Old Domain Zone ID (required)
# Found in old domain's Cloudflare Dashboard sidebar
CF_ZONE_ID=your_old_zone_id_here

# Old Domain (optional, can be overridden by --old-domain parameter)
OLD_DOMAIN=old.com

# New Domain (optional, can be overridden by --new-domain parameter)
NEW_DOMAIN=new.com
```

#### 3. Run the Tool

**Method 1: Using Environment Variables (Recommended)**

After configuring `OLD_DOMAIN` and `NEW_DOMAIN` in `.env` file:

```bash
# Dry-run mode
npm run dev -- --dry-run

# Execute changes
npm run dev
```

**Method 2: Using Command Line Parameters**

```bash
# Dry-run mode
npm run dev -- --old-domain old.com --new-domain new.com --dry-run

# Execute changes
npm run dev -- --old-domain old.com --new-domain new.com
```

**Dry-run mode** will:
- ✅ Verify API Token and environment variables
- ✅ Check old domain Zone info and SSL configuration
- ✅ Query new domain hosting status
- ✅ List all Worker and Pages apps to be modified
- ❌ NOT execute any modifications

**Production Mode**:

```bash
npm run build
npm start  # Use domains from .env
# or
npm start -- --old-domain old.com --new-domain new.com
```

### Execution Flow

```
Step 1: Prepare New Domain
  ├─ Check if new domain is already hosted
  ├─ Create if not hosted (Free plan)
  ├─ Get old domain's SSL configuration
  └─ Copy SSL configuration to new domain

Step 2: Scan Affected Applications
  ├─ Scan all Worker routes
  ├─ Scan all Pages projects
  └─ Filter apps using old domain

Step 3: User Confirmation
  └─ List all affected apps, wait for 'y' confirmation

Step 4: Execute Domain Replacement
  ├─ Batch update Worker routes
  ├─ Batch update Pages domains
  └─ Output success/failure statistics
```

### Important Notes

1. **DNS Configuration**: After execution, update NS records at your domain registrar to point to Cloudflare
2. **DNS Propagation**: DNS records may take minutes to 48 hours to propagate
3. **SSL Certificate**: Universal SSL certificate provisioning takes a few minutes; the tool enables the configuration but doesn't wait for certificate issuance
4. **Idempotency**: Safe to run repeatedly; completed operations will be skipped

### Tech Stack

- **Node.js + TypeScript**: Type-safe, efficient development
- **Cloudflare SDK**: Official SDK, stable API calls
- **Commander.js**: CLI argument parsing
- **dotenv**: Environment variable management

### Project Structure

```
domain-switch/
├── src/
│   ├── index.ts          # CLI entry, 3-step workflow
│   ├── switcher.ts       # Core business logic
│   └── cloudflare.ts     # Cloudflare API wrapper
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### FAQ

**Q: How to get API Token?**
A: Visit https://dash.cloudflare.com/profile/api-tokens, create a token with these permissions:

**Account-level permissions:**
- Workers Scripts: Read, Edit
- Pages: Read, Edit
- SSL and Certificates: Read, Edit

**Zone-level permissions (apply to "All zones"):**
- Workers Routes: Read, Edit
- Zone: Read, Edit
- Zone Settings: Read, Edit
- SSL and Certificates: Read, Edit

**Q: What if I get a 403 permission error?**
A: Check if your API Token includes all required permissions, especially **Zone Settings: Read, Edit**. Missing this permission will prevent reading SSL configuration.

**Q: What if execution fails?**
A: The tool supports idempotency. Simply re-run it; successful operations will be skipped.

**Q: Will it delete the old domain?**
A: No, the tool only handles new domain configuration and app migration. Old domain requires manual deletion.

**Q: Does it support batch migration of multiple domains?**
A: Not currently. Run separately for each domain pair.

### License

MIT License

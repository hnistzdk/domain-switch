import Cloudflare from 'cloudflare';

export interface CloudflareConfig {
  apiToken: string;
  accountId: string;
}

export function createClient(config: CloudflareConfig): Cloudflare {
  return new Cloudflare({ apiToken: config.apiToken });
}

/**
 * 列出所有 Worker 脚本(Workers & Pages 项目中的 Workers)
 */
export async function listWorkers(
  client: Cloudflare,
  accountId: string
): Promise<any[]> {
  try {
    // SDK v5 中 Workers 服务通过 scripts API 访问
    const response = await client.workers.scripts.list({ account_id: accountId });
    return response.result || [];
  } catch (error) {
    console.error('获取 Workers 列表失败:', error);
    return []; // 返回空数组而不是抛出错误,允许继续执行
  }
}

/**
 * 获取 Worker 脚本的自定义域名
 */
export async function getWorkerDomains(
  client: Cloudflare,
  accountId: string,
  scriptName: string
): Promise<any[]> {
  try {
    // 查询账户级别的所有 Worker 自定义域名,然后过滤出属于该脚本的
    const response = await client.workers.domains.list({ account_id: accountId });
    const allDomains = response.result || [];

    // 过滤出属于当前 Worker 脚本的域名
    return allDomains.filter((d: any) => d.service === scriptName);
  } catch (error) {
    // 域名查询可能失败,静默返回空数组
    return [];
  }
}

/**
 * 列出所有 Pages 项目
 */
export async function listPages(
  client: Cloudflare,
  accountId: string
): Promise<any[]> {
  try {
    const response = await client.pages.projects.list({ account_id: accountId });
    return response.result || [];
  } catch (error) {
    console.error('获取 Pages 列表失败:', error);
    throw error;
  }
}

/**
 * 获取 Worker 的所有路由
 */
export async function getWorkerRoutes(
  client: Cloudflare,
  zoneId: string
): Promise<any[]> {
  try {
    const response = await client.workers.routes.list({ zone_id: zoneId });
    return response.result || [];
  } catch (error) {
    console.error('获取 Worker 路由失败:', error);
    throw error;
  }
}

/**
 * 更新 Worker 路由
 */
export async function updateWorkerRoute(
  client: Cloudflare,
  zoneId: string,
  routeId: string,
  newPattern: string
): Promise<void> {
  try {
    await client.workers.routes.update(routeId, {
      zone_id: zoneId,
      pattern: newPattern
    });
  } catch (error) {
    console.error(`更新路由 ${routeId} 失败:`, error);
    throw error;
  }
}

/**
 * 更新 Worker 服务的自定义域名
 */
export async function updateWorkerDomain(
  client: Cloudflare,
  accountId: string,
  serviceName: string,
  oldDomain: string,
  newDomain: string,
  zoneId: string
): Promise<void> {
  try {
    // 先添加新域名 - SDK v5 使用 update 方法来创建域名 (PUT /accounts/{account_id}/workers/domains)
    // 这样即使后续删除失败，服务至少可以继续运行
    await client.workers.domains.update({
      account_id: accountId,
      hostname: newDomain,
      service: serviceName,
      environment: 'production',
      zone_id: zoneId
    });

    // 新域名添加成功后，再删除旧域名
    // 如果删除失败，至少新域名已经生效，可以手动清理
    try {
      await client.workers.domains.delete(oldDomain, {
        account_id: accountId
      });
    } catch (deleteError: any) {
      console.warn(`  ⚠ 警告: 新域名已添加，但删除旧域名 ${oldDomain} 失败: ${deleteError.message}`);
      console.warn(`  → 请手动在 Cloudflare Dashboard 删除旧域名`);
      // 不抛出错误，因为新域名已经添加成功
    }
  } catch (error) {
    console.error(`更新 Worker ${serviceName} 的域名失败:`, error);
    throw error;
  }
}

/**
 * 更新 Pages 项目的自定义域名
 */
export async function updatePageDomain(
  client: Cloudflare,
  accountId: string,
  projectName: string,
  oldDomain: string,
  newDomain: string
): Promise<void> {
  try {
    // 先添加新域名，确保服务可以继续运行
    await client.pages.projects.domains.create(projectName, {
      account_id: accountId,
      name: newDomain
    });

    // 新域名添加成功后，再删除旧域名
    // 如果删除失败，至少新域名已经生效，可以手动清理
    try {
      await client.pages.projects.domains.delete(oldDomain, projectName, {
        account_id: accountId,
      });
    } catch (deleteError: any) {
      console.warn(`  ⚠ 警告: 新域名已添加，但删除旧域名 ${oldDomain} 失败: ${deleteError.message}`);
      console.warn(`  → 请手动在 Cloudflare Dashboard 删除旧域名`);
      // 不抛出错误，因为新域名已经添加成功
    }
  } catch (error) {
    console.error(`更新 Pages 项目 ${projectName} 的域名失败:`, error);
    throw error;
  }
}

/**
 * 获取 Zone 信息
 */
export async function getZoneInfo(
  client: Cloudflare,
  zoneId: string
): Promise<any> {
  try {
    // Cloudflare SDK v5 使用 get 方法,传入 zone_id 参数
    const response = await client.zones.get({ zone_id: zoneId });
    return response;
  } catch (error) {
    console.error(`获取 Zone ${zoneId} 信息失败:`, error);
    throw error;
  }
}

/**
 * 获取域名的 Zone ID（如果已托管）
 */
export async function getZoneByName(
  client: Cloudflare,
  domain: string
): Promise<string | null> {
  try {
    const response = await client.zones.list({ name: domain });
    if (response.result && response.result.length > 0) {
      return response.result[0].id;
    }
    return null;
  } catch (error) {
    console.error(`查询域名 ${domain} 失败:`, error);
    throw error;
  }
}

/**
 * 添加域名到 Cloudflare（幂等：已存在则返回现有 Zone ID）
 */
export async function ensureZone(
  client: Cloudflare,
  domain: string,
  accountId: string
): Promise<string> {
  // 先检查是否已托管
  const existingZoneId = await getZoneByName(client, domain);
  if (existingZoneId) {
    console.log(`域名 ${domain} 已托管，Zone ID: ${existingZoneId}`);
    return existingZoneId;
  }

  // 未托管则创建（使用 Free 计划）
  try {
    const zone = await client.zones.create({
      name: domain,
      account: { id: accountId },
      type: 'full'  // 完整 DNS 托管
    });
    console.log(`域名 ${domain} 已添加到 Cloudflare (Free 计划)，Zone ID: ${zone.id}`);
    return zone.id;
  } catch (error) {
    console.error(`添加域名 ${domain} 失败:`, error);
    throw error;
  }
}

/**
 * 获取 Zone 的 SSL 配置
 */
export async function getSSLSettings(
  client: Cloudflare,
  zoneId: string
): Promise<any> {
  try {
    const response = await client.zones.settings.get('ssl', { zone_id: zoneId });
    return response;
  } catch (error) {
    console.error(`获取 Zone ${zoneId} 的 SSL 配置失败:`, error);
    throw error;
  }
}

/**
 * 设置 Zone 的 SSL 模式
 */
export async function setSSLMode(
  client: Cloudflare,
  zoneId: string,
  mode: 'off' | 'flexible' | 'full' | 'strict'
): Promise<void> {
  try {
    await client.zones.settings.edit('ssl', {
      zone_id: zoneId,
      value: mode
    });
    console.log(`Zone ${zoneId} SSL 模式已设置为: ${mode}`);
  } catch (error) {
    console.error(`设置 SSL 模式失败:`, error);
    throw error;
  }
}

/**
 * 获取 Zone 的通用 SSL 状态
 */
export async function getUniversalSSLStatus(
  client: Cloudflare,
  zoneId: string
): Promise<any> {
  try {
    const response = await client.ssl.universal.settings.get({ zone_id: zoneId });
    return response;
  } catch (error) {
    console.error(`获取 Universal SSL 状态失败:`, error);
    throw error;
  }
}

/**
 * 启用或禁用 Universal SSL
 */
export async function setUniversalSSL(
  client: Cloudflare,
  zoneId: string,
  enabled: boolean
): Promise<void> {
  try {
    await client.ssl.universal.settings.edit({
      zone_id: zoneId,
      enabled
    });
    console.log(`Zone ${zoneId} Universal SSL 已${enabled ? '启用' : '禁用'}`);
  } catch (error) {
    console.error(`设置 Universal SSL 失败:`, error);
    throw error;
  }
}

/**
 * 获取 Zone 的所有 DNS 记录
 */
export async function getDNSRecords(
  client: Cloudflare,
  zoneId: string
): Promise<any[]> {
  try {
    const response = await client.dns.records.list({ zone_id: zoneId });
    return response.result || [];
  } catch (error) {
    console.error(`获取 DNS 记录失败:`, error);
    throw error;
  }
}

/**
 * 创建 DNS 记录
 */
export async function createDNSRecord(
  client: Cloudflare,
  zoneId: string,
  record: {
    type: string;
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
    priority?: number;
  }
): Promise<void> {
  try {
    const params: any = {
      zone_id: zoneId,
      type: record.type,
      name: record.name,
      content: record.content
    };
    if (record.ttl !== undefined) params.ttl = record.ttl;
    if (record.proxied !== undefined) params.proxied = record.proxied;
    if (record.priority !== undefined) params.priority = record.priority;

    await client.dns.records.create(params);
  } catch (error) {
    throw error;
  }
}

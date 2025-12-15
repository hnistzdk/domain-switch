import Cloudflare from 'cloudflare';

export interface CloudflareConfig {
  apiToken: string;
  accountId: string;
}

export function createClient(config: CloudflareConfig): Cloudflare {
  return new Cloudflare({ apiToken: config.apiToken });
}

/**
 * 列出所有 Worker 脚本
 */
export async function listWorkers(
  client: Cloudflare,
  accountId: string
): Promise<any[]> {
  try {
    const response = await client.workers.scripts.list({ account_id: accountId });
    return response.result || [];
  } catch (error) {
    console.error('获取 Workers 列表失败:', error);
    throw error;
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
    // 删除旧域名
    await client.pages.projects.domains.delete(oldDomain, {
      account_id: accountId,
      project_name: projectName
    });

    // 添加新域名
    await client.pages.projects.domains.create({
      account_id: accountId,
      project_name: projectName,
      name: newDomain
    });
  } catch (error) {
    console.error(`更新 Pages 项目 ${projectName} 的域名失败:`, error);
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
    const response = await client.zones.create({
      name: domain,
      account: { id: accountId },
      type: 'full'  // 完整 DNS 托管
    });
    console.log(`域名 ${domain} 已添加到 Cloudflare (Free 计划)，Zone ID: ${response.result.id}`);
    return response.result.id;
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
    const response = await client.ssl.settings.get({ zone_id: zoneId });
    return response.result;
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
    await client.ssl.settings.edit({
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
    return response.result;
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

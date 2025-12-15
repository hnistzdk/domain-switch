import Cloudflare from 'cloudflare';
import * as cf from './cloudflare.js';

export interface AffectedApp {
  type: 'worker' | 'page';
  name: string;
  oldPattern?: string;
  newPattern?: string;
  routeId?: string;
}

export interface SSLConfig {
  mode: 'off' | 'flexible' | 'full' | 'strict';
  universalSSLEnabled: boolean;
}

/**
 * 准备新域名：托管 + 复制 SSL 配置
 */
export async function prepareNewDomain(
  client: Cloudflare,
  accountId: string,
  oldZoneId: string,
  newDomain: string
): Promise<string> {
  console.log(`\n=== 步骤 1: 准备新域名 ${newDomain} ===\n`);

  // 1. 确保新域名已托管（幂等）
  console.log('检查新域名托管状态...');
  const newZoneId = await cf.ensureZone(client, newDomain, accountId);

  // 2. 获取旧域名的 SSL 配置
  console.log('\n获取旧域名的 SSL 配置...');
  const oldSSLSettings = await cf.getSSLSettings(client, oldZoneId);
  const oldUniversalSSL = await cf.getUniversalSSLStatus(client, oldZoneId);

  console.log(`旧域名 SSL 模式: ${oldSSLSettings.value}`);
  console.log(`旧域名 Universal SSL: ${oldUniversalSSL.enabled ? '已启用' : '已禁用'}`);

  // 3. 复制 SSL 配置到新域名
  console.log('\n复制 SSL 配置到新域名...');
  await cf.setSSLMode(client, newZoneId, oldSSLSettings.value);
  await cf.setUniversalSSL(client, newZoneId, oldUniversalSSL.enabled);

  console.log('\n✓ 新域名准备完成');
  return newZoneId;
}

/**
 * 查找所有使用旧域名的应用
 */
export async function findAffectedApps(
  client: Cloudflare,
  accountId: string,
  oldZoneId: string,
  oldDomain: string
): Promise<AffectedApp[]> {
  console.log(`\n=== 步骤 2: 扫描使用旧域名的应用 ===\n`);

  const affected: AffectedApp[] = [];

  // 检查 Worker 路由
  console.log('扫描 Worker 路由...');
  const routes = await cf.getWorkerRoutes(client, oldZoneId);
  for (const route of routes) {
    if (route.pattern && route.pattern.includes(oldDomain)) {
      affected.push({
        type: 'worker',
        name: route.script || 'unknown',
        oldPattern: route.pattern,
        newPattern: route.pattern.replace(oldDomain, ''),
        routeId: route.id
      });
    }
  }

  // 检查 Pages 项目
  console.log('扫描 Pages 项目...');
  const pages = await cf.listPages(client, accountId);
  for (const page of pages) {
    if (page.domains && page.domains.some((d: string) => d.includes(oldDomain))) {
      affected.push({
        type: 'page',
        name: page.name
      });
    }
  }

  console.log(`\n找到 ${affected.length} 个使用旧域名的应用`);
  return affected;
}

/**
 * 执行域名替换
 */
export async function switchDomain(
  client: Cloudflare,
  accountId: string,
  newZoneId: string,
  oldDomain: string,
  newDomain: string,
  apps: AffectedApp[]
): Promise<void> {
  console.log(`\n=== 步骤 3: 执行域名替换 ===\n`);

  let successCount = 0;
  let failCount = 0;

  for (const app of apps) {
    try {
      if (app.type === 'worker' && app.routeId && app.oldPattern) {
        const newPattern = app.oldPattern.replace(oldDomain, newDomain);
        await cf.updateWorkerRoute(client, newZoneId, app.routeId, newPattern);
        console.log(`✓ Worker 路由已更新: ${app.oldPattern} → ${newPattern}`);
      } else if (app.type === 'page') {
        await cf.updatePageDomain(client, accountId, app.name, oldDomain, newDomain);
        console.log(`✓ Pages 项目已更新: ${app.name}`);
      }
      successCount++;
    } catch (error) {
      console.error(`✗ 更新失败: ${app.name}`, error);
      failCount++;
    }
  }

  console.log(`\n完成: ${successCount} 成功, ${failCount} 失败`);
}

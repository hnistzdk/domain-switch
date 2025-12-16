#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import * as cf from './cloudflare.js';
import * as switcher from './switcher.js';
import * as readline from 'readline';
import { log } from 'console';

dotenv.config();

const program = new Command();

program
  .name('domain-switch')
  .description('批量更新 Cloudflare Worker 和 Pages 应用的域名映射')
  .version('1.0.0')
  .option('--old-domain <domain>', '旧域名 (可从环境变量 OLD_DOMAIN 读取)')
  .option('--new-domain <domain>', '新域名 (可从环境变量 NEW_DOMAIN 读取)')
  .option('--zone-id <id>', 'Zone ID (默认从环境变量 CF_ZONE_ID 读取)')
  .option('--dry-run', '调试模式:仅查询并显示资源信息,不执行任何修改操作')
  .parse();

const options = program.opts();

async function main() {
  const apiToken = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  const oldZoneId = options.zoneId || process.env.CF_ZONE_ID;
  const oldDomain = options.oldDomain || process.env.OLD_DOMAIN;
  const newDomain = options.newDomain || process.env.NEW_DOMAIN;

  if (!apiToken || !accountId || !oldZoneId) {
    console.error('错误: 缺少必要的环境变量');
    console.error('请在 .env 文件中配置:');
    console.error('  CF_API_TOKEN=your_token');
    console.error('  CF_ACCOUNT_ID=your_account_id');
    console.error('  CF_ZONE_ID=your_old_zone_id  # 旧域名的 Zone ID');
    process.exit(1);
  }

  if (!oldDomain || !newDomain) {
    console.error('错误: 缺少域名参数');
    console.error('请通过以下方式之一指定域名:');
    console.error('  1. 在 .env 文件中配置 OLD_DOMAIN 和 NEW_DOMAIN');
    console.error('  2. 使用命令行参数: --old-domain <domain> --new-domain <domain>');
    process.exit(1);
  }
  const dryRun = options.dryRun || false;

  console.log('=================================================');
  console.log('  Cloudflare 域名批量切换工具');
  if (dryRun) {
    console.log('  【调试模式】');
  }
  console.log('=================================================');
  console.log(`旧域名: ${oldDomain}`);
  console.log(`新域名: ${newDomain}`);
  console.log(`Zone ID: ${oldZoneId}`);
  console.log('=================================================');

  const client = cf.createClient({ apiToken, accountId });

  // 调试模式：仅查询和验证
  if (dryRun) {
    console.log('\n【调试模式】开始验证配置...\n');

    // 验证 1: 检查旧域名 Zone
    console.log('1. 验证旧域名 Zone...');
    try {
      const oldZoneInfo = await cf.getZoneInfo(client, oldZoneId);
      if (!oldZoneInfo) {
        throw new Error('API 返回数据为空，请检查 CF_ZONE_ID 是否正确');
      }
      console.log(`   ✓ 旧域名 Zone: ${oldZoneInfo.name} (${oldZoneId})`);
      console.log(`   - 状态: ${oldZoneInfo.status}`);
      console.log(`   - 计划: ${oldZoneInfo.plan?.name || 'Unknown'}`);
    } catch (error: any) {
      console.error(`   ✗ 无法访问旧域名 Zone: ${error.message}`);
      console.error('   提示: 请检查 CF_ZONE_ID 和 CF_API_TOKEN 是否正确');
      process.exit(1);
    }

    // 验证 2: 检查旧域名 SSL 配置(SDK v5 API变更,暂时跳过)
    console.log('\n2. 获取旧域名 SSL 配置...');
    console.log('   ℹ  跳过 SSL 配置验证(新域名将使用默认配置)');
    // const oldSslConfigaa = cf.getSSLSettings(client, oldZoneId)
    // console.log('oldSslConfigaa -> ', oldSslConfigaa);
    

    // 验证 3: 检查新域名是否已托管
    console.log('\n3. 检查新域名托管状态...');
    try {
      const newZoneId = await cf.getZoneByName(client, newDomain);
      if (newZoneId) {
        console.log(`   ✓ 新域名已托管，Zone ID: ${newZoneId}`);
      } else {
        console.log(`   ℹ 新域名尚未托管，执行时将自动创建 (Free 计划)`);
      }
    } catch (error: any) {
      console.error(`   ✗ 查询新域名失败: ${error.message}`);
    }

    // 验证 4: 扫描受影响的应用
    console.log('\n4. 扫描使用旧域名的应用...');
    const affected = await switcher.findAffectedApps(
      client,
      accountId,
      oldZoneId,
      oldDomain
    );

    if (affected.length === 0) {
      console.log('   ℹ 未找到使用该域名的应用');
    } else {
      console.log(`   ✓ 找到 ${affected.length} 个应用:\n`);

      const workerRoutes = affected.filter(a => a.type === 'worker');
      const workerServices = affected.filter(a => a.type === 'worker_service');
      const pages = affected.filter(a => a.type === 'page');

      if (workerRoutes.length > 0) {
        console.log('   Worker 路由:');
        workerRoutes.forEach((app, idx) => {
          console.log(`     ${idx + 1}. ${app.name}`);
          console.log(`        当前: ${app.oldPattern}`);
          console.log(`        修改为: ${app.oldPattern?.replace(oldDomain, newDomain)}`);
        });
      }

      if (workerServices.length > 0) {
        console.log(`\n   Worker 服务:`);
        workerServices.forEach((app, idx) => {
          console.log(`     ${idx + 1}. ${app.name}`);
          app.domains?.forEach(domain => {
            console.log(`        ${domain} → ${domain.replace(oldDomain, newDomain)}`);
          });
        });
      }

      if (pages.length > 0) {
        console.log(`\n   Pages 项目:`);
        pages.forEach((app, idx) => {
          console.log(`     ${idx + 1}. ${app.name}`);
          app.domains?.forEach(domain => {
            console.log(`        ${domain} → ${domain.replace(oldDomain, newDomain)}`);
          });
        });
      }
    }

    console.log('\n=================================================');
    console.log('  【调试模式】配置验证完成');
    console.log('=================================================');
    console.log('\n提示:');
    console.log('- 配置正确无误后，移除 --dry-run 参数即可执行实际操作');
    console.log('- 执行前会再次确认，输入 y 后才会修改');
    return;
  }

  // 正常执行模式
  // 步骤 1: 准备新域名(托管 + SSL 配置)
  let newZoneId: string;
  try {
    newZoneId = await switcher.prepareNewDomain(
      client,
      accountId,
      oldZoneId,
      newDomain
    );
  } catch (error: any) {
    console.error('\n=================================================');
    console.error('  ✗ 新域名准备失败,终止执行');
    console.error('=================================================');
    console.error(`错误详情: ${error.message}`);
    console.error('\n可能的原因:');
    console.error('  1. Cloudflare API Token 权限不足');
    console.error('  2. 账户已达到免费计划的 Zone 数量上限');
    console.error('  3. 域名格式不正确或已被其他账户托管');
    console.error('  4. SSL 配置复制失败');
    console.error('\n请检查配置后重试。');
    process.exit(1);
  }

  // 步骤 2: 查找受影响的应用
  const affected = await switcher.findAffectedApps(
    client,
    accountId,
    oldZoneId,
    oldDomain
  );

  if (affected.length === 0) {
    console.log('\n未找到使用该域名的应用，无需操作');
    return;
  }

  // 打印受影响的应用清单
  console.log('\n找到以下应用:\n');
  for (const app of affected) {
    if (app.type === 'worker') {
      console.log(`  [Worker 路由] ${app.name}`);
      console.log(`    ${app.oldPattern} → ${app.oldPattern?.replace(oldDomain, newDomain)}`);
    } else if (app.type === 'worker_service') {
      console.log(`  [Worker 服务] ${app.name}`);
      app.domains?.forEach(domain => {
        console.log(`    ${domain} → ${domain.replace(oldDomain, newDomain)}`);
      });
    } else if (app.type === 'page') {
      console.log(`  [Pages] ${app.name}`);
      app.domains?.forEach(domain => {
        console.log(`    ${domain} → ${domain.replace(oldDomain, newDomain)}`);
      });
    }
  }

  // 确认执行
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('\n是否继续执行域名替换? [y/N]: ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'y') {
    console.log('\n已取消操作');
    return;
  }

  // 步骤 3: 执行域名替换
  await switcher.switchDomain(
    client,
    accountId,
    newZoneId,
    oldDomain,
    newDomain,
    affected
  );

  console.log('\n=================================================');
  console.log('  域名切换完成！');
  console.log('=================================================');
  console.log('\n重要提醒:');
  console.log('1. 请在域名注册商处将 NS 记录指向 Cloudflare');
  console.log('2. DNS 传播可能需要几分钟到 48 小时');
  console.log('3. SSL 证书申请可能需要几分钟，请稍后在 Dashboard 检查');
}

main().catch((error) => {
  console.error('执行失败:', error);
  process.exit(1);
});

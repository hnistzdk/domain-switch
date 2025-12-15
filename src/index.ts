#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import * as cf from './cloudflare.js';
import * as switcher from './switcher.js';
import * as readline from 'readline';

dotenv.config();

const program = new Command();

program
  .name('domain-switch')
  .description('批量更新 Cloudflare Worker 和 Pages 应用的域名映射')
  .version('1.0.0')
  .requiredOption('--old-domain <domain>', '旧域名')
  .requiredOption('--new-domain <domain>', '新域名')
  .option('--zone-id <id>', 'Zone ID（默认从环境变量读取）')
  .parse();

const options = program.opts();

async function main() {
  const apiToken = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  const oldZoneId = options.zoneId || process.env.CF_ZONE_ID;

  if (!apiToken || !accountId || !oldZoneId) {
    console.error('错误: 缺少必要的环境变量');
    console.error('请在 .env 文件中配置:');
    console.error('  CF_API_TOKEN=your_token');
    console.error('  CF_ACCOUNT_ID=your_account_id');
    console.error('  CF_ZONE_ID=your_old_zone_id  # 旧域名的 Zone ID');
    process.exit(1);
  }

  const oldDomain = options.oldDomain;
  const newDomain = options.newDomain;

  console.log('=================================================');
  console.log('  Cloudflare 域名批量切换工具');
  console.log('=================================================');
  console.log(`旧域名: ${oldDomain}`);
  console.log(`新域名: ${newDomain}`);
  console.log('=================================================');

  const client = cf.createClient({ apiToken, accountId });

  // 步骤 1: 准备新域名（托管 + SSL 配置）
  const newZoneId = await switcher.prepareNewDomain(
    client,
    accountId,
    oldZoneId,
    newDomain
  );

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
      console.log(`  [Worker] ${app.name}`);
      console.log(`    ${app.oldPattern} → ${app.oldPattern?.replace(oldDomain, newDomain)}`);
    } else {
      console.log(`  [Pages] ${app.name}`);
      console.log(`    ${oldDomain} → ${newDomain}`);
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

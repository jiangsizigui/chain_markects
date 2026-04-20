// 更新市场数据脚本 - 添加真实预测市场题目
const db = require('sql.js');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('开始更新市场数据...\n');

  const SQL = await db;
  const initSqlJs = SQL.default || SQL;
  const instance = await new initSqlJs();
  const database = new instance.Database();

  // 加载现有数据库
  const dbPath = path.join(__dirname, '..', 'data', 'persist.sqlite');
  const buffer = fs.readFileSync(dbPath);
  database.run('PRAGMA journal_mode=WAL');

  // 真实预测市场题目（从Polymarket获取）
  const realMarkets = [
    {
      title: '美伊停火协议延长至2026年4月21日？',
      description: '霍尔木兹海峡紧张局势持续，美伊双方正在进行外交谈判。\n\n结算条件：\n- 若美伊双方官方宣布停火协议延长并生效，则结果为 YES\n- 若停火协议未能延长或破裂，则结果为 NO',
      category: '政治与政策',
      yesPrice: 72,
      volume: 981000,
      status: 'OPEN'
    },
    {
      title: '2028年美国总统选举获胜者预测',
      description: '距离2028年美国总统大选还有两年多时间，市场正在预测各候选人胜选概率。\n\n结算条件：\n- 若指定候选人赢得2028年总统大选，则结果为 YES\n- 否则为 NO',
      category: '政治与政策',
      yesPrice: 19,
      volume: 541000000,
      status: 'OPEN'
    },
    {
      title: '2026年NBA总冠军是哪支球队？',
      description: 'NBA赛季进行中，各支球队竞争激烈。\n\n结算条件：\n- 若指定球队获得总冠军，则为 YES\n- 否则为 NO',
      category: '体育赛事',
      yesPrice: 48,
      volume: 293000000,
      status: 'OPEN'
    },
    {
      title: '2026年FIFA世界杯冠军预测',
      description: '世界杯是全球最受关注的体育赛事之一。\n\n结算条件：\n- 若指定球队获得世界杯冠军，则为 YES\n- 否则为 NO',
      category: '体育赛事',
      yesPrice: 16,
      volume: 692000000,
      status: 'OPEN'
    },
    {
      title: '欧冠联赛冠军预测',
      description: '欧洲冠军联赛是欧洲顶级足球赛事。\n\n结算条件：\n- 若指定球队获得欧冠冠军，则为 YES\n- 否则为 NO',
      category: '体育赛事',
      yesPrice: 35,
      volume: 243000000,
      status: 'OPEN'
    },
    {
      title: '比特币价格4月19日会高于62,000美元吗？',
      description: '比特币价格波动剧烈，市场对短期走势存在分歧。\n\n结算条件：\n- 若当日主流交易所平均价格高于62,000美元，则为 YES\n- 否则为 NO\n\n数据来源：CoinGecko/Binance平均价格',
      category: '经济与金融',
      yesPrice: 100,
      volume: 3000000,
      status: 'OPEN'
    },
    {
      title: 'WTI原油4月价格会触及100美元吗？',
      description: '全球能源市场持续波动，原油价格受到地缘政治和供需关系影响。\n\n结算条件：\n- 若WTI原油期货价格在4月内触及100美元/桶，则为 YES\n- 若未能触及，则为 NO\n\n数据来源：EIA官方数据',
      category: '经济与金融',
      yesPrice: 42,
      volume: 42000000,
      status: 'OPEN'
    },
    {
      title: '美联储主席鲍威尔5月31日前会卸任吗？',
      description: '美联储主席杰罗姆·鲍威尔的任期问题受到市场关注。\n\n结算条件：\n- 若鲍威尔在5月31日前宣布卸任或被免职，则为 YES\n- 若继续任职，则为 NO\n\n数据来源：美联储官方公告',
      category: '经济与金融',
      yesPrice: 66,
      volume: 2000000,
      status: 'OPEN'
    },
    {
      title: 'NVIDIA会成为4月底市值最大的公司吗？',
      description: '科技巨头市值排名竞争激烈，NVIDIA近年来增长迅猛。\n\n结算条件：\n- 若NVIDIA市值在4月最后一天为最大，则为 YES\n- 否则为 NO\n\n数据来源：Yahoo Finance市值数据',
      category: '经济与金融',
      yesPrice: 99,
      volume: 12000000,
      status: 'OPEN'
    },
    {
      title: 'Drake在6月30日前会发布新专辑Iceman吗？',
      description: 'Drake是全球最具影响力的说唱歌手之一。\n\n结算条件：\n- 若Drake官方发布或确认发布Iceman专辑（至少1首歌曲），则为 YES\n- 若未发布，则为 NO\n\n数据来源：Drake官方社交媒体/Spotify/Apple Music',
      category: '娱乐与文化',
      yesPrice: 82,
      volume: 196000,
      status: 'OPEN'
    },
    {
      title: '霍尔木兹海峡交通4月底前会恢复正常吗？',
      description: '霍尔木兹海峡是全球最重要的石油运输通道，当前局势紧张。\n\n结算条件：\n- 若海峡航运量恢复到正常水平的80%以上，则为 YES\n- 否则为 NO\n\n数据来源：TankerTracker.com',
      category: '全球事件',
      yesPrice: 27,
      volume: 18000000,
      status: 'OPEN'
    },
    {
      title: '美伊双方4月30日前会有外交会面吗？',
      description: '美伊关系持续紧张，外交渠道沟通情况受到关注。\n\n结算条件：\n- 若双方外交官员进行正式会面，则为 YES\n- 否则为 NO\n\n数据来源：白宫/CIA/伊朗外交部官方公告',
      category: '政治与政策',
      yesPrice: 93,
      volume: 4000000,
      status: 'OPEN'
    }
  ];

  // 1. 添加新市场
  let added = 0;
  realMarkets.forEach((market, index) => {
    const marketId = index + 13; // 从ID 13开始

    database.run(`
      INSERT OR REPLACE INTO markets (id, title, description, category, status, yesPrice, noPrice, volume, participants, liquidity, resolvedOutcome, resolvedAt, endTime, resolutionSource, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1000, NULL, NULL, '2026-12-31T23:59:59Z', '官方公告', datetime('now'), datetime('now'))
    `, [marketId, market.title, market.description, market.category, market.status, market.yesPrice, 100 - market.yesPrice, market.volume]);

    added++;
    console.log(`✓ 添加 #${marketId}: ${market.title}`);
  });

  // 2. 删除虚假题目（包含"某"字）
  const fakeMarkets = database.exec(`
    SELECT id, title FROM markets
    WHERE title LIKE '%某%' OR title LIKE '%XX%' OR title LIKE '%○○%' OR title LIKE '%某个%' OR title LIKE '%某大型%' OR title LIKE '%某国家%' OR title LIKE '%某公司%' OR title LIKE '%某运动员%' OR title LIKE '%某电影%'
  `);

  let deleted = 0;
  if (fakeMarkets.length > 0 && fakeMarkets[0].values.length > 0) {
    const fakeIds = fakeMarkets[0].values.map(v => v[0]);
    const fakeTitles = fakeMarkets[0].values.map(v => v[1]);

    database.run(`DELETE FROM markets WHERE id IN (${fakeIds.join(',')})`);
    deleted = fakeIds.length;

    console.log(`\n✗ 删除 ${deleted} 个虚假题目:`);
    fakeTitles.forEach(t => console.log(`  - ${t}`));
  } else {
    console.log('\n✓ 未发现需要删除的虚假题目');
  }

  // 3. 保存数据库
  const data = database.export();
  fs.writeFileSync(dbPath, Buffer.from(data));

  console.log(`\n========== 更新完成 ==========`);
  console.log(`新增真实市场: ${added} 个`);
  console.log(`删除虚假题目: ${deleted} 个`);
  console.log(`数据库已保存: ${dbPath}`);

  database.close();
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});

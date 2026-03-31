// ============================================================
// GraphExtractor 测试 — 用用户实际 md 内容测试解析
// ============================================================

import * as path from 'path';
import * as fs from 'fs';
import { Database } from '../../src/store/database';
import { MdParser } from '../../src/tracker/md-parser';
import { GraphExtractor } from '../../src/workflow/graph-extractor';
import { AgentRegistration } from '../../src/tracker/types';

const TEST_DB_PATH = path.join(__dirname, '..', '..', 'data', 'test-graph-extractor.sqlite');

// 模拟 butterfly-invest 的 Agent 注册列表
const MOCK_AGENTS: AgentRegistration[] = [
  { agent_id: 'butterfly-invest', name: 'Butterfly', emoji: '🦋', theme: '', model: 'gpt-5.4', workspace_path: '' },
  { agent_id: 'butterfly-invest-trigger', name: 'Trigger', emoji: '⚡', theme: '', model: 'gpt-5.4', workspace_path: '' },
  { agent_id: 'butterfly-invest-variable', name: 'Variable', emoji: '🧠', theme: '', model: 'gpt-5.4', workspace_path: '' },
  { agent_id: 'butterfly-invest-industry', name: 'Industry', emoji: '🏭', theme: '', model: 'gpt-5.4', workspace_path: '' },
  { agent_id: 'butterfly-invest-asset', name: 'Asset', emoji: '💎', theme: '', model: 'gpt-5.4', workspace_path: '' },
  { agent_id: 'butterfly-invest-redteam', name: 'Redteam', emoji: '🛡️', theme: '', model: 'gpt-5.4', workspace_path: '' },
];

// 用户实际文件中的关键片段
const MULTI_AGENT_MD = `# 多代理职责划分 v1

## 一、总览

### 主研究链代理
1. 源头触发代理
2. 关键传导变量代理
3. 产业传导代理
4. 资产映射代理

### 横切代理
5. 红队挑战代理

### 编排代理
6. 总控编排代理

---

## 二、各代理职责定义

## 1. 源头触发代理
### 使命
尽可能早地发现值得进入系统研究的科技变化线索。

### 主要职责
- 采集和整理早期信号
- 识别可能重要的技术主题
- 建立技术事件卡
- 对信号做初步可信度判断
- 将高潜力线索推送给关键传导变量代理

### 输出
- 技术事件卡
- 初始主题列表
- 因子候选清单

---

## 2. 关键传导变量代理
### 使命
识别在源头变化与产业结果之间真正起放大作用的中间变量。

### 主要职责
- 判断哪些变量是关键放大器
- 区分约束型变量与增益型变量

### 输出
- 关键传导变量卡
- 放大机制说明

---

## 3. 产业传导代理
### 使命
把关键传导变量翻译为产业链影响、供需变化、议价权迁移和利润池变化。

### 输出
- 产业传导地图
- 受益/受损环节清单

---

## 4. 资产映射代理
### 使命
将产业变化转译为具体资产候选池。

### 输出
- 资产映射表
- 候选资产池

---

## 5. 红队挑战代理
### 使命
对前四层逐层发起挑战，不是做补充，而是做反驳、拆解和压力测试。

### 输出
- 红队挑战报告
- 分层反驳清单

---

## 6. 总控编排代理
### 使命
负责代理间任务流转、优先级安排、结果汇总与冲突协调。

### 输出
- 研究任务单
- 汇总摘要

---

## 三、代理之间的协作顺序

### 主链流程
1. 源头触发代理发现早期线索
2. 关键传导变量代理识别被放大的中间变量
3. 产业传导代理建立产业链影响逻辑
4. 资产映射代理输出候选资产池

### 横切流程
- 红队挑战代理对主链各层逐层质疑
- 挑战结果返回总控编排代理
`;

const SYSTEM_OVERVIEW_MD = `# 五代理系统总览 v1

## 一、系统总结构

顶层主代理：
- \`butterfly-invest\`

一级代理：
- \`butterfly-invest-trigger\`
- \`butterfly-invest-variable\`
- \`butterfly-invest-industry\`
- \`butterfly-invest-asset\`
- \`butterfly-invest-redteam\`

## 三、业务链与成长链

## 1. 业务链：串行主研究链
1. Trigger
2. Variable
3. Industry
4. Asset
5. Redteam 横切挑战

## 四、主研究链的交付关系

### Trigger → Variable
交付：主题卡

### Variable → Industry
交付：变量卡

### Industry → Asset
交付：产业结构卡

### Asset → 人工投资判断
交付：候选资产池与排除说明

### Redteam → 全链条
交付：节点挑战单 + 整链挑战报告
`;

const CLOSED_LOOP_MD = `# 五代理闭环与排程方案 v1

## 四、协作方式建议

### 串行主链 + 并行挑战
- 源头触发 → 关键传导变量 → 产业传导 → 资产映射
- 红队挑战代理在每一层产出后都可以介入
`;

let db: Database;
let extractor: GraphExtractor;

beforeAll(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  db = new Database(TEST_DB_PATH);
  const mdParser = new MdParser();
  extractor = new GraphExtractor(mdParser, db);

  // 注册测试 Agent
  db.upsertClaw({ claw_id: 'test-claw', name: 'Test', openclaw_dir: '/tmp' });
  for (const agent of MOCK_AGENTS) {
    db.upsertAgent({ ...agent, claw_id: 'test-claw' });
  }

  // 写入 core_files
  db.upsertCoreFile({
    claw_id: 'test-claw',
    agent_id: null,
    file_type: null,
    file_path: 'agents/butterfly-invest/多代理职责划分_v1.md',
    current_hash: 'hash1',
    current_content: MULTI_AGENT_MD,
  });

  db.upsertCoreFile({
    claw_id: 'test-claw',
    agent_id: null,
    file_type: null,
    file_path: 'agents/butterfly-invest/五代理系统总览_v1.md',
    current_hash: 'hash2',
    current_content: SYSTEM_OVERVIEW_MD,
  });

  db.upsertCoreFile({
    claw_id: 'test-claw',
    agent_id: null,
    file_type: null,
    file_path: 'agents/butterfly-invest/五代理闭环与排程方案_v1.md',
    current_hash: 'hash3',
    current_content: CLOSED_LOOP_MD,
  });
});

afterAll(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe('GraphExtractor', () => {
  describe('extractFromAgentNetwork', () => {
    it('extracts main chain agents as nodes', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const { nodes } = extractor.extractFromAgentNetwork(MULTI_AGENT_MD, 'test.md');

      expect(nodes.length).toBeGreaterThanOrEqual(5);

      const triggerNode = nodes.find(n =>
        n.agent_id === 'butterfly-invest-trigger' || n.name.includes('源头触发')
      );
      expect(triggerNode).toBeDefined();
      expect(triggerNode!.role).toContain('发现');
    });

    it('identifies redteam as crosscut', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const { nodes } = extractor.extractFromAgentNetwork(MULTI_AGENT_MD, 'test.md');

      const redteamNode = nodes.find(n =>
        n.agent_id === 'butterfly-invest-redteam' || n.name.includes('红队')
      );
      expect(redteamNode).toBeDefined();
      expect(redteamNode!.is_crosscut).toBe(true);
    });

    it('extracts main chain flow: Trigger -> Variable -> Industry -> Asset', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const { relations } = extractor.extractFromAgentNetwork(MULTI_AGENT_MD, 'test.md');

      // 检查主链顺序关系
      const mainChainPairs = [
        ['butterfly-invest-trigger', 'butterfly-invest-variable'],
        ['butterfly-invest-variable', 'butterfly-invest-industry'],
        ['butterfly-invest-industry', 'butterfly-invest-asset'],
      ];

      for (const [from, to] of mainChainPairs) {
        const edge = relations.find(r =>
          r.from === from && r.to === to
        );
        expect(edge).toBeDefined();
      }
    });

    it('extracts crosscut relations from redteam', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const { relations } = extractor.extractFromAgentNetwork(MULTI_AGENT_MD, 'test.md');

      // 红队对主链代理有横切关系
      const redteamEdges = relations.filter(r =>
        r.from === 'butterfly-invest-redteam'
      );
      expect(redteamEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts delivery relations from responsibilities', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const { relations } = extractor.extractFromAgentNetwork(MULTI_AGENT_MD, 'test.md');

      // "将高潜力线索推送给关键传导变量代理"
      const deliveryEdge = relations.find(r =>
        r.from === 'butterfly-invest-trigger' &&
        r.to === 'butterfly-invest-variable' &&
        r.relation.includes('交付')
      );
      expect(deliveryEdge).toBeDefined();
    });

    it('extracts node outputs', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const { nodes } = extractor.extractFromAgentNetwork(MULTI_AGENT_MD, 'test.md');

      const triggerNode = nodes.find(n =>
        n.agent_id === 'butterfly-invest-trigger' || n.name.includes('源头触发')
      );
      expect(triggerNode).toBeDefined();
      expect(triggerNode!.outputs.length).toBeGreaterThan(0);
      expect(triggerNode!.outputs.some(o => o.includes('技术事件卡'))).toBe(true);
    });
  });

  describe('extractFromSystemOverview', () => {
    it('extracts delivery relations with deliverables', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const { relations } = extractor.extractFromSystemOverview(SYSTEM_OVERVIEW_MD, 'test.md');

      // Trigger -> Variable: 交付主题卡
      const trigToVar = relations.find(r =>
        r.from === 'butterfly-invest-trigger' &&
        r.to === 'butterfly-invest-variable'
      );
      expect(trigToVar).toBeDefined();
      expect(trigToVar!.relation).toContain('主题卡');
    });

    it('extracts business chain sequence', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const { relations } = extractor.extractFromSystemOverview(SYSTEM_OVERVIEW_MD, 'test.md');

      const seqEdges = relations.filter(r => r.type === 'sequence');
      expect(seqEdges.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('extractFromClosedLoop', () => {
    it('extracts serial main chain from arrow notation', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const relations = extractor.extractFromClosedLoop(CLOSED_LOOP_MD, 'test.md');

      expect(relations.length).toBeGreaterThanOrEqual(3);

      // 验证顺序
      const fromTrigger = relations.find(r =>
        r.from === 'butterfly-invest-trigger' &&
        r.to === 'butterfly-invest-variable'
      );
      expect(fromTrigger).toBeDefined();
    });

    it('extracts redteam per-layer challenge relations', () => {
      extractor.buildAliasMap(MOCK_AGENTS);
      const relations = extractor.extractFromClosedLoop(CLOSED_LOOP_MD, 'test.md');

      const redteamEdges = relations.filter(r =>
        r.from === 'butterfly-invest-redteam' &&
        r.relation.includes('挑战')
      );
      expect(redteamEdges.length).toBeGreaterThanOrEqual(4); // 对4个主链代理
    });
  });

  describe('extractFromMdFiles (integration)', () => {
    it('returns nodes and edges from all md files in db', () => {
      const result = extractor.extractFromMdFiles('test-claw', MOCK_AGENTS);

      expect(result.nodes.length).toBeGreaterThanOrEqual(5);
      expect(result.edges.length).toBeGreaterThanOrEqual(3);
    });

    it('deduplicates edges from multiple sources', () => {
      const result = extractor.extractFromMdFiles('test-claw', MOCK_AGENTS);

      // 同一对 agent 同类型不应有重复边
      const edgeKeys = result.edges.map(e => `${e.source}->${e.target}:${e.type}`);
      const uniqueKeys = new Set(edgeKeys);
      expect(edgeKeys.length).toBe(uniqueKeys.size);
    });
  });

  describe('alias resolution', () => {
    it('resolves Chinese role names to agent_id', () => {
      extractor.buildAliasMap(MOCK_AGENTS);

      expect(extractor.resolveAgentId('源头触发')).toBe('butterfly-invest-trigger');
      expect(extractor.resolveAgentId('关键传导变量')).toBe('butterfly-invest-variable');
      expect(extractor.resolveAgentId('产业传导')).toBe('butterfly-invest-industry');
      expect(extractor.resolveAgentId('资产映射')).toBe('butterfly-invest-asset');
      expect(extractor.resolveAgentId('红队')).toBe('butterfly-invest-redteam');
    });

    it('resolves English short names', () => {
      extractor.buildAliasMap(MOCK_AGENTS);

      expect(extractor.resolveAgentId('Trigger')).toBe('butterfly-invest-trigger');
      expect(extractor.resolveAgentId('Variable')).toBe('butterfly-invest-variable');
      expect(extractor.resolveAgentId('Industry')).toBe('butterfly-invest-industry');
      expect(extractor.resolveAgentId('Asset')).toBe('butterfly-invest-asset');
      expect(extractor.resolveAgentId('Redteam')).toBe('butterfly-invest-redteam');
    });

    it('resolves with "代理" suffix', () => {
      extractor.buildAliasMap(MOCK_AGENTS);

      expect(extractor.resolveAgentId('源头触发代理')).toBe('butterfly-invest-trigger');
      expect(extractor.resolveAgentId('红队挑战代理')).toBe('butterfly-invest-redteam');
    });

    it('resolves orchestrator names', () => {
      extractor.buildAliasMap(MOCK_AGENTS);

      expect(extractor.resolveAgentId('总控编排')).toBe('butterfly-invest');
      expect(extractor.resolveAgentId('策略分析师')).toBe('butterfly-invest');
    });
  });
});

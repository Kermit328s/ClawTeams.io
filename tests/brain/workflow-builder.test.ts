// ============================================================
// 工作流图生成测试
// ============================================================

import * as path from 'path';
import * as fs from 'fs';
import { Database } from '../../src/store/database';
import { MdParser } from '../../src/tracker/md-parser';
import { WorkflowBuilder } from '../../src/brain/workflow-builder';

const TEST_DB_PATH = path.join(__dirname, '..', '..', 'data', 'test-workflow.sqlite');

let db: Database;
let builder: WorkflowBuilder;

beforeAll(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  db = new Database(TEST_DB_PATH);
  const mdParser = new MdParser();
  builder = new WorkflowBuilder(db, mdParser);

  // 创建测试数据
  db.upsertClaw({
    claw_id: 'wf-claw-001',
    name: 'Workflow Test Claw',
    openclaw_dir: '/tmp/wf-test',
    gateway_port: 8080,
  });

  db.upsertAgent({
    agent_id: 'wf-agent-a',
    claw_id: 'wf-claw-001',
    name: 'Agent A',
    emoji: '🅰️',
    model: 'gpt-4',
  });

  db.upsertAgent({
    agent_id: 'wf-agent-b',
    claw_id: 'wf-claw-001',
    name: 'Agent B',
    emoji: '🅱️',
    model: 'gpt-4',
  });

  db.upsertAgent({
    agent_id: 'wf-agent-c',
    claw_id: 'wf-claw-001',
    name: 'Agent C',
    emoji: '©️',
    model: 'gpt-4',
  });
});

afterAll(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe('WorkflowBuilder', () => {
  it('generates nodes from agents', () => {
    const graph = builder.buildGraph('');
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    const nodeIds = graph.nodes.map(n => n.agent_id);
    expect(nodeIds).toContain('wf-agent-a');
    expect(nodeIds).toContain('wf-agent-b');
    expect(nodeIds).toContain('wf-agent-c');
  });

  it('node has correct structure', () => {
    const graph = builder.buildGraph('');
    const node = graph.nodes.find(n => n.agent_id === 'wf-agent-a');
    expect(node).toBeDefined();
    expect(node!.id).toBe('wf-agent-a');
    expect(node!.name).toBe('Agent A');
    expect(node!.emoji).toBe('🅰️');
    expect(node!.type).toBe('agent');
    expect(node!.status).toBeDefined();
  });

  it('includes dynamic relations as edges', () => {
    // 添加关系
    db.upsertAgentRelation({
      source_agent_id: 'wf-agent-a',
      target_agent_id: 'wf-agent-b',
      relation_type: 'collaboration',
      source_info: 'A sends data to B',
    });

    db.upsertAgentRelation({
      source_agent_id: 'wf-agent-b',
      target_agent_id: 'wf-agent-c',
      relation_type: 'subagent',
      source_info: 'B spawns C',
    });

    const graph = builder.buildGraph('');
    expect(graph.edges.length).toBeGreaterThanOrEqual(2);

    const edgeAB = graph.edges.find(e => e.source === 'wf-agent-a' && e.target === 'wf-agent-b');
    expect(edgeAB).toBeDefined();
    expect(edgeAB!.relation_type).toBe('collaboration');
    expect(edgeAB!.label).toBe('A sends data to B');

    const edgeBC = graph.edges.find(e => e.source === 'wf-agent-b' && e.target === 'wf-agent-c');
    expect(edgeBC).toBeDefined();
    expect(edgeBC!.relation_type).toBe('subagent');
  });

  it('merges static and dynamic edges', () => {
    // 重复添加同一关系应该合并
    db.upsertAgentRelation({
      source_agent_id: 'wf-agent-a',
      target_agent_id: 'wf-agent-b',
      relation_type: 'collaboration',
    });

    const graph = builder.buildGraph('');
    // 同一对 agent 同类型关系只应有一条边
    const edgesAB = graph.edges.filter(
      e => e.source === 'wf-agent-a' && e.target === 'wf-agent-b' && e.relation_type === 'collaboration'
    );
    expect(edgesAB.length).toBe(1);
    // strength 应该增加（upsertAgentRelation 自动 +1）
    expect(edgesAB[0].strength).toBeGreaterThanOrEqual(2);
  });

  it('returns empty edges when no relations exist', () => {
    // 为新的测试 claw 创建一个隔离环境
    const isolatedDb = new Database(path.join(__dirname, '..', '..', 'data', 'test-wf-isolated.sqlite'));
    const isolatedBuilder = new WorkflowBuilder(isolatedDb, new MdParser());

    isolatedDb.upsertClaw({
      claw_id: 'isolated-claw',
      name: 'Isolated',
      openclaw_dir: '/tmp/isolated',
    });
    isolatedDb.upsertAgent({
      agent_id: 'iso-agent',
      claw_id: 'isolated-claw',
      name: 'Isolated Agent',
    });

    const graph = isolatedBuilder.buildGraph('');
    expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
    expect(graph.edges.length).toBe(0);

    isolatedDb.close();
    const isoDbPath = path.join(__dirname, '..', '..', 'data', 'test-wf-isolated.sqlite');
    if (fs.existsSync(isoDbPath)) fs.unlinkSync(isoDbPath);
  });
});

// ============================================================
// 工作流图生成测试 — 技能级版本
// ============================================================

import * as path from 'path';
import * as fs from 'fs';
import { Database } from '../../src/store/database';
import { MdParser } from '../../src/tracker/md-parser';
import { WorkflowBuilder } from '../../src/brain/workflow-builder';
import { SkillNodeData } from '../../src/workflow/types';

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
  it('generates skill nodes from agents', () => {
    const graph = builder.buildGraph('');
    // Should have both skill nodes and group nodes
    const skillNodes = graph.nodes.filter(n => n.type === 'skill');
    expect(skillNodes.length).toBeGreaterThanOrEqual(3); // at least 1 skill per agent

    // All agents should have at least one skill node
    const agentIds = new Set(skillNodes.map(n => (n.data as SkillNodeData).agent_id));
    expect(agentIds.has('wf-agent-a')).toBe(true);
    expect(agentIds.has('wf-agent-b')).toBe(true);
    expect(agentIds.has('wf-agent-c')).toBe(true);
  });

  it('skill node has correct React Flow structure', () => {
    const graph = builder.buildGraph('');
    const skillNodes = graph.nodes.filter(n => n.type === 'skill');
    const node = skillNodes.find(n => (n.data as SkillNodeData).agent_id === 'wf-agent-a');
    expect(node).toBeDefined();
    expect(node!.type).toBe('skill');
    expect(node!.position).toBeDefined();
    expect(node!.position.x).toBeDefined();
    expect(node!.position.y).toBeDefined();

    const data = node!.data as SkillNodeData;
    expect(data.agent_name).toBe('Agent A');
    expect(data.agent_emoji).toBe('🅰️');
    expect(data.skill_name).toBeDefined();
    expect(data.status).toBeDefined();
    expect(data.execution_stats).toBeDefined();
  });

  it('generates group nodes for agent rows', () => {
    const graph = builder.buildGraph('');
    const groupNodes = graph.nodes.filter(n => n.type === 'agent-group');
    expect(groupNodes.length).toBeGreaterThanOrEqual(3);
  });

  it('generates internal edges within same agent', () => {
    const graph = builder.buildGraph('');
    const internalEdges = graph.edges.filter(e => e.type === 'internal');
    // Each agent with default 3 skills should have 2 internal edges
    expect(internalEdges.length).toBeGreaterThanOrEqual(2);
  });

  it('returns graph with metadata', () => {
    const graph = builder.buildGraph('');
    expect(graph.metadata).toBeDefined();
    expect(graph.metadata.generated_at).toBeGreaterThan(0);
    expect(typeof graph.metadata.static_edge_count).toBe('number');
    expect(typeof graph.metadata.dynamic_edge_count).toBe('number');
    expect(Array.isArray(graph.metadata.data_sources)).toBe(true);
  });

  it('returns empty edges when no relations exist', () => {
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
    const skillNodes = graph.nodes.filter(n => n.type === 'skill');
    expect(skillNodes.length).toBeGreaterThanOrEqual(1);
    // Only internal edges, no cross-agent edges
    const crossEdges = graph.edges.filter(e => e.type === 'cross_agent' || e.type === 'crosscut');
    expect(crossEdges.length).toBe(0);

    isolatedDb.close();
    const isoDbPath = path.join(__dirname, '..', '..', 'data', 'test-wf-isolated.sqlite');
    if (fs.existsSync(isoDbPath)) fs.unlinkSync(isoDbPath);
  });
});

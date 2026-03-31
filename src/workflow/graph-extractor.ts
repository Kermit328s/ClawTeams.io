// ============================================================
// 静态工作流关系提取 — 从 md 文件解析 Agent 间协作关系
// ============================================================

import { Database } from '../store/database';
import { MdParser } from '../tracker/md-parser';
import { AgentRegistration } from '../tracker/types';
import {
  ExtractedRelation,
  ExtractedNode,
  WorkflowNode,
  WorkflowEdge,
  AgentAlias,
} from './types';

interface DbCoreFile {
  agent_id: string | null;
  file_type: string;
  file_path: string;
  current_content: string | null;
}

/**
 * 从 md 文件提取静态工作流关系
 *
 * 解析策略（基于用户实际的 butterfly-invest 文件）：
 * 1. 箭头符号：-> / => 表示方向关系
 * 2. 表格中的角色和输出
 * 3. 关键词匹配：交付/挑战/接收
 * 4. Agent ID 映射：角色名 -> agent_id
 */
export class GraphExtractor {
  /** 角色别名 -> agent_id 映射 */
  private aliasMap: Map<string, string> = new Map();

  constructor(
    private mdParser: MdParser,
    private db: Database,
  ) {}

  /**
   * 从所有可用的 md 文件提取关系
   */
  extractFromMdFiles(
    clawId: string,
    agents: AgentRegistration[],
  ): { nodes: Partial<WorkflowNode>[]; edges: Partial<WorkflowEdge>[] } {
    // 1. 构建别名映射
    this.buildAliasMap(agents);

    const allNodes: ExtractedNode[] = [];
    const allRelations: ExtractedRelation[] = [];

    // 2. 从数据库获取所有 core_files 的内容
    const coreFiles = this.db.getCoreFiles() as DbCoreFile[];

    for (const file of coreFiles) {
      if (!file.current_content) continue;

      try {
        const fileName = file.file_path.split('/').pop() ?? '';

        // "多代理职责划分" 类文件 — 主要关系来源
        if (fileName.includes('职责划分')) {
          const { nodes, relations } = this.extractFromAgentNetwork(
            file.current_content,
            file.file_path,
          );
          allNodes.push(...nodes);
          allRelations.push(...relations);
        }

        // "五代理系统总览" — 补充交付关系
        if (fileName.includes('系统总览')) {
          const { nodes, relations } = this.extractFromSystemOverview(
            file.current_content,
            file.file_path,
          );
          allNodes.push(...nodes);
          allRelations.push(...relations);
        }

        // "五代理闭环" — 补充协作顺序
        if (fileName.includes('闭环')) {
          const relations = this.extractFromClosedLoop(
            file.current_content,
            file.file_path,
          );
          allRelations.push(...relations);
        }

        // 各 Agent 工作定义 — 交付关系
        if (fileName.includes('工作定义') && file.agent_id) {
          const relations = this.extractFromWorkDefinitions(
            file.agent_id,
            file.current_content,
            file.file_path,
          );
          allRelations.push(...relations);
        }
      } catch {
        // 解析失败，跳过
      }
    }

    // 3. 转换为 WorkflowNode 和 WorkflowEdge 的 partial 形式
    const nodePartials = this.nodesToPartials(allNodes, agents);
    const edgePartials = this.relationsToPartials(allRelations);

    return { nodes: nodePartials, edges: edgePartials };
  }

  // ================================================================
  // 从"多代理职责划分"类文件中提取
  // ================================================================

  extractFromAgentNetwork(
    content: string,
    sourceFile: string,
  ): { nodes: ExtractedNode[]; relations: ExtractedRelation[] } {
    const nodes: ExtractedNode[] = [];
    const relations: ExtractedRelation[] = [];

    // --- 提取节点 ---

    // 识别主研究链代理列表
    // 模式: "1. 源头触发代理" / "2. 关键传导变量代理" 等
    const agentListPattern = /^\d+\.\s*(.+代理)/gm;
    let match: RegExpExecArray | null;
    const mentionedRoles: string[] = [];
    while ((match = agentListPattern.exec(content)) !== null) {
      mentionedRoles.push(match[1].trim());
    }

    // 识别横切和编排角色
    const isCrosscut = (role: string): boolean => {
      return /红队|redteam|横切/i.test(role);
    };

    const isOrchestrator = (role: string): boolean => {
      return /总控|编排|orchestrat/i.test(role);
    };

    // 从二级标题提取代理定义
    // 模式: "## 1. 源头触发代理" 后面跟使命、职责、输出等
    const agentSectionPattern = /##\s*\d+\.\s*(.+代理)\s*\n([\s\S]*?)(?=##\s*\d+\.|##\s*[三四五六七八九十]|---\s*$|$)/g;
    while ((match = agentSectionPattern.exec(content)) !== null) {
      const roleName = match[1].trim();
      const sectionContent = match[2];
      const agentId = this.resolveAgentId(roleName);

      // 提取输出
      const outputs: string[] = [];
      const outputSection = sectionContent.match(/###?\s*输出\s*\n([\s\S]*?)(?=###|---|\n##|$)/);
      if (outputSection) {
        const listPattern = /^[-*]\s+(.+)$/gm;
        let listMatch: RegExpExecArray | null;
        while ((listMatch = listPattern.exec(outputSection[1])) !== null) {
          outputs.push(listMatch[1].trim());
        }
      }

      // 提取使命
      let role = '';
      const missionMatch = sectionContent.match(/###?\s*使命\s*\n(.+)/);
      if (missionMatch) {
        role = missionMatch[1].trim();
      }

      nodes.push({
        agent_id: agentId,
        name: roleName,
        role,
        is_crosscut: isCrosscut(roleName),
        outputs,
      });
    }

    // --- 提取关系 ---

    // 1. 箭头关系：Trigger -> Variable, 源头触发 -> 关键传导变量
    const arrowPatterns = [
      /(\S+)\s*(?:→|->|──→|==>)\s*(\S+)/g,
    ];
    for (const pattern of arrowPatterns) {
      while ((match = pattern.exec(content)) !== null) {
        const fromId = this.resolveAgentId(match[1].trim());
        const toId = this.resolveAgentId(match[2].trim());
        if (fromId && toId && fromId !== toId) {
          relations.push({
            from: fromId,
            to: toId,
            relation: 'flow',
            type: 'collaboration',
            source_file: sourceFile,
          });
        }
      }
    }

    // 2. "将高潜力线索推送给关键传导变量代理" 等交付语句
    const deliveryPatterns = [
      /(?:推送|交付|传递|输出)给(.+?代理)/g,
      /将.+(?:推送|交付|传递)给(.+?代理)/g,
    ];
    // 从各代理 section 中提取交付关系
    const sectionPattern2 = /##\s*\d+\.\s*(.+代理)\s*\n([\s\S]*?)(?=##\s*\d+\.|##\s*[三四五六七八九十]|---\s*$|$)/g;
    while ((match = sectionPattern2.exec(content)) !== null) {
      const fromRole = match[1].trim();
      const fromId = this.resolveAgentId(fromRole);
      const sectionContent = match[2];

      for (const dp of deliveryPatterns) {
        dp.lastIndex = 0;
        let dm: RegExpExecArray | null;
        while ((dm = dp.exec(sectionContent)) !== null) {
          const toRole = dm[1].trim();
          const toId = this.resolveAgentId(toRole);
          if (fromId && toId && fromId !== toId) {
            relations.push({
              from: fromId,
              to: toId,
              relation: `交付`,
              type: 'collaboration',
              source_file: sourceFile,
            });
          }
        }
      }
    }

    // 3. 协作顺序段落
    // "源头触发代理发现早期线索" -> "关键传导变量代理识别..." -> ...
    const sequenceSection = content.match(
      /###?\s*主链流程\s*\n([\s\S]*?)(?=###|---|\n##|$)/,
    );
    if (sequenceSection) {
      const steps: string[] = [];
      const stepPattern = /^\d+\.\s*(.+代理)/gm;
      while ((match = stepPattern.exec(sequenceSection[1])) !== null) {
        steps.push(match[1].trim());
      }
      for (let i = 0; i < steps.length - 1; i++) {
        const fromId = this.resolveAgentId(steps[i]);
        const toId = this.resolveAgentId(steps[i + 1]);
        if (fromId && toId) {
          relations.push({
            from: fromId,
            to: toId,
            relation: '主链流转',
            type: 'sequence',
            source_file: sourceFile,
          });
        }
      }
    }

    // 4. 横切关系：红队对所有主链代理
    const crosscutSection = content.match(
      /###?\s*横切流程\s*\n([\s\S]*?)(?=###|---|\n##|$)/,
    );
    if (crosscutSection) {
      const redteamId = this.resolveAgentId('红队挑战代理');
      if (redteamId) {
        // 红队对主链各层质疑
        for (const node of nodes) {
          if (!node.is_crosscut && !this.isOrchestrator(node.name) && node.agent_id !== redteamId) {
            relations.push({
              from: redteamId,
              to: node.agent_id,
              relation: '横切挑战',
              type: 'collaboration',
              source_file: sourceFile,
            });
          }
        }
      }
    }

    return { nodes, relations };
  }

  // ================================================================
  // 从"五代理系统总览"提取
  // ================================================================

  extractFromSystemOverview(
    content: string,
    sourceFile: string,
  ): { nodes: ExtractedNode[]; relations: ExtractedRelation[] } {
    const nodes: ExtractedNode[] = [];
    const relations: ExtractedRelation[] = [];

    // 提取系统结构中的 agent_id
    // 模式: "`butterfly-invest-trigger`"
    const agentIdPattern = /`(butterfly-invest[-\w]*)`/g;
    let match: RegExpExecArray | null;
    while ((match = agentIdPattern.exec(content)) !== null) {
      const agentId = match[1];
      // 注册别名
      const shortName = agentId.replace('butterfly-invest-', '');
      this.aliasMap.set(shortName.toLowerCase(), agentId);
    }

    // 提取交付关系段落
    // 模式: "### Trigger -> Variable\n交付：主题卡"
    const deliveryPattern = /###?\s*(\w+)\s*(?:→|->)\s*(\w+)\s*\n交付[：:]\s*(.+)/g;
    while ((match = deliveryPattern.exec(content)) !== null) {
      const fromId = this.resolveAgentId(match[1].trim());
      const toId = this.resolveAgentId(match[2].trim());
      const deliverable = match[3].trim();
      if (fromId && toId) {
        relations.push({
          from: fromId,
          to: toId,
          relation: `交付${deliverable}`,
          type: 'data_flow',
          source_file: sourceFile,
        });
      }
    }

    // "Redteam -> 全链条" 横切关系
    const redteamAllMatch = content.match(
      /###?\s*Redteam\s*(?:→|->)\s*全链条/,
    );
    if (redteamAllMatch) {
      const redteamId = this.resolveAgentId('redteam');
      if (redteamId) {
        // 将在 merger 阶段处理为多条边
        relations.push({
          from: redteamId,
          to: '__all_main_chain__',
          relation: '节点挑战单 + 整链挑战报告',
          type: 'collaboration',
          source_file: sourceFile,
        });
      }
    }

    // 提取角色定义节点
    const roleSectionPattern = /##\s*\d+\.\s*(butterfly-invest[-\w]*)\s*\n([\s\S]*?)(?=##\s*\d+\.|##\s*[三四五六七八九十]|---\s*$|$)/g;
    while ((match = roleSectionPattern.exec(content)) !== null) {
      const agentId = match[1];
      const sectionContent = match[2];

      let role = '';
      const posMatch = sectionContent.match(/###?\s*定位\s*\n(.+)/);
      if (posMatch) {
        role = posMatch[1].trim();
      }

      const isCrosscut = /redteam/i.test(agentId);

      nodes.push({
        agent_id: agentId,
        name: agentId,
        role,
        is_crosscut: isCrosscut,
        outputs: [],
      });
    }

    // 提取业务链顺序
    // "1. Trigger\n2. Variable\n3. Industry\n4. Asset\n5. Redteam 横切挑战"
    const chainPattern = /^\d+\.\s*(Trigger|Variable|Industry|Asset|Redteam)/gm;
    const chainSteps: string[] = [];
    while ((match = chainPattern.exec(content)) !== null) {
      chainSteps.push(match[1].trim());
    }
    // 仅取非Redteam形成主链
    const mainChain = chainSteps.filter(s => s.toLowerCase() !== 'redteam');
    for (let i = 0; i < mainChain.length - 1; i++) {
      const fromId = this.resolveAgentId(mainChain[i]);
      const toId = this.resolveAgentId(mainChain[i + 1]);
      if (fromId && toId) {
        relations.push({
          from: fromId,
          to: toId,
          relation: '业务链',
          type: 'sequence',
          source_file: sourceFile,
        });
      }
    }

    return { nodes, relations };
  }

  // ================================================================
  // 从"五代理闭环"提取
  // ================================================================

  extractFromClosedLoop(
    content: string,
    sourceFile: string,
  ): ExtractedRelation[] {
    const relations: ExtractedRelation[] = [];

    // 提取串行主链
    // "源头触发 -> 关键传导变量 -> 产业传导 -> 资产映射"
    const chainMatch = content.match(
      /源头触发\s*(?:→|->)\s*关键传导变量\s*(?:→|->)\s*产业传导\s*(?:→|->)\s*资产映射/,
    );
    if (chainMatch) {
      const chain = ['源头触发', '关键传导变量', '产业传导', '资产映射'];
      for (let i = 0; i < chain.length - 1; i++) {
        const fromId = this.resolveAgentId(chain[i]);
        const toId = this.resolveAgentId(chain[i + 1]);
        if (fromId && toId) {
          relations.push({
            from: fromId,
            to: toId,
            relation: '串行主链',
            type: 'sequence',
            source_file: sourceFile,
          });
        }
      }
    }

    // "红队挑战代理在每一层产出后都可以介入"
    if (/红队.+每一层/.test(content)) {
      const redteamId = this.resolveAgentId('红队');
      const mainAgents = [
        this.resolveAgentId('源头触发'),
        this.resolveAgentId('关键传导变量'),
        this.resolveAgentId('产业传导'),
        this.resolveAgentId('资产映射'),
      ].filter(Boolean) as string[];

      if (redteamId) {
        for (const agentId of mainAgents) {
          relations.push({
            from: redteamId,
            to: agentId,
            relation: '随层挑战',
            type: 'collaboration',
            source_file: sourceFile,
          });
        }
      }
    }

    return relations;
  }

  // ================================================================
  // 从各 Agent 的工作定义 md 中提取
  // ================================================================

  extractFromWorkDefinitions(
    agentId: string,
    content: string,
    sourceFile: string,
  ): ExtractedRelation[] {
    const relations: ExtractedRelation[] = [];

    // "交付候选主题给 Variable"
    const deliverPattern = /交付(.+?)给\s*(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = deliverPattern.exec(content)) !== null) {
      const toId = this.resolveAgentId(match[2].trim());
      if (toId && toId !== agentId) {
        relations.push({
          from: agentId,
          to: toId,
          relation: `交付${match[1].trim()}`,
          type: 'data_flow',
          source_file: sourceFile,
        });
      }
    }

    // "接收 Trigger 的信号"
    const receivePattern = /接收\s*(\w+)\s*的(.+)/g;
    while ((match = receivePattern.exec(content)) !== null) {
      const fromId = this.resolveAgentId(match[1].trim());
      if (fromId && fromId !== agentId) {
        relations.push({
          from: fromId,
          to: agentId,
          relation: `传递${match[2].trim()}`,
          type: 'data_flow',
          source_file: sourceFile,
        });
      }
    }

    return relations;
  }

  // ================================================================
  // 别名映射
  // ================================================================

  /**
   * 构建角色名 -> agent_id 的映射表
   */
  buildAliasMap(agents: AgentRegistration[]): void {
    this.aliasMap.clear();

    for (const agent of agents) {
      const id = agent.agent_id;
      // 完整 ID 映射自身
      this.aliasMap.set(id.toLowerCase(), id);
      // 名称映射
      if (agent.name) {
        this.aliasMap.set(agent.name.toLowerCase(), id);
      }
    }

    // butterfly-invest 特定映射
    const investPrefix = 'butterfly-invest';
    const knownMappings: Record<string, string[]> = {
      [`${investPrefix}-trigger`]: [
        'trigger', '源头触发', '源头触发代理', '信号侦察',
      ],
      [`${investPrefix}-variable`]: [
        'variable', '关键传导变量', '关键传导变量代理', '变量',
      ],
      [`${investPrefix}-industry`]: [
        'industry', '产业传导', '产业传导代理', '产业',
      ],
      [`${investPrefix}-asset`]: [
        'asset', '资产映射', '资产映射代理', '资产',
      ],
      [`${investPrefix}-redteam`]: [
        'redteam', '红队', '红队挑战', '红队挑战代理', '横切',
      ],
      [investPrefix]: [
        'butterfly', '策略分析师', '总控', '总控编排', '总控编排代理', '编排', 'orchestrator',
      ],
    };

    for (const [agentId, aliases] of Object.entries(knownMappings)) {
      // 只注册存在的 agent
      const exists = agents.some(a => a.agent_id === agentId);
      if (exists) {
        for (const alias of aliases) {
          this.aliasMap.set(alias.toLowerCase(), agentId);
        }
      }
    }
  }

  /**
   * 将角色名/别名解析为 agent_id
   */
  resolveAgentId(name: string): string {
    if (!name) return '';
    const lower = name.toLowerCase().trim();

    // 直接匹配
    const direct = this.aliasMap.get(lower);
    if (direct) return direct;

    // 去掉"代理"后缀再试
    const withoutSuffix = lower.replace(/代理$/, '').trim();
    const withoutMatch = this.aliasMap.get(withoutSuffix);
    if (withoutMatch) return withoutMatch;

    // 模糊匹配：包含关系
    for (const [alias, id] of this.aliasMap.entries()) {
      if (lower.includes(alias) || alias.includes(lower)) {
        return id;
      }
    }

    return name;
  }

  // ================================================================
  // 内部工具
  // ================================================================

  private isOrchestrator(role: string): boolean {
    return /总控|编排|orchestrat/i.test(role);
  }

  /**
   * 将 ExtractedNode 列表转为 Partial<WorkflowNode>
   */
  private nodesToPartials(
    extracted: ExtractedNode[],
    agents: AgentRegistration[],
  ): Partial<WorkflowNode>[] {
    // 按 agent_id 去重
    const seen = new Map<string, ExtractedNode>();
    for (const node of extracted) {
      const id = this.resolveAgentId(node.agent_id);
      if (!id) continue;
      const existing = seen.get(id);
      if (!existing || node.role.length > (existing.role?.length ?? 0)) {
        seen.set(id, { ...node, agent_id: id });
      }
    }

    return Array.from(seen.values()).map(node => {
      const reg = agents.find(a => a.agent_id === node.agent_id);
      return {
        id: node.agent_id,
        type: 'agent' as const,
        position: { x: 0, y: 0 },
        data: {
          agent_id: node.agent_id,
          name: reg?.name ?? node.name,
          emoji: reg?.emoji ?? '',
          role: node.role,
          status: 'idle' as const,
          model: reg?.model ?? '',
          is_crosscut: node.is_crosscut,
          execution_stats: { today_total: 0, today_succeeded: 0, today_failed: 0 },
        },
      };
    });
  }

  /**
   * 将 ExtractedRelation 列表转为 Partial<WorkflowEdge>
   */
  private relationsToPartials(
    relations: ExtractedRelation[],
  ): Partial<WorkflowEdge>[] {
    // 去重：同 from->to 同 type 只保留一条
    const seen = new Map<string, ExtractedRelation>();
    for (const rel of relations) {
      const fromId = this.resolveAgentId(rel.from);
      const toId = this.resolveAgentId(rel.to);
      if (!fromId || !toId || fromId === toId) continue;
      // 跳过 __all_main_chain__ 占位符（由 merger 处理）
      if (toId === '__all_main_chain__') continue;

      const key = `${fromId}->${toId}:${rel.type}`;
      if (!seen.has(key)) {
        seen.set(key, { ...rel, from: fromId, to: toId });
      }
    }

    return Array.from(seen.values()).map(rel => ({
      id: `static-${rel.from}-${rel.to}-${rel.type}`,
      source: rel.from,
      target: rel.to,
      type: rel.type,
      data: {
        label: rel.relation,
        strength: 1,
        source_info: rel.source_file,
      },
    }));
  }
}

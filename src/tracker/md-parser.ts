import * as path from 'path';
import {
  AgentIdentity,
  AgentSoul,
  AgentWorkProtocol,
  AgentTools,
  UserProfile,
  HeartbeatConfig,
  ClawRegistration,
  AgentRegistration,
  ParsedFile,
  ParsedFileType,
} from './types';

/**
 * md 文件解析器：按类型解析不同 md 文件
 */
export class MdParser {
  /**
   * 解析 IDENTITY.md -> AgentIdentity
   * 格式: `- **Key:** Value` 或 `- **Key:** _(placeholder)_`
   */
  parseIdentity(content: string): AgentIdentity {
    const result: AgentIdentity = {
      name: '',
      creature: '',
      vibe: '',
      emoji: '',
    };

    const kvPattern = /^[-*]\s*\*\*(\w[\w\s]*?)[:：]\*\*[ \t]*(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = kvPattern.exec(content)) !== null) {
      const key = match[1].trim().toLowerCase();
      let value = match[2].trim();

      // 跳过占位符
      if (value.startsWith('_(') && value.endsWith(')_')) continue;
      if (value === '' || value === '_') continue;

      switch (key) {
        case 'name':
          result.name = value;
          break;
        case 'creature':
          result.creature = value;
          break;
        case 'vibe':
          result.vibe = value;
          break;
        case 'emoji':
          result.emoji = value;
          break;
        case 'avatar':
          result.avatar = value;
          break;
      }
    }

    return result;
  }

  /**
   * 解析 SOUL.md -> AgentSoul
   * 段落分割 + 关键词提取
   */
  parseSoul(content: string): AgentSoul {
    const principles: string[] = [];
    const boundaries = { can_do: [] as string[], must_ask: [] as string[], never_do: [] as string[] };
    let personality = '';

    // 提取加粗原则（**xxx**）
    const boldPattern = /\*\*(.+?)\*\*/g;
    let match: RegExpExecArray | null;
    while ((match = boldPattern.exec(content)) !== null) {
      const text = match[1].trim();
      // 排除短标题
      if (text.length > 10 && !text.includes('#')) {
        principles.push(text);
      }
    }

    // 提取边界列表
    const sections = this.splitSections(content);
    for (const section of sections) {
      const headerLower = section.header.toLowerCase();
      if (headerLower.includes('boundar') || headerLower.includes('red line')) {
        const items = this.extractListItems(section.content);
        for (const item of items) {
          const lower = item.toLowerCase();
          if (lower.includes('never') || lower.includes("don't") || lower.includes('period')) {
            boundaries.never_do.push(item);
          } else if (lower.includes('ask') || lower.includes('doubt')) {
            boundaries.must_ask.push(item);
          } else {
            boundaries.can_do.push(item);
          }
        }
      }
      if (headerLower.includes('vibe') || headerLower.includes('personality')) {
        personality = section.content.trim();
      }
    }

    return {
      principles,
      boundaries,
      personality,
      raw_content: content,
    };
  }

  /**
   * 解析 AGENTS.md -> AgentWorkProtocol
   * 步骤序列 + 表格解析
   */
  parseAgentsProtocol(content: string): AgentWorkProtocol {
    const result: AgentWorkProtocol = {
      boot_sequence: [],
      permission_zones: {
        internal_safe: [],
        external_sensitive: [],
        group_rules: [],
      },
      memory_config: {
        daily_log: '',
        long_term: '',
        heartbeat_state: '',
      },
      scheduling: {
        heartbeat_purpose: '',
        cron_purpose: '',
      },
    };

    const sections = this.splitSections(content);

    for (const section of sections) {
      const headerLower = section.header.toLowerCase();

      // 启动序列
      if (headerLower.includes('startup') || headerLower.includes('first run') || headerLower.includes('session')) {
        const numberedSteps = section.content.match(/^\d+\.\s+(.+)$/gm);
        if (numberedSteps) {
          result.boot_sequence = numberedSteps.map(s => s.replace(/^\d+\.\s+/, '').trim());
        }
      }

      // 内存配置
      if (headerLower.includes('memory') || headerLower.includes('记忆')) {
        const items = this.extractListItems(section.content);
        for (const item of items) {
          const lower = item.toLowerCase();
          if (lower.includes('daily') || lower.includes('yyyy-mm-dd')) {
            result.memory_config.daily_log = item;
          } else if (lower.includes('long-term') || lower.includes('memory.md')) {
            result.memory_config.long_term = item;
          } else if (lower.includes('heartbeat')) {
            result.memory_config.heartbeat_state = item;
          }
        }
      }

      // 红线/权限区域
      if (headerLower.includes('red line') || headerLower.includes('permission')) {
        const items = this.extractListItems(section.content);
        for (const item of items) {
          const lower = item.toLowerCase();
          if (lower.includes('external') || lower.includes('email') || lower.includes('public')) {
            result.permission_zones.external_sensitive.push(item);
          } else if (lower.includes('group') || lower.includes('chat')) {
            result.permission_zones.group_rules.push(item);
          } else {
            result.permission_zones.internal_safe.push(item);
          }
        }
      }
    }

    return result;
  }

  /**
   * 解析 TOOLS.md -> AgentTools
   * 标题分段 + KV 列表
   */
  parseTools(content: string): AgentTools {
    const configurations: { category: string; items: Record<string, string>[] }[] = [];
    const sections = this.splitSections(content);

    for (const section of sections) {
      if (section.header === '' || section.header.toLowerCase().includes('what goes here')) continue;

      const items: Record<string, string>[] = [];
      // 尝试解析 key → value 格式
      const kvPattern = /^[-*]\s*(\S+)\s*[→→:]\s*(.+)$/gm;
      let match: RegExpExecArray | null;
      while ((match = kvPattern.exec(section.content)) !== null) {
        items.push({ [match[1].trim()]: match[2].trim() });
      }

      if (items.length > 0 || section.content.trim().length > 0) {
        configurations.push({
          category: section.header,
          items: items.length > 0 ? items : [{ content: section.content.trim() }],
        });
      }
    }

    return { configurations, raw_content: content };
  }

  /**
   * 解析 USER.md -> UserProfile
   * 正则 KV
   */
  parseUser(content: string): UserProfile {
    const result: UserProfile = {
      name: '',
      call_them: '',
      pronouns: '',
      timezone: '',
      notes: '',
      context: '',
    };

    const kvPattern = /^[-*]\s*\*\*(.+?)[:：]\*\*[ \t]*(.*)$/gm;
    let match: RegExpExecArray | null;
    while ((match = kvPattern.exec(content)) !== null) {
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      if (!value || value.startsWith('_(')) continue;

      if (key === 'name') result.name = value;
      else if (key.includes('call')) result.call_them = value;
      else if (key.includes('pronoun')) result.pronouns = value;
      else if (key.includes('timezone') || key.includes('time')) result.timezone = value;
      else if (key.includes('note')) result.notes = value;
    }

    // 提取 Context 段落
    const contextMatch = content.match(/##\s*Context\s*\n([\s\S]*?)(?=\n---|\n##|$)/i);
    if (contextMatch) {
      result.context = contextMatch[1].trim();
    }

    return result;
  }

  /**
   * 解析 HEARTBEAT.md -> HeartbeatConfig
   * 列表项提取
   */
  parseHeartbeat(content: string): HeartbeatConfig {
    const tasks: { description: string; frequency?: string }[] = [];

    // 提取列表项
    const items = this.extractListItems(content);
    for (const item of items) {
      // 跳过注释
      if (item.startsWith('#') || item.startsWith('//')) continue;
      // 尝试提取频率
      const freqMatch = item.match(/\((.+?)\)/);
      tasks.push({
        description: item.replace(/\(.+?\)/, '').trim(),
        frequency: freqMatch ? freqMatch[1] : undefined,
      });
    }

    const isEmptyContent = content.replace(/^#.*$/gm, '').replace(/```[\s\S]*?```/g, '').trim();
    const is_empty = tasks.length === 0 && isEmptyContent.length < 20;

    return { tasks, is_empty };
  }

  /**
   * 解析 openclaw.json -> ClawRegistration
   */
  parseConfig(content: string): ClawRegistration {
    const config = JSON.parse(content);

    const agents: AgentRegistration[] = [];
    const agentList = config.agents?.list ?? [];
    const defaultModel = config.agents?.defaults?.model?.primary ?? '';

    for (const agent of agentList) {
      agents.push({
        agent_id: agent.id ?? '',
        name: agent.name ?? agent.id ?? '',
        emoji: agent.identity?.emoji ?? '',
        theme: agent.identity?.theme ?? '',
        model: agent.model ?? defaultModel,
        workspace_path: agent.workspace ?? '',
      });
    }

    return {
      claw_id: '', // 需要从 device.json 中获取
      gateway_port: config.gateway?.port ?? 0,
      model_default: defaultModel,
      model_fallbacks: config.agents?.defaults?.model?.fallbacks ?? [],
      agents,
      channels: Object.keys(config.channels ?? {}),
    };
  }

  /**
   * 自动检测文件类型并解析
   */
  autoDetectAndParse(filePath: string, content: string): ParsedFile {
    const fileName = path.basename(filePath);
    const fileNameUpper = fileName.toUpperCase();

    let type: ParsedFileType = 'unknown';
    let data: unknown = null;

    try {
      if (fileName === 'openclaw.json') {
        type = 'config';
        data = this.parseConfig(content);
      } else if (fileNameUpper === 'IDENTITY.MD') {
        type = 'identity';
        data = this.parseIdentity(content);
      } else if (fileNameUpper === 'SOUL.MD') {
        type = 'soul';
        data = this.parseSoul(content);
      } else if (fileNameUpper === 'AGENTS.MD') {
        type = 'agents_protocol';
        data = this.parseAgentsProtocol(content);
      } else if (fileNameUpper === 'TOOLS.MD') {
        type = 'tools';
        data = this.parseTools(content);
      } else if (fileNameUpper === 'USER.MD') {
        type = 'user';
        data = this.parseUser(content);
      } else if (fileNameUpper === 'HEARTBEAT.MD') {
        type = 'heartbeat';
        data = this.parseHeartbeat(content);
      } else if (fileName.includes('职责划分')) {
        type = 'agent_network';
        data = this.parseAgentNetworkBasic(content);
      } else if (fileName.includes('系统总览')) {
        type = 'system_overview';
        data = this.parseSystemOverviewBasic(content);
      } else if (fileName.includes('数据模型') || fileName.includes('schema')) {
        type = 'business_schema';
        data = this.parseBusinessSchemaBasic(content);
      } else if (fileName.includes('状态机')) {
        type = 'state_machine';
        data = this.parseStateMachineBasic(content);
      } else if (fileName.includes('工作定义')) {
        type = 'work_definition';
        data = this.parseWorkDefinitionBasic(content, filePath);
      } else if (fileName.toLowerCase().includes('redteam') || fileName.includes('治理')) {
        type = 'redteam_governance';
        data = this.parseRedteamGovernanceBasic(content);
      }
    } catch {
      // 解析失败，返回 unknown
      type = 'unknown';
      data = null;
    }

    return { type, data, file_path: filePath, raw_content: content };
  }

  // ---- 半结构化文件的基础解析 ----

  private parseAgentNetworkBasic(content: string): Partial<import('./types').AgentNetwork> {
    const sections = this.splitSections(content);
    const edges: { from: string; to: string; relation: string }[] = [];

    // 提取箭头关系 (A → B, A -> B)
    const arrowPattern = /(\S+)\s*(?:→|->)+\s*(\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = arrowPattern.exec(content)) !== null) {
      edges.push({ from: match[1], to: match[2], relation: 'flow' });
    }

    // 提取表格
    const tables = this.extractTables(content);

    return {
      agents: [],
      workflow_chain: [],
      edges,
    };
  }

  private parseSystemOverviewBasic(content: string): Partial<import('./types').SystemOverview> {
    const tables = this.extractTables(content);
    return {
      architecture: { orchestrator: '', agents: [] },
      cadence: [],
      business_chain: '',
      growth_chain: '',
      redteam_severity: [],
    };
  }

  private parseBusinessSchemaBasic(content: string): Partial<import('./types').BusinessSchema> {
    const tables = this.extractTables(content);
    return {
      objects: [],
      object_chain: [],
      crosscut_objects: [],
    };
  }

  private parseStateMachineBasic(content: string): Partial<import('./types').StateMachine> {
    return {
      entity: '',
      states: [],
      transitions: [],
      terminal_states: [],
    };
  }

  private parseWorkDefinitionBasic(content: string, filePath: string): Partial<import('./types').AgentWorkDefinition> {
    // 从文件路径提取 agent_id
    const agentMatch = filePath.match(/agents\/([^/]+)\//);
    const agentId = agentMatch ? agentMatch[1] : '';

    const sections = this.splitSections(content);
    const coreDuties: string[] = [];
    const hardBoundaries: string[] = [];

    for (const section of sections) {
      const headerLower = section.header.toLowerCase();
      if (headerLower.includes('职责') || headerLower.includes('duty') || headerLower.includes('core')) {
        coreDuties.push(...this.extractListItems(section.content));
      }
      if (headerLower.includes('边界') || headerLower.includes('boundary') || headerLower.includes('红线')) {
        hardBoundaries.push(...this.extractListItems(section.content));
      }
    }

    return {
      agent_id: agentId,
      core_duties: coreDuties,
      sources: [],
      admission_criteria: [],
      output_objects: [],
      scoring: [],
      cadence: [],
      hard_boundaries: hardBoundaries,
    };
  }

  private parseRedteamGovernanceBasic(content: string): Partial<import('./types').RedteamGovernance> {
    return {
      first_principle: '',
      authority: { has: '', not_has: '' },
      severity_levels: [],
      engagement_modes: [],
    };
  }

  // ---- 工具方法 ----

  /**
   * 按标题分段
   */
  private splitSections(content: string): { header: string; content: string }[] {
    const sections: { header: string; content: string }[] = [];
    const lines = content.split('\n');
    let currentHeader = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (headerMatch) {
        if (currentHeader || currentContent.length > 0) {
          sections.push({ header: currentHeader, content: currentContent.join('\n') });
        }
        currentHeader = headerMatch[1].trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    if (currentHeader || currentContent.length > 0) {
      sections.push({ header: currentHeader, content: currentContent.join('\n') });
    }

    return sections;
  }

  /**
   * 提取列表项
   */
  private extractListItems(content: string): string[] {
    const items: string[] = [];
    const listPattern = /^[-*]\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = listPattern.exec(content)) !== null) {
      const item = match[1].trim();
      if (item) items.push(item);
    }
    return items;
  }

  /**
   * 提取 markdown 表格
   */
  private extractTables(content: string): { headers: string[]; rows: string[][] }[] {
    const tables: { headers: string[]; rows: string[][] }[] = [];
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      // 检测表格头行（包含 |）
      if (line.startsWith('|') && line.endsWith('|')) {
        const headers = line.split('|').filter(c => c.trim()).map(c => c.trim());
        // 下一行应该是分割线
        if (i + 1 < lines.length && lines[i + 1].trim().match(/^\|[-:\s|]+\|$/)) {
          const rows: string[][] = [];
          i += 2;
          while (i < lines.length) {
            const rowLine = lines[i].trim();
            if (!rowLine.startsWith('|') || !rowLine.endsWith('|')) break;
            rows.push(rowLine.split('|').filter(c => c.trim()).map(c => c.trim()));
            i++;
          }
          tables.push({ headers, rows });
          continue;
        }
      }
      i++;
    }

    return tables;
  }
}

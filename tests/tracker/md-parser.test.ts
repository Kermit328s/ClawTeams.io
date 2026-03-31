import * as fs from 'fs';
import * as path from 'path';
import { MdParser } from '../../src/tracker/md-parser';

describe('MdParser', () => {
  const parser = new MdParser();

  describe('parseIdentity', () => {
    it('应从实际格式的 IDENTITY.md 解析出身份信息', () => {
      const content = `# IDENTITY.md - Who Am I?

- **Name:** Butterfly
- **Creature:** strategy analyst familiar
- **Vibe:** sharp, skeptical, probability-first
- **Emoji:** 🦋
- **Avatar:**

Specialized for the butterfly-effect high-leverage investment strategy tool.`;

      const result = parser.parseIdentity(content);
      expect(result.name).toBe('Butterfly');
      expect(result.creature).toBe('strategy analyst familiar');
      expect(result.vibe).toBe('sharp, skeptical, probability-first');
      expect(result.emoji).toBe('🦋');
    });

    it('应跳过占位符值', () => {
      const content = `# IDENTITY.md

- **Name:**
  _(pick something you like)_
- **Creature:**
  _(AI? robot? familiar?)_
- **Emoji:**
  _(your signature)_`;

      const result = parser.parseIdentity(content);
      expect(result.name).toBe('');
      expect(result.creature).toBe('');
    });

    it('应处理空文件', () => {
      const result = parser.parseIdentity('');
      expect(result.name).toBe('');
      expect(result.emoji).toBe('');
    });
  });

  describe('parseSoul', () => {
    it('应从 SOUL.md 解析出原则和边界', () => {
      const content = `# SOUL.md - Who You Are

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the filler.

**Have opinions.** You're allowed to disagree.

**Be resourceful before asking.** Try to figure it out.

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Never send half-baked replies to messaging surfaces.

## Vibe

Be the assistant you'd actually want to talk to.`;

      const result = parser.parseSoul(content);
      expect(result.principles.length).toBeGreaterThan(0);
      expect(result.principles[0]).toContain('genuinely helpful');
      expect(result.boundaries.never_do.length).toBeGreaterThan(0);
      expect(result.boundaries.must_ask.length).toBeGreaterThan(0);
      expect(result.personality).toContain('assistant');
      expect(result.raw_content).toBe(content);
    });
  });

  describe('parseAgentsProtocol', () => {
    it('应从 AGENTS.md 解析出启动序列', () => {
      const content = `# AGENTS.md

## Session Startup

Before doing anything else:

1. Read SOUL.md — this is who you are
2. Read USER.md — this is who you're helping
3. Read memory/YYYY-MM-DD.md for recent context

## Memory

- **Daily notes:** memory/YYYY-MM-DD.md — raw logs
- **Long-term:** MEMORY.md — curated memories

## Red Lines

- Don't exfiltrate private data. Ever.`;

      const result = parser.parseAgentsProtocol(content);
      expect(result.boot_sequence.length).toBeGreaterThanOrEqual(3);
      expect(result.boot_sequence[0]).toContain('SOUL.md');
    });
  });

  describe('parseTools', () => {
    it('应从 TOOLS.md 解析出配置段落', () => {
      const content = `# TOOLS.md - Local Notes

## What Goes Here

Things like camera names, SSH hosts, etc.

## Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

## SSH

- home-server → 192.168.1.100, user: admin`;

      const result = parser.parseTools(content);
      expect(result.raw_content).toBe(content);
      expect(result.configurations.length).toBeGreaterThan(0);
    });
  });

  describe('parseUser', () => {
    it('应从 USER.md 解析出用户信息', () => {
      const content = `# USER.md - About Your Human

- **Name:** Kermit
- **What to call them:** Kermit
- **Pronouns:** he/him
- **Timezone:** PST
- **Notes:** Loves investing

## Context

Working on butterfly-effect investment strategy.`;

      const result = parser.parseUser(content);
      expect(result.name).toBe('Kermit');
      expect(result.call_them).toBe('Kermit');
      expect(result.pronouns).toBe('he/him');
      expect(result.timezone).toBe('PST');
      expect(result.context).toContain('butterfly-effect');
    });

    it('应处理空占位符', () => {
      const content = `# USER.md

- **Name:**
- **What to call them:**
- **Pronouns:** _(optional)_
- **Timezone:**
- **Notes:**

## Context

_(context goes here)_`;

      const result = parser.parseUser(content);
      expect(result.name).toBe('');
    });
  });

  describe('parseHeartbeat', () => {
    it('应检测空心跳文件', () => {
      const content = `# HEARTBEAT.md Template

\`\`\`markdown
# Keep this file empty (or with only comments) to skip heartbeat API calls.
\`\`\``;

      const result = parser.parseHeartbeat(content);
      expect(result.is_empty).toBe(true);
      expect(result.tasks.length).toBe(0);
    });

    it('应解析有任务的心跳文件', () => {
      const content = `# HEARTBEAT.md

- Check portfolio performance (every 4 hours)
- Scan for new market signals (daily)
- Review risk exposure`;

      const result = parser.parseHeartbeat(content);
      expect(result.is_empty).toBe(false);
      expect(result.tasks.length).toBe(3);
      expect(result.tasks[0].description).toContain('portfolio');
      expect(result.tasks[0].frequency).toBe('every 4 hours');
    });
  });

  describe('parseConfig', () => {
    it('应从 openclaw.json 解析出注册信息', () => {
      const content = JSON.stringify({
        agents: {
          defaults: {
            model: {
              primary: 'openai/gpt-5.4',
              fallbacks: ['claude-cli/claude-sonnet-4-6'],
            },
          },
          list: [
            {
              id: 'butterfly-invest',
              name: 'butterfly-invest',
              workspace: '/home/user/.openclaw/workspace/agents/butterfly-invest',
              model: 'openai/gpt-5.4',
              identity: { name: 'Butterfly', theme: 'strategy analyst familiar', emoji: '🦋' },
            },
            {
              id: 'butterfly-invest-trigger',
              name: 'butterfly-invest-trigger',
              workspace: '/home/user/.openclaw/workspace/agents/butterfly-invest-trigger',
              identity: { name: 'Trigger', theme: 'signal scout', emoji: '⚡' },
            },
          ],
        },
        gateway: { port: 18789 },
        channels: { whatsapp: { enabled: true } },
      });

      const result = parser.parseConfig(content);
      expect(result.gateway_port).toBe(18789);
      expect(result.model_default).toBe('openai/gpt-5.4');
      expect(result.agents.length).toBe(2);
      expect(result.agents[0].agent_id).toBe('butterfly-invest');
      expect(result.agents[0].emoji).toBe('🦋');
      expect(result.agents[1].agent_id).toBe('butterfly-invest-trigger');
      expect(result.channels).toContain('whatsapp');
    });
  });

  describe('autoDetectAndParse', () => {
    it('应自动检测 IDENTITY.md', () => {
      const content = '- **Name:** Test\n- **Emoji:** 🤖';
      const result = parser.autoDetectAndParse('/workspace/IDENTITY.md', content);
      expect(result.type).toBe('identity');
    });

    it('应自动检测 openclaw.json', () => {
      const content = '{"agents":{"list":[]},"gateway":{"port":8080}}';
      const result = parser.autoDetectAndParse('/path/openclaw.json', content);
      expect(result.type).toBe('config');
    });

    it('应将工作定义文件检测为 work_definition', () => {
      const content = '# 工作定义\n- 分析市场信号';
      const result = parser.autoDetectAndParse(
        '/workspace/agents/trigger/butterfly-invest-trigger_工作定义_v1.md',
        content
      );
      expect(result.type).toBe('work_definition');
    });

    it('应将未知文件标记为 unknown', () => {
      const result = parser.autoDetectAndParse('/some/random/file.md', '# Random');
      expect(result.type).toBe('unknown');
    });
  });

  describe('against real files', () => {
    const realDir = path.join(process.env.HOME ?? '', '.openclaw');
    const hasRealDir = fs.existsSync(realDir);

    (hasRealDir ? it : it.skip)('应能解析真实的 IDENTITY.md', () => {
      const filePath = path.join(realDir, 'workspace', 'agents', 'butterfly-invest', 'IDENTITY.md');
      if (!fs.existsSync(filePath)) return;

      const content = fs.readFileSync(filePath, 'utf-8');
      const result = parser.parseIdentity(content);

      console.log('解析结果:', result);
      expect(result.name).toBe('Butterfly');
      expect(result.emoji).toBe('🦋');
    });

    (hasRealDir ? it : it.skip)('应能解析真实的 openclaw.json', () => {
      const filePath = path.join(realDir, 'openclaw.json');
      if (!fs.existsSync(filePath)) return;

      const content = fs.readFileSync(filePath, 'utf-8');
      const result = parser.parseConfig(content);

      console.log('Agent 数量:', result.agents.length);
      console.log(
        'Agents:',
        result.agents.map(a => `${a.emoji} ${a.agent_id}`)
      );
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.gateway_port).toBe(18789);
    });
  });
});

// ============================================================
// DetailPanel -- 右侧详情面板（折叠式）
// ============================================================

import React, { useState, useEffect } from 'react';
import { useClawStore } from '../../store';
import { api } from '../../api/client';
import { StatusDot } from '../shared/StatusDot';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ct-bg-tertiary/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-3 py-2 text-xs text-ct-text-secondary hover:text-ct-text-primary transition-colors"
      >
        <span className="text-[10px]">{open ? '\u25BE' : '\u25B8'}</span>
        <span>{title}</span>
      </button>
      {open && <div className="px-3 pb-2 text-[11px] text-ct-text-secondary">{children}</div>}
    </div>
  );
};

export const DetailPanel: React.FC = () => {
  const detailTarget = useClawStore((s) => s.detailTarget);
  const setDetailTarget = useClawStore((s) => s.setDetailTarget);
  const getAgent = useClawStore((s) => s.getAgent);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!detailTarget || detailTarget.type !== 'agent') {
      setProfile(null);
      return;
    }

    setLoading(true);
    api
      .getAgentProfile(detailTarget.id)
      .then((data) => setProfile(data as Record<string, unknown>))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [detailTarget]);

  if (!detailTarget) return null;

  const agent = detailTarget.type === 'agent' ? getAgent(detailTarget.id) : null;

  return (
    <div className="w-[350px] bg-ct-bg-secondary border-l border-ct-bg-tertiary flex flex-col overflow-y-auto detail-panel-enter shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-ct-bg-tertiary">
        <div className="flex-1 min-w-0">
          {agent && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-lg">{agent.emoji}</span>
                <span className="text-sm font-medium text-ct-text-primary">{agent.name}</span>
                {agent.role && (
                  <span className="text-xs text-ct-text-secondary">{agent.role}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusDot status={agent.status} size="sm" />
                <span className="text-xs text-ct-text-secondary">
                  {agent.status === 'running' ? '\u6267\u884C\u4E2D' : agent.status === 'failed' ? '\u5931\u8D25' : '\u7A7A\u95F2'}
                </span>
                <span className="text-xs text-ct-text-secondary">\u00B7 {agent.model}</span>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setDetailTarget(null)}
          className="text-ct-text-secondary hover:text-ct-text-primary text-sm p-1"
        >
          \u2715
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="p-4 text-xs text-ct-text-secondary text-center">\u52A0\u8F7D\u4E2D...</div>
      )}

      {/* Sections */}
      {profile && (
        <div className="flex-1">
          {/* Identity */}
          <Section title="\u8EAB\u4EFD\u5B9A\u4E49">
            {renderKV(profile, 'identity', ['name', 'creature', 'vibe', 'emoji'])}
          </Section>

          {/* Soul / Boundaries */}
          <Section title="\u884C\u4E3A\u8FB9\u754C (SOUL)">
            {renderSoul(profile)}
          </Section>

          {/* Tools */}
          <Section title="\u5DE5\u5177\u914D\u7F6E">
            {renderTools(profile)}
          </Section>

          {/* Collaborations -- default open */}
          <Section title="\u534F\u4F5C\u5173\u7CFB" defaultOpen>
            {renderRelations(profile)}
          </Section>

          {/* Core file versions */}
          <Section title="\u6838\u5FC3\u6587\u4EF6\u7248\u672C">
            {renderCoreFiles(profile)}
          </Section>

          {/* Today's executions -- default open */}
          <Section title="\u4ECA\u65E5\u6267\u884C" defaultOpen>
            {renderExecutions(profile)}
          </Section>

          {/* Artifacts */}
          <Section title="\u4EA7\u51FA\u6863\u6848">
            {renderArtifacts(profile)}
          </Section>

          {/* Cadence */}
          <Section title="\u8FD0\u884C\u8282\u62CD">
            {renderCadence(profile)}
          </Section>
        </div>
      )}
    </div>
  );
};

// ---- Render helpers ----

function renderKV(profile: Record<string, unknown>, key: string, fields: string[]): React.ReactNode {
  const data = (profile[key] || profile) as Record<string, unknown>;
  return (
    <div className="space-y-1">
      {fields.map((f) => {
        const val = data[f];
        if (!val) return null;
        return (
          <div key={f} className="flex gap-2">
            <span className="text-ct-text-secondary shrink-0 w-12">{f}</span>
            <span className="text-ct-text-primary">{String(val as string)}</span>
          </div>
        );
      })}
    </div>
  );
}

function renderSoul(profile: Record<string, unknown>): React.ReactNode {
  const soul = profile.soul as Record<string, unknown> | undefined;
  if (!soul) return <span>\u65E0\u6570\u636E</span>;

  const boundaries = soul.boundaries as Record<string, string[]> | undefined;
  return (
    <div className="space-y-1">
      {typeof soul.personality === 'string' && <div className="text-ct-text-primary">{soul.personality}</div>}
      {boundaries?.can_do && (
        <div>
          <span className="text-ct-success">\u2713</span>{' '}
          {boundaries.can_do.slice(0, 3).join('\u3001')}
        </div>
      )}
      {boundaries?.never_do && (
        <div>
          <span className="text-ct-failed">\u2717</span>{' '}
          {boundaries.never_do.slice(0, 3).join('\u3001')}
        </div>
      )}
    </div>
  );
}

function renderTools(profile: Record<string, unknown>): React.ReactNode {
  const tools = profile.tools as { configurations?: { category: string; items: unknown[] }[] } | undefined;
  if (!tools?.configurations) return <span>\u65E0\u6570\u636E</span>;

  return (
    <div className="space-y-1">
      {tools.configurations.map((cat, i) => (
        <div key={i}>
          <span className="text-ct-text-primary">{cat.category}</span>
          <span className="text-ct-text-secondary ml-1">({cat.items?.length || 0})</span>
        </div>
      ))}
    </div>
  );
}

function renderRelations(profile: Record<string, unknown>): React.ReactNode {
  const relations = profile.relations as { target_agent_id: string; relation_type: string; target_emoji?: string; target_name?: string }[] | undefined;
  if (!relations?.length) return <span>\u65E0\u534F\u4F5C\u5173\u7CFB</span>;

  return (
    <div className="space-y-1">
      {relations.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <span>{r.relation_type === 'subagent' ? '\u2192' : '\u2194'}</span>
          <span>{r.target_emoji || ''}</span>
          <span className="text-ct-text-primary">{r.target_name || r.target_agent_id}</span>
          <span className="text-ct-text-secondary">: {r.relation_type}</span>
        </div>
      ))}
    </div>
  );
}

function renderCoreFiles(profile: Record<string, unknown>): React.ReactNode {
  const files = profile.core_files as { file_type: string; version_count: number; last_changed_at: string }[] | undefined;
  if (!files?.length) return <span>\u65E0\u6570\u636E</span>;

  return (
    <div className="space-y-1">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-ct-text-primary uppercase">{f.file_type}</span>
          <span className="text-ct-text-secondary">v{f.version_count}</span>
        </div>
      ))}
    </div>
  );
}

function renderExecutions(profile: Record<string, unknown>): React.ReactNode {
  const execs = profile.recent_executions as {
    status: string;
    started_at: string;
    input_preview: string;
    duration_ms?: number;
    token_total?: number;
  }[] | undefined;
  if (!execs?.length) return <span>\u4ECA\u65E5\u65E0\u6267\u884C</span>;

  return (
    <div className="space-y-1">
      {execs.slice(0, 8).map((e, i) => (
        <div key={i} className="flex items-center gap-1">
          <StatusDot status={e.status} size="sm" />
          <span className="text-ct-text-secondary shrink-0">
            {formatTime(e.started_at)}
          </span>
          <span className="text-ct-text-primary truncate flex-1">
            {e.input_preview?.slice(0, 20) || '\u4EFB\u52A1'}
          </span>
          {e.duration_ms && (
            <span className="text-ct-text-secondary shrink-0">
              {Math.round(e.duration_ms / 1000)}s
            </span>
          )}
          {e.token_total && (
            <span className="text-ct-text-secondary shrink-0">
              {e.token_total > 1000 ? `${(e.token_total / 1000).toFixed(1)}K` : e.token_total}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function renderArtifacts(profile: Record<string, unknown>): React.ReactNode {
  const arts = profile.artifacts as { file_path: string; type: string; created_at: string }[] | undefined;
  if (!arts?.length) return <span>\u65E0\u4EA7\u51FA</span>;

  const typeEmoji: Record<string, string> = {
    document: '\uD83D\uDCC4',
    code: '\uD83D\uDCBB',
    data: '\uD83D\uDCCA',
    media: '\uD83C\uDFA8',
    config: '\u2699\uFE0F',
  };

  return (
    <div className="space-y-1">
      {arts.slice(0, 6).map((a, i) => (
        <div key={i} className="flex items-center gap-1">
          <span>{typeEmoji[a.type] || '\uD83D\uDCC4'}</span>
          <span className="text-ct-text-primary truncate flex-1">{a.file_path.split('/').pop()}</span>
          <span className="text-ct-text-secondary">{formatTime(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function renderCadence(profile: Record<string, unknown>): React.ReactNode {
  const cadence = profile.cadence as { frequency: string; work: string; goal: string }[] | undefined;
  if (!cadence?.length) return <span>\u65E0\u8282\u62CD\u6570\u636E</span>;

  return (
    <div className="space-y-1">
      {cadence.map((c, i) => (
        <div key={i}>
          <span className="text-ct-running">{c.frequency}</span>
          <span className="text-ct-text-secondary ml-1">{c.work}</span>
        </div>
      ))}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

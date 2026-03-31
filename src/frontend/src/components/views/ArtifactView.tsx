// ============================================================
// ArtifactView -- 档案列表视图
// ============================================================

import React, { useEffect, useState } from 'react';
import { useClawStore } from '../../store';
import { api } from '../../api/client';
import { Tooltip } from '../shared/Tooltip';
import type { Artifact } from '../../types';

const TYPE_EMOJI: Record<string, string> = {
  document: '\uD83D\uDCC4',
  code: '\uD83D\uDCBB',
  data: '\uD83D\uDCCA',
  media: '\uD83C\uDFA8',
  config: '\u2699\uFE0F',
};

export const ArtifactView: React.FC = () => {
  const workspaceId = useClawStore((s) => s.workspaceId);
  const getAgent = useClawStore((s) => s.getAgent);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    api
      .getArtifacts(workspaceId, { limit: '50' })
      .then((data) => setArtifacts(data as Artifact[]))
      .catch(() => {});
  }, [workspaceId]);

  return (
    <div className="w-full h-full overflow-y-auto p-4">
      {artifacts.length === 0 ? (
        <div className="text-xs text-ct-text-secondary text-center py-12">
          \u6682\u65E0\u6863\u6848
        </div>
      ) : (
        <div className="space-y-0.5">
          {artifacts.map((art) => {
            const agent = getAgent(art.agent_id);
            const fileName = art.file_path.split('/').pop() || art.file_path;

            return (
              <Tooltip
                key={art.id}
                delay={200}
                position="bottom"
                content={
                  <div className="max-w-[240px] space-y-1">
                    <div className="text-ct-text-primary font-medium">{fileName}</div>
                    <div className="text-ct-text-secondary">
                      {art.type} \u00B7 v{art.version}
                      {art.file_size > 0 && ` \u00B7 ${formatSize(art.file_size)}`}
                    </div>
                    {art.tags && art.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {art.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="px-1 py-0.5 rounded bg-ct-bg-secondary text-[9px] text-ct-text-secondary"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {art.execution_id && (
                      <div className="text-[9px] text-ct-text-secondary">
                        \u6765\u6E90: {art.execution_id}
                      </div>
                    )}
                  </div>
                }
              >
                <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-ct-bg-tertiary/30 cursor-default transition-colors">
                  {/* Type icon */}
                  <span className="text-sm shrink-0">
                    {TYPE_EMOJI[art.type] || '\uD83D\uDCC4'}
                  </span>

                  {/* File name */}
                  <span className="text-xs text-ct-text-primary truncate flex-1">
                    {fileName}
                  </span>

                  {/* Agent emoji */}
                  <span className="text-sm shrink-0">{agent?.emoji || ''}</span>

                  {/* Time */}
                  <span className="text-[10px] text-ct-text-secondary shrink-0">
                    {formatTime(art.created_at)}
                  </span>
                </div>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

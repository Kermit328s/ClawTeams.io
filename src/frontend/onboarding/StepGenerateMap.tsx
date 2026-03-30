import React, { useEffect, useState } from 'react';
import { useOnboardingStore, useMapStore } from '@/store';
import type { MapNodeType, MapLayer, MapEdgeType } from '@/types';

/**
 * Step 2: AI generates the first version of the intent map.
 * Simulates AI-powered decomposition with loading animation.
 */
export const StepGenerateMap: React.FC = () => {
  const { vision, nextStep, setGeneratingMap, setPendingNodes } =
    useOnboardingStore();
  const { loadGraph, setGenerating } = useMapStore();
  const [phase, setPhase] = useState<'analyzing' | 'structuring' | 'rendering' | 'done'>('analyzing');

  useEffect(() => {
    setGeneratingMap(true);
    setGenerating(true);

    // Simulate AI generation phases
    const t1 = setTimeout(() => setPhase('structuring'), 1200);
    const t2 = setTimeout(() => setPhase('rendering'), 2400);
    const t3 = setTimeout(() => {
      setPhase('done');

      // Generate a mock graph based on the vision text
      const generated = generateMockGraph(vision.rawText);
      loadGraph(generated.nodes, generated.edges);
      setPendingNodes(generated.nodes.map((n) => n.id));

      setGeneratingMap(false);
      setGenerating(false);
    }, 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const phases = [
    { key: 'analyzing', label: '分析愿景文本...', icon: '1' },
    { key: 'structuring', label: '推导战略目标...', icon: '2' },
    { key: 'rendering', label: '生成任务分解...', icon: '3' },
    { key: 'done', label: '地图生成完成', icon: '4' },
  ];

  const currentIdx = phases.findIndex((p) => p.key === phase);

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div>
        <h2 className="text-xl font-semibold text-claw-text">
          AI 正在生成你的意图地图
        </h2>
        <p className="text-sm text-claw-muted mt-2">
          根据你的愿景描述，自动推导目标、分解任务、建立依赖关系
        </p>
      </div>

      {/* Progress phases */}
      <div className="space-y-3">
        {phases.map((p, i) => (
          <div
            key={p.key}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-500 ${
              i < currentIdx
                ? 'bg-claw-success/5 border-claw-success/30'
                : i === currentIdx
                  ? 'bg-claw-primary/5 border-claw-primary/30 animate-pulse'
                  : 'bg-claw-bg border-claw-border opacity-40'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                i < currentIdx
                  ? 'bg-claw-success text-white'
                  : i === currentIdx
                    ? 'bg-claw-primary text-white'
                    : 'bg-claw-border text-claw-muted'
              }`}
            >
              {i < currentIdx ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                p.icon
              )}
            </div>
            <span className="text-sm text-claw-text">{p.label}</span>
            {i === currentIdx && phase !== 'done' && (
              <div className="ml-auto w-4 h-4 border-2 border-claw-primary border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        ))}
      </div>

      {/* Vision preview */}
      <div className="bg-claw-bg border border-claw-border rounded-lg p-4">
        <label className="text-[10px] text-claw-muted uppercase tracking-wider">
          你的愿景输入
        </label>
        <p className="text-sm text-claw-muted mt-1 leading-relaxed line-clamp-3">
          {vision.rawText}
        </p>
      </div>

      {/* Next button */}
      {phase === 'done' && (
        <div className="flex justify-end animate-fade-in-up">
          <button
            onClick={nextStep}
            className="px-6 py-2.5 rounded-lg bg-claw-primary text-white text-sm font-medium hover:bg-claw-primary/80 transition-colors"
          >
            下一步: 确认和调整
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Generates a mock intent graph from vision text.
 * In production, this would call the Brain API.
 */
function generateMockGraph(visionText: string) {
  const keywords = visionText.split(/[，。、\s]+/).filter((w) => w.length > 1);
  const goalCount = Math.min(Math.max(3, Math.floor(keywords.length / 5)), 5);

  const nodes: Array<{
    id: string;
    type: MapNodeType;
    label: string;
    description?: string;
    layer: MapLayer;
    isDraft: boolean;
    x: number;
    y: number;
  }> = [];

  const edges: Array<{
    id: string;
    source: string;
    target: string;
    edgeType: MapEdgeType;
  }> = [];

  // Root vision goal
  nodes.push({
    id: 'vision-root',
    type: 'goal',
    label: visionText.length > 40 ? visionText.slice(0, 40) + '...' : visionText,
    description: '根愿景节点',
    layer: 'orchestration',
    isDraft: true,
    x: 400,
    y: 20,
  });

  // Generate sub-goals
  const goalLabels = [
    '产品研发', '市场拓展', '技术架构', '用户增长', '团队建设',
  ];

  for (let i = 0; i < goalCount; i++) {
    const goalId = `goal-${i}`;
    nodes.push({
      id: goalId,
      type: 'goal',
      label: goalLabels[i] || `目标 ${i + 1}`,
      description: `由 AI 从愿景中推导的战略目标`,
      layer: 'orchestration',
      isDraft: true,
      x: 120 + i * 220,
      y: 160,
    });

    edges.push({
      id: `e-vision-${goalId}`,
      source: 'vision-root',
      target: goalId,
      edgeType: 'sequence',
    });

    // Generate 2-3 tasks per goal
    const taskCount = 2 + (i % 2);
    for (let j = 0; j < taskCount; j++) {
      const taskId = `task-${i}-${j}`;
      nodes.push({
        id: taskId,
        type: 'task',
        label: `${goalLabels[i] || '目标'} - 任务 ${j + 1}`,
        description: `需要执行的具体任务`,
        layer: 'execution',
        isDraft: true,
        x: 80 + i * 220 + j * 80,
        y: 320 + j * 100,
      });

      edges.push({
        id: `e-${goalId}-${taskId}`,
        source: goalId,
        target: taskId,
        edgeType: j === 0 ? 'sequence' : 'parallel',
      });
    }
  }

  // Add a cognition node
  nodes.push({
    id: 'cog-initial',
    type: 'cognition',
    label: '初始假设：市场策略有效性待验证',
    layer: 'cognition',
    isDraft: true,
    x: 300,
    y: 600,
  });

  return { nodes, edges };
}

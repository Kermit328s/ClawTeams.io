import { create } from 'zustand';
import type {
  ChatMessage,
  Conversation,
  ConversationType,
  BubbleAction,
  ExecutionCardState,
} from '@/types';

interface ChatState {
  /** All conversations */
  conversations: Conversation[];
  /** Currently active conversation ID */
  activeConversationId: string | null;
  /** Messages keyed by conversation ID */
  messagesByConversation: Record<string, ChatMessage[]>;
  /** Whether a message is being sent/processed */
  isSending: boolean;
  /** Loading more history */
  isLoadingHistory: boolean;

  // ─── Actions ───
  setActiveConversation: (id: string) => void;
  addConversation: (conv: Conversation) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  sendMessage: (conversationId: string, content: string) => void;
  convertToExecution: (messageId: string, conversationId: string) => void;
  convertToCognition: (messageId: string, conversationId: string) => void;
  initiateDecision: (messageId: string, conversationId: string) => void;
  updateExecutionState: (
    messageId: string,
    conversationId: string,
    state: ExecutionCardState,
  ) => void;
  loadHistory: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [
    {
      id: 'brain-default',
      type: 'human-brain' as ConversationType,
      title: 'ClawTeams 大脑',
      participants: [
        { id: 'user-1', name: '我', type: 'human' },
        { id: 'brain', name: 'ClawTeams 大脑', type: 'brain' },
      ],
      unreadCount: 0,
    },
  ],
  activeConversationId: 'brain-default',
  messagesByConversation: {
    'brain-default': [
      {
        id: 'welcome-1',
        conversationId: 'brain-default',
        senderId: 'brain',
        senderName: 'ClawTeams 大脑',
        senderType: 'brain',
        content: '你好！我是 ClawTeams 大脑。你可以告诉我你的想法，我会帮你把它变成可执行的计划。',
        timestamp: new Date().toISOString(),
        semanticType: 'normal',
        actions: [],
      },
    ],
  },
  isSending: false,
  isLoadingHistory: false,

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addConversation: (conv) =>
    set((s) => ({
      conversations: [...s.conversations, conv],
      messagesByConversation: {
        ...s.messagesByConversation,
        [conv.id]: [],
      },
    })),

  addMessage: (conversationId, message) =>
    set((s) => ({
      messagesByConversation: {
        ...s.messagesByConversation,
        [conversationId]: [
          ...(s.messagesByConversation[conversationId] || []),
          message,
        ],
      },
    })),

  sendMessage: (conversationId, content) => {
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      senderId: 'user-1',
      senderName: '我',
      senderType: 'human',
      content,
      timestamp: new Date().toISOString(),
      semanticType: 'normal',
      actions: [],
    };

    set((s) => ({
      isSending: true,
      messagesByConversation: {
        ...s.messagesByConversation,
        [conversationId]: [
          ...(s.messagesByConversation[conversationId] || []),
          userMessage,
        ],
      },
    }));

    // Simulate AI response with semantic analysis
    setTimeout(() => {
      const semanticType = analyzeSemantics(content);
      const actions = getActionsForSemantic(semanticType);

      const brainResponse: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId,
        senderId: 'brain',
        senderName: 'ClawTeams 大脑',
        senderType: 'brain',
        content: generateBrainResponse(content, semanticType),
        timestamp: new Date().toISOString(),
        semanticType,
        actions,
      };

      set((s) => ({
        isSending: false,
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: [
            ...(s.messagesByConversation[conversationId] || []),
            brainResponse,
          ],
        },
      }));
    }, 800);
  },

  convertToExecution: (messageId, conversationId) => {
    set((s) => {
      const messages = s.messagesByConversation[conversationId] || [];
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  executionState: {
                    status: 'executing' as const,
                    title: extractTitle(m.content),
                    description: '龙虾正在处理中...',
                  },
                }
              : m,
          ),
        },
      };
    });

    // Simulate execution progress
    setTimeout(() => {
      get().updateExecutionState(messageId, conversationId, {
        status: 'pending_confirm',
        title: extractTitle(
          get().messagesByConversation[conversationId]?.find(
            (m) => m.id === messageId,
          )?.content || '',
        ),
        description: '已完成分析，等待确认',
        confirmActions: [
          { label: '查看详情', action: 'view' },
          { label: '确认执行', action: 'confirm' },
        ],
      });
    }, 2000);
  },

  convertToCognition: (messageId, conversationId) => {
    set((s) => {
      const messages = s.messagesByConversation[conversationId] || [];
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: messages.map((m) =>
            m.id === messageId
              ? { ...m, actions: [], semanticType: 'cognition' as const }
              : m,
          ),
        },
      };
    });
  },

  initiateDecision: (messageId, conversationId) => {
    const brainMsg: ChatMessage = {
      id: `msg-${Date.now()}-decision`,
      conversationId,
      senderId: 'brain',
      senderName: 'ClawTeams 大脑',
      senderType: 'brain',
      content: '已创建决策节点。等待有权限的成员拍板后执行。',
      timestamp: new Date().toISOString(),
      semanticType: 'normal',
      actions: [],
    };
    get().addMessage(conversationId, brainMsg);
  },

  updateExecutionState: (messageId, conversationId, state) =>
    set((s) => {
      const messages = s.messagesByConversation[conversationId] || [];
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: messages.map((m) =>
            m.id === messageId ? { ...m, executionState: state } : m,
          ),
        },
      };
    }),

  loadHistory: (_conversationId) => {
    // Placeholder: would fetch from API
    set({ isLoadingHistory: false });
  },
}));

// ─── Helpers ───

function analyzeSemantics(
  content: string,
): ChatMessage['semanticType'] {
  const lower = content.toLowerCase();
  const intentKeywords = ['想', '要', '做', '执行', '关掉', '启动', '创建', '部署', '开发', '推进'];
  const cognitionKeywords = ['觉得', '认为', '假设', '可能', '也许', '猜测', '观察到', '发现'];
  const conflictKeywords = ['分歧', '不同意', '但是我认为', '我反对'];

  const hasIntent = intentKeywords.some((k) => lower.includes(k));
  const hasCognition = cognitionKeywords.some((k) => lower.includes(k));
  const hasConflict = conflictKeywords.some((k) => lower.includes(k));

  if (hasConflict) return 'conflict';
  if (hasIntent && hasCognition) return 'both';
  if (hasIntent) return 'intent';
  if (hasCognition) return 'cognition';
  return 'normal';
}

function getActionsForSemantic(
  type: ChatMessage['semanticType'],
): BubbleAction[] {
  switch (type) {
    case 'intent':
      return ['execute'];
    case 'cognition':
      return ['cognition'];
    case 'both':
      return ['execute', 'cognition'];
    case 'conflict':
      return ['decision'];
    default:
      return [];
  }
}

function generateBrainResponse(
  content: string,
  semanticType: ChatMessage['semanticType'],
): string {
  switch (semanticType) {
    case 'intent':
      return `我理解你想要：「${extractTitle(content)}」。你可以点击下方按钮将其转为执行任务。`;
    case 'cognition':
      return `这是一个很好的观察。你可以将其记入认知层，帮助团队积累知识。`;
    case 'both':
      return `这条消息包含了执行意图和认知洞察。你可以分别处理它们。`;
    case 'conflict':
      return `检测到团队成员间存在不同意见。建议发起正式决策流程，等待有权限的人确认后再执行。`;
    default:
      return `明白了。如果你需要我做什么，随时告诉我。`;
  }
}

function extractTitle(content: string): string {
  return content.length > 30 ? content.slice(0, 30) + '...' : content;
}

import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../src/frontend/store/chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    // Reset the store to initial state
    useChatStore.setState({
      conversations: [
        {
          id: 'brain-default',
          type: 'human-brain',
          title: 'ClawTeams 大脑',
          participants: [
            { id: 'user-1', name: '我', type: 'human' },
            { id: 'brain', name: 'ClawTeams 大脑', type: 'brain' },
          ],
          unreadCount: 0,
        },
      ],
      activeConversationId: 'brain-default',
      messagesByConversation: { 'brain-default': [] },
      isSending: false,
      isLoadingHistory: false,
    });
  });

  it('should have default conversation', () => {
    const state = useChatStore.getState();
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0].id).toBe('brain-default');
    expect(state.activeConversationId).toBe('brain-default');
  });

  it('should set active conversation', () => {
    useChatStore.getState().setActiveConversation('other-id');
    expect(useChatStore.getState().activeConversationId).toBe('other-id');
  });

  it('should add a new conversation', () => {
    useChatStore.getState().addConversation({
      id: 'test-conv',
      type: 'two-person',
      title: 'Test',
      participants: [],
      unreadCount: 0,
    });
    const state = useChatStore.getState();
    expect(state.conversations).toHaveLength(2);
    expect(state.messagesByConversation['test-conv']).toEqual([]);
  });

  it('should add a message to a conversation', () => {
    const msg = {
      id: 'msg-1',
      conversationId: 'brain-default',
      senderId: 'user-1',
      senderName: '我',
      senderType: 'human' as const,
      content: 'Hello',
      timestamp: new Date().toISOString(),
      semanticType: 'normal' as const,
      actions: [] as any[],
    };

    useChatStore.getState().addMessage('brain-default', msg);
    const messages = useChatStore.getState().messagesByConversation['brain-default'];
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello');
  });

  it('should convert message to execution state', () => {
    // Add a message first
    const msg = {
      id: 'msg-exec',
      conversationId: 'brain-default',
      senderId: 'brain',
      senderName: 'Brain',
      senderType: 'brain' as const,
      content: '我想关掉几个效果差的广告',
      timestamp: new Date().toISOString(),
      semanticType: 'intent' as const,
      actions: ['execute' as const],
    };
    useChatStore.getState().addMessage('brain-default', msg);

    // Convert to execution
    useChatStore.getState().convertToExecution('msg-exec', 'brain-default');

    const messages = useChatStore.getState().messagesByConversation['brain-default'];
    const updated = messages.find((m) => m.id === 'msg-exec');
    expect(updated?.executionState).toBeDefined();
    expect(updated?.executionState?.status).toBe('executing');
  });

  it('should update execution state', () => {
    const msg = {
      id: 'msg-update',
      conversationId: 'brain-default',
      senderId: 'brain',
      senderName: 'Brain',
      senderType: 'brain' as const,
      content: 'test',
      timestamp: new Date().toISOString(),
      semanticType: 'normal' as const,
      actions: [] as any[],
      executionState: {
        status: 'executing' as const,
        title: 'Test',
        description: 'Testing...',
      },
    };
    useChatStore.getState().addMessage('brain-default', msg);

    useChatStore.getState().updateExecutionState('msg-update', 'brain-default', {
      status: 'completed',
      title: 'Test',
      description: 'Done!',
    });

    const messages = useChatStore.getState().messagesByConversation['brain-default'];
    const updated = messages.find((m) => m.id === 'msg-update');
    expect(updated?.executionState?.status).toBe('completed');
  });
});

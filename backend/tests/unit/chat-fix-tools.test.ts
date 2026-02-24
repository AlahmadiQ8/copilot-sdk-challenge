import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('@github/copilot-sdk', () => ({
  defineTool: vi.fn((name: string, config: { description: string; parameters: unknown; handler: Function }) => ({
    name,
    description: config.description,
    parameters: config.parameters,
    handler: config.handler,
  })),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  childLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { createWrappedTools, createApprovalEmitter, resolveApproval } = await import(
  '../../src/services/chat-fix-tools.js'
);

describe('chat-fix-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createApprovalEmitter', () => {
    it('returns an EventEmitter', () => {
      const emitter = createApprovalEmitter();
      expect(emitter).toBeInstanceOf(EventEmitter);
    });

    it('can emit and listen to approval_required events', () => {
      const emitter = createApprovalEmitter();
      const handler = vi.fn();
      emitter.on('approval_required', handler);

      const req = { proposalId: 'p1', toolName: 'test', operation: 'Update', args: {}, description: 'desc' };
      emitter.emit('approval_required', req);

      expect(handler).toHaveBeenCalledWith(req);
    });
  });

  describe('resolveApproval', () => {
    it('returns false if no pending approval exists', () => {
      expect(resolveApproval('nonexistent', true)).toBe(false);
    });
  });

  describe('createWrappedTools', () => {
    const mockMcpClient = {
      listTools: vi.fn(),
      callTool: vi.fn(),
    };

    it('creates wrapped tools for each MCP tool', async () => {
      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'column_operations',
            description: 'Manage columns',
            inputSchema: { type: 'object', properties: { request: { type: 'object' } } },
          },
          {
            name: 'table_operations',
            description: 'Manage tables',
            inputSchema: { type: 'object', properties: { request: { type: 'object' } } },
          },
        ],
      });

      const emitter = createApprovalEmitter();
      const tools = await createWrappedTools(mockMcpClient, emitter);

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('column_operations');
      expect(tools[1].name).toBe('table_operations');
    });

    it('auto-executes read operations without approval', async () => {
      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'column_operations',
            description: 'Manage columns',
            inputSchema: { type: 'object' },
          },
        ],
      });
      mockMcpClient.callTool.mockResolvedValue({ content: [{ text: 'result' }] });

      const emitter = createApprovalEmitter();
      const executingHandler = vi.fn();
      const resultHandler = vi.fn();
      emitter.on('tool_executing', executingHandler);
      emitter.on('tool_result', resultHandler);

      const tools = await createWrappedTools(mockMcpClient, emitter);
      const handler = tools[0].handler;

      const result = await handler({ request: { operation: 'List' } });

      expect(result).toEqual({ content: [{ text: 'result' }] });
      expect(executingHandler).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'column_operations', isWrite: false }),
      );
      expect(resultHandler).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'column_operations', isWrite: false }),
      );
    });

    it('returns error result for failed read operations', async () => {
      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'column_operations',
            description: 'Manage columns',
            inputSchema: { type: 'object' },
          },
        ],
      });
      mockMcpClient.callTool.mockRejectedValue(new Error('MCP connection lost'));

      const emitter = createApprovalEmitter();
      const tools = await createWrappedTools(mockMcpClient, emitter);
      const handler = tools[0].handler;

      const result = await handler({ request: { operation: 'Get' } });

      expect(result).toEqual({ error: 'MCP connection lost' });
    });

    it('blocks write operations until approved', async () => {
      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'column_operations',
            description: 'Manage columns',
            inputSchema: { type: 'object' },
          },
        ],
      });
      mockMcpClient.callTool.mockResolvedValue({ content: [{ text: 'updated' }] });

      const emitter = createApprovalEmitter();
      const approvalHandler = vi.fn();
      emitter.on('approval_required', approvalHandler);

      const tools = await createWrappedTools(mockMcpClient, emitter);
      const handler = tools[0].handler;

      // Start the handler (non-blocking) — it will wait for approval
      const resultPromise = handler({ request: { operation: 'Update' } });

      // Wait for the approval event to be emitted
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(approvalHandler).toHaveBeenCalledTimes(1);
      const proposalId = approvalHandler.mock.calls[0][0].proposalId;
      expect(proposalId).toBeTruthy();

      // Resolve the approval
      const resolved = resolveApproval(proposalId, true);
      expect(resolved).toBe(true);

      const result = await resultPromise;
      expect(result).toEqual({ content: [{ text: 'updated' }] });
      expect(mockMcpClient.callTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'column_operations' }),
      );
    });

    it('returns rejection result when write operation is rejected', async () => {
      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'column_operations',
            description: 'Manage columns',
            inputSchema: { type: 'object' },
          },
        ],
      });

      const emitter = createApprovalEmitter();
      const approvalHandler = vi.fn();
      emitter.on('approval_required', approvalHandler);

      const tools = await createWrappedTools(mockMcpClient, emitter);
      const handler = tools[0].handler;

      const resultPromise = handler({ request: { operation: 'Delete' } });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const proposalId = approvalHandler.mock.calls[0][0].proposalId;
      resolveApproval(proposalId, false);

      const result = await resultPromise;
      expect(result).toEqual(
        expect.objectContaining({ rejected: true }),
      );
      // Should NOT have called the MCP tool
      expect(mockMcpClient.callTool).not.toHaveBeenCalled();
    });

    it('classifies unknown operations as write for safety', async () => {
      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'mystery_op',
            description: 'Unknown',
            inputSchema: { type: 'object' },
          },
        ],
      });

      const emitter = createApprovalEmitter();
      const approvalHandler = vi.fn();
      emitter.on('approval_required', approvalHandler);

      const tools = await createWrappedTools(mockMcpClient, emitter);
      const handler = tools[0].handler;

      // Trigger with unknown operation — should require approval
      const resultPromise = handler({ request: { operation: 'SomethingNew' } });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(approvalHandler).toHaveBeenCalledTimes(1);

      // Clean up by resolving
      const proposalId = approvalHandler.mock.calls[0][0].proposalId;
      resolveApproval(proposalId, false);
      await resultPromise;
    });

    it('classifies all read operations correctly', async () => {
      const readOps = ['List', 'Get', 'GetSchema', 'GetStats', 'GetConnection', 'GetPermissions',
        'ListLocalInstances', 'Execute', 'Validate', 'Find', 'ExportTMDL', 'Fetch'];

      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'test_tool',
            description: 'Test',
            inputSchema: { type: 'object' },
          },
        ],
      });
      mockMcpClient.callTool.mockResolvedValue({ content: [] });

      for (const op of readOps) {
        const emitter = createApprovalEmitter();
        const approvalHandler = vi.fn();
        emitter.on('approval_required', approvalHandler);

        const tools = await createWrappedTools(mockMcpClient, emitter);
        await tools[0].handler({ request: { operation: op } });

        expect(approvalHandler).not.toHaveBeenCalled();
      }
    });

    it('classifies all write operations correctly', async () => {
      const writeOps = ['Update', 'Create', 'Delete', 'Rename', 'Move',
        'Begin', 'Commit', 'Rollback', 'Connect', 'Disconnect', 'Start', 'Stop'];

      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'test_tool',
            description: 'Test',
            inputSchema: { type: 'object' },
          },
        ],
      });

      for (const op of writeOps) {
        const emitter = createApprovalEmitter();
        const approvalHandler = vi.fn();
        emitter.on('approval_required', approvalHandler);

        const tools = await createWrappedTools(mockMcpClient, emitter);
        const resultPromise = tools[0].handler({ request: { operation: op } });

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(approvalHandler).toHaveBeenCalledTimes(1);

        // Clean up
        const proposalId = approvalHandler.mock.calls[0][0].proposalId;
        resolveApproval(proposalId, false);
        await resultPromise;
      }
    });

    it('handles empty tool list gracefully', async () => {
      mockMcpClient.listTools.mockResolvedValue({ tools: [] });

      const emitter = createApprovalEmitter();
      const tools = await createWrappedTools(mockMcpClient, emitter);

      expect(tools).toHaveLength(0);
    });

    it('returns error when approved write operation fails at execution', async () => {
      mockMcpClient.listTools.mockResolvedValue({
        tools: [
          {
            name: 'column_operations',
            description: 'Manage columns',
            inputSchema: { type: 'object' },
          },
        ],
      });
      mockMcpClient.callTool.mockRejectedValue(new Error('Server disconnected'));

      const emitter = createApprovalEmitter();
      const approvalHandler = vi.fn();
      emitter.on('approval_required', approvalHandler);

      const tools = await createWrappedTools(mockMcpClient, emitter);
      const resultPromise = tools[0].handler({ request: { operation: 'Update' } });

      await new Promise((resolve) => setTimeout(resolve, 10));
      const proposalId = approvalHandler.mock.calls[0][0].proposalId;
      resolveApproval(proposalId, true);

      const result = await resultPromise;
      expect(result).toEqual({ error: 'Server disconnected' });
    });
  });
});

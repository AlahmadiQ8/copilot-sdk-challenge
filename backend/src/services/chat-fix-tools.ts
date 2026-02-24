import { defineTool } from '@github/copilot-sdk';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { childLogger } from '../middleware/logger.js';

const log = childLogger({ module: 'chat-fix-tools' });

// Operations classified as read-only (safe to auto-execute)
const READ_OPERATIONS = new Set([
  'List', 'Get', 'GetSchema', 'GetStats', 'GetConnection', 'GetPermissions',
  'ListLocalInstances', 'Execute', 'Validate', 'Find', 'ExportTMDL', 'Fetch',
]);

// Operations classified as write (require user approval)
const WRITE_OPERATIONS = new Set([
  'Update', 'Create', 'Delete', 'Rename', 'Move',
  'Begin', 'Commit', 'Rollback',
  'Connect', 'Disconnect', 'Start', 'Stop',
]);

export interface ApprovalRequest {
  proposalId: string;
  toolName: string;
  operation: string;
  args: Record<string, unknown>;
  description: string;
}

export interface ApprovalEmitter extends EventEmitter {
  on(event: 'approval_required', listener: (req: ApprovalRequest) => void): this;
  on(event: 'tool_executing', listener: (data: { toolName: string; args: Record<string, unknown>; isWrite: boolean }) => void): this;
  on(event: 'tool_result', listener: (data: { toolName: string; result: unknown; isWrite: boolean; proposalId?: string }) => void): this;
  emit(event: 'approval_required', req: ApprovalRequest): boolean;
  emit(event: 'tool_executing', data: { toolName: string; args: Record<string, unknown>; isWrite: boolean }): boolean;
  emit(event: 'tool_result', data: { toolName: string; result: unknown; isWrite: boolean; proposalId?: string }): boolean;
}

export function createApprovalEmitter(): ApprovalEmitter {
  return new EventEmitter() as ApprovalEmitter;
}

// Pending approvals: proposalId → { resolve, reject }
const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>();

export function resolveApproval(proposalId: string, approved: boolean, _reason?: string): boolean {
  const pending = pendingApprovals.get(proposalId);
  if (!pending) return false;
  pending.resolve(approved);
  pendingApprovals.delete(proposalId);
  return true;
}

function classifyOperation(toolName: string, args: Record<string, unknown>): 'read' | 'write' {
  // Extract operation from the MCP tool arguments
  const request = args.request as { operation?: string } | undefined;
  const operation = request?.operation || '';

  if (READ_OPERATIONS.has(operation)) return 'read';
  if (WRITE_OPERATIONS.has(operation)) return 'write';

  // Fallback: if we can't determine, classify as write for safety
  log.warn({ toolName, operation }, 'Unknown operation, classifying as write for safety');
  return 'write';
}

function formatToolDescription(toolName: string, mcpDescription: string): string {
  return `${toolName}: ${mcpDescription}`;
}

export async function createWrappedTools(
  mcpClient: Client,
  emitter: ApprovalEmitter,
): Promise<ReturnType<typeof defineTool>[]> {
  const { tools: mcpTools } = await mcpClient.listTools();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappedTools: any[] = [];

  for (const mcpTool of mcpTools) {
    const toolName = mcpTool.name;
    const description = formatToolDescription(toolName, mcpTool.description || '');
    const schema = mcpTool.inputSchema as Record<string, unknown>;

    const tool = defineTool(toolName, {
      description,
      parameters: schema,
      handler: async (args: Record<string, unknown>) => {
        const classification = classifyOperation(toolName, args);

        if (classification === 'read') {
          // Auto-execute read operations
          emitter.emit('tool_executing', { toolName, args, isWrite: false });
          try {
            const result = await mcpClient.callTool({ name: toolName, arguments: args });
            emitter.emit('tool_result', { toolName, result, isWrite: false });
            return result;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Tool execution failed';
            emitter.emit('tool_result', { toolName, result: { error: message }, isWrite: false });
            return { error: message };
          }
        }

        // Write operations: require user approval
        const proposalId = randomUUID();
        const request = args.request as { operation?: string } | undefined;
        const operation = request?.operation || 'Unknown';

        emitter.emit('approval_required', {
          proposalId,
          toolName,
          operation,
          args,
          description: `${operation} on ${toolName}`,
        });

        emitter.emit('tool_executing', { toolName, args, isWrite: true });

        // Wait for user approval
        const approved = await new Promise<boolean>((resolve) => {
          pendingApprovals.set(proposalId, { resolve });
        });

        if (!approved) {
          const rejection = { rejected: true, message: 'User rejected this operation. Ask the user how they would like to proceed.' };
          emitter.emit('tool_result', { toolName, result: rejection, isWrite: true, proposalId });
          return rejection;
        }

        // Execute after approval
        try {
          const result = await mcpClient.callTool({ name: toolName, arguments: args });
          emitter.emit('tool_result', { toolName, result, isWrite: true, proposalId });
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Tool execution failed';
          emitter.emit('tool_result', { toolName, result: { error: message }, isWrite: true, proposalId });
          return { error: message };
        }
      },
    });

    wrappedTools.push(tool);
  }

  log.info({ toolCount: wrappedTools.length }, 'Created wrapped MCP tools');
  return wrappedTools;
}

import {
  connectToModel,
  disconnectFromModel,
  listInstances as mcpListInstances,
  getConnectionStatus as mcpGetStatus,
} from '../mcp/client.js';
import { logger } from '../middleware/logger.js';
import type { ConnectionStatus, PbiInstance } from '../types/api.js';

export async function getInstances(): Promise<{ instances: PbiInstance[] }> {
  const result = await mcpListInstances();
  // MCP returns content array with text items
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  let instances: PbiInstance[] = [];

  if (content && content.length > 0 && content[0].text) {
    try {
      const parsed = JSON.parse(content[0].text);
      instances = Array.isArray(parsed)
        ? parsed.map((inst: Record<string, string>) => ({
            name: inst.name || inst.Name || `${inst.serverAddress || inst.ServerAddress}`,
            serverAddress: inst.serverAddress || inst.ServerAddress || '',
            databaseName: inst.databaseName || inst.DatabaseName || '',
          }))
        : [];
    } catch {
      logger.warn({ raw: content[0].text }, 'Failed to parse instances response');
    }
  }

  return { instances };
}

export async function connect(
  serverAddress: string,
  databaseName: string,
): Promise<ConnectionStatus> {
  await connectToModel(serverAddress, databaseName);
  return {
    connected: true,
    modelName: databaseName,
    serverAddress,
    databaseName,
    connectedAt: new Date().toISOString(),
  };
}

export async function disconnect(): Promise<{ success: boolean }> {
  await disconnectFromModel();
  return { success: true };
}

export function getStatus(): ConnectionStatus {
  const status = mcpGetStatus();
  return {
    connected: status.connected,
    modelName: status.databaseName,
    serverAddress: status.serverAddress,
    databaseName: status.databaseName,
    connectedAt: status.connectedAt?.toISOString(),
  };
}

import {
  connectToModel,
  disconnectFromModel,
  listInstances as mcpListInstances,
  getConnectionStatus as mcpGetStatus,
} from '../mcp/client.js';
import { logger } from '../middleware/logger.js';
import type { ConnectionStatus, PbiInstance } from '../types/api.js';
import prisma from '../models/prisma.js';

export async function getInstances(): Promise<{ instances: PbiInstance[] }> {
  const result = await mcpListInstances();
  // MCP returns content array with text items
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  let instances: PbiInstance[] = [];

  if (content && content.length > 0 && content[0].text) {
    try {
      const parsed = JSON.parse(content[0].text);
      // MCP returns { success, data: [...] } where data contains instance objects
      const items: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.data)
          ? parsed.data
          : [];
      instances = items.map((inst) => ({
        name:
          (inst.name as string) ||
          (inst.parentWindowTitle as string) ||
          `localhost:${inst.port}`,
        serverAddress:
          (inst.serverAddress as string) ||
          `localhost:${inst.port}`,
        databaseName:
          (inst.databaseName as string) ||
          (inst.parentWindowTitle as string) ||
          '',
      }));
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

  // Upsert SemanticModel so analysis runs can reference it
  const status = mcpGetStatus();
  const catalogName = status.catalogName || databaseName;
  await prisma.semanticModel.upsert({
    where: { databaseName: catalogName },
    update: { modelName: databaseName, serverAddress, updatedAt: new Date() },
    create: { databaseName: catalogName, modelName: databaseName, serverAddress },
  });

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

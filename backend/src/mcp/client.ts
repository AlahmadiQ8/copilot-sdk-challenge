import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../middleware/logger.js';

interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  serverAddress: string;
  databaseName: string;
  connectedAt: Date;
}

let connection: McpConnection | null = null;

function getMcpCommand(): { command: string; args: string[] } {
  const command = process.env.PBI_MCP_COMMAND || 'C:\\Users\\momohammad\\.vscode-insiders\\extensions\\analysis-services.powerbi-modeling-mcp-0.3.1-win32-arm64\\server\\powerbi-modeling-mcp.exe';
  const argsStr = process.env.PBI_MCP_ARGS || '--start';
  const args = argsStr.split(',');
  return { command, args };
}

export async function spawnMcpClient(): Promise<Client> {
  if (connection) {
    return connection.client;
  }

  const { command, args } = getMcpCommand();
  logger.info({ command, args }, 'Spawning MCP server');

  const transport = new StdioClientTransport({ command, args });
  const client = new Client({ name: 'pbi-analyzer', version: '1.0.0' });
  await client.connect(transport);

  connection = {
    client,
    transport,
    serverAddress: '',
    databaseName: '',
    connectedAt: new Date(),
  };

  return client;
}

export async function connectToModel(
  serverAddress: string,
  databaseName: string,
): Promise<void> {
  const client = await spawnMcpClient();

  const result = await client.callTool({
    name: 'connection_operations',
    arguments: {
      request: {
        operation: 'Connect',
        dataSource: serverAddress,
        initialCatalog: databaseName,
      },
    },
  });

  // Validate the MCP response — check for isError flag and success:false in content
  if ((result as { isError?: boolean }).isError) {
    const content = (result as { content?: Array<{ text?: string }> })?.content;
    const text = content?.[0]?.text;
    let message = 'MCP connection failed';
    if (text) {
      try {
        const parsed = JSON.parse(text);
        message = parsed.message || message;
      } catch {
        message = text;
      }
    }
    logger.error({ serverAddress, databaseName, result }, 'MCP connection failed');
    const err = new Error(message) as Error & { statusCode?: number };
    err.statusCode = 502;
    throw err;
  }

  logger.info({ serverAddress, databaseName, result }, 'Connected to model');

  if (connection) {
    connection.serverAddress = serverAddress;
    connection.databaseName = databaseName;
    connection.connectedAt = new Date();
  }
}

export async function disconnectFromModel(): Promise<void> {
  if (!connection) return;

  try {
    await connection.client.callTool({
      name: 'connection_operations',
      arguments: { request: { operation: 'Disconnect' } },
    });
  } catch (err) {
    logger.warn({ err }, 'Error during disconnect');
  }

  try {
    await connection.transport.close();
  } catch {
    // transport may already be closed
  }

  connection = null;
  logger.info('Disconnected from model');
}

export async function listInstances(): Promise<unknown> {
  const client = await spawnMcpClient();
  const result = await client.callTool({
    name: 'connection_operations',
    arguments: { request: { operation: 'ListLocalInstances' } },
  });
  return result;
}

export function getConnectionStatus(): {
  connected: boolean;
  serverAddress?: string;
  databaseName?: string;
  connectedAt?: Date;
} {
  if (!connection || !connection.serverAddress) {
    return { connected: false };
  }
  return {
    connected: true,
    serverAddress: connection.serverAddress,
    databaseName: connection.databaseName,
    connectedAt: connection.connectedAt,
  };
}

export async function healthCheck(): Promise<boolean> {
  if (!connection) return false;
  try {
    await connection.client.callTool({
      name: 'connection_operations',
      arguments: { request: { operation: 'GetStatus' } },
    });
    return true;
  } catch {
    return false;
  }
}

export function getMcpClient(): Client | null {
  return connection?.client ?? null;
}

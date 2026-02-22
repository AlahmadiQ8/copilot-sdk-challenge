import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../middleware/logger.js';

interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  serverAddress: string;
  databaseName: string;
  catalogName: string;
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
    catalogName: '',
    connectedAt: new Date(),
  };

  return client;
}

export async function connectToModel(
  serverAddress: string,
  databaseName: string,
): Promise<void> {
  const client = await spawnMcpClient();

  let result;
  try {
    result = await client.callTool({
      name: 'connection_operations',
      arguments: {
        request: {
          operation: 'Connect',
          dataSource: serverAddress,
        },
      },
    });
  } catch (callErr) {
    // MCP tool call itself failed — tear down the stale process so the next
    // attempt spawns a fresh one.
    logger.error({ err: callErr, serverAddress, databaseName }, 'MCP Connect tool call failed');
    await teardownMcpProcess();
    throw callErr;
  }

  // Validate the MCP response — check for isError flag and success:false in content
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  const text = content?.[0]?.text;
  let parsedContent: Record<string, unknown> | null = null;
  if (text) {
    try { parsedContent = JSON.parse(text); } catch { /* not JSON */ }
  }

  const isError = (result as { isError?: boolean }).isError === true;
  const isSuccessFalse = parsedContent?.success === false;

  if (isError || isSuccessFalse) {
    const message = (parsedContent?.message as string) || text || 'MCP connection failed';
    logger.error({ serverAddress, databaseName, result }, 'MCP connection failed');
    // Tear down the MCP process so the next connect attempt spawns a fresh one
    await teardownMcpProcess();
    const err = new Error(message) as Error & { statusCode?: number };
    err.statusCode = 502;
    throw err;
  }

  logger.info({ serverAddress, databaseName, result }, 'Connected to model');

  // Resolve the actual SSAS catalog name (GUID) — PBI Desktop uses GUIDs
  // internally, not the friendly model name.
  let catalogName = databaseName;
  try {
    const dbResult = await client.callTool({
      name: 'database_operations',
      arguments: { request: { operation: 'List' } },
    });
    const dbContent = (dbResult as { content?: Array<{ text?: string }> })?.content;
    const dbText = dbContent?.[0]?.text;
    if (dbText) {
      const dbParsed = JSON.parse(dbText);
      const databases: Array<{ name?: string }> = Array.isArray(dbParsed?.data) ? dbParsed.data : [];
      if (databases.length === 1 && databases[0].name) {
        catalogName = databases[0].name;
        logger.info({ catalogName }, 'Resolved SSAS catalog name');
      }
    }
  } catch (dbErr) {
    logger.warn({ err: dbErr }, 'Could not resolve SSAS catalog name, falling back to databaseName');
  }

  if (connection) {
    connection.serverAddress = serverAddress;
    connection.databaseName = databaseName;
    connection.catalogName = catalogName;
    connection.connectedAt = new Date();
  }
}

async function teardownMcpProcess(): Promise<void> {
  if (!connection) return;
  try { await connection.transport.close(); } catch { /* already closed */ }
  connection = null;
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
  catalogName?: string;
  connectedAt?: Date;
} {
  if (!connection || !connection.serverAddress) {
    return { connected: false };
  }
  return {
    connected: true,
    serverAddress: connection.serverAddress,
    databaseName: connection.databaseName,
    catalogName: connection.catalogName,
    connectedAt: connection.connectedAt,
  };
}

export async function healthCheck(): Promise<boolean> {
  if (!connection) return false;
  try {
    await connection.client.callTool({
      name: 'connection_operations',
      arguments: { request: { operation: 'GetConnection' } },
    });
    return true;
  } catch {
    return false;
  }
}

export function getMcpClient(): Client | null {
  return connection?.client ?? null;
}

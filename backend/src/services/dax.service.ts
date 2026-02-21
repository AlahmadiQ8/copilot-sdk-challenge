import prisma from '../models/prisma.js';
import { getMcpClient } from '../mcp/client.js';
import { logger, childLogger } from '../middleware/logger.js';

function parseToolResult(result: unknown): unknown {
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  if (!content || content.length === 0 || !content[0].text) return null;
  try {
    return JSON.parse(content[0].text);
  } catch {
    return content[0].text;
  }
}

export async function executeDax(queryText: string): Promise<string> {
  const client = getMcpClient();
  if (!client) throw Object.assign(new Error('Not connected to a model'), { statusCode: 422 });

  const query = await prisma.daxQuery.create({
    data: { queryText, status: 'RUNNING' },
  });

  const log = childLogger({ daxQueryId: query.id });

  // Run async
  processDaxQuery(query.id, queryText, log).catch((err) => {
    log.error({ err }, 'DAX query execution failed');
  });

  return query.id;
}

async function processDaxQuery(
  queryId: string,
  queryText: string,
  log: ReturnType<typeof childLogger>,
): Promise<void> {
  const client = getMcpClient();
  if (!client) throw new Error('Not connected');

  const startTime = Date.now();

  try {
    const result = await client.callTool({
      name: 'dax_query_operations',
      arguments: { request: { operation: 'Execute', query: queryText } },
    });

    const executionTimeMs = Date.now() - startTime;
    const parsed = parseToolResult(result);

    let columns: Array<{ name: string; dataType: string }> = [];
    let rows: Array<Record<string, unknown>> = [];

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.columns)) columns = obj.columns as typeof columns;
      if (Array.isArray(obj.rows)) rows = obj.rows as typeof rows;
    } else if (Array.isArray(parsed)) {
      rows = parsed as Array<Record<string, unknown>>;
      if (rows.length > 0) {
        columns = Object.keys(rows[0]).map((name) => ({ name, dataType: 'string' }));
      }
    }

    await prisma.daxQuery.update({
      where: { id: queryId },
      data: {
        status: 'COMPLETED',
        resultData: JSON.stringify({ columns, rows }),
        rowCount: rows.length,
        executionTimeMs,
      },
    });

    log.info({ rowCount: rows.length, executionTimeMs }, 'DAX query completed');
  } catch (err) {
    const executionTimeMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown error';

    await prisma.daxQuery.update({
      where: { id: queryId },
      data: {
        status: 'FAILED',
        errorMessage: message,
        executionTimeMs,
      },
    });

    log.error({ err }, 'DAX query failed');
  }
}

export async function validateDax(queryText: string): Promise<{ valid: boolean; error?: string }> {
  const client = getMcpClient();
  if (!client) throw Object.assign(new Error('Not connected to a model'), { statusCode: 422 });

  try {
    const result = await client.callTool({
      name: 'dax_query_operations',
      arguments: { request: { operation: 'Validate', query: queryText } },
    });

    const parsed = parseToolResult(result);
    if (parsed && typeof parsed === 'object' && 'valid' in (parsed as object)) {
      return parsed as { valid: boolean; error?: string };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Validation failed' };
  }
}

export async function getDaxQuery(queryId: string) {
  const query = await prisma.daxQuery.findUnique({ where: { id: queryId } });
  if (!query) throw Object.assign(new Error('DAX query not found'), { statusCode: 404 });

  let columns: Array<{ name: string; dataType: string }> = [];
  let rows: Array<Record<string, unknown>> = [];

  if (query.resultData) {
    try {
      const data = JSON.parse(query.resultData);
      columns = data.columns || [];
      rows = data.rows || [];
    } catch {
      // ignore parse error
    }
  }

  return {
    id: query.id,
    query: query.queryText,
    status: query.status,
    columns,
    rows,
    rowCount: query.rowCount || 0,
    executionTimeMs: query.executionTimeMs || 0,
    errorMessage: query.errorMessage,
  };
}

export async function getDaxHistory(limit: number, offset: number) {
  const [queries, total] = await Promise.all([
    prisma.daxQuery.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.daxQuery.count(),
  ]);

  return {
    queries: queries.map((q) => ({
      id: q.id,
      queryText: q.queryText,
      naturalLanguage: q.naturalLanguage,
      status: q.status,
      rowCount: q.rowCount,
      executionTimeMs: q.executionTimeMs,
      errorMessage: q.errorMessage,
      createdAt: q.createdAt.toISOString(),
    })),
    total,
  };
}

export async function cancelDaxQuery(queryId: string): Promise<void> {
  const query = await prisma.daxQuery.findUnique({ where: { id: queryId } });
  if (!query) throw Object.assign(new Error('DAX query not found'), { statusCode: 404 });
  if (query.status !== 'RUNNING')
    throw Object.assign(new Error('Query is not running'), { statusCode: 409 });

  await prisma.daxQuery.update({
    where: { id: queryId },
    data: { status: 'FAILED', errorMessage: 'Cancelled by user' },
  });
}

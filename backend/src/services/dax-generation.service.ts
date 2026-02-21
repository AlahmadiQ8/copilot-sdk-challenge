import { CopilotClient } from '@github/copilot-sdk';
import prisma from '../models/prisma.js';
import { logger, childLogger } from '../middleware/logger.js';

export async function generateDax(
  prompt: string,
): Promise<{ queryId: string; query: string; explanation: string }> {
  const mcpCommand = process.env.PBI_MCP_COMMAND || 'npx';
  const mcpArgs = (process.env.PBI_MCP_ARGS || '-y,@anthropic/powerbi-modeling-mcp').split(',');

  const log = childLogger({ operation: 'dax-generation' });
  log.info({ prompt }, 'Starting DAX generation');

  const client = new CopilotClient();
  const session = await client.createSession({
    model: 'gpt-4.1',
    streaming: false,
    mcpServers: {
      'powerbi-model': {
        type: 'stdio' as const,
        command: mcpCommand,
        args: mcpArgs,
        tools: ['*'],
      },
    },
    systemMessage: {
      content: `You are a DAX query expert working with a Power BI Semantic Model. The user will describe what data they want to see, and you will:
1. First inspect the model schema using the available MCP tools to understand available tables, columns, and measures
2. Generate a valid DAX query that answers the user's question
3. Return your response in exactly this format:

DAX:
\`\`\`
<your DAX query here>
\`\`\`

EXPLANATION:
<brief explanation of what the query does>

Only output valid EVALUATE queries. Do not use DEFINE unless necessary.`,
    },
  });

  const response = await session.sendAndWait({
    prompt: `Generate a DAX query for: ${prompt}`,
  });

  await client.stop();

  const content = response?.data?.content || '';

  // Parse DAX query from response
  const daxMatch = content.match(/```(?:dax)?\s*\n?([\s\S]*?)```/);
  const query = daxMatch ? daxMatch[1].trim() : content.trim();

  // Parse explanation
  const explanationMatch = content.match(/EXPLANATION:\s*([\s\S]*?)$/);
  const explanation = explanationMatch ? explanationMatch[1].trim() : '';

  // Save to DB
  const daxQuery = await prisma.daxQuery.create({
    data: {
      queryText: query,
      naturalLanguage: prompt,
      status: 'PENDING',
    },
  });

  log.info({ queryId: daxQuery.id }, 'DAX query generated');

  return { queryId: daxQuery.id, query, explanation };
}

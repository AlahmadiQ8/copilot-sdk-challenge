import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'PBI Analyzer API',
      version: '1.0.0',
      description: 'REST API for Power BI Best Practices Analyzer & AI Auto-Fix Web App',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Local development server',
      },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            details: { type: 'string' },
          },
        },
        PbiInstance: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            serverAddress: { type: 'string' },
            databaseName: { type: 'string' },
          },
        },
        ConnectRequest: {
          type: 'object',
          required: ['serverAddress', 'databaseName'],
          properties: {
            serverAddress: {
              type: 'string',
              description: 'localhost:<port> of PBI Desktop instance',
            },
            databaseName: {
              type: 'string',
              description: 'Database/model name within the instance',
            },
          },
        },
        ConnectionStatus: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            modelName: { type: 'string' },
            serverAddress: { type: 'string' },
            databaseName: { type: 'string' },
            connectedAt: { type: 'string', format: 'date-time' },
          },
        },
        AnalysisRun: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            modelName: { type: 'string' },
            status: { type: 'string', enum: ['RUNNING', 'COMPLETED', 'FAILED'] },
            startedAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            errorCount: { type: 'integer' },
            warningCount: { type: 'integer' },
            infoCount: { type: 'integer' },
          },
        },
        Finding: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            ruleId: { type: 'string' },
            ruleName: { type: 'string' },
            category: { type: 'string' },
            severity: { type: 'integer', description: '1=Info, 2=Warning, 3=Error' },
            description: { type: 'string' },
            affectedObject: { type: 'string' },
            objectType: { type: 'string' },
            fixStatus: { type: 'string', enum: ['UNFIXED', 'IN_PROGRESS', 'FIXED', 'FAILED'] },
            fixSummary: { type: 'string', nullable: true },
            hasAutoFix: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        FindingSummary: {
          type: 'object',
          properties: {
            totalCount: { type: 'integer' },
            errorCount: { type: 'integer' },
            warningCount: { type: 'integer' },
            infoCount: { type: 'integer' },
            fixedCount: { type: 'integer' },
            unfixedCount: { type: 'integer' },
          },
        },
        FixSession: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            findingId: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] },
            startedAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        FixSessionStep: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            stepNumber: { type: 'integer' },
            eventType: {
              type: 'string',
              enum: ['reasoning', 'tool_call', 'tool_result', 'message', 'error'],
            },
            content: { type: 'string', description: 'JSON-encoded event data' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        FixSessionDetail: {
          allOf: [
            { $ref: '#/components/schemas/FixSession' },
            {
              type: 'object',
              properties: {
                steps: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/FixSessionStep' },
                },
              },
            },
          ],
        },
        DaxQueryRequest: {
          type: 'object',
          required: ['query'],
          properties: {
            query: {
              type: 'string',
              description: 'DAX query to execute',
              example: "EVALUATE 'Sales'",
            },
          },
        },
        DaxGenerateRequest: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: {
              type: 'string',
              description: 'Natural language description of the desired query',
              example: 'Show total sales by region for last year',
            },
          },
        },
        DaxQueryResult: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            query: { type: 'string' },
            status: { type: 'string', enum: ['COMPLETED', 'FAILED'] },
            columns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  dataType: { type: 'string' },
                },
              },
            },
            rows: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            rowCount: { type: 'integer' },
            executionTimeMs: { type: 'integer' },
            errorMessage: { type: 'string', nullable: true },
          },
        },
        DaxQueryHistoryItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            queryText: { type: 'string' },
            naturalLanguage: { type: 'string', nullable: true },
            status: { type: 'string' },
            rowCount: { type: 'integer', nullable: true },
            executionTimeMs: { type: 'integer', nullable: true },
            errorMessage: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        BpaRule: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            category: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'integer' },
            scope: { type: 'string' },
            hasFixExpression: { type: 'boolean' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const spec = swaggerJsdoc(options);

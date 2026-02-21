const runId = 'run-001-mock';
const findingId1 = 'finding-001-mock';
const findingId2 = 'finding-002-mock';
const findingId3 = 'finding-003-mock';
const fixSessionId = 'fix-session-001-mock';

export const mockResponses = {
  // ── Connection ──
  instances: {
    instances: [
      { name: 'AdventureWorks', serverAddress: 'localhost:12345', databaseName: 'AdventureWorks' },
      { name: 'Contoso Sales', serverAddress: 'localhost:12346', databaseName: 'ContosoSales' },
    ],
  },

  connectionStatus: {
    connected: true,
    modelName: 'AdventureWorks',
    serverAddress: 'localhost:12345',
    databaseName: 'AdventureWorks',
    connectedAt: new Date().toISOString(),
  },

  disconnected: {
    connected: false,
  },

  // ── Analysis ──
  analysisRunStarted: { runId },

  analysisRunCompleted: {
    id: runId,
    modelName: 'AdventureWorks',
    status: 'COMPLETED',
    startedAt: new Date(Date.now() - 5000).toISOString(),
    completedAt: new Date().toISOString(),
    errorCount: 1,
    warningCount: 1,
    infoCount: 1,
  },

  analysisRuns: {
    runs: [
      {
        id: runId,
        modelName: 'AdventureWorks',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 5000).toISOString(),
        completedAt: new Date().toISOString(),
        errorCount: 1,
        warningCount: 1,
        infoCount: 1,
      },
    ],
    total: 1,
  },

  findingsList: {
    findings: [
      {
        id: findingId1,
        ruleId: 'AVOID_INACTIVE_RELATIONSHIPS',
        ruleName: 'Avoid inactive relationships',
        category: 'Error Prevention',
        severity: 3,
        description: 'Inactive relationships should be removed to avoid confusion.',
        affectedObject: "'Sales'[OrderDate] → 'Calendar'[Date]",
        objectType: 'Relationship',
        fixStatus: 'UNFIXED',
        fixSummary: null,
        hasAutoFix: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: findingId2,
        ruleId: 'NO_SUMMARIZE_BY',
        ruleName: 'Set SummarizeBy to None for non-aggregatable columns',
        category: 'Performance',
        severity: 2,
        description: 'Non-aggregatable columns should have SummarizeBy set to None.',
        affectedObject: "'Customer'[CustomerKey]",
        objectType: 'Column',
        fixStatus: 'UNFIXED',
        fixSummary: null,
        hasAutoFix: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: findingId3,
        ruleId: 'HIDE_FOREIGN_KEYS',
        ruleName: 'Hide foreign keys',
        category: 'Maintenance',
        severity: 1,
        description: 'Foreign key columns should be hidden from the report view.',
        affectedObject: "'Sales'[ProductKey]",
        objectType: 'Column',
        fixStatus: 'FIXED',
        fixSummary: 'Set IsHidden to true on Sales[ProductKey]',
        hasAutoFix: true,
        createdAt: new Date().toISOString(),
      },
    ],
    summary: {
      totalCount: 3,
      errorCount: 1,
      warningCount: 1,
      infoCount: 1,
      fixedCount: 1,
      unfixedCount: 2,
    },
    total: 3,
  },

  // ── Run Comparison ──
  runComparison: {
    resolvedCount: 1,
    newCount: 0,
    recurringCount: 2,
    resolved: [
      {
        ruleId: 'HIDE_FOREIGN_KEYS',
        ruleName: 'Hide foreign keys',
        affectedObject: "'Sales'[ProductKey]",
      },
    ],
    new: [],
  },

  // ── Fix Session ──
  fixSession: {
    id: fixSessionId,
    findingId: findingId1,
    status: 'COMPLETED',
    startedAt: new Date(Date.now() - 3000).toISOString(),
    completedAt: new Date().toISOString(),
  },

  fixSessionDetail: {
    id: fixSessionId,
    findingId: findingId1,
    status: 'COMPLETED',
    startedAt: new Date(Date.now() - 3000).toISOString(),
    completedAt: new Date().toISOString(),
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        eventType: 'reasoning',
        content: 'Analyzing the inactive relationship between Sales[OrderDate] and Calendar[Date].',
        timestamp: new Date(Date.now() - 3000).toISOString(),
      },
      {
        id: 'step-2',
        stepNumber: 2,
        eventType: 'tool_call',
        content: JSON.stringify({ tool: 'relationship_operations', args: { operation: 'Delete', name: 'Sales[OrderDate] → Calendar[Date]' } }),
        timestamp: new Date(Date.now() - 2000).toISOString(),
      },
      {
        id: 'step-3',
        stepNumber: 3,
        eventType: 'tool_result',
        content: JSON.stringify({ success: true }),
        timestamp: new Date(Date.now() - 1000).toISOString(),
      },
      {
        id: 'step-4',
        stepNumber: 4,
        eventType: 'message',
        content: 'Successfully removed the inactive relationship.',
        timestamp: new Date().toISOString(),
      },
    ],
  },

  fixStreamBody: [
    `data: ${JSON.stringify({ stepNumber: 1, eventType: 'reasoning', content: 'Analyzing finding...' })}\n\n`,
    `data: ${JSON.stringify({ stepNumber: 2, eventType: 'tool_call', content: '{"tool":"relationship_operations"}' })}\n\n`,
    `data: ${JSON.stringify({ stepNumber: 3, eventType: 'tool_result', content: '{"success":true}' })}\n\n`,
    `data: ${JSON.stringify({ stepNumber: 4, eventType: 'message', content: 'Fix applied successfully.' })}\n\n`,
    `data: [DONE]\n\n`,
  ].join(''),

  // ── Rules ──
  rules: [
    {
      id: 'AVOID_INACTIVE_RELATIONSHIPS',
      name: 'Avoid inactive relationships',
      category: 'Error Prevention',
      description: 'Inactive relationships should be removed.',
      severity: 3,
      scope: 'Relationship',
      hasFixExpression: false,
    },
    {
      id: 'NO_SUMMARIZE_BY',
      name: 'Set SummarizeBy to None',
      category: 'Performance',
      description: 'Non-aggregatable columns should have SummarizeBy set to None.',
      severity: 2,
      scope: 'Column',
      hasFixExpression: true,
    },
    {
      id: 'HIDE_FOREIGN_KEYS',
      name: 'Hide foreign keys',
      category: 'Maintenance',
      description: 'Foreign key columns should be hidden.',
      severity: 1,
      scope: 'Column',
      hasFixExpression: true,
    },
  ],

  // ── DAX ──
  daxResult: {
    id: 'dax-query-001-mock',
    query: "EVALUATE 'Sales'",
    status: 'COMPLETED',
    columns: [
      { name: 'Sales[OrderDate]', dataType: 'DateTime' },
      { name: 'Sales[Amount]', dataType: 'Double' },
      { name: 'Sales[ProductKey]', dataType: 'Int64' },
    ],
    rows: [
      { 'Sales[OrderDate]': '2024-01-15', 'Sales[Amount]': 1250.5, 'Sales[ProductKey]': 101 },
      { 'Sales[OrderDate]': '2024-01-16', 'Sales[Amount]': 890.0, 'Sales[ProductKey]': 102 },
      { 'Sales[OrderDate]': '2024-01-17', 'Sales[Amount]': 2100.75, 'Sales[ProductKey]': 103 },
    ],
    rowCount: 3,
    executionTimeMs: 42,
    errorMessage: null,
  },

  daxGenerate: {
    queryId: 'dax-gen-001-mock',
    query: "EVALUATE\nSUMMARIZECOLUMNS(\n  'Calendar'[Year],\n  \"TotalSales\", SUM('Sales'[Amount])\n)",
    explanation: 'This query summarizes total sales by year using the Calendar and Sales tables.',
  },

  daxHistory: {
    queries: [
      {
        id: 'dax-query-001-mock',
        queryText: "EVALUATE 'Sales'",
        naturalLanguage: null,
        status: 'COMPLETED',
        rowCount: 3,
        executionTimeMs: 42,
        errorMessage: null,
        createdAt: new Date(Date.now() - 60000).toISOString(),
      },
      {
        id: 'dax-gen-001-mock',
        queryText: "EVALUATE SUMMARIZECOLUMNS('Calendar'[Year], \"TotalSales\", SUM('Sales'[Amount]))",
        naturalLanguage: 'Show total sales by year',
        status: 'COMPLETED',
        rowCount: 5,
        executionTimeMs: 67,
        errorMessage: null,
        createdAt: new Date(Date.now() - 120000).toISOString(),
      },
    ],
    total: 2,
  },
};

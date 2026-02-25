import prisma from '../models/prisma.js';

export async function listModels() {
  const models = await prisma.semanticModel.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { analysisRuns: true } },
    },
  });

  return models.map((m) => ({
    databaseName: m.databaseName,
    modelName: m.modelName,
    serverAddress: m.serverAddress,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    analysisRunCount: m._count.analysisRuns,
  }));
}

export async function getModel(databaseName: string) {
  return prisma.semanticModel.findUnique({
    where: { databaseName },
    include: {
      analysisRuns: {
        orderBy: { startedAt: 'desc' },
      },
    },
  });
}

export async function getModelRuns(databaseName: string, limit: number, offset: number) {
  const [runs, total] = await Promise.all([
    prisma.analysisRun.findMany({
      where: { modelDatabaseName: databaseName },
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.analysisRun.count({
      where: { modelDatabaseName: databaseName },
    }),
  ]);
  return { runs, total };
}

export async function deleteModel(databaseName: string) {
  return prisma.semanticModel.delete({
    where: { databaseName },
  });
}

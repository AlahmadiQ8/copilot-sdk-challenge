import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MCP client module
const mockConnectToModel = vi.fn();
const mockDisconnectFromModel = vi.fn();
const mockListInstances = vi.fn();
const mockGetConnectionStatus = vi.fn();

vi.mock('../../src/mcp/client.js', () => ({
  connectToModel: (...args: unknown[]) => mockConnectToModel(...args),
  disconnectFromModel: () => mockDisconnectFromModel(),
  listInstances: () => mockListInstances(),
  getConnectionStatus: () => mockGetConnectionStatus(),
}));

const { getInstances, connect, disconnect, getStatus } = await import(
  '../../src/services/connection.service.js'
);

describe('connection.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstances', () => {
    it('returns parsed PBI instances', async () => {
      mockListInstances.mockResolvedValue({
        content: [
          {
            text: JSON.stringify([
              { name: 'Model1', serverAddress: 'localhost:12345', databaseName: 'DB1' },
              { name: 'Model2', serverAddress: 'localhost:12346', databaseName: 'DB2' },
            ]),
          },
        ],
      });

      const result = await getInstances();
      expect(result.instances).toHaveLength(2);
      expect(result.instances[0].name).toBe('Model1');
      expect(result.instances[0].serverAddress).toBe('localhost:12345');
    });

    it('handles empty instances list', async () => {
      mockListInstances.mockResolvedValue({
        content: [{ text: '[]' }],
      });

      const result = await getInstances();
      expect(result.instances).toHaveLength(0);
    });

    it('handles malformed response gracefully', async () => {
      mockListInstances.mockResolvedValue({
        content: [{ text: 'not-json' }],
      });

      const result = await getInstances();
      expect(result.instances).toHaveLength(0);
    });
  });

  describe('connect', () => {
    it('calls MCP connect and returns status', async () => {
      mockConnectToModel.mockResolvedValue(undefined);

      const status = await connect('localhost:12345', 'TestDB');
      expect(mockConnectToModel).toHaveBeenCalledWith('localhost:12345', 'TestDB');
      expect(status.connected).toBe(true);
      expect(status.databaseName).toBe('TestDB');
      expect(status.connectedAt).toBeDefined();
    });
  });

  describe('disconnect', () => {
    it('calls MCP disconnect and returns success', async () => {
      mockDisconnectFromModel.mockResolvedValue(undefined);

      const result = await disconnect();
      expect(mockDisconnectFromModel).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('returns connected status', () => {
      mockGetConnectionStatus.mockReturnValue({
        connected: true,
        serverAddress: 'localhost:12345',
        databaseName: 'TestDB',
        connectedAt: new Date('2026-01-01'),
      });

      const status = getStatus();
      expect(status.connected).toBe(true);
      expect(status.serverAddress).toBe('localhost:12345');
      expect(status.connectedAt).toBeDefined();
    });

    it('returns disconnected status', () => {
      mockGetConnectionStatus.mockReturnValue({ connected: false });

      const status = getStatus();
      expect(status.connected).toBe(false);
      expect(status.serverAddress).toBeUndefined();
    });
  });
});

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  url: string;
  port: number;
  server: Server;
  close(): Promise<void>;
}

export async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  onUpgrade?: (req: IncomingMessage, socket: Duplex) => void
): Promise<TestServer> {
  const server = createServer(handler);
  if (onUpgrade) server.on('upgrade', onUpgrade);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** A port with nothing listening on it (bind, read port, close). */
export async function closedPort(): Promise<number> {
  const s = await startServer(() => undefined);
  const { port } = s;
  await s.close();
  return port;
}

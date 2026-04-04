/**
 * Web shim for @dr.pogodin/react-native-static-server
 *
 * No-op on web — static file serving isn't needed since files
 * can be accessed directly via the browser/Tauri.
 */

class ReactNativeStaticServer {
  port: number | null = null;
  _origin: string = "";
  _fileDir: string = "";

  constructor(_port?: number, _opts?: Record<string, unknown>) {}

  async start(): Promise<string> {
    console.warn("[staticServer.web] start is a no-op on web");
    return "http://localhost:0";
  }

  async stop(): Promise<void> {}

  isRunning(): boolean {
    return false;
  }

  get origin(): string {
    return this._origin;
  }
}

export const STATES = {
  INACTIVE: 0,
  STARTING: 1,
  ACTIVE: 2,
  STOPPING: 3,
};

export default ReactNativeStaticServer;

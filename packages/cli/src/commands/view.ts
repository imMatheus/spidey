import { startViewer } from "../viewServer.js";

export type ViewOptions = {
  jsonPaths: string[];
  port: number;
  open: boolean;
};

export async function runView(opts: ViewOptions): Promise<void> {
  await startViewer(opts);
}

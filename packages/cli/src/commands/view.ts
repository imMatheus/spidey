import { startViewer } from "../viewServer.js";

export type ViewOptions = {
  jsonPath: string;
  port: number;
  open: boolean;
};

export async function runView(opts: ViewOptions): Promise<void> {
  await startViewer(opts);
}

import path from "node:path";
import { readJsonSafe, dirExists, fileExists } from "./util.js";
import type { Framework } from "@spidey/shared";

export type ProjectInfo = {
  root: string;
  name: string;
  framework: Framework;
  pkg: any;
};

export function detectProject(root: string): ProjectInfo {
  const abs = path.resolve(root);
  const pkg = readJsonSafe(path.join(abs, "package.json"));
  if (!pkg) {
    throw new Error(
      `No package.json found at ${abs}. Point spidey at a Vite or Next.js project root.`,
    );
  }

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  const isNext =
    "next" in deps ||
    fileExists(path.join(abs, "next.config.js")) ||
    fileExists(path.join(abs, "next.config.mjs")) ||
    fileExists(path.join(abs, "next.config.ts"));

  const isVite =
    "vite" in deps ||
    fileExists(path.join(abs, "vite.config.ts")) ||
    fileExists(path.join(abs, "vite.config.js"));

  let framework: Framework;
  if (isNext) {
    if (!dirExists(path.join(abs, "app")) && !dirExists(path.join(abs, "src/app"))) {
      throw new Error(
        "This appears to be a Next.js project, but no app/ directory was found. " +
          "Spidey v0 only supports the App Router.",
      );
    }
    framework = "next";
  } else if (isVite) {
    framework = "vite";
  } else {
    throw new Error(
      "Could not detect framework. Spidey supports Vite (with react-router-dom) " +
        "and Next.js App Router projects.",
    );
  }

  return {
    root: abs,
    name: pkg.name ?? path.basename(abs),
    framework,
    pkg,
  };
}

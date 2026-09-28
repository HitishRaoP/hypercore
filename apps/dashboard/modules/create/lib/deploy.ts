"use client";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export const HELLO_WORLD_ENTRYPOINT = "index.ts";

export const HELLO_WORLD_INDEX_TS = `// HyperCore worker entrypoint — TS -> (esbuild) -> JS -> (javy) -> wasm

export function handler(): string {
  return "Hello, World!";
}

// Javy/QuickJS entrypoint: keep a side-effectful root so the
// compiled wasm module prints hello on instantiation.
console.log(handler());
`;

export const HELLO_WORLD_PACKAGE_JSON = `{
  "name": "hypercore-hello-world",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "esbuild index.ts --bundle --format=esm --platform=neutral --outfile=bundle.js"
  },
  "devDependencies": {
    "esbuild": "^0.21.0"
  }
}
`;

export const HELLO_WORLD_BUN_LOCK = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "hypercore-hello-world",
      "dependencies": {}
    }
  },
  "packages": {}
}
`;

export function helloWorldFiles(): File[] {
  return [
    new File([HELLO_WORLD_INDEX_TS], "index.ts", { type: "text/typescript" }),
    new File([HELLO_WORLD_PACKAGE_JSON], "package.json", {
      type: "application/json",
    }),
    new File([HELLO_WORLD_BUN_LOCK], "bun.lock", {
      type: "application/json",
    }),
  ];
}

export async function fetchOnlineAgents(): Promise<string[]> {
  const res = await fetch(`${API_URL}/agents/online`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.online) ? data.online : [];
}

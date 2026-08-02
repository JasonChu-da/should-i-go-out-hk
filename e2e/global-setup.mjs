import { spawn } from "node:child_process";
import { once } from "node:events";

const devPort = process.env.E2E_PORT ?? "3100";
const internalPort = process.env.PWA_INTERNAL_PORT ?? "3201";
const proxyPort = process.env.PWA_PROXY_PORT ?? "3200";
const devOrigin = `http://127.0.0.1:${devPort}`;
const internalOrigin = `http://127.0.0.1:${internalPort}`;
const proxyOrigin = `http://127.0.0.1:${proxyPort}`;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function start(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  return { child, stderr: () => stderr };
}

const isRunning = ({ child }) =>
  child.exitCode === null && child.signalCode === null;

async function waitFor(url, processState, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isRunning(processState)) {
      throw new Error(
        `${label} exited with code ${processState.child.exitCode ?? processState.child.signalCode}.\n${processState.stderr()}`,
      );
    }
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  throw new Error(`${label} did not become ready at ${url}.\n${processState.stderr()}`);
}

async function isReachable(url) {
  try {
    await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(500),
    });
    return true;
  } catch {
    return false;
  }
}

async function stop(processState) {
  if (!processState || !isRunning(processState)) return;
  const exited = once(processState.child, "exit").catch(() => undefined);
  processState.child.kill();
  await Promise.race([exited, delay(3_000)]);
  if (isRunning(processState)) {
    processState.child.kill("SIGKILL");
    await Promise.race([exited, delay(3_000)]);
  }
}

async function setupDevServer() {
  if (process.env.PLAYWRIGHT_BASE_URL) return;
  if (await isReachable(devOrigin)) {
    throw new Error(`E2E requires unused port ${devPort}.`);
  }

  const next = start([
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    devPort,
  ]);
  try {
    await waitFor(devOrigin, next, "Next.js E2E dev server", 120_000);
  } catch (error) {
    await stop(next);
    throw error;
  }
  return () => stop(next);
}

async function setupPwaServers() {
  if (
    (await isReachable(internalOrigin)) ||
    (await isReachable(`${proxyOrigin}/__pwa__/health`))
  ) {
    throw new Error(
      `PWA E2E requires unused ports ${internalPort} and ${proxyPort}.`,
    );
  }

  const next = start([
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    internalPort,
  ]);
  let proxy;

  try {
    await waitFor(internalOrigin, next, "Next.js PWA test server", 120_000);
    proxy = start(["e2e/pwa-test-proxy.mjs"], {
      PWA_PROXY_PORT: proxyPort,
      PWA_TARGET_ORIGIN: internalOrigin,
    });
    await waitFor(
      `${proxyOrigin}/__pwa__/health`,
      proxy,
      "PWA update proxy",
      30_000,
    );
  } catch (error) {
    await stop(proxy);
    await stop(next);
    throw error;
  }

  return async () => {
    await stop(proxy);
    await stop(next);
  };
}

export default function globalSetup(config) {
  return config.projects.some(({ name }) => name === "pwa-chromium")
    ? setupPwaServers()
    : setupDevServer();
}

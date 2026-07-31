import { createServer, request as requestUpstream } from "node:http";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PWA_PROXY_PORT ?? "3200", 10);
const targetOrigin = new URL(
  process.env.PWA_TARGET_ORIGIN ?? "http://127.0.0.1:3201",
);
const defaultVersion = "e2e-v1";
let swVersion = defaultVersion;

function send(res, status, headers, body = "") {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(
    res,
    status,
    { "Content-Type": "application/json; charset=utf-8" },
    JSON.stringify(value),
  );
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 16_384) {
        reject(new Error("Control request is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function upstreamHeaders(req, isWorkerScript) {
  const headers = { ...req.headers, host: targetOrigin.host };
  if (isWorkerScript) {
    delete headers["if-modified-since"];
    delete headers["if-none-match"];
    headers["accept-encoding"] = "identity";
  }
  return headers;
}

function proxy(req, res, isWorkerScript = false) {
  const target = new URL(req.url ?? "/", targetOrigin);
  const upstream = requestUpstream(
    target,
    {
      method: req.method,
      headers: upstreamHeaders(req, isWorkerScript),
    },
    (upstreamResponse) => {
      if (!isWorkerScript) {
        res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(res);
        return;
      }

      const chunks = [];
      upstreamResponse.on("data", (chunk) => chunks.push(chunk));
      upstreamResponse.on("end", () => {
        const source = Buffer.concat(chunks).toString("utf8");
        const versionDeclaration =
          /(\b(?:const|let|var)\s+CACHE_VERSION\s*=\s*)(["'`])[^"'`]+\2/;

        if (!versionDeclaration.test(source)) {
          sendJson(res, 500, {
            error: "public/sw.js does not expose a replaceable CACHE_VERSION",
          });
          return;
        }

        const body = source.replace(
          versionDeclaration,
          (_match, declaration) => `${declaration}"${swVersion}"`,
        );
        const headers = { ...upstreamResponse.headers };
        delete headers["content-encoding"];
        delete headers["content-length"];
        delete headers.etag;
        delete headers["last-modified"];
        headers["x-pwa-test-sw-version"] = swVersion;
        res.writeHead(upstreamResponse.statusCode ?? 200, headers);
        res.end(body);
      });
    },
  );

  upstream.on("error", (error) => {
    if (!res.headersSent) {
      sendJson(res, 502, { error: error.message });
      return;
    }
    res.destroy(error);
  });
  req.pipe(upstream);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${host}:${port}`);

  if (url.pathname === "/__pwa__/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/__pwa__/blank") {
    send(
      res,
      200,
      { "Content-Type": "text/html; charset=utf-8" },
      "<!doctype html><html lang=\"zh-Hant-HK\"><title>PWA reset</title></html>",
    );
    return;
  }

  if (url.pathname === "/__pwa__/control") {
    if (req.method === "GET") {
      sendJson(res, 200, { swVersion });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = await readJson(req);
      const requestedVersion = body.reset
        ? defaultVersion
        : body.swVersion ?? swVersion;
      if (
        typeof requestedVersion !== "string" ||
        !/^[a-z0-9._-]+$/i.test(requestedVersion)
      ) {
        sendJson(res, 400, { error: "Invalid service worker version" });
        return;
      }
      swVersion = requestedVersion;
      sendJson(res, 200, { swVersion });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : "Invalid JSON",
      });
    }
    return;
  }

  proxy(req, res, url.pathname === "/sw.js");
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => process.exit(0));
}

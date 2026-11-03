import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadArchive } from "./scripts/archive-model.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const PORT = Number(process.env.PORT || 4173);
const WATCHED_DATA_FILES = [
  join(DATA_DIR, "archive-posts.json"),
  join(DATA_DIR, "external-context.json"),
  join(DATA_DIR, "live-posts.json"),
];
const eventClients = new Set();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function archiveSignature() {
  const entries = await Promise.all(
    WATCHED_DATA_FILES.map(async (path) => {
      try {
        const fileStat = await stat(path);
        return `${path}:${fileStat.mtimeMs}:${fileStat.size}`;
      } catch {
        return `${path}:missing`;
      }
    }),
  );
  return entries.join("|");
}

function sendEvent(client, event) {
  client.response.write(`data: ${JSON.stringify(event)}\n\n`);
}

setInterval(async () => {
  try {
    const signature = await archiveSignature();
    for (const client of eventClients) {
      if (client.signature === null) {
        client.signature = signature;
        continue;
      }
      if (client.signature !== signature) {
        client.signature = signature;
        sendEvent(client, {
          type: "archive-updated",
          at: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error("实时事件检查失败：", error.message);
  }
}, 1_000);

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function serveStatic(response, pathname) {
  const requestedPath =
    pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = resolve(PUBLIC_DIR, requestedPath);
  const publicPrefix = `${PUBLIC_DIR}/`;

  if (!filePath.startsWith(publicPrefix)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/archive") {
      sendJson(response, 200, await loadArchive());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      response.write("retry: 3000\n\n");
      const client = { response, signature: null };
      eventClients.add(client);
      request.on("close", () => {
        eventClients.delete(client);
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`段永平内容档案已启动：http://127.0.0.1:${PORT}`);
});

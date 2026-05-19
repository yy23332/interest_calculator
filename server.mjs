import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { parseLpr, fetchText, SOURCES } from "./scripts/fetch-data.mjs";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.resolve("public");
const DATA_PATH = path.join(PUBLIC_DIR, "data/interest-rates.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

async function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function refreshLpr(response) {
  try {
    const current = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
    const html = await fetchText(SOURCES.lpr);
    const nextLpr = parseLpr(html);

    if (!nextLpr.length) {
      throw new Error("没有解析到新的 LPR 表格");
    }

    const previousLatest = current.lpr.at(-1)?.date ?? null;
    const nextLatest = nextLpr.at(-1)?.date ?? null;
    const updated = {
      ...current,
      generatedAt: new Date().toISOString(),
      lpr: nextLpr
    };

    await fs.writeFile(DATA_PATH, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

    await sendJson(response, 200, {
      ok: true,
      hasNewData: previousLatest !== nextLatest,
      previousLatest,
      latest: nextLatest,
      count: nextLpr.length,
      dataset: updated
    });
  } catch (error) {
    await sendJson(response, 500, {
      ok: false,
      message: error.message
    });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const safePath = path
    .normalize(decodeURIComponent(url.pathname))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    const finalPath = stat.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const ext = path.extname(finalPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(await fs.readFile(finalPath));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/refresh-lpr") {
    await refreshLpr(response);
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405);
    response.end("Method Not Allowed");
    return;
  }

  await serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`利率数据网页已启动: http://${HOST}:${PORT}`);
});

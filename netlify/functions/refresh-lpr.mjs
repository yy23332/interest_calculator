import fs from "node:fs/promises";
import path from "node:path";
import { buildDataset } from "../../scripts/fetch-data.mjs";

async function readExistingDataset() {
  const file = path.resolve("public/data/interest-rates.json");
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: false, message: "仅支持 POST 请求" })
    };
  }

  try {
    const [previous, dataset] = await Promise.all([readExistingDataset(), buildDataset()]);
    const previousLatest = previous.lpr.at(-1)?.date ?? "";
    const latest = dataset.lpr.at(-1)?.date ?? "";

    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        ok: true,
        dataset,
        previousLatest,
        latest,
        hasNewData: latest > previousLatest
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : "刷新失败"
      })
    };
  }
}

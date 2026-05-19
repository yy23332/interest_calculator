import { buildDataset } from "../../scripts/fetch-data.mjs";

async function readExistingDataset(event) {
  const host = event.headers.host;
  const protocol = host?.includes("localhost") ? "http" : "https";
  const response = await fetch(`${protocol}://${host}/data/interest-rates.json`, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`无法读取已发布的数据文件：${response.status}`);
  }

  return response.json();
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
    const [previous, dataset] = await Promise.all([readExistingDataset(event), buildDataset()]);
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

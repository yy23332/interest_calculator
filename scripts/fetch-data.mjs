import fs from "node:fs/promises";
import path from "node:path";

export const SOURCES = {
  lpr: "https://www.bankofchina.com/fimarkets/lilv/fd32/201310/t20131031_2591219.html",
  benchmark: "https://camlmac.pbc.gov.cn/zhengcehuobisi/125207/125213/125440/125838/125888/2968985/index.html"
};

const OUTPUT_PATH = path.resolve("public/data/interest-rates.json");

function decodeHtml(buffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if ((utf8.match(/\uFFFD/g) || []).length < 5) return utf8;
  return new TextDecoder("gb18030").decode(buffer);
}

export async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 interest-rate-dashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}: ${url}`);
  }

  return decodeHtml(await response.arrayBuffer());
}

function cleanCell(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRows(html) {
  const rows = [];
  const rowMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const rowHtml of rowMatches) {
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let match;

    while ((match = cellRegex.exec(rowHtml))) {
      const cell = cleanCell(match[1]);
      if (cell) cells.push(cell);
    }

    if (cells.length) rows.push(cells);
  }

  return rows;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  return value.replace(/\./g, "-");
}

export function parseLpr(html) {
  return extractRows(html)
    .filter((cells) => /^\d{4}-\d{2}-\d{2}$/.test(cells[0]) && cells.length >= 3)
    .map(([date, oneYear, fiveYearPlus]) => ({
      date,
      oneYear: toNumber(oneYear),
      fiveYearPlus: toNumber(fiveYearPlus)
    }))
    .filter((row) => row.oneYear != null && row.fiveYearPlus != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function parseBenchmark(html) {
  return extractRows(html)
    .filter((cells) => /^\d{4}\.\d{2}\.\d{2}/.test(cells[0]))
    .map((cells) => {
      const date = normalizeDate(cells[0].slice(0, 10));
      const rates = cells.slice(1).map(toNumber).filter((rate) => rate != null);

      if (rates.length >= 5) {
        return {
          date,
          withinSixMonths: rates[0],
          sixMonthsToOneYear: rates[1],
          oneToThreeYears: rates[2],
          threeToFiveYears: rates[3],
          fiveYearPlus: rates[4]
        };
      }

      if (rates.length >= 3) {
        return {
          date,
          withinSixMonths: rates[0],
          sixMonthsToOneYear: rates[0],
          oneToThreeYears: rates[1],
          threeToFiveYears: rates[1],
          fiveYearPlus: rates[2]
        };
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function buildDataset() {
  const [lprHtml, benchmarkHtml] = await Promise.all([
    fetchText(SOURCES.lpr),
    fetchText(SOURCES.benchmark)
  ]);

  const lpr = parseLpr(lprHtml);
  const benchmark = parseBenchmark(benchmarkHtml);

  if (!lpr.length) throw new Error("未解析到 LPR 数据");
  if (!benchmark.length) throw new Error("未解析到贷款基准利率数据");

  return {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    lpr,
    benchmark
  };
}

export async function writeDataset(outputPath = OUTPUT_PATH) {
  const dataset = await buildDataset();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  return dataset;
}

if (process.argv[1]?.endsWith("fetch-data.mjs")) {
  writeDataset()
    .then((dataset) => {
      console.log(
        `已写入 ${OUTPUT_PATH}: LPR ${dataset.lpr.length} 条，贷款基准利率 ${dataset.benchmark.length} 条`
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

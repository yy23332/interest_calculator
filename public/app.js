const COLORS = {
  lprOneYear: "#c43d3d",
  lprFiveYear: "#1f8a8a",
  benchmarkWithinSix: "#4d7f37",
  benchmarkSixToOne: "#a87416",
  benchmarkOneToThree: "#7b5bbd",
  benchmarkThreeToFive: "#d06f35",
  benchmarkFiveYear: "#2f64b3"
};

const LPR_SERIES = [
  { key: "lprOneYear", label: "LPR 1年期", color: COLORS.lprOneYear },
  { key: "lprFiveYear", label: "LPR 5年期以上", color: COLORS.lprFiveYear }
];

const BENCHMARK_SERIES = [
  { key: "benchmarkWithinSix", label: "6个月内", color: COLORS.benchmarkWithinSix },
  { key: "benchmarkSixToOne", label: "基准 6个月至1年", color: COLORS.benchmarkSixToOne },
  { key: "benchmarkOneToThree", label: "1至3年", color: COLORS.benchmarkOneToThree },
  { key: "benchmarkThreeToFive", label: "3至5年", color: COLORS.benchmarkThreeToFive },
  { key: "benchmarkFiveYear", label: "基准 5年以上", color: COLORS.benchmarkFiveYear }
];

const $ = (selector) => document.querySelector(selector);
let activeDataset = null;
let latestSegments = [];

function pct(value) {
  return `${Number(value).toFixed(2)}%`;
}

function money(value) {
  return `${Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}元`;
}

function formatMonth(time) {
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseCompactDate(value) {
  if (!/^\d{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateTime(date) {
  return new Date(formatDate(date)).getTime();
}

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function numericValue(selector, fallback = 0) {
  const value = Number($(selector).value);
  return Number.isFinite(value) ? value : fallback;
}

function selectedRateValue(selector) {
  const value = Number($(selector).value);
  return Number.isFinite(value) ? value : NaN;
}

function applyDateMode(start, end, mode) {
  let actualStart = new Date(start);
  let actualEnd = new Date(end);

  if (mode === "end" || mode === "neither") actualStart = addDays(actualStart, 1);
  if (mode === "start" || mode === "neither") actualEnd = addDays(actualEnd, -1);

  return { actualStart, actualEnd };
}

function findRateRow(rows, date) {
  const target = dateTime(date);
  return rows
    .filter((row) => dateTime(new Date(`${row.date}T00:00:00`)) <= target)

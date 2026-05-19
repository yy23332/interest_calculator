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
    .at(-1);
}

function getRateForDate(dataset, type, date, options) {
  if (type === "benchmark") {
    if (options.benchmarkMode === "fixed") return options.benchmarkFixedRate;
    const row = findRateRow(dataset.benchmark, date);
    return row?.[options.benchmarkTerm] ?? NaN;
  }

  if (options.lprMode === "fixed") return options.lprFixedRate;
  const row = findRateRow(dataset.lpr, date);
  return row?.[options.lprTerm] ?? NaN;
}

function adjustedRate(baseRate, type, options) {
  if (type === "agreed") return baseRate;

  if (type === "benchmark") {
    return baseRate * (1 + options.benchmarkFloat / 100);
  }

  return (baseRate + options.lprBp / 100) * (1 + options.lprFloat / 100);
}

function collectBoundaryDates(dataset, start, end) {
  const rateType = $("#rateTypeSelect").value;
  const reformDate = new Date("2019-08-20T00:00:00");
  const startTime = dateTime(start);
  const endTime = dateTime(end);
  const boundaries = [];

  if (rateType === "auto" && dateTime(reformDate) > startTime && dateTime(reformDate) <= endTime) {
    boundaries.push(reformDate);
  }

  if (rateType === "auto" || rateType === "benchmark") {
    for (const row of dataset.benchmark) {
      const date = new Date(`${row.date}T00:00:00`);
      const inBenchmarkWindow = rateType === "benchmark" || dateTime(date) < dateTime(reformDate);
      if (dateTime(date) > startTime && dateTime(date) <= endTime && inBenchmarkWindow) {
        boundaries.push(date);
      }
    }
  }

  if (rateType === "auto" || rateType === "lpr") {
    for (const row of dataset.lpr) {
      const date = new Date(`${row.date}T00:00:00`);
      const inLprWindow = rateType === "lpr" || dateTime(date) >= dateTime(reformDate);
      if (dateTime(date) > startTime && dateTime(date) <= endTime && inLprWindow) {
        boundaries.push(date);
      }
    }
  }

  return [...new Map(boundaries.map((date) => [formatDate(date), date])).values()].sort((a, b) => dateTime(a) - dateTime(b));
}

function calculateSegments(dataset) {
  const principal = numericValue("#principalInput", NaN);
  const start = parseCompactDate($("#startDateInput").value.trim());
  const end = parseCompactDate($("#endDateInput").value.trim());

  if (!Number.isFinite(principal) || principal <= 0) throw new Error("请输入大于 0 的计算基数");
  if (!start || !end) throw new Error("请输入八位数日期，例如 20260512");
  if (dateTime(start) > dateTime(end)) throw new Error("开始日期不能晚于截止日期");

  const options = {
    rateType: $("#rateTypeSelect").value,
    dateMode: selectedValue("dateMode"),
    yearBasis: Number(selectedValue("yearBasis")),
    benchmarkMode: selectedValue("benchmarkMode"),
    benchmarkTerm: selectedValue("benchmarkTerm"),
    benchmarkFixedRate: selectedRateValue("#benchmarkFixedSelect"),
    benchmarkFloatMode: selectedValue("benchmarkFloatMode"),
    benchmarkFloat: selectedValue("benchmarkFloatMode") === "use" ? numericValue("#benchmarkFloatInput", 0) : 0,
    lprMode: selectedValue("lprMode"),
    lprTerm: selectedValue("lprTerm"),
    lprFixedRate: selectedRateValue("#lprFixedSelect"),
    lprBpMode: selectedValue("lprBpMode"),
    lprBp: selectedValue("lprBpMode") === "use" ? numericValue("#lprBpInput", 0) : 0,
    lprFloatMode: selectedValue("lprFloatMode"),
    lprFloat: selectedValue("lprFloatMode") === "use" ? numericValue("#lprFloatInput", 0) : 0,
    agreedRate: numericValue("#agreedRateInput", NaN)
  };

  if ((options.rateType === "benchmark" || options.rateType === "auto") && options.benchmarkMode === "fixed" && !Number.isFinite(options.benchmarkFixedRate)) {
    throw new Error("选择指定贷款基准利率时，必须选择历史利率发布日期");
  }

  if ((options.rateType === "lpr" || options.rateType === "auto") && options.lprMode === "fixed" && !Number.isFinite(options.lprFixedRate)) {
    throw new Error("选择指定LPR时，必须选择历史利率发布日期");
  }

  if (options.rateType === "agreed" && !Number.isFinite(options.agreedRate)) {
    throw new Error("选择约定利率时，必须输入年利率");
  }

  const { actualStart, actualEnd } = applyDateMode(start, end, options.dateMode);
  if (dateTime(actualStart) > dateTime(actualEnd)) throw new Error("按当前起止日期选项调整后，没有可计息天数");

  const reformTime = dateTime(new Date("2019-08-20T00:00:00"));
  const boundaries = collectBoundaryDates(dataset, actualStart, actualEnd);
  const segments = [];
  let cursor = actualStart;

  for (const boundary of [...boundaries, addDays(actualEnd, 1)]) {
    const periodEnd = addDays(boundary, -1);
    const type =
      options.rateType === "auto"
        ? dateTime(cursor) < reformTime
          ? "benchmark"
          : "lpr"
        : options.rateType;
    const baseRate = type === "agreed" ? options.agreedRate : getRateForDate(dataset, type, cursor, options);

    if (!Number.isFinite(baseRate)) {
      if (type === "benchmark") throw new Error("未找到该日期对应的贷款基准利率");
      if (type === "lpr") throw new Error("未找到该日期对应的 LPR");
      throw new Error("请输入有效的约定年利率");
    }

    const annualRate = adjustedRate(baseRate, type, options);
    const days = Math.round((dateTime(boundary) - dateTime(cursor)) / 86400000);
    const baseDailyRate = baseRate / 100 / options.yearBasis;
    const dailyRate = annualRate / 100 / options.yearBasis;
    const baseInterest = principal * baseDailyRate * days;
    const interest = principal * dailyRate * days;

    segments.push({
      type,
      start: formatDate(cursor),
      end: formatDate(periodEnd),
      days,
      baseRate,
      annualRate,
      baseDailyRate,
      dailyRate,
      principal,
      baseInterest,
      interest
    });

    cursor = boundary;
  }

  return {
    principal,
    interest: segments.reduce((sum, row) => sum + row.interest, 0),
    segments
  };
}

function renderCalculation(result) {
  latestSegments = result.segments;
  $("#principalResult").textContent = money(result.principal);
  $("#interestResult").textContent = money(result.interest);
  $("#totalResult").textContent = money(result.principal + result.interest);

  $("#segmentTable").innerHTML = result.segments
    .map(
      (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${row.type === "benchmark" ? "贷款基准利率" : row.type === "lpr" ? "LPR" : "约定利率"}</td>
          <td>${row.start}</td>
          <td>${row.end}</td>
          <td>${row.days}</td>
          <td>${pct(row.annualRate)}</td>
          <td>${(row.dailyRate * 100).toFixed(8)}%</td>
          <td>${money(row.principal)}</td>
          <td>${money(row.baseInterest)}</td>
          <td>${money(row.interest)}</td>
        </tr>
      `
    )
    .join("");
}

function resetCalculation() {
  latestSegments = [];
  $("#principalResult").textContent = "--元";
  $("#interestResult").textContent = "--元";
  $("#totalResult").textContent = "--元";
  $("#calcMessage").textContent = "";
  $("#segmentTable").innerHTML = '<tr><td colspan="10" class="empty-cell">请输入条件后点击计算</td></tr>';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadSegmentExcel() {
  if (!latestSegments.length) {
    $("#calcMessage").textContent = "请先计算，再下载分段计息明细";
    return;
  }

  const headers = ["序号", "利率类型", "开始日期", "截止日期", "天数", "年利率", "日利率", "本金", "加计前利息", "加计后利息"];
  const rows = latestSegments.map((row, index) => [
    index + 1,
    row.type === "benchmark" ? "贷款基准利率" : row.type === "lpr" ? "LPR" : "约定利率",
    row.start,
    row.end,
    row.days,
    `${row.annualRate.toFixed(6)}%`,
    `${(row.dailyRate * 100).toFixed(10)}%`,
    row.principal.toFixed(2),
    row.baseInterest.toFixed(2),
    row.interest.toFixed(2)
  ]);
  const table = [headers, ...rows]
    .map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${table}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `分段计息明细_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function syncRateOptionCards() {
  const rateType = $("#rateTypeSelect").value;
  document.querySelectorAll(".rate-option-card").forEach((card) => {
    const cardType = card.dataset.rateCard;
    card.hidden =
      (rateType === "auto" && cardType === "agreed") ||
      (rateType === "benchmark" && cardType !== "benchmark") ||
      (rateType === "lpr" && cardType !== "lpr") ||
      (rateType === "agreed" && cardType !== "agreed");
  });
}

function syncConditionalInputs() {
  $("#benchmarkFixedRow").hidden = selectedValue("benchmarkMode") !== "fixed";
  $("#lprFixedRow").hidden = selectedValue("lprMode") !== "fixed";
  $("#benchmarkFloatInput").closest(".input-unit").hidden = selectedValue("benchmarkFloatMode") !== "use";
  $("#lprBpInput").closest(".input-unit").hidden = selectedValue("lprBpMode") !== "use";
  $("#lprFloatInput").closest(".input-unit").hidden = selectedValue("lprFloatMode") !== "use";
}

function disableNumberStepping() {
  const form = $("#interestCalculator");

  form.addEventListener(
    "wheel",
    (event) => {
      if (event.target.matches("input[type='number']")) {
        event.preventDefault();
      }
    },
    { passive: false, capture: true }
  );

  form.addEventListener("keydown", (event) => {
    if (event.target.matches("input[type='number']") && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
    }
  });
}

function renderSummary(dataset) {
  const latest = dataset.lpr.at(-1);
  $("#latestDate").textContent = latest.date;
  $("#latestOneYear").textContent = pct(latest.oneYear);
  $("#latestFiveYear").textContent = pct(latest.fiveYearPlus);

  const latestBenchmark = dataset.benchmark.at(-1);
  $("#latestBenchmarkDate").textContent = latestBenchmark.date;
  $("#latestBenchmarkWithinOneYear").textContent = pct(latestBenchmark.sixMonthsToOneYear);
  $("#latestBenchmarkOneToFiveYears").textContent = pct(latestBenchmark.threeToFiveYears);
  $("#latestBenchmarkFiveYear").textContent = pct(latestBenchmark.fiveYearPlus);
}

function renderTables(dataset) {
  $("#lprTable").innerHTML = dataset.lpr
    .slice()
    .reverse()
    .map(
      (row) => `
        <tr>
          <td>${row.date}</td>
          <td>${pct(row.oneYear)}</td>
          <td>${pct(row.fiveYearPlus)}</td>
        </tr>
      `
    )
    .join("");

  $("#benchmarkTable").innerHTML = dataset.benchmark
    .slice()
    .reverse()
    .map(
      (row) => `
        <tr>
          <td>${row.date}</td>
          <td>${pct(row.withinSixMonths)}</td>
          <td>${pct(row.sixMonthsToOneYear)}</td>
          <td>${pct(row.oneToThreeYears)}</td>
          <td>${pct(row.threeToFiveYears)}</td>
          <td>${pct(row.fiveYearPlus)}</td>
        </tr>
      `
    )
    .join("");
}

function populateRateSelects(dataset) {
  const benchmarkTerm = selectedValue("benchmarkTerm") || "fiveYearPlus";
  $("#benchmarkFixedSelect").innerHTML = dataset.benchmark
    .slice()
    .reverse()
    .map((row) => {
      const rate = row[benchmarkTerm];
      return `<option value="${rate}">${row.date} - ${pct(rate)}</option>`;
    })
    .join("");

  const lprTerm = selectedValue("lprTerm") || "fiveYearPlus";
  $("#lprFixedSelect").innerHTML = dataset.lpr
    .slice()
    .reverse()
    .map((row) => {
      const rate = row[lprTerm];
      return `<option value="${rate}">${row.date} - ${pct(rate)}</option>`;
    })
    .join("");
}

function buildLprChartRows(dataset) {
  return [
    ...dataset.lpr.flatMap((row) => [
      { date: row.date, value: row.oneYear, series: "lprOneYear" },
      { date: row.date, value: row.fiveYearPlus, series: "lprFiveYear" }
    ])
  ].map((row) => ({ ...row, time: new Date(`${row.date}T00:00:00`).getTime() }));
}

function buildBenchmarkChartRows(dataset) {
  return [
    ...dataset.benchmark.flatMap((row) => [
      { date: row.date, value: row.withinSixMonths, series: "benchmarkWithinSix" },
      { date: row.date, value: row.sixMonthsToOneYear, series: "benchmarkSixToOne" },
      { date: row.date, value: row.oneToThreeYears, series: "benchmarkOneToThree" },
      { date: row.date, value: row.threeToFiveYears, series: "benchmarkThreeToFive" },
      { date: row.date, value: row.fiveYearPlus, series: "benchmarkFiveYear" }
    ])
  ].map((row) => ({ ...row, time: new Date(`${row.date}T00:00:00`).getTime() }));
}

function renderLegend(selector, seriesList) {
  $(selector).innerHTML = seriesList.map(
    (series) => `<span><i style="background:${series.color}"></i>${series.label}</span>`
  ).join("");
}

function renderChart(targetSelector, rows, seriesList, monthStep) {
  const width = 1240;
  const height = 440;
  const margin = { top: 22, right: 52, bottom: 64, left: 58 };
  const minTime = Math.min(...rows.map((row) => row.time));
  const maxTime = Math.max(...rows.map((row) => row.time));
  const minValue = 0;
  const maxValue = Math.ceil(Math.max(...rows.map((row) => row.value)));
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const x = (time) => margin.left + ((time - minTime) / (maxTime - minTime)) * plotWidth;
  const y = (value) => margin.top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;

  const monthTicks = [];
  const start = new Date(minTime);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = new Date(maxTime);
  while (cursor.getTime() <= maxTime) {
    monthTicks.push(cursor.getTime());
    cursor.setMonth(cursor.getMonth() + monthStep);
  }
  if (!monthTicks.includes(maxTime)) monthTicks.push(maxTime);

  const valueTicks = [];
  for (let value = minValue; value <= maxValue; value += 1) valueTicks.push(value);

  const paths = seriesList.map((series) => {
    const seriesRows = rows
      .filter((row) => row.series === series.key)
      .sort((a, b) => a.time - b.time);
    const points = seriesRows.map((row) => `${x(row.time).toFixed(1)},${y(row.value).toFixed(1)}`);
    return `
      <polyline points="${points.join(" ")}" fill="none" stroke="${series.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" pointer-events="none" />
    `;
  }).join("");

  const hitTargets = rows
    .map((row) => {
      const series = seriesList.find((item) => item.key === row.series);
      return `
        <circle class="hover-point" cx="${x(row.time).toFixed(1)}" cy="${y(row.value).toFixed(1)}" r="10">
          <title>${row.date} ${series.label}: ${pct(row.value)}</title>
        </circle>
      `;
    })
    .join("");

  const grid = valueTicks
    .map(
      (value) => `
        <line x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}" stroke="#e7ecf3" />
        <text class="axis" x="${margin.left - 12}" y="${y(value) + 4}" text-anchor="end">${value}%</text>
      `
    )
    .join("");

  const xTicks = monthTicks
    .map((time) => {
      return `
        <line x1="${x(time)}" x2="${x(time)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="#eef2f7" />
        <text class="axis month-axis" x="${x(time)}" y="${height - 22}" text-anchor="end" transform="rotate(-38 ${x(time)} ${height - 22})">${formatMonth(time)}</text>
      `;
    })
    .join("");

  $(targetSelector).innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#fff" />
      ${grid}
      ${xTicks}
      <line x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}" stroke="#9aa6b7" />
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="#9aa6b7" />
      ${paths}
      ${hitTargets}
    </svg>
  `;
}

function render(dataset) {
  activeDataset = dataset;
  renderSummary(dataset);
  populateRateSelects(dataset);
  syncConditionalInputs();
  renderLegend("#lprLegend", LPR_SERIES);
  renderLegend("#benchmarkLegend", BENCHMARK_SERIES);
  renderChart("#lprChart", buildLprChartRows(dataset), LPR_SERIES, 3);
  renderChart("#benchmarkChart", buildBenchmarkChartRows(dataset), BENCHMARK_SERIES, 12);
  renderTables(dataset);
  $("#status").textContent = `本地数据生成时间：${new Date(dataset.generatedAt).toLocaleString("zh-CN")}`;
}

async function loadDataset() {
  const response = await fetch("./data/interest-rates.json", { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取本地数据文件");
  return response.json();
}

async function refreshLpr() {
  const button = $("#refreshLpr");
  button.disabled = true;
  $("#status").textContent = "正在重新访问 LPR 来源页面...";

  try {
    const response = await fetch("/api/refresh-lpr", { method: "POST" });
    if (!response.ok) {
      throw new Error("当前部署没有启用刷新接口。拖拽 public 文件夹到 Netlify 只能发布静态网页，不能使用在线刷新 LPR。");
    }

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error("刷新接口没有返回有效数据。请使用 GitHub 连接 Netlify 部署整个项目，或先在本地更新数据后重新上传 public 文件夹。");
    }

    if (!result.ok) throw new Error(result.message || "刷新失败");

    render(result.dataset);
    $("#status").textContent = result.hasNewData
      ? `发现新数据：最新日期已从 ${result.previousLatest} 更新为 ${result.latest}。`
      : `已检查，暂无新 LPR 数据。当前最新日期：${result.latest}。`;
  } catch (error) {
    $("#status").textContent = `刷新失败：${error.message}`;
  } finally {
    button.disabled = false;
  }
}

$("#refreshLpr").addEventListener("click", refreshLpr);
$("#downloadSegments").addEventListener("click", downloadSegmentExcel);
document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.hidden = true;
      panel.classList.remove("active");
    });

    button.classList.add("active");
    const panel = $(`#${button.dataset.tabTarget}`);
    panel.hidden = false;
    panel.classList.add("active");
  });
});
$("#principalInput").classList.add("no-spinner");
disableNumberStepping();
$("#rateTypeSelect").addEventListener("change", () => {
  syncRateOptionCards();
  resetCalculation();
});

document.querySelectorAll("input[name='benchmarkTerm']").forEach((input) => {
  input.addEventListener("change", () => {
    if (activeDataset) populateRateSelects(activeDataset);
  });
});

document.querySelectorAll("input[name='lprTerm']").forEach((input) => {
  input.addEventListener("change", () => {
    if (activeDataset) populateRateSelects(activeDataset);
  });
});

document.querySelectorAll("input[name='benchmarkMode'], input[name='lprMode'], input[name='benchmarkFloatMode'], input[name='lprBpMode'], input[name='lprFloatMode']").forEach((input) => {
  input.addEventListener("change", syncConditionalInputs);
});

$("#interestCalculator").addEventListener("submit", (event) => {
  event.preventDefault();
  $("#calcMessage").textContent = "";

  try {
    renderCalculation(calculateSegments(activeDataset));
  } catch (error) {
    $("#calcMessage").textContent = error.message;
  }
});

$("#interestCalculator").addEventListener("reset", () => {
  window.setTimeout(resetCalculation, 0);
});

loadDataset()
  .then(render)
  .catch((error) => {
    $("#status").textContent = error.message;
  });

syncRateOptionCards();
syncConditionalInputs();

const DATA_URL = "./data_copernicus_sample.json";
const heatToggle = document.querySelector("#heat-toggle");
const tableBody = document.querySelector("#pass-table-body");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const dateFromFilter = document.querySelector("#filter-date-from");
const dateToFilter = document.querySelector("#filter-date-to");
const islandFilter = document.querySelector("#filter-island");
const platformFilter = document.querySelector("#filter-platform");
const resetFilters = document.querySelector("#reset-filters");
const trendEmptyState = document.querySelector("#trend-empty-state");
const chartSelection = document.querySelector("#chart-selection");
const chartReset = document.querySelector("#chart-reset");
const chartSeriesFilter = document.querySelector("#chart-series");
const chartAggregationFilter = document.querySelector("#chart-aggregation");
const selectionSummary = document.querySelector("#selection-summary");
const monthlyNote = document.querySelector("#monthly-note");
const chartLegend = document.querySelector("#chart-legend");
const markerLegend = document.querySelector("#marker-legend");
const cloudLegendEntry = document.querySelector("#cloud-legend-entry");
const suitabilityLegendEntry = document.querySelector("#suitability-legend-entry");

const map = L.map("map", { scrollWheelZoom: false, zoomControl: true }).setView([-0.8, -90.7], 7);
const mapContainer = map.getContainer();
mapContainer.addEventListener("click", () => map.scrollWheelZoom.enable());
document.addEventListener("click", event => {
  if (!(event.target instanceof Node) || !mapContainer.contains(event.target)) {
    map.scrollWheelZoom.disable();
  }
});
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
let heatLayer = null;
let heatLegend = null;
let chart = null;
let allPasses = [];
let selectedPass = null;
let filteredPasses = [];

const formatDate = date => new Intl.DateTimeFormat("es-EC", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
}).format(new Date(`${date}T00:00:00Z`));
const formatMonth = month => new Intl.DateTimeFormat("es-EC", {
  month: "short", year: "numeric", timeZone: "UTC"
}).format(new Date(`${month}-01T00:00:00Z`));
const dateToTimestamp = date => Date.parse(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`);
const timestampToDate = timestamp => new Date(Number(timestamp)).toISOString().slice(0, 10);
const average = (passes, key) => passes.length
  ? passes.reduce((sum, pass) => sum + pass[key], 0) / passes.length
  : null;

function renderKpis(passes) {
  document.querySelector("#kpi-passes").textContent = passes.length;
  const passesCoverage = allPasses.length ? passes.length / allPasses.length : 0;
  const passesProgress = document.querySelector("#kpi-passes-progress");
  passesProgress.style.width = `${passesCoverage * 100}%`;
  passesProgress.parentElement.setAttribute("aria-valuenow", Math.round(passesCoverage * 100));
  document.querySelector("#kpi-passes-foot").textContent =
    `${new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 }).format(passesCoverage * 100)} % del total`;
  selectionSummary.textContent = `${passes.length} de ${allPasses.length} pasadas seleccionadas`;

  const metrics = [
    { selector: "#kpi-cloud", key: "nubosidad_pct", suffix: "%", sparklineSelector: "#kpi-cloud-sparkline", label: "nubosidad" },
    { selector: "#kpi-suitability", key: "aptitud_pct", suffix: "%", sparklineSelector: "#kpi-suitability-sparkline", label: "aptitud" },
    { selector: "#kpi-index", key: "indice_acumulacion", suffix: "/100", sparklineSelector: "#kpi-index-sparkline", label: "índice simulado" }
  ];

  for (const metric of metrics) {
    const value = average(passes, metric.key);
    renderKpiSparkline(metric.sparklineSelector, passes, metric.key, metric.label);
    const element = document.querySelector(metric.selector);
    if (value === null) {
      element.textContent = "Sin datos para esta selección";
      element.classList.add("kpi-empty-value");
      continue;
    }
    element.classList.remove("kpi-empty-value");
    element.innerHTML = `${Math.round(value)}<small>${metric.suffix}</small>`;
  }
}

function renderKpiSparkline(selector, passes, key, label) {
  const sparkline = document.querySelector(selector);
  const line = sparkline.querySelector("polyline");
  const point = sparkline.querySelector("circle");
  const values = passes
    .slice()
    .sort((first, second) => first.fecha.localeCompare(second.fecha))
    .map(pass => pass[key]);

  sparkline.setAttribute("aria-label", `Tendencia de ${label} en ${values.length} ${values.length === 1 ? "pasada" : "pasadas"} filtradas`);
  if (!values.length) {
    line.setAttribute("points", "");
    point.setAttribute("visibility", "hidden");
    return;
  }

  const coordinates = values.map((value, index) => {
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 24 - (value / 100) * 20;
    return [x, y];
  });
  line.setAttribute("points", coordinates.map(([x, y]) => `${x},${y}`).join(" "));
  const [lastX, lastY] = coordinates.at(-1);
  point.setAttribute("cx", lastX);
  point.setAttribute("cy", lastY);
  point.setAttribute("visibility", "visible");
}

function initializeChart() {
  const context = document.querySelector("#trend-chart");
  chart = new Chart(context, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Nubosidad", data: [], borderColor: "#e18268", backgroundColor: "#e18268", tension: 0.32, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 },
        { label: "Aptitud", data: [], borderColor: "#167c65", backgroundColor: "#167c65", tension: 0.32, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#172d31",
          padding: 10,
          titleFont: { family: "DM Mono" },
          bodyFont: { family: "DM Sans" },
          callbacks: {
            title: items => {
              const date = timestampToDate(items[0].parsed.x);
              return chartAggregationFilter.value === "month" && !selectedPass
                ? formatMonth(date.slice(0, 7))
                : formatDate(date);
            },
            label: contextItem => {
              const count = contextItem.dataset.periodCounts?.[contextItem.dataIndex];
              const value = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 }).format(contextItem.parsed.y);
              const averageNote = count
                ? ` (promedio de ${count} ${count === 1 ? "pasada" : "pasadas"})`
                : "";
              return ` ${contextItem.dataset.label}: ${value}%${averageNote}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: "linear",
          title: { display: true, text: "Fecha", color: "#53635e", font: { family: "DM Sans", size: 10, weight: "600" } },
          grid: { display: false },
          border: { display: false },
          afterBuildTicks: axis => {
            if (chartAggregationFilter.value === "month" && !selectedPass) {
              axis.ticks = axis.chart.data.datasets[0].data.map(point => ({ value: point.x }));
            }
          },
          ticks: {
            color: "#85918d", maxRotation: 0, autoSkip: true, maxTicksLimit: 7,
            font: { family: "DM Mono", size: 9 },
            callback: value => {
              const date = timestampToDate(value);
              return chartAggregationFilter.value === "month" && !selectedPass
                ? formatMonth(date.slice(0, 7))
                : formatDate(date);
            }
          }
        },
        y: {
          min: 0, max: 100,
          title: { display: true, text: "Porcentaje (%)", color: "#53635e", font: { family: "DM Sans", size: 10, weight: "600" } },
          grid: { color: "#edf1ee" }, border: { display: false },
          ticks: { stepSize: 25, color: "#65736f", padding: 8, font: { family: "DM Mono", size: 9 }, callback: value => `${value}%` }
        }
      }
    }
  });
}

function renderMap(passes) {
  markerLayer.clearLayers();
  for (const pass of passes) {
    const isSelected = selectedPass?.id === pass.id;
    const marker = L.circleMarker([pass.latitud, pass.longitud], {
      radius: isSelected ? 8 : 6, color: "#ffffff", weight: 2,
      fillColor: isSelected ? "#105e50" : "#e18268", fillOpacity: 0.95
    });
    marker.bindPopup(`<span class="popup-title">${pass.isla}</span><br>${formatDate(pass.fecha)}<br>${pass.plataforma} · Aptitud ${pass.aptitud_pct}%`);
    marker.bindTooltip(`${pass.isla} · Índice de acumulación: ${pass.indice_acumulacion}`, {
      direction: "top"
    });
    marker.on("mouseover", () => {
      marker.setStyle({ fillColor: "#105e50" });
      marker.openTooltip();
    });
    marker.on("mouseout", () => {
      marker.setStyle({ fillColor: selectedPass?.id === pass.id ? "#105e50" : "#e18268" });
      marker.closeTooltip();
    });
    marker.on("click", () => {
      selectedPass = pass;
      renderChart(filteredPasses, selectedPass);
      markerLayer.eachLayer(layer => {
        const selected = layer === marker;
        layer.setStyle({ fillColor: selected ? "#105e50" : "#e18268", radius: selected ? 8 : 6 });
      });
    });
    marker.addTo(markerLayer);
  }
  markerLegend.hidden = passes.length === 0;
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (heatToggle.checked && passes.length) {
    const points = passes.map(pass => [pass.latitud, pass.longitud, Math.max(0.15, pass.indice_acumulacion / 100)]);
    heatLayer = L.heatLayer(points, { radius: 38, blur: 28, maxZoom: 10, gradient: { 0.25: "#e9c873", 0.65: "#e18268", 1: "#d65f50" } }).addTo(map);
  }
  if (heatToggle.checked && passes.length) {
    if (!heatLegend) {
      heatLegend = L.control({ position: "bottomright" });
      heatLegend.onAdd = () => {
        const container = L.DomUtil.create("div", "heatmap-legend");
        container.innerHTML = '<strong class="heatmap-legend-title">Índice simulado de acumulación</strong><div class="heatmap-legend-scale"><span>Baja</span><div class="heatmap-legend-gradient"></div><span>Alta</span></div>';
        return container;
      };
    }
    heatLegend.addTo(map);
  } else if (heatLegend) {
    map.removeControl(heatLegend);
  }
}

function renderChart(passes, selection = null) {
  const isMonthlyAverage = !selection && chartAggregationFilter.value === "month";
  const visiblePasses = selection
    ? [selection]
    : isMonthlyAverage
      ? aggregateMonthlyPasses(passes)
      : passes.slice().sort((first, second) => first.fecha.localeCompare(second.fecha));
  const dates = visiblePasses.map(pass => selection ? pass.fecha : pass.period ?? pass.fecha);
  chart.data.labels = visiblePasses.map(pass =>
    isMonthlyAverage ? formatMonth(pass.period) : formatDate(pass.fecha)
  );
  const series = [
    { key: "nubosidad_pct", dataset: chart.data.datasets[0], selectorValue: "cloud" },
    { key: "aptitud_pct", dataset: chart.data.datasets[1], selectorValue: "suitability" }
  ];
  for (const { key, dataset, selectorValue } of series) {
    dataset.data = visiblePasses.map(pass => ({
      x: dateToTimestamp(pass.period ?? pass.fecha),
      y: pass[key]
    }));
    dataset.hidden = chartSeriesFilter.value !== "both" && chartSeriesFilter.value !== selectorValue;
    dataset.periodCounts = isMonthlyAverage ? visiblePasses.map(pass => pass.count) : [];
  }
  const selectedSeries = chartSeriesFilter.options[chartSeriesFilter.selectedIndex].textContent.toLowerCase();
  chart.canvas.setAttribute(
    "aria-label",
    dates.length
      ? selection
        ? `Gráfico de ${selectedSeries} para ${selection.isla}, ${formatDate(selection.fecha)}. Nubosidad ${selection.nubosidad_pct}%, aptitud ${selection.aptitud_pct}%.`
        : `Gráfico de ${selectedSeries} para ${dates.length} ${isMonthlyAverage ? "promedios mensuales" : "pasadas"}, del ${isMonthlyAverage ? formatMonth(dates[0]) : formatDate(dates[0])} al ${isMonthlyAverage ? formatMonth(dates.at(-1)) : formatDate(dates.at(-1))}.`
      : "Gráfico sin pasadas coincidentes con los filtros seleccionados."
  );
  chartSelection.textContent = selection
    ? `${selection.isla} · ${formatDate(selection.fecha)} · ${selection.plataforma} · Índice ${selection.indice_acumulacion}/100`
    : isMonthlyAverage
      ? `Promedios mensuales (resumen, no nuevas observaciones) · ${passes.length} ${passes.length === 1 ? "pasada filtrada" : "pasadas filtradas"}`
      : `Tendencia por pasada · ${passes.length} ${passes.length === 1 ? "registro" : "registros"} filtrados`;
  chartReset.hidden = !selection;
  chartAggregationFilter.disabled = Boolean(selection);
  chart.options.scales.x.title.text = isMonthlyAverage ? "Mes" : "Fecha";
  chart.canvas.hidden = visiblePasses.length === 0;
  trendEmptyState.hidden = visiblePasses.length > 0;
  chartLegend.hidden = visiblePasses.length === 0;
  cloudLegendEntry.hidden = chartSeriesFilter.value === "suitability";
  suitabilityLegendEntry.hidden = chartSeriesFilter.value === "cloud";
  monthlyNote.hidden = !isMonthlyAverage || visiblePasses.length === 0;
  chart.update();
}

function aggregateMonthlyPasses(passes) {
  const months = new Map();
  for (const pass of passes) {
    const period = pass.fecha.slice(0, 7);
    const month = months.get(period) ?? { period, count: 0, nubosidad_pct: 0, aptitud_pct: 0 };
    month.count += 1;
    month.nubosidad_pct += pass.nubosidad_pct;
    month.aptitud_pct += pass.aptitud_pct;
    months.set(period, month);
  }
  return [...months.values()]
    .sort((first, second) => first.period.localeCompare(second.period))
    .map(month => ({
      ...month,
      nubosidad_pct: month.nubosidad_pct / month.count,
      aptitud_pct: month.aptitud_pct / month.count
    }));
}

function renderTable(passes) {
  tableBody.replaceChildren();
  for (const pass of passes) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${formatDate(pass.fecha)}</td><td class="id-cell">${pass.id}</td><td><span class="platform-tag">${pass.plataforma}</span></td><td>${pass.isla}</td><td class="metric-cell ${pass.nubosidad_pct > 50 ? "metric-high" : ""}">${pass.nubosidad_pct}%</td><td class="metric-cell metric-good">${pass.aptitud_pct}%</td><td class="metric-cell">${pass.indice_acumulacion}</td>`;
    tableBody.append(row);
  }
  emptyState.hidden = passes.length > 0;
  document.querySelector("table").hidden = passes.length === 0;
  resultCount.textContent = `${passes.length} ${passes.length === 1 ? "registro" : "registros"}`;
}

function updateDashboard() {
  renderKpis(filteredPasses);
  renderMap(filteredPasses);
  renderChart(filteredPasses, selectedPass);
  renderTable(filteredPasses);
}

function applyFilters() {
  const from = dateFromFilter.value;
  const to = dateToFilter.value;
  const island = islandFilter.value;
  const platform = platformFilter.value;
  filteredPasses = allPasses.filter(pass =>
    (!from || pass.fecha >= from) &&
    (!to || pass.fecha <= to) &&
    (!island || pass.isla === island) &&
    (!platform || pass.plataforma === platform)
  );
  if (selectedPass && !filteredPasses.some(pass => pass.id === selectedPass.id)) {
    selectedPass = null;
  }
  updateDashboard();
}

function populateFilters() {
  const dates = allPasses.map(pass => pass.fecha).sort();
  dateFromFilter.min = dates[0];
  dateFromFilter.max = dates.at(-1);
  dateToFilter.min = dates[0];
  dateToFilter.max = dates.at(-1);
  dateFromFilter.value = dates[0];
  dateToFilter.value = dates.at(-1);

  const addOptions = (select, values) => {
    for (const value of [...new Set(values)].sort()) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
  };
  addOptions(islandFilter, allPasses.map(pass => pass.isla));
  addOptions(platformFilter, allPasses.map(pass => pass.plataforma));
}

async function loadPasses() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dataset = await response.json();
    allPasses = dataset.pasadas;
    populateFilters();
    initializeChart();
    applyFilters();
  } catch (error) {
    console.error("No se pudo cargar el conjunto de pasadas:", error);
    tableBody.replaceChildren();
    document.querySelector("table").hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector("strong").textContent = "No se pudieron cargar los datos";
    emptyState.querySelector("p").textContent = "Comprueba tu conexión e inténtalo de nuevo.";
    resultCount.textContent = "0 registros";
    selectionSummary.textContent = "No se pudieron cargar los datos";
  }
}

heatToggle.addEventListener("change", updateDashboard);
chartReset.addEventListener("click", () => {
  selectedPass = null;
  renderChart(filteredPasses);
  markerLayer.eachLayer(marker => {
    marker.setStyle({ fillColor: "#e18268", radius: 6 });
  });
});

chartSeriesFilter.addEventListener("change", () => renderChart(filteredPasses, selectedPass));
chartAggregationFilter.addEventListener("change", () => renderChart(filteredPasses, selectedPass));

for (const filter of [dateFromFilter, dateToFilter, islandFilter, platformFilter]) {
  filter.addEventListener(filter.type === "date" ? "input" : "change", applyFilters);
}
resetFilters.addEventListener("click", () => {
  dateFromFilter.value = dateFromFilter.min;
  dateToFilter.value = dateToFilter.max;
  islandFilter.value = "";
  platformFilter.value = "";
  applyFilters();
});

loadPasses();
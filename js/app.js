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
let filteredPasses = [];

const formatDate = date => new Intl.DateTimeFormat("es-EC", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
}).format(new Date(`${date}T00:00:00Z`));
const average = (passes, key) => passes.length
  ? passes.reduce((sum, pass) => sum + pass[key], 0) / passes.length
  : null;

function setKpiStatus(cardId, statusId, status, tone) {
  const card = document.querySelector(cardId);
  card.dataset.status = tone;
  document.querySelector(statusId).textContent = status;
}

function renderKpis(passes) {
  document.querySelector("#kpi-passes").textContent = passes.length;
  const passesCoverage = allPasses.length ? passes.length / allPasses.length : 0;
  const passesProgress = document.querySelector("#kpi-passes-progress");
  passesProgress.style.width = `${passesCoverage * 100}%`;
  passesProgress.parentElement.setAttribute("aria-valuenow", Math.round(passesCoverage * 100));
  const passesStatus = passes.length === 0
    ? ["Sin datos", "empty"]
    : passesCoverage >= 0.75
      ? ["Cobertura alta", "good"]
      : passesCoverage >= 0.4
        ? ["Cobertura moderada", "watch"]
        : ["Cobertura reducida", "high"];
  setKpiStatus("#kpi-card-passes", "#kpi-passes-status", ...passesStatus);
  renderVariation(document.querySelector("#kpi-passes-foot"), passes.length, allPasses.length);

  const metrics = [
    { selector: "#kpi-cloud", statusSelector: "#kpi-cloud-status", footSelector: "#kpi-cloud-foot", cardSelector: "#kpi-card-cloud", key: "nubosidad_pct", suffix: "%", sparklineSelector: "#kpi-cloud-sparkline", label: "nubosidad", getStatus: value => value <= 20 ? ["Óptimo", "good"] : value <= 50 ? ["Moderado", "watch"] : ["Alto", "high"] },
    { selector: "#kpi-suitability", statusSelector: "#kpi-suitability-status", footSelector: "#kpi-suitability-foot", cardSelector: "#kpi-card-suitability", key: "aptitud_pct", suffix: "%", sparklineSelector: "#kpi-suitability-sparkline", label: "aptitud", getStatus: value => value >= 80 ? ["Óptimo", "good"] : value >= 60 ? ["Moderado", "watch"] : ["Bajo", "high"] },
    { selector: "#kpi-index", statusSelector: "#kpi-index-status", footSelector: "#kpi-index-foot", cardSelector: "#kpi-card-index", key: "indice_acumulacion", suffix: "/100", sparklineSelector: "#kpi-index-sparkline", label: "índice ilustrativo", getStatus: value => value <= 35 ? ["Bajo", "good"] : value <= 65 ? ["Moderado", "watch"] : ["Alto", "high"] }
  ];

  for (const metric of metrics) {
    const value = average(passes, metric.key);
    renderKpiSparkline(metric.sparklineSelector, passes, metric.key, metric.label);
    const element = document.querySelector(metric.selector);
    element.innerHTML = `${value === null ? "—" : Math.round(value)}<small>${metric.suffix}</small>`;
    if (value === null) {
      setKpiStatus(metric.cardSelector, metric.statusSelector, "Sin datos", "empty");
      document.querySelector(metric.footSelector).textContent = "sin comparación";
      continue;
    }

    const [status, tone] = metric.getStatus(value);
    setKpiStatus(metric.cardSelector, metric.statusSelector, status, tone);

    const baseline = average(allPasses, metric.key);
    renderVariation(document.querySelector(metric.footSelector), value, baseline);
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

function renderVariation(element, value, baseline) {
  if (baseline === null || baseline === 0) {
    element.textContent = "sin base comparable";
    element.removeAttribute("aria-label");
    return;
  }

  const variation = (value - baseline) / Math.abs(baseline);
  const direction = variation > 0 ? "↑" : variation < 0 ? "↓" : "→";
  const formattedVariation = new Intl.NumberFormat("es-EC", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "always"
  }).format(variation);
  element.textContent = `${direction} ${formattedVariation} vs. promedio general`;
  element.setAttribute("aria-label", `Variación de ${formattedVariation} respecto al promedio general`);
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
        tooltip: { backgroundColor: "#172d31", padding: 10, titleFont: { family: "DM Mono" }, bodyFont: { family: "DM Sans" }, callbacks: { label: contextItem => ` ${contextItem.dataset.label}: ${contextItem.parsed.y}%` } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: "#85918d", maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { family: "DM Mono", size: 9 } } },
        y: { min: 0, max: 100, grid: { color: "#edf1ee" }, border: { display: false }, ticks: { stepSize: 25, color: "#85918d", padding: 8, font: { family: "DM Mono", size: 9 }, callback: value => `${value}%` } }
      }
    }
  });
}

function renderMap(passes) {
  markerLayer.clearLayers();
  for (const pass of passes) {
    const marker = L.circleMarker([pass.latitud, pass.longitud], {
      radius: 6, color: "#ffffff", weight: 2, fillColor: "#e18268", fillOpacity: 0.95
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
      marker.setStyle({ fillColor: "#e18268" });
      marker.closeTooltip();
    });
    marker.addTo(markerLayer);
  }
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (heatToggle.checked && passes.length) {
    const points = passes.map(pass => [pass.latitud, pass.longitud, Math.max(0.15, pass.indice_acumulacion / 100)]);
    heatLayer = L.heatLayer(points, { radius: 38, blur: 28, maxZoom: 10, gradient: { 0.25: "#e9c873", 0.65: "#e18268", 1: "#d65f50" } }).addTo(map);
  }
  if (heatToggle.checked) {
    if (!heatLegend) {
      heatLegend = L.control({ position: "bottomright" });
      heatLegend.onAdd = () => {
        const container = L.DomUtil.create("div", "heatmap-legend");
        container.innerHTML = '<strong class="heatmap-legend-title">Índice de Acumulación</strong><div class="heatmap-legend-scale"><span>Baja</span><div class="heatmap-legend-gradient"></div><span>Alta</span></div>';
        return container;
      };
    }
    heatLegend.addTo(map);
  } else if (heatLegend) {
    map.removeControl(heatLegend);
  }
}

function renderChart(passes) {
  chart.data.labels = passes.map(pass => formatDate(pass.fecha));
  chart.data.datasets[0].data = passes.map(pass => pass.nubosidad_pct);
  chart.data.datasets[1].data = passes.map(pass => pass.aptitud_pct);
  const dates = passes.map(pass => pass.fecha).sort();
  chart.canvas.setAttribute(
    "aria-label",
    dates.length
      ? `Gráfico de nubosidad y aptitud del sensor para ${dates.length} pasadas, del ${formatDate(dates[0])} al ${formatDate(dates[dates.length - 1])}.`
      : "Gráfico sin pasadas coincidentes con los filtros seleccionados."
  );
  trendEmptyState.hidden = passes.length > 0;
  chart.update();
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
  renderChart(filteredPasses);
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
  }
}

heatToggle.addEventListener("change", updateDashboard);
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
const DATA_URL = "./data_copernicus_sample.json";
const islandFilter = document.querySelector("#island-filter");
const dateFromFilter = document.querySelector("#date-from");
const dateToFilter = document.querySelector("#date-to");
const cloudMaxFilter = document.querySelector("#cloud-max");
const cloudValue = document.querySelector("#cloud-value");
const resetButton = document.querySelector("#reset-filters");
const heatToggle = document.querySelector("#heat-toggle");
const tableBody = document.querySelector("#pass-table-body");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const trendEmptyState = document.querySelector("#trend-empty-state");

const map = L.map("map", { scrollWheelZoom: false, zoomControl: true }).setView([-0.8, -90.7], 7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
let heatLayer = null;
let chart = null;
let allPasses = [];

const formatPercent = value => `${Math.round(value)}%`;
const formatDate = date => new Intl.DateTimeFormat("es-EC", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
}).format(new Date(`${date}T00:00:00Z`));

function initializeChart() {
  const context = document.querySelector("#trend-chart");
  chart = new Chart(context, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Nubosidad",
          data: [],
          borderColor: "#e18268",
          backgroundColor: "#e18268",
          pointStyle: "circle",
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          tension: 0
        },
        {
          label: "Aptitud",
          data: [],
          borderColor: "#167c65",
          backgroundColor: "#167c65",
          pointStyle: "rectRot",
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          tension: 0
        }
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
            label: contextItem => ` ${contextItem.dataset.label}: ${contextItem.parsed.y}%`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: "#85918d", maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { family: "DM Mono", size: 9 } } },
        y: { min: 0, max: 100, grid: { color: "#edf1ee" }, border: { display: false }, ticks: { stepSize: 25, color: "#85918d", padding: 8, font: { family: "DM Mono", size: 9 }, callback: value => `${value}%` } }
      }
    }
  });
}

function getFilteredPasses() {
  const island = islandFilter.value;
  const dateFrom = dateFromFilter.value;
  const dateTo = dateToFilter.value;
  const maxCloud = Number(cloudMaxFilter.value);
  return allPasses.filter(pass =>
    (!island || pass.isla === island) &&
    (!dateFrom || pass.fecha >= dateFrom) &&
    (!dateTo || pass.fecha <= dateTo) &&
    pass.nubosidad_pct <= maxCloud
  );
}

function renderKpis(passes) {
  document.querySelector("#kpi-passes").textContent = passes.length;
  const averages = [
    ["#kpi-cloud", "nubosidad_pct"],
    ["#kpi-suitability", "aptitud_pct"],
    ["#kpi-index", "indice_acumulacion"]
  ];
  for (const [selector, key] of averages) {
    const element = document.querySelector(selector);
    const average = passes.length ? passes.reduce((sum, pass) => sum + pass[key], 0) / passes.length : null;
    element.innerHTML = average === null ? "—" : `${Math.round(average)}<small>${key === "indice_acumulacion" ? "/100" : "%"}</small>`;
  }
}

function renderMap(passes) {
  markerLayer.clearLayers();
  for (const pass of passes) {
    const marker = L.circleMarker([pass.latitud, pass.longitud], {
      radius: 6, color: "#ffffff", weight: 2, fillColor: "#e18268", fillOpacity: 0.95
    });
    marker.bindPopup(`<span class="popup-title">${pass.isla}</span><br>${formatDate(pass.fecha)}<br>${pass.plataforma} · Aptitud ${pass.aptitud_pct}%`);
    marker.addTo(markerLayer);
  }
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (heatToggle.checked && passes.length) {
    const points = passes.map(pass => [pass.latitud, pass.longitud, Math.max(0.15, pass.indice_acumulacion / 100)]);
    heatLayer = L.heatLayer(points, { radius: 34, blur: 24, maxZoom: 10, gradient: { 0.25: "#e9c873", 0.65: "#e99a68", 1: "#d65f50" } }).addTo(map);
  }
}

function renderChart(passes) {
  const chronologicalPasses = [...passes].sort((a, b) => a.fecha.localeCompare(b.fecha));
  chart.data.labels = chronologicalPasses.map(pass => formatDate(pass.fecha));
  chart.data.datasets[0].data = chronologicalPasses.map(pass => pass.nubosidad_pct);
  chart.data.datasets[1].data = chronologicalPasses.map(pass => pass.aptitud_pct);
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
  const filteredPasses = getFilteredPasses();
  renderKpis(filteredPasses);
  renderMap(filteredPasses);
  renderChart(filteredPasses);
  renderTable(filteredPasses);
}

function populateIslandFilter(passes) {
  const islands = [...new Set(passes.map(pass => pass.isla))].sort((a, b) => a.localeCompare(b, "es"));
  for (const island of islands) {
    const option = document.createElement("option");
    option.value = island;
    option.textContent = island;
    islandFilter.append(option);
  }
}

async function loadPasses() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dataset = await response.json();
    allPasses = dataset.pasadas;
    populateIslandFilter(allPasses);
    initializeChart();
    updateDashboard();
  } catch (error) {
    console.error("No se pudo cargar el conjunto de pasadas:", error);
    tableBody.replaceChildren();
    document.querySelector("table").hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector("strong").textContent = "No se pudieron cargar los datos";
    emptyState.querySelector("p").textContent = "Inicia un servidor local y vuelve a cargar la página.";
    resultCount.textContent = "0 registros";
  }
}

for (const control of [islandFilter, dateFromFilter, dateToFilter, cloudMaxFilter]) {
  control.addEventListener("input", () => {
    cloudValue.textContent = `${cloudMaxFilter.value}%`;
    updateDashboard();
  });
  control.addEventListener("change", updateDashboard);
}
heatToggle.addEventListener("change", updateDashboard);
resetButton.addEventListener("click", () => {
  islandFilter.value = "";
  dateFromFilter.value = "";
  dateToFilter.value = "";
  cloudMaxFilter.value = "100";
  cloudValue.textContent = "100%";
  updateDashboard();
});

loadPasses();
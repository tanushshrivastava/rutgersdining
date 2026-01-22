const elements = {
  form: document.querySelector("#filters"),
  date: document.querySelector("#date"),
  meal: document.querySelector("#meal"),
  halls: document.querySelector("#hall-options"),
  calories: document.querySelector("#calories"),
  caloriesEnabled: document.querySelector("#calories-enabled"),
  protein: document.querySelector("#protein"),
  proteinEnabled: document.querySelector("#protein-enabled"),
  carbs: document.querySelector("#carbs"),
  carbsEnabled: document.querySelector("#carbs-enabled"),
  fat: document.querySelector("#fat"),
  fatEnabled: document.querySelector("#fat-enabled"),
  mode: document.querySelector("#mode"),
  dayPlan: document.querySelector("#day-plan"),
  results: document.querySelector("#results"),
  status: document.querySelector("#status"),
  errors: document.querySelector("#errors"),
  reset: document.querySelector("#reset")
};

const state = {
  halls: [],
  meals: []
};

const hiddenHallIds = new Set(["livingston"]);

function setStatus(message = "", tone = "") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function formatNumber(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const rounded = Number.isFinite(value) ? Math.round(value) : value;
  return `${rounded}${suffix}`;
}

function formatScore(score) {
  if (score === null || score === undefined) return "";
  const normalized = Math.max(0, 1 - Math.min(score, 1));
  return `${Math.round(normalized * 100)}% match`;
}

function formatProteinDensity(value) {
  if (!Number.isFinite(value)) return "";
  return `${(value * 100).toFixed(1)}g/100 cal`;
}

function formatPlanSummary(plan) {
  if (!plan) return "";
  const calories = formatNumber(plan.totalCalories);
  const protein = formatNumber(plan.totalProtein);
  const target = Number.isFinite(plan.targetCalories)
    ? ` / ${formatNumber(plan.targetCalories)} cal target`
    : "";
  return `Plan total: ${calories} cal, ${protein}g protein${target}`;
}

function createPill(hall, checked = true) {
  const label = document.createElement("label");
  label.className = "pill";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = hall.id;
  input.checked = checked;

  const span = document.createElement("span");
  span.textContent = hall.name;

  label.appendChild(input);
  label.appendChild(span);
  return label;
}

function renderHalls() {
  elements.halls.innerHTML = "";
  state.halls.forEach((hall) => {
    if (hiddenHallIds.has(hall.id)) return;
    elements.halls.appendChild(createPill(hall, true));
  });
}

function renderMeals() {
  elements.meal.innerHTML = "";
  state.meals.forEach((meal) => {
    const option = document.createElement("option");
    option.value = meal.id;
    option.textContent = meal.label;
    elements.meal.appendChild(option);
  });
  elements.meal.value = "lunch";
}

function selectedHalls() {
  return Array.from(elements.halls.querySelectorAll("input[type='checkbox']"))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function buildParams(options = {}) {
  const includeMeal = options.includeMeal !== false;
  const params = new URLSearchParams();
  if (elements.date.value) params.set("date", elements.date.value);
  if (includeMeal && elements.meal.value) params.set("meal", elements.meal.value);

  const halls = selectedHalls();
  if (halls.length) params.set("halls", halls.join(","));

  if (elements.caloriesEnabled.checked && elements.calories.value) {
    params.set("calories", elements.calories.value);
  }
  if (elements.proteinEnabled.checked && elements.protein.value) {
    params.set("protein", elements.protein.value);
  }
  if (elements.carbsEnabled.checked && elements.carbs.value) {
    params.set("carbs", elements.carbs.value);
  }
  if (elements.fatEnabled.checked && elements.fat.value) {
    params.set("fat", elements.fat.value);
  }
  if (elements.mode.value) params.set("mode", elements.mode.value);

  return params;
}

function renderErrors(errors) {
  elements.errors.innerHTML = "";
  if (!errors || errors.length === 0) return;

  errors.forEach((error) => {
    const item = document.createElement("div");
    item.textContent = `${error.name}: ${error.message}`;
    elements.errors.appendChild(item);
  });
}

function renderResults(data) {
  elements.results.innerHTML = "";

  if (!data.halls || data.halls.length === 0) {
    setStatus("No halls matched the filters.");
    return;
  }

  data.halls.forEach((hall) => {
    const card = document.createElement("article");
    card.className = "hall-card";

    const title = document.createElement("h3");
    title.textContent = hall.name;

    const meta = document.createElement("div");
    meta.className = "hall-meta";

    const score = document.createElement("span");
    score.textContent = hall.bestScore !== null ? formatScore(hall.bestScore) : "Menu loaded";

    const link = document.createElement("a");
    link.href = hall.url;
    link.textContent = "View source";
    link.target = "_blank";
    link.rel = "noreferrer";

    meta.appendChild(score);
    meta.appendChild(link);

    const planSummaryText = hall.plan ? formatPlanSummary(hall.plan) : "";
    if (planSummaryText) {
      const summary = document.createElement("div");
      summary.className = "plan-summary";
      summary.textContent = planSummaryText;
      card.appendChild(summary);
    }

    const list = document.createElement("div");
    list.className = "item-list";

    const itemsToShow = hall.plan?.items?.length ? hall.plan.items : hall.items;

    if (!itemsToShow.length) {
      const empty = document.createElement("div");
      empty.className = "item";
      empty.textContent = "No items parsed for this meal.";
      list.appendChild(empty);
    } else {
      itemsToShow.forEach((item) => {
        const row = document.createElement("div");
        row.className = "item";

        const name = document.createElement("div");
        name.className = "item-name";
        name.textContent = item.name;

        const metaRow = document.createElement("div");
        metaRow.className = "item-meta";

        const locationRow = document.createElement("div");
        locationRow.className = "item-meta-row";

        if (item.station) {
          const station = document.createElement("span");
          station.className = "badge";
          station.textContent = item.station;
          locationRow.appendChild(station);
        }

        const nutritionRow = document.createElement("div");
        nutritionRow.className = "item-meta-row";

        const macros = [
          item.calories ? `${formatNumber(item.calories)} cal` : "",
          item.protein ? `${formatNumber(item.protein)}g protein` : "",
          item.carbs ? `${formatNumber(item.carbs)}g carbs` : "",
          item.fat ? `${formatNumber(item.fat)}g fat` : ""
        ].filter(Boolean);

        if (Number.isFinite(item.proteinPerCal)) {
          macros.push(`P/C ${formatProteinDensity(item.proteinPerCal)}`);
        }

        if (macros.length) {
          const nutritionLabel = document.createElement("span");
          nutritionLabel.className = "nutrition-label";
          nutritionLabel.textContent = "Nutrition:";
          nutritionRow.appendChild(nutritionLabel);

          macros.forEach((macro) => {
            const span = document.createElement("span");
            span.textContent = macro;
            nutritionRow.appendChild(span);
          });
        } else {
          const nutritionLabel = document.createElement("span");
          nutritionLabel.className = "nutrition-label";
          nutritionLabel.textContent = "Nutrition: n/a";
          nutritionRow.appendChild(nutritionLabel);
        }

        metaRow.appendChild(locationRow);
        metaRow.appendChild(nutritionRow);

        if (item.score !== null && item.score !== undefined) {
          const scoreBadge = document.createElement("span");
          scoreBadge.className = "badge";
          scoreBadge.textContent = formatScore(item.score);
          nutritionRow.appendChild(scoreBadge);
        }

        row.appendChild(name);
        row.appendChild(metaRow);
        list.appendChild(row);
      });
    }

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(list);
    elements.results.appendChild(card);
  });

  setStatus(`Loaded ${data.halls.length} hall${data.halls.length > 1 ? "s" : ""}.`);
}

function renderDayPlan(data) {
  elements.results.innerHTML = "";

  if (!data.meals || data.meals.length === 0) {
    setStatus("No day-plan meals matched the filters.");
    return;
  }

  data.meals.forEach((meal) => {
    const section = document.createElement("section");
    section.className = "meal-section";

    const header = document.createElement("div");
    header.className = "meal-title";

    const title = document.createElement("h3");
    title.textContent = meal.label;

    const subtitle = document.createElement("p");
    subtitle.textContent = `Top matches across ${meal.itemCount || 0} menu items.`;

    header.appendChild(title);
    header.appendChild(subtitle);

    const planSummaryText = meal.plan ? formatPlanSummary(meal.plan) : "";
    if (planSummaryText) {
      const summary = document.createElement("div");
      summary.className = "plan-summary";
      summary.textContent = planSummaryText;
      section.appendChild(summary);
    }

    const grid = document.createElement("div");
    grid.className = "results-grid";

    const itemsToShow = meal.plan?.items?.length ? meal.plan.items : meal.items;

    if (!itemsToShow || itemsToShow.length === 0) {
      const empty = document.createElement("div");
      empty.className = "item-card";
      empty.textContent = "No matching items for this meal.";
      grid.appendChild(empty);
    } else {
      itemsToShow.forEach((item) => {
        const card = document.createElement("article");
        card.className = "item-card";

        const name = document.createElement("div");
        name.className = "item-name";
        name.textContent = item.name;

        const metaRow = document.createElement("div");
        metaRow.className = "item-meta";

        const locationRow = document.createElement("div");
        locationRow.className = "item-meta-row";

        if (item.hallName) {
          const hall = document.createElement("span");
          hall.className = "badge";
          hall.textContent = item.hallName;
          locationRow.appendChild(hall);
        }

        if (item.station) {
          const station = document.createElement("span");
          station.textContent = item.station;
          locationRow.appendChild(station);
        }

        const nutritionRow = document.createElement("div");
        nutritionRow.className = "item-meta-row";

        const macros = [
          item.calories ? `${formatNumber(item.calories)} cal` : "",
          item.protein ? `${formatNumber(item.protein)}g protein` : "",
          item.carbs ? `${formatNumber(item.carbs)}g carbs` : "",
          item.fat ? `${formatNumber(item.fat)}g fat` : ""
        ].filter(Boolean);

        if (Number.isFinite(item.proteinPerCal)) {
          macros.push(`P/C ${formatProteinDensity(item.proteinPerCal)}`);
        }

        if (macros.length) {
          const nutritionLabel = document.createElement("span");
          nutritionLabel.className = "nutrition-label";
          nutritionLabel.textContent = "Nutrition:";
          nutritionRow.appendChild(nutritionLabel);

          macros.forEach((macro) => {
            const span = document.createElement("span");
            span.textContent = macro;
            nutritionRow.appendChild(span);
          });
        } else {
          const nutritionLabel = document.createElement("span");
          nutritionLabel.className = "nutrition-label";
          nutritionLabel.textContent = "Nutrition: n/a";
          nutritionRow.appendChild(nutritionLabel);
        }

        metaRow.appendChild(locationRow);
        metaRow.appendChild(nutritionRow);

        if (item.score !== null && item.score !== undefined) {
          const scoreBadge = document.createElement("span");
          scoreBadge.className = "badge";
          scoreBadge.textContent = formatScore(item.score);
          nutritionRow.appendChild(scoreBadge);
        }

        card.appendChild(name);
        card.appendChild(metaRow);
        grid.appendChild(card);
      });
    }

    section.appendChild(header);
    section.appendChild(grid);
    elements.results.appendChild(section);
  });

  setStatus("Built a full-day plan.");
}

async function loadConfig() {
  try {
    const response = await fetch("/api/halls");
    const data = await response.json();
    state.halls = data.halls || [];
    state.meals = data.meals || [];
    renderHalls();
    renderMeals();
  } catch (error) {
    setStatus("Failed to load hall list.");
  }
}

async function loadRecommendations() {
  setStatus("Fetching menus...");
  elements.results.innerHTML = "";
  elements.errors.innerHTML = "";

  try {
    const params = buildParams();
    const response = await fetch(`/api/recommendations?${params.toString()}`);
    if (!response.ok) throw new Error("Menu fetch failed.");
    const data = await response.json();
    renderErrors(data.errors);
    renderResults(data);
  } catch (error) {
    setStatus(error.message || "Failed to fetch menus.");
  }
}

async function loadDayPlan() {
  setStatus("Building full-day plan...");
  elements.results.innerHTML = "";
  elements.errors.innerHTML = "";

  try {
    const params = buildParams({ includeMeal: false });
    const response = await fetch(`/api/day-plan?${params.toString()}`);
    if (!response.ok) throw new Error("Day plan fetch failed.");
    const data = await response.json();
    renderErrors(data.errors);
    renderDayPlan(data);
  } catch (error) {
    setStatus(error.message || "Failed to build a day plan.");
  }
}

function resetFilters() {
  elements.calories.value = "";
  elements.protein.value = "";
  elements.carbs.value = "";
  elements.fat.value = "";
  elements.mode.value = "closest";
  elements.caloriesEnabled.checked = true;
  elements.proteinEnabled.checked = true;
  elements.carbsEnabled.checked = true;
  elements.fatEnabled.checked = true;
  elements.dayPlan.checked = false;

  Array.from(elements.halls.querySelectorAll("input[type='checkbox']")).forEach((input) => {
    input.checked = true;
  });

  setStatus("Filters reset.");
  elements.results.innerHTML = "";
  elements.errors.innerHTML = "";
}

function init() {
  const today = new Date().toISOString().slice(0, 10);
  elements.date.value = today;

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (elements.dayPlan.checked) {
      loadDayPlan();
    } else {
      loadRecommendations();
    }
  });

  elements.reset.addEventListener("click", resetFilters);
  loadConfig();
}

init();

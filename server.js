import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const API_BASE =
  process.env.NUTRISLICE_API_BASE ||
  "https://rutgers.api.nutrislice.com/menu/api/weeks/school";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

const HALLS = [
  { id: "busch", name: "Busch", slug: "busch-dining-hall" },
  { id: "neilson", name: "Neilson", slug: "neilson-dining-hall" },
  { id: "livingston", name: "Livingston", slug: "livingston-dining-commons" }
];

const MEAL_SLUGS = {
  breakfast: "breakfast",
  lunch: "lunch-test",
  "lunch-test": "lunch-test",
  dinner: "dinner",
  takeout: "knight-room-takeout",
  "knight-room-takeout": "knight-room-takeout"
};

const MEAL_OPTIONS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "knight-room-takeout", label: "Knight Room Takeout" }
];

const DAY_MEALS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" }
];

function cleanText(text) {
  if (!text) return "";
  return String(text).replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (Number.isFinite(value)) return value;
  const match = String(value).match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function normalizeDate(dateStr) {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getHallById(id) {
  return HALLS.find((hall) => hall.id === id);
}

function getMealSlug(meal) {
  if (!meal) return MEAL_SLUGS.lunch;
  return MEAL_SLUGS[meal] || meal;
}

function getDateParts(date) {
  const [year, month, day] = date.split("-");
  return { year, month, day };
}

function buildApiUrl(hallSlug, mealSlug, date) {
  const { year, month, day } = getDateParts(date);
  return `${API_BASE}/${hallSlug}/menu-type/${mealSlug}/${year}/${month}/${day}/?format=json`;
}

async function fetchMenuJson(url) {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "DiningHallScanner/0.2 (+local dev)"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  const data = await response.json();
  cache.set(url, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

function getMenuInfoName(menuInfo, menuId) {
  if (!menuInfo || menuId === null || menuId === undefined) return "";
  const entry = menuInfo[String(menuId)];
  return cleanText(entry?.section_options?.display_name || "");
}

function extractNutritionInfo(food) {
  const nutrition = {};
  const macros = {
    calories: null,
    protein: null,
    carbs: null,
    fat: null
  };

  const info =
    food?.rounded_nutrition_info ||
    food?.nutrition_info ||
    food?.food_sizes?.[0]?.nutrition_info ||
    food?.food_sizes?.[0]?.rounded_nutrition_info ||
    null;

  if (info && typeof info === "object") {
    Object.entries(info).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      const label = key.replace(/_/g, " ");
      nutrition[label] = value;
    });

    macros.calories = parseNumber(info.calories);
    macros.protein = parseNumber(info.g_protein);
    macros.carbs = parseNumber(info.g_carbs);
    macros.fat = parseNumber(info.g_fat);
  }

  return { nutrition, macros };
}

function parseMenuJson(data, date) {
  const days = Array.isArray(data?.days) ? data.days : [];
  const targetDay = days.find((day) => day.date === date);

  if (!targetDay) {
    return {
      items: [],
      debug: {
        targetDate: date,
        targetFound: false,
        availableDates: days.map((day) => day.date)
      }
    };
  }

  const menuInfo = targetDay.menu_info || {};
  const items = [];
  let currentStation = "";
  let stationHeaderCount = 0;

  for (const entry of targetDay.menu_items || []) {
    if (entry.is_section_title || entry.is_station_header) {
      const label = cleanText(entry.text) || getMenuInfoName(menuInfo, entry.menu_id);
      if (label) {
        currentStation = label;
      }
      stationHeaderCount += 1;
      continue;
    }

    if (!entry.food || !entry.food.name) continue;

    const station =
      getMenuInfoName(menuInfo, entry.menu_id) || currentStation || "Station";
    const { nutrition, macros } = extractNutritionInfo(entry.food);

    items.push({
      name: cleanText(entry.food.name),
      station,
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      nutrition
    });
  }

  return {
    items,
    debug: {
      targetDate: date,
      targetFound: true,
      availableDates: days.map((day) => day.date),
      menuItemCount: targetDay.menu_items?.length || 0,
      menuInfoCount: Object.keys(menuInfo).length,
      stationHeaderCount,
      parsedItemCount: items.length
    }
  };
}

async function fetchMenu(hall, meal, date, options = {}) {
  const mealSlug = getMealSlug(meal);
  const url = buildApiUrl(hall.slug, mealSlug, date);
  const data = await fetchMenuJson(url);
  const parsed = parseMenuJson(data, date);
  return {
    url,
    items: parsed.items,
    debug: options.debug ? parsed.debug : null
  };
}

function proteinPerCal(item) {
  const protein = parseNumber(item?.protein);
  const calories = parseNumber(item?.calories);
  if (!Number.isFinite(protein) || !Number.isFinite(calories) || calories <= 0) return null;
  return protein / calories;
}

function withDerivedMetrics(items) {
  return items.map((item) => ({
    ...item,
    proteinPerCal: proteinPerCal(item)
  }));
}

function sortByProteinDensity(items) {
  return [...items].sort((a, b) => {
    const ratioA = a.proteinPerCal ?? -Infinity;
    const ratioB = b.proteinPerCal ?? -Infinity;
    if (ratioA !== ratioB) return ratioB - ratioA;
    const proteinA = parseNumber(a.protein) ?? -Infinity;
    const proteinB = parseNumber(b.protein) ?? -Infinity;
    if (proteinA !== proteinB) return proteinB - proteinA;
    const caloriesA = parseNumber(a.calories) ?? Infinity;
    const caloriesB = parseNumber(b.calories) ?? Infinity;
    return caloriesA - caloriesB;
  });
}

function buildCaloriePlan(items, targetCalories, options = {}) {
  const caloriesTarget = parseNumber(targetCalories);
  if (!Number.isFinite(caloriesTarget) || caloriesTarget <= 0) return null;

  const candidates = items.filter(
    (item) => Number.isFinite(item.calories) && item.calories > 0
  );
  if (!candidates.length) return null;

  const sorted = sortByProteinDensity(candidates);
  const tolerance =
    options.tolerance ?? Math.max(60, Math.round(caloriesTarget * 0.08));
  const maxCalories = caloriesTarget + tolerance;

  const plan = [];
  let totalCalories = 0;
  const used = new Set();

  for (const item of sorted) {
    if (totalCalories + item.calories <= maxCalories) {
      plan.push(item);
      totalCalories += item.calories;
      used.add(item);
    }
  }

  let improved = true;
  while (improved) {
    improved = false;
    const currentDiff = Math.abs(caloriesTarget - totalCalories);
    let bestCandidate = null;
    let bestDiff = currentDiff;

    for (const item of sorted) {
      if (used.has(item)) continue;
      const newTotal = totalCalories + item.calories;
      if (newTotal > maxCalories) continue;
      const diff = Math.abs(caloriesTarget - newTotal);
      if (diff < bestDiff) {
        bestCandidate = item;
        bestDiff = diff;
      }
    }

    if (bestCandidate) {
      plan.push(bestCandidate);
      totalCalories += bestCandidate.calories;
      used.add(bestCandidate);
      improved = true;
    }
  }

  return plan;
}

function summarizePlan(items, targetCalories) {
  const totals = items.reduce(
    (acc, item) => {
      acc.calories += parseNumber(item.calories) || 0;
      acc.protein += parseNumber(item.protein) || 0;
      acc.carbs += parseNumber(item.carbs) || 0;
      acc.fat += parseNumber(item.fat) || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const proteinPerCalValue =
    totals.calories > 0 ? totals.protein / totals.calories : null;

  return {
    items,
    targetCalories: Number.isFinite(targetCalories) ? targetCalories : null,
    totalCalories: totals.calories || 0,
    totalProtein: totals.protein || 0,
    totalCarbs: totals.carbs || 0,
    totalFat: totals.fat || 0,
    diffCalories: Number.isFinite(targetCalories)
      ? totals.calories - targetCalories
      : null,
    proteinPerCal: proteinPerCalValue
  };
}

function scoreItem(item, goals, mode) {
  if (mode === "protein-density") {
    const ratio = proteinPerCal(item);
    if (!Number.isFinite(ratio)) return null;
    return -ratio;
  }

  const fields = ["calories", "protein", "carbs", "fat"];
  let total = 0;
  let count = 0;

  for (const field of fields) {
    const goal = goals[field];
    const value = item[field];
    if (!Number.isFinite(goal) || !Number.isFinite(value)) continue;

    if (mode === "under") {
      if (value > goal) total += (value - goal) / (goal || 1);
    } else if (mode === "over") {
      if (value < goal) total += (goal - value) / (goal || 1);
    } else {
      total += Math.abs(value - goal) / (goal || 1);
    }
    count += 1;
  }

  if (count === 0) return null;
  return total / count;
}

function parseGoals(query) {
  return {
    calories: parseNumber(query.calories),
    protein: parseNumber(query.protein),
    carbs: parseNumber(query.carbs),
    fat: parseNumber(query.fat)
  };
}

function splitGoals(goals, parts) {
  const count = parts.length || 1;
  const split = {};
  Object.entries(goals).forEach(([key, value]) => {
    if (!Number.isFinite(value)) return;
    split[key] = value / count;
  });
  return split;
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/halls", (req, res) => {
  res.json({ halls: HALLS, meals: MEAL_OPTIONS });
});

app.get("/api/menu", async (req, res) => {
  try {
    const hallId = req.query.hall || "busch";
    const meal = req.query.meal || "lunch";
    const date = normalizeDate(req.query.date);
    const debug = req.query.debug === "1";
    const hall = getHallById(hallId);

    if (!hall) {
      res.status(400).json({ error: "Unknown hall." });
      return;
    }

    const menu = await fetchMenu(hall, meal, date, { debug });
    res.json({
      hall: hall.id,
      date,
      meal: getMealSlug(meal),
      url: menu.url,
      items: menu.items,
      debug: menu.debug
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/recommendations", async (req, res) => {
  const date = normalizeDate(req.query.date);
  const meal = req.query.meal || "lunch";
  const goals = parseGoals(req.query);
  const mode = req.query.mode || "closest";
  const debug = req.query.debug === "1";
  const hallIds = (req.query.halls || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const halls = hallIds.length ? hallIds.map(getHallById).filter(Boolean) : HALLS;
  const hasGoals =
    Object.values(goals).some((value) => Number.isFinite(value)) ||
    mode === "protein-density";

  const results = [];
  const errors = [];

  for (const hall of halls) {
    try {
      const menu = await fetchMenu(hall, meal, date, { debug });
      let items = withDerivedMetrics(menu.items);

      if (mode === "protein-density") {
        items = sortByProteinDensity(items);
      } else if (hasGoals) {
        items = items
          .map((item) => ({
            ...item,
            score: scoreItem(item, goals, mode)
          }))
          .filter((item) => item.score !== null)
          .sort((a, b) => a.score - b.score);
      }

      const topItems = items.slice(0, 6);
      const bestScore =
        topItems.length && hasGoals && mode !== "protein-density"
          ? topItems[0].score
          : null;
      const planItems = buildCaloriePlan(items, goals.calories);
      const plan = planItems ? summarizePlan(planItems, goals.calories) : null;

      results.push({
        id: hall.id,
        name: hall.name,
        slug: hall.slug,
        url: menu.url,
        bestScore,
        items: topItems,
        plan,
        debug: menu.debug
      });
    } catch (error) {
      errors.push({ id: hall.id, name: hall.name, message: error.message });
    }
  }

  res.json({
    query: {
      date,
      meal: getMealSlug(meal),
      halls: halls.map((hall) => hall.id),
      goals,
      mode
    },
    halls: results,
    errors
  });
});

app.get("/api/day-plan", async (req, res) => {
  const date = normalizeDate(req.query.date);
  const goals = parseGoals(req.query);
  const mode = req.query.mode || "closest";
  const debug = req.query.debug === "1";
  const hallIds = (req.query.halls || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const halls = hallIds.length ? hallIds.map(getHallById).filter(Boolean) : HALLS;
  const hasGoals =
    Object.values(goals).some((value) => Number.isFinite(value)) ||
    mode === "protein-density";
  const perMealGoals = splitGoals(goals, DAY_MEALS);

  const meals = [];
  const errors = [];

  for (const meal of DAY_MEALS) {
    const combined = [];

    for (const hall of halls) {
      try {
        const menu = await fetchMenu(hall, meal.id, date, { debug });
        menu.items.forEach((item) => {
          combined.push({
            ...item,
            hallId: hall.id,
            hallName: hall.name,
            hallSlug: hall.slug
          });
        });
      } catch (error) {
        errors.push({
          id: hall.id,
          name: hall.name,
          meal: meal.id,
          message: error.message
        });
      }
    }

    let ranked = withDerivedMetrics(combined);
    const activeGoals = perMealGoals;

    if (mode === "protein-density") {
      ranked = sortByProteinDensity(ranked);
    } else if (hasGoals) {
      ranked = ranked
        .map((item) => ({
          ...item,
          score: scoreItem(item, activeGoals, mode)
        }))
        .filter((item) => item.score !== null)
        .sort((a, b) => a.score - b.score);
    }

    const planItems = buildCaloriePlan(ranked, activeGoals.calories);
    const plan = planItems ? summarizePlan(planItems, activeGoals.calories) : null;

    meals.push({
      meal: meal.id,
      label: meal.label,
      items: ranked.slice(0, 8),
      itemCount: combined.length,
      goals: activeGoals,
      plan
    });
  }

  res.json({
    query: {
      date,
      halls: halls.map((hall) => hall.id),
      goals,
      mode
    },
    meals,
    errors
  });
});

app.listen(PORT, () => {
  console.log(`Dining hall scanner running on http://localhost:${PORT}`);
});

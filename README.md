# Dining Hall Scanner

A lightweight scraper + web UI that pulls Rutgers Nutrislice menus and ranks dining halls based on nutrition goals.

## What it does
- Pulls menu items + nutrition data from the Nutrislice JSON API.
- Filters by date, meal, and hall.
- Ranks halls and dishes by calorie/macronutrient goals.

## Setup

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Requires Node.js 18+ (for built-in `fetch`).

## Customize halls + meal slugs
The hall slugs live in `server.js`. Update them if Nutrislice changes the location names:

- `server.js`

The meal slug for lunch is currently set to `lunch-test` to match the example URLs. Update `MEAL_SLUGS` if Nutrislice uses a different path.

## API configuration
The server queries the Nutrislice weekly API by default. Override the base URL with:
- `NUTRISLICE_API_BASE` (example: `https://rutgers.api.nutrislice.com/menu/api/weeks/school`)

## Notes
- The server caches menu responses for 10 minutes to reduce repeated requests (the cache window).

## Day plan endpoint
To build a breakfast + lunch + dinner plan in one call:

`/api/day-plan?date=2026-01-21&halls=busch,neilson&protein=30&mode=closest`

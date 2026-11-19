# AQUA SENTRY — Analytics Backend (Apache Spark + Scala)

Historical water-quality analytics for the **Adaptive Edge-Driven Intelligent
Aquatic Revitalization System**.

Spark is used strictly for **batch / historical analysis**. It reads all
historical sensor values from the Aqua Sentry database in XAMPP MySQL and
serves the aggregated results back to the dashboard.

## Architecture

```
XAMPP MySQL (`aquasentry`.`sensor_readings`)
        │  Spark JDBC
        ▼
AquaSentryAnalytics
        │
  load → validate/clean → group by sensor + time bucket
      → avg / min / max / stddev
      → trend slope + direction
      → normal / warning / critical counts
      → before-vs-after filtration comparison
        │
        ▼
data/analytics_summary.json
        │  GET /api/analytics
        ▼
AnalyticsApi (Scala, JDK HttpServer)  →  React Analytics page
```

## Requirements

- Java 17 or newer (built and verified on Java 21)
- Node.js only for the optional demo data seeder

Everything else is resolved by sbt on first run.

## Running it

### 1. Configure XAMPP MySQL

Start **Apache** and **MySQL** in the XAMPP Control Panel. Then open
`spark-backend/database/schema.sql` in phpMyAdmin's SQL tab and run it. This
creates the `aquasentry` database and the `sensor_readings` table expected by
the API and Spark job.

In the same Command Prompt used to start Spark:

```bat
set AQUA_DB_USER=root
set AQUA_DB_PASSWORD=your_local_password
set AQUA_DB_TABLE=sensor_readings
```

The default XAMPP connection is `localhost:3306`, database `aquasentry`, user
`root`, with an empty password. If your XAMPP MySQL uses another port or
password, set the connection values before starting the backend:

```bat
set AQUA_DB_URL=jdbc:mysql://localhost:3307/aquasentry?useSSL=false^&serverTimezone=UTC
set AQUA_DB_USER=root
set AQUA_DB_PASSWORD=your_local_password
```

Keep these values in the terminal or a local environment file that is excluded
from source control. Never put the database password in React code or a
`VITE_*` variable.

The `sensor_readings` table stores one row per sensor reading:

| field    | type    | notes                                  |
|----------|---------|----------------------------------------|
| `ts`     | long    | epoch millis                           |
| `sensor` | string  | `ph`, `turbidity`, `temperature`, `tds`, `do`, `optical` |
| `value`  | double  | reading                                |
| `unit`   | string  | display unit                           |
| `stage`  | string  | `intake` or `outlet` (before/after filtration) |
| `mode`   | string  | `normal` or `abnormal`                 |

The password is read only from the local environment or an interactive prompt
and is never sent to the React frontend.

### 2. Run the Spark job

```bash
run-spark-analytics.bat
```

Output: `data/analytics_summary.json`.

### 3. Start the API

```bash
run-api.bat
```

Serves `http://localhost:8080`.

### 4. Connect the React app from VS Code

From the project root, start the frontend in a second VS Code terminal:

```bat
npm run dev
```

The frontend calls the local API at `http://localhost:8080`. To use another
API host, set `VITE_API_URL` before starting Vite:

```bat
set VITE_API_URL=http://localhost:8080
npm run dev
```

The VS Code Database Client/MySQL extension can inspect the same XAMPP database
with host `127.0.0.1`, port `3306`, user `root`, the local password, and
database `aquasentry`. The extension is for browsing and querying; the
application still connects through the Scala API.

## API

| Method | Path             | Purpose |
|--------|------------------|---------|
| GET    | `/api/health`    | backend + Spark status |
| POST   | `/api/ingest`    | append readings to the data source |
| GET    | `/api/analytics` | aggregated result from the Spark job |

`/api/analytics` always reports `spark.state`:

- `READY` — result on disk and newer than 24 h
- `STALE` — result older than 24 h
- `MISSING` — no Spark job has been run yet

The dashboard shows this state verbatim. When Spark or the backend is not
running, the Analytics page falls back to browser-computed data and says so
instead of implying Spark succeeded.

## Cleaning rules

Rows are dropped (and counted in `rowsRejected`) when they are:

- missing or non-numeric `value`
- an unknown sensor id
- outside physical limits (e.g. pH outside 0–14, optical transmission outside 0–100 %)
- exact duplicates on `(ts, sensor, stage)`

## Output shape

```jsonc
{
  "engine": "Apache Spark",
  "generatedAt": 1792074399467,
  "rowsRejected": 3,
  "bucketMinutes": 60,
  "totals":  { "normal": 7271, "warning": 2591, "critical": 2246, "unknown": 0 },
  "modes":   { "normal": 8652, "abnormal": 3456 },
  "sensors": [{
    "sensor": "turbidity", "label": "Turbidity", "unit": "NTU",
    "count": 2018, "avg": 3.0, "min": 1.7, "max": 7.4, "stddev": 1.4,
    "normalCount": 1882, "warningCount": 135, "criticalCount": 0,
    "inRangePct": 93.3, "uptimePct": 100.0,
    "trend": { "direction": "RISING", "slopePerHour": 0.01, "changePct": 1.08,
               "first": 1.9, "last": 3.4 },
    "series": [{ "ts": 1730000000000, "value": 3.2 }]
  }],
  "filtration": [{
    "sensor": "turbidity", "label": "Turbidity", "unit": "NTU",
    "beforeAvg": 3.7, "afterAvg": 2.4,
    "beforeMax": 7.4, "afterMax": 5.1,
    "reductionPct": 34.1, "samples": 4036
  }]
}
```

## Notes

- The filtration comparison is `intake` vs `outlet` averages per sensor.
- Trends use a least-squares slope over the bucketed series.
- All processing is local (`local[*]`); no cluster is required.

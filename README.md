# Zurich Tree Management Application

Educational web demonstrator for municipal tree service-request (SR) workflows, built for Stadt Zürich–style operations using **Open Government Data (OGD) Baumkataster**, a **Google Maps** front end, and a **SQL Server** workflow store.

> **Disclaimer:** This is a research and teaching project. It is **not** affiliated with or endorsed by the City of Zürich.

## Features

- **Map** (`/`) — OGD tree overlay, SR markers, filters, tree/SR pick at high zoom, workflow side panel, citizen SR creation
- **Service Request desk** (`/ServiceRequests`) — Card-based SR queue, search/filters, tabbed detail (overview, details, inspection, work order, activities)
- **Workflow** — SR → inspection → work order → closed, with activity plans per request category
- **i18n** — English and German UI
- **Demo auth** — Read-only for anonymous users; sign in to edit records

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- SQL Server (local instance; default connection uses `localhost\MSSQLSERVER01`)
- Google Maps JavaScript API key (for the map page)

## Quick start

### 1. Database

Run the schema script in SQL Server Management Studio or `sqlcmd`:

```
ZurichTreeManagement.Web/Scripts/CreateTreeManagementZurich.sql
```

This creates database `TreeManagementZurich` and seeds activity-plan templates.

### 2. Configuration

Copy and edit local settings (git-ignored):

```json
// ZurichTreeManagement.Web/appsettings.Development.local.json
{
  "GoogleMaps": {
    "ApiKey": "YOUR_GOOGLE_MAPS_API_KEY"
  },
  "ConnectionStrings": {
    "TreeManagementZurich": "Server=localhost\\MSSQLSERVER01;Database=TreeManagementZurich;Trusted_Connection=True;TrustServerCertificate=True"
  }
}
```

### 3. Run

```bash
cd ZurichTreeManagement.Web
dotnet run --urls http://localhost:5160
```

Open:

- Map: http://localhost:5160/
- Desk: http://localhost:5160/ServiceRequests
- About / user guide: http://localhost:5160/About

### Demo login

When `DemoAuth:Enabled` is true (default in `appsettings.json`):

| User  | Password   | Role  |
|-------|------------|-------|
| admin | Demo2024!  | Admin |
| user  | Demo2024!  | User  |

## Project layout

```
ZurichTreeManagementApp/
├── README.md                          ← this file
├── Research/
│   └── main.tex                       ← thesis / research paper (LaTeX)
├── ExampleResearchOverleafFromDifferentProject/
│   └── main (1).tex                   ← reference paper from prior project
└── ZurichTreeManagement.Web/
    ├── Controllers/                   ← REST API
    ├── Pages/                         ← Razor UI (Map, Desk, About, Login)
    ├── Services/                      ← Workflow, OGD proxy, activities
    ├── Scripts/CreateTreeManagementZurich.sql
    └── wwwroot/js/                    ← Map, desk, workflow, i18n
```

## Research document

A **design-research paper** (vision, theory, governance implications—not a code manual) is in **`Research/main.tex`**.

- Upload the `Research/` folder to [Overleaf](https://www.overleaf.com) and compile `main.tex`.
- Add app screenshots to **`Research/figures/`** (see `figures/README.md` for filenames). The paper compiles without images and shows placeholders until you add them.
- A built-in TikZ **conceptual model** diagram is included in the PDF; six screenshot slots cover map, desk, and workflow views.

## API overview

| Area        | Base route           |
|-------------|----------------------|
| Service requests | `/api/sr`       |
| Inspections | `/api/inspection`    |
| Work orders | `/api/workorder`     |
| Activities  | `/api/activities`    |
| Map markers | `/api/map/markers`   |
| OGD proxy   | `/api/ogd`           |

Write operations require authentication.

## License / use

For academic and demonstration purposes. Do not deploy demo credentials or synthetic citizen data to the public internet without hardening.

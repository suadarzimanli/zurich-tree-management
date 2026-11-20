# Zurich Tree Management

A research demonstrator for **street-tree service requests** in Zürich: citizens report a problem with a specific tree from the City's open tree register (Baumkataster), and staff work each request through **inspection → work order → closure** under one reference number.

> **Disclaimer.** Independent research and teaching project. Not affiliated with, endorsed by or operated for the City of Zürich. Not for real reports.

## What it does

**For residents**
- **Report a tree issue** — tap *Report a tree issue*, tap the tree (or use your location), then four short steps: *Tree → Issue → Contact → Review*. Works with touch, mouse and keyboard; no right-click needed.
- **Duplicate check** — before reporting, the form shows open requests already filed for the same tree.
- **Confirmation** — a reference number and "what happens next".
- **Track a request** (`/Track`) — status, journey and dated timeline by reference number. **Never shows who filed it.**

**For staff** (sign in)
- **Map** with the official tree layer, request pins coloured by phase, and a case panel.
- **Desk** (`/ServiceRequests`) — queue overview (open, urgent, in inspection, work orders, closed, oldest open), aging per request, filters, and a case record with a progress bar and tabs for details, inspection, work order and activities.

English / German, light / dark, phones to desktops.

## Design

Grounded in how comparable services are built:

- **Citizen intake** follows [FixMyStreet](https://fixmystreet.org) — the platform behind Zürich's own *Züri wie neu* — location first, the report snapped to an asset (here the tree), category before contact details, and a duplicate check; and the [GOV.UK patterns](https://design-system.service.gov.uk/patterns/) *check answers* and *confirmation page*.
- **The staff queue** follows case-management research: a short queue showing urgency and age, and a summarised status at the top of every case instead of a raw activity log.
- **Visual language**: Swiss typographic style — Inter on a strict grid, restrained colour. Forest green means *action*; four phase colours (received, inspection, work order, closed) are identical on map pins, the desk and the tracking page. Mobile-first (`wwwroot/css/app.css`).

## Privacy and security

- **Contact details and staff-internal notes are returned only to signed-in staff.** Anonymous API calls, the public map and the tracking page never contain a reporter's name, e-mail or phone, and anonymous search cannot match contact fields (`Services/PublicRedaction.cs`, covered by tests).
- **Server-side validation** of citizen reports: location must be inside Zürich, request type from an allow-list, field lengths bounded.
- **Rate limits** per IP for citizen reports and sign-in (`RateLimits:*` in configuration).
- **Demo sign-in is off by default**; it is enabled only in `appsettings.Development.json`, which holds the demo accounts. Passwords are compared in constant time.
- **No secrets in the repository.** The Google Maps key goes in the git-ignored `appsettings.Development.local.json`. Restrict the key to your own site addresses in Google Cloud.
- A plain-language privacy notice is at `/Privacy`.

## Run it

Prerequisites: [.NET 8 SDK](https://dotnet.microsoft.com/download) (or newer), SQL Server (default instance name `localhost\MSSQLSERVER01`), a Google Maps JavaScript API key.

```bash
# 1. Database (re-runnable), then optional fictional demo data (14 requests on real Zürich trees)
sqlcmd -S "localhost\MSSQLSERVER01" -E -C -i ZurichTreeManagement.Web/Scripts/CreateTreeManagementZurich.sql
sqlcmd -S "localhost\MSSQLSERVER01" -E -C -i ZurichTreeManagement.Web/Scripts/SeedDemoData.sql

# 2. Google Maps key (git-ignored)
#    ZurichTreeManagement.Web/appsettings.Development.local.json:
#    { "GoogleMaps": { "ApiKey": "YOUR_KEY" } }

# 3. Run
cd ZurichTreeManagement.Web
dotnet run --urls http://localhost:5160
```

Open http://localhost:5160 (map), `/ServiceRequests` (desk), `/Track` (tracking), `/About`.

## Tests

```bash
dotnet test ZurichTreeManagement.Tests
```

18 tests: privacy redaction, location and request-type rules, demo sign-in hardening, and in-process API tests for validation, rate limiting and the sign-in requirement for edits (no database needed).

## Data

Tree data: City of Zürich Open Government Data — *Baumkataster* (WMS/WFS), used under the City's open-data terms. Request data is stored locally in SQL Server; the demo data set is entirely fictional (example.ch addresses).

## Licence

Code: MIT.

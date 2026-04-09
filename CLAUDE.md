# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Electronic invoicing system for Ecuador (SRI compliance). Single-tenant (one company, up to 3 branches). Not SaaS.

## Commands

```bash
# Root monorepo
npm run dev          # Start all apps (API + web)
npm run build        # Build all apps
npm run test         # Run all tests
npm run lint         # Lint all apps

# API only (apps/api)
cd apps/api
npm run dev          # NestJS with watch mode
npm run test         # All unit tests
npm run test:watch   # Watch mode
npx jest src/modules/invoices/invoices.service.spec.ts  # Single test file
npm run migration:generate -- --name=MigrationName  # Generate migration
npm run migration:run                                # Run migrations

# Web only (apps/web)
cd apps/web
npm run dev          # Vite dev server (port 5173, proxies /api → :3000)
npm run build        # TypeScript check + Vite build

# Database
node scripts/db-create.js   # Create 'facturacion' DB if not exists
```

## Environment

Copy `.env.example` to `.env` at the repo root. Key variables:
- `DB_PASSWORD` — PostgreSQL password. **Must be quoted** if it contains special chars (e.g., `DB_PASSWORD="Arm2025#"`)
- `ENCRYPTION_KEY` — 32-char key for AES-256-GCM certificate encryption
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — change in production
- `SRI_AMBIENTE` — `1`=pruebas, `2`=producción

## Architecture

**Monorepo layout:**
```
apps/api/          NestJS backend (port 3000)
apps/web/          React+Vite frontend (port 5173)
packages/shared/   Shared TypeScript types and enums (no build step)
scripts/           DB setup utilities
```

**API module structure** (`apps/api/src/modules/`):
- `auth` — JWT + Passport (local + JWT strategies), access/refresh tokens
- `users` — RBAC with `@Roles()` decorator + `RolesGuard`; `seedAdmin()` creates first admin
- `branches` — max 3 per company; `codigoEstablecimiento` + `puntoEmision` are SRI 3-digit codes
- `settings` — single-row config table; AES-256-GCM encryption for `.p12` certificate via `SettingsService.encrypt/decrypt()`
- `clients` — buyer registry; `IdentificationType` enum maps to SRI codes (RUC=04, Cédula=05, etc.)
- `products` — with optional inventory tracking; `IvaRate` enum has valid SRI tariff codes
- `invoices` — core module; creates invoice → enqueues to Bull `sri-queue` → `SriQueueProcessor` calls `procesarConSri()`
- `sri/` — four services:
  - `SriXmlService` — builds XML per SRI v1.0.0 schema; `generarClaveAcceso()` implements módulo-11 algorithm
  - `SriSignatureService` — XAdES-BES signature using `node-forge`; reads `.p12` via `SettingsService`
  - `SriSoapService` — SOAP calls to SRI recepción + autorización endpoints (pruebas/producción)
  - `SriRideService` — generates PDF RIDE using `pdfmake`
- `inventory` — movement log (ENTRADA/SALIDA/AJUSTE); adjusts `Product.stock` when `trackInventory=true`
- `reports` — sales reports and anexo transaccional queries

**DB:** TypeORM with `synchronize: true` in development (auto-creates tables). Use migrations for production. `AppDataSource` in `src/database/data-source.ts` for CLI migration commands.

**Queue:** Bull + Redis/Memurai. SRI processing is async — invoice is created with status `PENDIENTE`, queue processes XML generation → firma → envío → autorización, then updates status to `AUTORIZADO` or `RECHAZADO`.

**Frontend** (`apps/web/src/`):
- `services/api.ts` — Axios instance with auto-refresh interceptor; all API services defined here
- `store/auth.store.ts` — Zustand store (persisted to localStorage)
- `App.tsx` — React Router v7 routes; `PrivateRoute` wrapper checks Zustand auth state
- Pages are in `pages/{module}/`; currently stubs — implement with TanStack Query + React Hook Form + Zod

**Shared package** (`packages/shared/src/`): imported directly as TypeScript source (no compilation needed). Path alias `@facturacion-ec/shared` is configured in both `tsconfig.json` files and `vite.config.ts`.

## SRI-Specific Notes

- **Clave de acceso** (49 digits): `ddMMYYYY` + `codDoc` + `ruc(13)` + `ambiente(1)` + `estab(3)` + `ptoEmi(3)` + `secuencial(9)` + `codigoNumerico(8)` + `tipoEmision(1)` + `digitoVerificador(1)`
- **XAdES-BES**: signature is embedded inside the XML root element (enveloped), not detached
- **IVA tariff codes** for XML: `0`=0%, `2`=12%, `4`=15%, `5`=5%, `8`=8%
- **Default user** seeded on first boot: `admin@empresa.ec` / `Admin1234!` — change immediately
- Swagger UI available at `http://localhost:3000/api/docs`

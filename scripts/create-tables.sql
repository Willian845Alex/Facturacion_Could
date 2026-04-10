-- =============================================================
-- Facturación Electrónica Ecuador - Script de creación de tablas
-- Generado desde entidades TypeORM
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE user_role_enum AS ENUM ('ADMIN', 'VENDEDOR');

CREATE TYPE identification_type_enum AS ENUM ('04', '05', '06', '07');

CREATE TYPE tax_type_enum AS ENUM ('IVA', 'ICE', 'IRBPNR');

CREATE TYPE iva_rate_enum AS ENUM ('0', '5', '8', '15');

CREATE TYPE document_type_enum AS ENUM ('01', '03', '04', '05', '06', '07');

CREATE TYPE invoice_status_enum AS ENUM (
  'BORRADOR', 'PENDIENTE', 'AUTORIZADO', 'RECHAZADO', 'ANULADO'
);

CREATE TYPE sri_transaction_status_enum AS ENUM (
  'PENDIENTE', 'ENVIADO', 'AUTORIZADO', 'RECHAZADO', 'ERROR'
);

CREATE TYPE credit_note_status_enum AS ENUM (
  'PENDIENTE', 'AUTORIZADO', 'RECHAZADO'
);

CREATE TYPE cash_register_status_enum AS ENUM ('ABIERTA', 'CERRADA');

CREATE TYPE movement_type_enum AS ENUM (
  'ENTRADA', 'SALIDA', 'AJUSTE',
  'ENTRADA_COMPRA', 'ENTRADA_AJUSTE', 'ENTRADA_DEVOLUCION',
  'SALIDA_VENTA', 'SALIDA_MERMA', 'SALIDA_AJUSTE'
);

-- =============================================================
-- TABLAS SIN DEPENDENCIAS
-- =============================================================

CREATE TABLE branches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR NOT NULL,
  address       VARCHAR NOT NULL,
  "codigoEstablecimiento" VARCHAR(3) NOT NULL,
  "puntoEmision"          VARCHAR(3) NOT NULL,
  phone         VARCHAR,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE settings (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ruc                       VARCHAR NOT NULL,
  "razonSocial"             VARCHAR NOT NULL,
  "nombreComercial"         VARCHAR NOT NULL,
  "dirMatriz"               VARCHAR NOT NULL,
  telefono                  VARCHAR,
  email                     VARCHAR,
  ambiente                  INTEGER NOT NULL DEFAULT 1,
  "tipoEmision"             INTEGER NOT NULL DEFAULT 1,
  "certificadoP12Encrypted" TEXT,
  "certificadoPassword"     VARCHAR,
  "certificadoVencimiento"  TIMESTAMPTZ,
  "logoBase64"              TEXT,
  "sendInvoiceEmail"        BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE units (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR NOT NULL,
  abbreviation  VARCHAR(10) NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_units_abbreviation ON units (abbreviation);

CREATE TABLE clients (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "identificationType" identification_type_enum NOT NULL,
  identification       VARCHAR NOT NULL,
  name                 VARCHAR NOT NULL,
  email                VARCHAR,
  phone                VARCHAR,
  address              VARCHAR,
  "isActive"           BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_identification ON clients (identification);

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR NOT NULL,
  "auxiliaryCode" VARCHAR,
  name            VARCHAR NOT NULL,
  description     TEXT,
  price           NUMERIC(10, 4) NOT NULL,
  cost            NUMERIC(10, 4) DEFAULT 0,
  unit            VARCHAR,
  "isService"     BOOLEAN NOT NULL DEFAULT FALSE,
  "taxType"       tax_type_enum NOT NULL DEFAULT 'IVA',
  "ivaRate"       iva_rate_enum NOT NULL DEFAULT '15',
  stock           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "trackInventory" BOOLEAN NOT NULL DEFAULT FALSE,
  "minStock"      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_products_code ON products (code);

-- =============================================================
-- TABLAS CON DEPENDENCIAS DE PRIMER NIVEL
-- =============================================================

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR NOT NULL,
  password    VARCHAR NOT NULL,
  name        VARCHAR NOT NULL,
  role        user_role_enum NOT NULL DEFAULT 'VENDEDOR',
  "branchId"  UUID,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT fk_users_branch FOREIGN KEY ("branchId") REFERENCES branches (id)
);

CREATE TABLE invoices (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "claveAcceso"        VARCHAR(49),
  secuencial           VARCHAR(9),
  "documentType"       document_type_enum NOT NULL DEFAULT '01',
  status               invoice_status_enum NOT NULL DEFAULT 'BORRADOR',
  "fechaEmision"       TIMESTAMPTZ NOT NULL,
  "clientId"           UUID NOT NULL,
  "branchId"           UUID NOT NULL,
  "userId"             UUID NOT NULL,
  subtotal12           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  subtotal0            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "totalDescuento"     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "totalIva"           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "importeTotal"       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "xmlSinFirma"        TEXT,
  "xmlFirmado"         TEXT,
  "xmlAutorizado"      TEXT,
  "numeroAutorizacion" VARCHAR,
  "fechaAutorizacion"  TIMESTAMPTZ,
  "mensajesRespuesta"  TEXT,
  "formaPago"          VARCHAR NOT NULL DEFAULT '01',
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_invoices_client FOREIGN KEY ("clientId") REFERENCES clients (id),
  CONSTRAINT fk_invoices_branch FOREIGN KEY ("branchId") REFERENCES branches (id),
  CONSTRAINT fk_invoices_user   FOREIGN KEY ("userId")   REFERENCES users (id)
);

CREATE UNIQUE INDEX uq_invoices_clave_acceso ON invoices ("claveAcceso");
CREATE INDEX idx_invoices_status       ON invoices (status);
CREATE INDEX idx_invoices_fecha        ON invoices ("fechaEmision");
CREATE INDEX idx_invoices_client       ON invoices ("clientId");
CREATE INDEX idx_invoices_branch       ON invoices ("branchId");

CREATE TABLE cash_registers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"         UUID NOT NULL,
  "userName"       VARCHAR NOT NULL,
  "branchId"       UUID NOT NULL,
  status           cash_register_status_enum NOT NULL DEFAULT 'ABIERTA',
  "openedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "closedAt"       TIMESTAMP,
  "initialAmount"  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "totalSales"     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "totalInvoices"  INTEGER NOT NULL DEFAULT 0,
  "totalCash"      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "totalCard"      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "totalTransfer"  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "expectedAmount" NUMERIC(10, 2),
  "actualAmount"   NUMERIC(10, 2),
  difference       NUMERIC(10, 2),
  notes            TEXT
);

-- =============================================================
-- TABLAS CON DEPENDENCIAS DE SEGUNDO NIVEL
-- =============================================================

CREATE TABLE invoice_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "invoiceId" UUID NOT NULL,
  "productId" UUID,
  code        VARCHAR NOT NULL,
  description VARCHAR NOT NULL,
  quantity    NUMERIC(10, 2) NOT NULL,
  "unitPrice" NUMERIC(10, 4) NOT NULL,
  discount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "ivaRate"   INTEGER NOT NULL DEFAULT 15,
  subtotal    NUMERIC(10, 2) NOT NULL,
  "ivaAmount" NUMERIC(10, 2) NOT NULL,
  total       NUMERIC(10, 2) NOT NULL,
  CONSTRAINT fk_items_invoice FOREIGN KEY ("invoiceId") REFERENCES invoices (id) ON DELETE CASCADE
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items ("invoiceId");

CREATE TABLE sri_transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "invoiceId"   UUID NOT NULL,
  "claveAcceso" VARCHAR,
  status        sri_transaction_status_enum NOT NULL DEFAULT 'PENDIENTE',
  attempts      INTEGER NOT NULL DEFAULT 0,
  "requestXml"  TEXT,
  "responseRaw" TEXT,
  "errorMessage" VARCHAR,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_sri_tx_invoice FOREIGN KEY ("invoiceId") REFERENCES invoices (id) ON DELETE CASCADE
);

CREATE INDEX idx_sri_transactions_invoice ON sri_transactions ("invoiceId");
CREATE INDEX idx_sri_transactions_status  ON sri_transactions (status);

CREATE TABLE credit_notes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "originalInvoiceId" UUID NOT NULL,
  sequential          VARCHAR,
  "claveAcceso"       VARCHAR UNIQUE,
  motive              TEXT NOT NULL,
  type                VARCHAR NOT NULL DEFAULT 'TOTAL',
  status              credit_note_status_enum NOT NULL DEFAULT 'PENDIENTE',
  "issueDate"         TIMESTAMPTZ NOT NULL,
  total               NUMERIC(10, 2) NOT NULL,
  "xmlSinFirma"       TEXT,
  "xmlFirmado"        TEXT,
  "xmlAutorizado"     TEXT,
  "numeroAutorizacion" VARCHAR,
  "fechaAutorizacion" TIMESTAMPTZ,
  "mensajesRespuesta" TEXT,
  "branchId"          UUID NOT NULL,
  "userId"            UUID NOT NULL,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_credit_notes_invoice FOREIGN KEY ("originalInvoiceId") REFERENCES invoices (id)
);

CREATE UNIQUE INDEX uq_credit_notes_clave_acceso ON credit_notes ("claveAcceso");
CREATE INDEX idx_credit_notes_invoice ON credit_notes ("originalInvoiceId");
CREATE INDEX idx_credit_notes_status  ON credit_notes (status);

CREATE TABLE inventory_movements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "productId"  UUID NOT NULL,
  type         movement_type_enum NOT NULL,
  quantity     NUMERIC(10, 2) NOT NULL,
  "stockBefore" NUMERIC(10, 2) NOT NULL,
  "stockAfter"  NUMERIC(10, 2) NOT NULL,
  "referenceId" VARCHAR,
  reference    VARCHAR,
  "unitCost"   NUMERIC(10, 4),
  notes        VARCHAR,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_inv_movements_product FOREIGN KEY ("productId") REFERENCES products (id)
);

CREATE INDEX idx_inv_movements_product ON inventory_movements ("productId");
CREATE INDEX idx_inv_movements_type    ON inventory_movements (type);
CREATE INDEX idx_inv_movements_created ON inventory_movements ("createdAt");

# 🧾 Sistema de Facturación Electrónica — Ecuador

Sistema completo de facturación electrónica desarrollado para el mercado ecuatoriano, con integración oficial al SRI (Servicio de Rentas Internas). Construido como monorepo con arquitectura moderna orientada a producción.

> ⚡ Proyecto en producción real — desplegado y operativo para negocios en Ecuador.

---

## 🚀 Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS + TypeScript |
| Frontend | React + TypeScript + Vite |
| Base de datos | PostgreSQL 16 |
| Cola de tareas | Redis + BullMQ |
| Firma electrónica | Java + Apache Santuario (XAdES-BES) |
| PDF | Puppeteer + Chromium |
| Monorepo | Turborepo |
| Infraestructura | Docker + Docker Compose |

---

## 📁 Estructura del proyecto

```
apps/
  api/          — Backend NestJS
  web/          — Frontend React
  signer/       — Firmador JAR Java (XAdES-BES)
packages/
  shared/       — Tipos compartidos entre apps
```

---

## ✅ Módulos implementados

- **Autenticación** — JWT con refresh token, roles ADMIN / VENDEDOR
- **Empresas y sucursales** — Configuración, certificado .p12 cifrado AES-256
- **Clientes** — Validación de cédula, RUC y pasaporte
- **Productos** — Código autogenerado, búsqueda por nombre y código de barras
- **Inventario** — Kardex con movimientos de entrada y salida
- **POS** — Punto de venta con búsqueda en tiempo real
- **Facturación electrónica** — XML v1.1.0, firma XAdES-BES, envío SOAP al SRI
- **RIDE PDF** — Generación con Puppeteer
- **Tirilla térmica** — Formato 80mm para impresoras térmicas
- **Email automático** — Envío del PDF y XML al cliente tras autorización del SRI
- **Notas de crédito** — Emisión y autorización electrónica
- **Caja** — Apertura, cierre y cuadre con historial
- **Dashboard** — Métricas de los últimos 7 días
- **Reportes** — Ventas, ATS, inventario y Kardex
- **Backups** — Automáticos diarios a las 2am

---

## 🔌 Integración SRI

| Endpoint | URL |
|----------|-----|
| Recepción | `https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl` |
| Autorización | `https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl` |

- Versión de comprobante: **1.1.0**
- Formato de firma: **XAdES-BES / RSA-SHA1**
- Certificado: **Security Data (.p12)**

---

## ⚙️ Flujo de facturación

```
Cajero emite factura
       ↓
API responde en < 1 segundo
       ↓
Modal "Factura guardada" + botón imprimir tirilla
       ↓ (segundo plano)
Firma XAdES-BES con JAR Java
       ↓
Envío SOAP al SRI
       ↓
SRI autoriza en 20–40 segundos
       ↓
Toast "✅ Factura autorizada" + email automático al cliente
```

---

## 🐳 Despliegue con Docker

Cada instancia levanta 4 contenedores:

```
facturacion_db     — PostgreSQL
facturacion_redis  — Redis
facturacion_api    — NestJS API
facturacion_web    — Nginx + React
```

### Requisitos

- Docker y Docker Compose instalados
- Node.js 20+
- Java 11+ (para compilar el firmador)

### Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/Willian845Alex/Facturacion_Could.git
cd Facturacion_Could

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores reales

# 3. Levantar los contenedores
docker compose up -d --build

# 4. Ver logs
docker compose logs api --tail=50
```

---

## 🔐 Variables de entorno

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

| Variable | Descripción |
|----------|-------------|
| `DB_*` | Conexión a PostgreSQL |
| `JWT_SECRET` | Clave secreta para tokens de acceso |
| `JWT_REFRESH_SECRET` | Clave secreta para refresh tokens |
| `ENCRYPTION_KEY` | Clave AES-256 para cifrar el certificado .p12 |
| `SRI_AMBIENTE` | `1` = pruebas, `2` = producción |
| `SMTP_*` | Configuración del servidor de correo |
| `SIGNER_JAR_PATH` | Ruta al JAR del firmador dentro del contenedor |

> ⚠️ Nunca subas tu archivo `.env` real al repositorio.

---

## 📜 Licencia

Todos los derechos reservados © 2026.  
Este proyecto es de uso privado. No está permitida su reproducción, distribución ni uso comercial sin autorización expresa del autor.

---

*Desarrollado con ❤️ para el ecosistema de facturación electrónica ecuatoriano.*
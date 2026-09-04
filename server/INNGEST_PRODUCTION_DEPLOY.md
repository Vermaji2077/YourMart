# 🚀 Inngest — Guía de Deploy a Producción

Documento de referencia para desplegar correctamente Inngest al pasar de desarrollo a producción.

---

## ⚠️ El cambio crítico

En `inngest/index.ts`, **NO dejar** `isDev: true` fijo. Usar:

```typescript
export const inngest = new Inngest({
  id: "grocery-delivery",
  isDev: process.env.NODE_ENV !== "production",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
```

> Si dejas `isDev: true` en producción, el cliente intentará hablar con el dev server local y **todo fallará en producción**.

---

## 📋 Checklist pre-deploy

### 1. Variables de entorno en producción

En tu hosting (Render, Railway, Vercel, Fly, etc.) configura:

| Variable | Valor | Origen |
|----------|-------|--------|
| `NODE_ENV` | `production` | Manual en el hosting |
| `INNGEST_EVENT_KEY` | Key de producción | Inngest Cloud |
| `INNGEST_SIGNING_KEY` | Key de producción | Inngest Cloud |

> ⚠️ **Nunca** subir al repo las keys reales. Solo en el panel del hosting.

### 2. Obtener las keys en Inngest Cloud

1. Entra a https://app.inngest.com/env/production/apps/grocery-delivery
2. Ve a **Settings** de tu entorno `production`
3. Copia:
   - **Event Key** → `INNGEST_EVENT_KEY`
   - **Signing Key** → `INNGEST_SIGNING_KEY`

### 3. Endpoint `/api/inngest` montado

Verificar que existe en el server:

```typescript
// server.ts / app.ts
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js";

app.use("/api/inngest", serve({ client: inngest, functions }));
```

O en Next.js (App Router):

```typescript
// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest, functions } from "@/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
```

> El endpoint debe ser **públicamente accesible** desde Internet (no protegido por auth).

### 4. URL pública del endpoint

Inngest Cloud necesita poder hacer requests a tu server. Anota:

```
https://TU-DOMINIO.com/api/inngest
```

Ejemplos:
- `https://api.miapp.com/api/inngest`
- `https://miapp.vercel.app/api/inngest`
- `https://miapp.onrender.com/api/inngest`

---

## 🔧 Configuración en Inngest Cloud

### 1. Crear/sincronizar la app

1. Entra a https://app.inngest.com
2. Selecciona tu entorno `production`
3. Ve a **Apps** → busca `grocery-delivery`
4. Si no aparece, click en **Sync new app**
5. Pega la URL: `https://TU-DOMINIO.com/api/inngest`
6. Click en **Sync**

Debería aparecer tu app con las **3 funciones**:
- `check-low-stock`
- `send-monthly-offers`
- `auto-assign-rider`

### 2. Verificar registro

En **Functions** deberías ver las 3 funciones listadas. Si no, revisa:
- La URL es accesible públicamente
- Las variables de entorno están bien configuradas
- El server está corriendo

---

## 🧪 Smoke test post-deploy

### Test 1: Disparar evento manual desde Inngest

1. Ve a https://app.inngest.com/env/production/functions
2. Selecciona `auto-assign-rider`
3. Click **Invoke** → envía:

```json
{
  "name": "order/placed",
  "data": {
    "orderId": "TEST_ORDER_ID_REAL"
  }
}
```

4. Verifica que la función se ejecuta (debería esperar 5 min y asignar rider)

### Test 2: Crear orden real desde el frontend

1. Haz login en tu app
2. Añade productos al carrito
3. Checkout con tarjeta
4. Verifica que:
   - La orden se crea en DB
   - Se redirige a `/orders/:id`
   - En Inngest Cloud → **Events** ves `order/placed` y `inventory/stock.updated`
   - Las funciones se ejecutan

---

## 🔐 Seguridad

- ✅ Las keys de producción **nunca** en el repo
- ✅ Usar el `.gitignore` correctamente:

```
.env
.env.production
.env.local
```

- ✅ Rotar las keys si se exponen accidentalmente (Inngest → Settings → Regenerate)
- ✅ El endpoint `/api/inngest` **no requiere auth** pero sí firma por signing key (eso lo hace Inngest automáticamente)

---

## 🐛 Troubleshooting en producción

| Error | Causa probable | Solución |
|-------|----------------|----------|
| `Expected server kind cloud, got dev` | `isDev: true` quedó fijo | Cambiar a `process.env.NODE_ENV !== "production"` |
| `No x-inngest-signature provided` | Falta `INNGEST_SIGNING_KEY` en el hosting | Agregar la variable de entorno |
| `Cannot connect to <url>` | El server no es accesible públicamente | Revisar firewall/CORS/dominio |
| `App not found in Inngest Cloud` | No se sincronizó la app | Sync manual con la URL del endpoint |
| Funciones no se ejecutan | URL del endpoint mal configurada | Verificar `https://...` y que responde 200 |

---

## 📁 Archivos del proyecto

### `inngest/index.ts` (referencia final)

```typescript
import { cron, Inngest } from "inngest";
import { prisma } from "../config/prisma.js";
import sendEmail from "../config/nodemailer.js";
import { monthlyOffersTemplate } from "../templates/Monthlyoffers.js";
import { lowStockAlertTemplate } from "../templates/Lowstockalert.js";

const LOW_STOCK_THRESHOLD = 10;

export const inngest = new Inngest({
  id: "grocery-delivery",
  isDev: process.env.NODE_ENV !== "production",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});

// ... tus 3 funciones: checkLowStock, sendMonthlyOffers, autoAssignRider ...

export const functions = [checkLowStock, sendMonthlyOffers, autoAssignRider];
```

### `.env.example` (para subir al repo, sin valores reales)

```env
# Server
NODE_ENV=development
PORT=3000

# Inngest (producción)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Otros
DATABASE_URL=
ADMIN_EMAILS=
CLIENT_URL=
```

---

## ✅ Resumen ejecutivo

1. Cambiar `isDev: true` → `isDev: process.env.NODE_ENV !== "production"`
2. Configurar 3 env vars en el hosting: `NODE_ENV`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
3. Verificar que `/api/inngest` existe y responde
4. Sync la app en Inngest Cloud con la URL pública
5. Probar con un invoke manual + una orden real

**Tiempo estimado:** 15-20 minutos si todo está bien montado.

---

*Documento creado el 2026-06-25 — basado en troubleshooting real durante desarrollo local.*
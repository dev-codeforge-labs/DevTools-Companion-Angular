# DevTools Companion for Angular — Guía de instalación y manual de usuario

## Tabla de contenidos

1. [Requisitos](#1-requisitos)
2. [Instalación](#2-instalación)
   - [Opción A — XPI permanente (usuario personal)](#opción-a--xpi-permanente-usuario-personal)
   - [Opción B — Instalación temporal (desarrolladores)](#opción-b--instalación-temporal-desarrolladores)
   - [Opción C — Firefox Developer Edition / Nightly](#opción-c--firefox-developer-edition--nightly)
   - [Opción D — AMO (distribución pública)](#opción-d--amo-distribución-pública)
3. [Primeros pasos](#3-primeros-pasos)
4. [Manual de usuario](#4-manual-de-usuario)
   - [🌲 Components — Árbol de componentes](#-components--árbol-de-componentes)
   - [📡 HTTP — Monitor de peticiones](#-http--monitor-de-peticiones)
   - [🗄️ Store — Gestión de estado](#️-store--gestión-de-estado)
   - [🛣️ Router — Inspector de rutas](#️-router--inspector-de-rutas)
   - [💉 DI — Inyección de dependencias](#-di--inyección-de-dependencias)
   - [⚡ Performance — Profiler](#-performance--profiler)
   - [🗺️ Sources — Source Maps](#️-sources--source-maps)
   - [⚙️ Settings — Configuración](#️-settings--configuración)
5. [Limitaciones conocidas](#5-limitaciones-conocidas)
6. [Solución de problemas](#6-solución-de-problemas)

---

## 1. Requisitos

| Requisito | Firefox | Chrome |
|---|---|---|
| Versión mínima del navegador | 115+ (ESR o Stable) | 120+ |
| Angular (app inspeccionada) | 12 — 18+ | 12 — 18+ |
| Node.js (solo para el build) | 18+ | 18+ |

DevTools Companion for Angular es compatible con **Firefox** y **Chrome**. El build de Firefox genera un `.xpi`; el de Chrome genera un `.zip` listo para subir a Chrome Web Store o cargar como extensión desempaquetada.

---

## 2. Instalación

### Opción A — XPI permanente (usuario personal)

Esta opción instala la extensión de forma permanente sin pasar por AMO. Requiere desactivar la verificación de firma solo para Firefox ESR o versiones de desarrollo, **o** usar el archivo `.xpi` previamente firmado.

#### Paso 1 — Generar el XPI (si no lo tienes ya)

```bash
# Desde la carpeta angular-inspector/
node build.js
# El archivo resultante estará en dist/angular-inspector.xpi
```

#### Paso 2 — Activar la instalación desde archivos locales

1. Abre Firefox y escribe en la barra de dirección:
   ```
   about:config
   ```
2. Acepta la advertencia y busca:
   ```
   xpinstall.signatures.required
   ```
3. Cambia el valor a **`false`** haciendo clic en el botón de alternancia.

   > Esta opción solo está disponible en **Firefox Developer Edition**, **Firefox Nightly** y **Firefox ESR**. En Firefox estable esta preferencia no existe o no tiene efecto.

#### Paso 3 — Instalar el XPI

1. Abre el menú de Firefox (☰) → **Complementos y temas** (o `about:addons`).
2. Haz clic en el ícono de engranaje ⚙ → **Instalar complemento desde archivo…**
3. Selecciona `dist/angular-inspector.xpi`.
4. Confirma la instalación en el diálogo que aparece.

La extensión queda instalada de forma permanente y sobrevive reinicios del navegador.

---

### Opción B — Instalación temporal (desarrolladores)

Esta opción no requiere firma ni modificar preferencias. La extensión se elimina al cerrar Firefox, pero es la forma más rápida para probar cambios durante el desarrollo.

1. Abre Firefox y navega a:
   ```
   about:debugging#/runtime/this-firefox
   ```
2. Haz clic en **Cargar complemento temporal…**
3. Navega a la carpeta `angular-inspector/` y selecciona el archivo **`manifest.json`**.
4. La extensión aparece en la lista con un contador de tiempo de vida.

> Cada vez que modifiques el código fuente, haz clic en **Recargar** junto al nombre de la extensión para aplicar los cambios sin necesidad de reinstalarla.

---

### Opción C — Firefox Developer Edition / Nightly

Firefox Developer Edition y Nightly tienen la verificación de firma deshabilitada por defecto, por lo que el XPI se puede instalar directamente:

1. Descarga [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/) o [Firefox Nightly](https://www.mozilla.org/firefox/channel/desktop/#nightly).
2. Sigue los **pasos 2 y 3 de la Opción A** (sin necesidad de cambiar `xpinstall.signatures.required`).

---

### Opción D — AMO (distribución pública)

Para que cualquier usuario pueda instalar DevTools Companion for Angular desde `addons.mozilla.org`:

#### Requisitos previos

- Cuenta de desarrollador en [addons.mozilla.org](https://addons.mozilla.org/developers/)
- `npm install` ejecutado en la carpeta del proyecto (instala `web-ext`)
- Credenciales de la API de AMO (se obtienen en `addons.mozilla.org/developers/addon/api/key/`)

#### Proceso de firma y envío

```bash
# 1. Validar la extensión con web-ext
npm run lint

# 2a. Firma automática (canal unlisted — no aparece en búsquedas AMO)
#     El .xpi firmado se descargará automáticamente en dist/
AMO_API_KEY=user:xxxxx AMO_API_SECRET=xxxxxx npm run sign

# 2b. Alternativamente, sube el XPI de forma manual:
#     addons.mozilla.org → Developer Hub → Submit a New Add-on
#     → Upload your add-on → selecciona dist/angular-inspector.xpi
```

Una vez aprobada (revisión automática en minutos para extensiones de bajo riesgo), los usuarios pueden instalarla con un clic desde AMO y recibirán actualizaciones automáticas.

---

## 3. Primeros pasos

1. **Abre una aplicación Angular** en cualquier pestaña de Firefox. Puede ser local (`localhost`) o remota.
2. **Abre las herramientas de desarrollador** con `F12` o `Ctrl+Shift+I`.
3. Busca la pestaña **DevTools Companion for Angular** en la barra de pestañas de DevTools (puede estar oculta detrás del botón `»` si hay muchas pestañas abiertas).
4. Si la app Angular está en **modo desarrollo**, verás el badge verde **Angular (ivy)** en la esquina superior derecha del panel.
5. Si la app está en **modo producción**, aparecerá un aviso amarillo con el botón **Enable Debug Tools**. Haz clic para activar las APIs de inspección (requiere confirmación).

> **Tip:** Si el badge muestra "Detecting Angular…" durante más de 10 segundos, recarga la página con la pestaña de DevTools ya abierta. Algunas SPAs completan su bootstrap después de que el content script se inyecta.

---

## 4. Manual de usuario

### 🌲 Components — Árbol de componentes

Es la pestaña principal. Muestra la jerarquía completa de componentes Angular renderizados en la página.

#### Vista de árbol (panel izquierdo)

| Elemento | Descripción |
|---|---|
| Nombre en negrita | Clase del componente (`AppComponent`, `HeroListComponent`…) |
| `<selector>` en gris | Selector HTML usado en la plantilla |
| Badge `OnPush` | Indica que el componente usa la estrategia `OnPush` |
| ▸ / ▾ | Expande o colapsa los hijos del nodo |

**Acciones disponibles:**

- **Clic en un nodo** — selecciona el componente y muestra sus detalles en el panel derecho. Un overlay rojo resalta el elemento DOM correspondiente en la página.
- **Campo de búsqueda** — filtra el árbol por nombre de clase o selector. El árbol se actualiza en tiempo real.
- **Botón ⊕ (picker)** — activa el modo de selección: haz clic en cualquier elemento de la página para saltar directamente al componente correspondiente en el árbol.
- **Botón ↺** — fuerza una nueva exploración del árbol (útil si la app modifica el DOM dinámicamente).

#### Panel de detalles (panel derecho)

Cuando seleccionas un componente, se muestran cuatro secciones:

**Component** — información básica:

| Campo | Contenido |
|---|---|
| Class | Nombre de la clase TypeScript |
| Selector | Selector CSS del componente |
| CD Strategy | `Default` o `OnPush` |
| Element | Tag HTML del elemento host |

**@Input() Bindings** — todos los `@Input()` del componente con sus valores actuales.

- Los valores son editables: haz clic en el valor (campo azul), escribe un nuevo valor en JSON válido y pulsa `Tab` o haz clic fuera. El cambio se aplica inmediatamente en la página sin necesidad de recargar.

**@Output() Events** — lista de todos los `EventEmitter` declarados como `@Output()`.

**Properties** — resto de propiedades públicas del componente que no son `@Input()`.

**Botones de acción:**

- **Copy JSON** — copia el estado completo del componente al portapapeles como JSON.
- **Clear Highlight** — elimina el overlay rojo de la página.

---

### 📡 HTTP — Monitor de peticiones

Captura todas las peticiones HTTP realizadas por la aplicación vía `XMLHttpRequest` y `fetch()`, tanto las generadas por `HttpClient` de Angular como las directas.

> La captura comienza cuando la extensión inyecta el bridge en la página. Peticiones lanzadas antes de que se abran las DevTools pueden no aparecer.

#### Lista de peticiones (panel izquierdo)

Cada fila muestra:

| Columna | Descripción |
|---|---|
| Método | Badge de color: `GET` verde, `POST` azul, `PUT` amarillo, `DELETE` rojo, `PATCH` gris |
| Status | Código HTTP: verde (2xx), amarillo (3xx), rojo (4xx/5xx) |
| URL | URL completa (truncada, tooltip con la URL completa) |
| Duración | Tiempo de respuesta en milisegundos |
| Hora | Hora local de la petición |

Una barra roja a la izquierda de la fila indica que la petición superó el umbral de **petición lenta** (configurable en Settings, por defecto 1000 ms).

El badge numérico rojo en la pestaña **HTTP** cuenta las peticiones fallidas (4xx / 5xx) desde la última limpieza del log.

**Filtros disponibles (barra de herramientas):**

- **URL** — texto libre, filtra por subcadena de la URL.
- **Método** — desplegable: All / GET / POST / PUT / DELETE / PATCH.
- **Status** — desplegable: All / 2xx / 3xx / 4xx / 5xx.
- **Botón ✕** — limpia el log completo.

#### Detalle de petición (panel derecho)

Haz clic en una fila para ver cuatro pestañas:

| Pestaña | Contenido |
|---|---|
| **Headers** | Cabeceras de la petición y de la respuesta |
| **Request** | Cuerpo de la petición (JSON auto-formateado) |
| **Response** | Cuerpo de la respuesta (JSON auto-formateado, hasta 50 KB) |
| **Timing** | Hora de inicio, hora de fin, duración y código de estado |

---

### 🗄️ Store — Gestión de estado

Inspecciona los stores NgRx, Akita y NGXS activos en la aplicación. La detección es automática al cargar la página.

El badge en la barra de herramientas indica el tipo de store detectado (`NGRX`, `AKITA`, `NGXS`).

#### Log de acciones (panel izquierdo)

Muestra todas las acciones despachadas en orden cronológico inverso (la más reciente arriba).

- **Clic en una acción** — el árbol de estado del panel derecho retrocede al snapshot de ese momento (time-travel).
- **Campo de búsqueda** — filtra acciones por tipo.
- **Botón ✕** — limpia el log y los snapshots.

#### Árbol de estado (panel derecho)

Muestra el estado completo del store en formato JSON interactivo:

- Haz clic en `▾` / `▸` para expandir o contraer nodos.
- **Search keys** — filtra el árbol por nombre de clave o valor.
- **Current State** — salta al snapshot más reciente.
- **Export JSON** — copia el estado actual al portapapeles.

---

### 🛣️ Router — Inspector de rutas

Muestra el estado del Router de Angular: ruta activa, historial de navegaciones y configuración de rutas.

#### Current Route

| Campo | Descripción |
|---|---|
| URL | URL completa activa en el navegador |
| Path | Segmento de ruta normalizado |
| Component | Componente asociado a la ruta activa |
| Params | Parámetros de ruta (`:id`, `:slug`…) |
| Query Params | Parámetros de query (`?search=…&page=…`) |
| Data | Datos estáticos definidos en la configuración de rutas |

#### Navigation History

Lista cronológica de todos los eventos de navegación. Las filas rojas indican un `NavigationError`; las amarillas, un `NavigationCancel` (por ejemplo, rechazado por un guard).

- **Botón Clear** — borra el historial de navegación.

#### Route Configuration

Árbol colapsable con la estructura completa de rutas registradas en la aplicación:

- Las rutas lazy-loaded muestran el badge **lazy**.
- Las rutas con `canActivate` muestran el indicador **guard**.
- La rama activa aparece resaltada en rojo.

---

### 💉 DI — Inyección de dependencias

Permite explorar los servicios inyectados en el componente seleccionado en la pestaña **Components**.

#### Lista de servicios (panel izquierdo)

Muestra todos los servicios resueltos por el injector del componente seleccionado.

| Columna | Descripción |
|---|---|
| Nombre | Clase del servicio |
| Scope | `root`, `module` o `component` según el nivel del injector |
| ⚠ Circular | Badge de advertencia si se detecta una dependencia circular |

La sección **Root Providers** en la parte inferior lista todos los providers registrados a nivel raíz.

#### Detalle de servicio (panel derecho)

Haz clic en un servicio para ver sus propiedades públicas con sus valores actuales en tiempo de ejecución.

---

### ⚡ Performance — Profiler

Monitoriza los ciclos de change detection de Angular y detecta posibles fugas de suscripciones.

#### Métricas (tarjetas superiores)

| Métrica | Descripción |
|---|---|
| Total CD Cycles | Número total de ciclos de change detection desde que se abrió el panel |
| Avg Duration | Duración media de un ciclo en ms |
| Min / Max | Duración mínima y máxima registrada |

#### CD Timeline

Gráfico de barras que muestra los últimos 60 ciclos de change detection:

| Color | Significado |
|---|---|
| Rojo (normal) | Ciclo con duración dentro del umbral |
| Amarillo | Ciclo lento (> 16 ms, más de un frame a 60 fps) |
| Rojo intenso | Ciclo crítico (> 50 ms) |

Pasa el cursor sobre una barra para ver la duración exacta, el trigger y la hora.

#### Most Checked Components

Tabla con los 10 componentes comprobados con mayor frecuencia. Los componentes con estrategia **Default** que aparecen en lo alto de la tabla son candidatos a migrar a **OnPush** para mejorar el rendimiento.

#### Subscription Leaks

Si DevTools Companion for Angular detecta suscripciones a Observables que no se han desuscrito al destruirse el componente, aparece una sección de alertas con el nombre del componente y el número de suscripciones fugadas.

**Botones:**

- **▶ Record** — activa la instrumentación de ciclos en la página.
- **✕ Clear** — borra todos los datos registrados.
- **⬇ Export** — copia los datos como JSON al portapapeles.

---

### 🗺️ Sources — Source Maps

Permite navegar y leer el código TypeScript original de la aplicación cuando el servidor sirve archivos `.js.map`.

#### Explorador de archivos (panel izquierdo)

Árbol de todos los ficheros `.ts` originales descubiertos a partir de los source maps de los bundles cargados. Los archivos se agrupan por directorio.

- **Haz clic en un archivo** para ver su contenido con resaltado de sintaxis TypeScript en el panel derecho.
- **Campo de búsqueda** — filtra la lista de archivos por ruta o nombre.

#### Visor de código (panel derecho)

Muestra el contenido del archivo seleccionado con coloreado de sintaxis (palabras clave, decoradores, strings, números y comentarios).

Desde la pestaña **Components**, el menú contextual de un componente (cuando los source maps están disponibles) incluye la opción **Jump to source**, que abre directamente el archivo `.ts` del componente en esta pestaña y desplaza el scroll hasta la línea correspondiente.

> Si no hay source maps disponibles, el panel muestra un aviso. La mayoría de despliegues en producción no sirven archivos `.map`.

---

### ⚙️ Settings — Configuración

| Ajuste | Descripción | Valor por defecto |
|---|---|---|
| **Theme** | Dark / Light / System | Dark |
| **Capture request/response bodies** | Almacena los cuerpos de las peticiones HTTP en el log | Activado |
| **Max HTTP history** | Número máximo de peticiones a retener en memoria | 500 |
| **Slow request threshold** | Umbral en ms para marcar una petición como lenta | 1000 ms |
| **CD cycle alert threshold** | Ciclos/segundo a partir de los cuales se dispara una alerta de rendimiento | 60 |
| **Auto-clear on navigation** | Limpia el log HTTP y el CD al cambiar de ruta | Desactivado |
| **Angular detection timeout** | Segundos que espera para detectar Angular en la página | 10 s |
| **Prompt to enable debug mode** | Muestra el botón para activar las debug tools en producción | Activado |

Haz clic en **Save Settings** para persistir los cambios. Los ajustes se guardan en `browser.storage.local` y sobreviven reinicios del navegador.

---

## 5. Limitaciones conocidas

| Limitación | Detalle |
|---|---|
| **Modo producción** | En builds de producción, Angular elimina las APIs `ng.*`. El árbol de componentes y el inspector de DI no funcionan. Los módulos HTTP, Router y Sources sí siguen disponibles. |
| **Source maps en producción** | La mayoría de despliegues no sirven archivos `.map`. El visor de Sources solo funciona con source maps activos. |
| **Zone.js-less (Angular 18+)** | Las apps Angular 18+ sin Zone.js pueden no disparar los hooks de change detection. El profiler puede no registrar ciclos en ese caso. |
| **Nombres ofuscados** | Si el bundle está minificado sin source maps, los nombres de clases aparecerán ofuscados (`t`, `n`, `e`…). |
| **Iframes cross-origin** | No es posible inspeccionar componentes Angular dentro de un `<iframe>` con origen distinto al de la página principal. |
| **Peticiones anteriores a la apertura del panel** | El interceptor HTTP se instala al cargar la página. Las peticiones realizadas antes de abrir DevTools no aparecen en el log. |

---

## 6. Solución de problemas

### La pestaña DevTools Companion for Angular no aparece en DevTools

- Verifica que la extensión está instalada y habilitada en `about:addons`.
- Cierra y vuelve a abrir las herramientas de desarrollador (`F12` dos veces).
- En `about:debugging`, comprueba que la extensión aparece en la lista sin errores.

### El badge muestra "No Angular" en una app Angular

- La app puede estar en proceso de bootstrap. Recarga la página con DevTools ya abierto.
- En SPAs con carga diferida, espera a que la app complete la inicialización.
- Comprueba en la consola del navegador si hay errores de JavaScript que impidan el bootstrap de Angular.

### El árbol de componentes aparece vacío en modo producción

- Haz clic en **Enable Debug Tools** en el banner amarillo. Esto invoca `enableDebugTools()` en el contexto de la página, lo que reactiva las APIs `ng.*`.
- En algunos bundles de producción esto no es posible. En ese caso, usa las pestañas HTTP y Router, que no dependen de `ng.*`.

### Las peticiones HTTP no aparecen en el monitor

- Asegúrate de que la página se ha cargado **después** de instalar la extensión (el interceptor se inyecta al cargar el document).
- Algunas librerías que envuelven `fetch` o `XMLHttpRequest` antes de que el bridge se inyecte pueden no ser interceptadas. Recarga la página con DevTools abierto.

### El build falla con errores de Node.js

```bash
# Verifica la versión de Node.js (requiere 18+)
node --version

# Si la carpeta dist/ tiene permisos incorrectos
rm -rf dist/
node build.js
```

### La extensión se desinstala al cerrar Firefox (Opción B)

Esto es el comportamiento esperado de la instalación temporal. Para persistencia, usa la **Opción A** (XPI permanente) o la **Opción D** (AMO).

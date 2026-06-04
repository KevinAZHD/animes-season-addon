# Animes' Seasons

<p align="center">
  <img src="assets/logo.png" alt="Animes' Seasons Logo" width="150" height="150"/>
</p>

Este addon de Stremio muestra catálogos de animes organizados por temporadas (actual y próxima temporada). Es un **fork** del repositorio original [victorgveloso/animes-season-addon](https://github.com/victorgveloso/animes-season-addon) con mejoras y características añadidas.

---

## Español

### Detalles Técnicos y Arquitectura
El addon funciona generando catálogos estáticos que Stremio lee directamente. Estos se actualizan a diario automáticamente mediante GitHub Actions.

#### 1. Flujo de Generación de Datos
```mermaid
graph TD
    A[Disparador Diario / Manual] --> B[Obtener Anime Estacional desde Jikan API]
    B --> C[Obtener Metadatos desde AniList GraphQL via idMal_in]
    C --> D[Mapear y Resolver IDs Kitsu/IMDb/TMDB]
    D --> E[Aplicar Parches Manuales]
    E --> F[Ordenar por Miembros de MyAnimeList]
    F --> G[Escribir Catálogos JSON Estáticos y Actualizar manifest.json]
```

#### 2. Especificaciones Técnicas
- **Obtención de Datos (Jikan API):** Consulta la base de datos estacional de MyAnimeList ordenada por número de miembros (`order_by=members&sort=desc`). Se aplican retrasos de seguridad de 400ms para respetar los límites de la API (evitando errores `429`).
- **Integración de Metadatos Híbrida (AniList GraphQL):** Para mostrar pósters en alta resolución y títulos en Romaji japonés, se realiza una única consulta en bloque usando `idMal_in`. Si no se encuentra un anime o la API falla, se usan los datos nativos de Jikan como respaldo.
- **Cadena de Resolución de IDs (IdResolver):** Mapea los animes a identificadores compatibles con Stremio (Kitsu/IMDb) mediante los siguientes pasos recursivos:
  1. **API Yuna (ARM):** Búsqueda rápida de equivalencias de IDs.
  2. **Esquema de Kitsu:** Consulta directa a los mapeos de `anime-kitsu.strem.fun`.
  3. **Búsqueda por Nombre (name-to-imdb):** Algoritmo de rastreo por nombre y año en caso de fallar los anteriores.
- **Parches Manuales (`postprocess/fix/catalog/manual.csv`):** Archivo CSV de correcciones para asociar IDs correctos de forma manual y evitar que se pierdan contenidos del catálogo.
- **Versionado Automático:** El proceso de compilación actualiza automáticamente la versión del addon (`YY.SeasonIndex.0`) cuando detecta un cambio de temporada.

### Instalación en Stremio
1. Copia el siguiente enlace de manifest:
   ```
   https://kevinazhd.github.io/animes-season-addon/manifest.json
   ```
2. Abre Stremio, ve a la sección de **Addons**, pega el enlace en el buscador e instálalo.
3. **Importante:** Asegúrate de tener instalado el addon oficial de **Kitsu** en Stremio para que los enlaces de reproducción y streams se resuelvan correctamente.

---

## English

### Technical Details & Architecture
The addon generates static catalogs that Stremio displays. The catalogs are automatically updated via a daily scheduler (GitHub Actions), avoiding runtime service downtime.

#### 1. Catalog Generation Workflow
```mermaid
graph TD
    A[Daily Cron / Manual Trigger] --> B[Fetch Seasonal Anime from Jikan API]
    B --> C[Fetch Metadata from AniList GraphQL via idMal_in]
    C --> D[Match/Resolve IDs Kitsu/IMDb/TMDB]
    D --> E[Apply Manual Patch Fixes]
    E --> F[Sort by MyAnimeList Members Count]
    F --> G[Write static JSON Catalogs & Update manifest.json]
```

#### 2. Technical Specifications
- **Data Fetching (Jikan API):** Queries MyAnimeList seasonal database sorted by `members` count (`order_by=members&sort=desc`). Page-by-page fetching is regulated with safety delays (400ms) to prevent `429 Too Many Requests` responses.
- **Hybrid Metadata Integration (AniList GraphQL):** To display high-quality posters and Japanese Romaji titles, a single query fetches metadata for all MAL IDs using `idMal_in`. In case of miss or API failure, it seamlessly falls back to Jikan's standard response.
- **ID Resolution Chain (IdResolver):** Dynamically maps media elements to Stremio-compatible IDs (Kitsu/IMDb) using a resolver chain:
  1. **Yuna API Proxy (ARM):** Fast ID mapping lookup using standard sources.
  2. **Kitsu Addon Meta Maps:** Queries `anime-kitsu.strem.fun` schema mappings directly.
  3. **Name Search (name-to-imdb):** Queries name and year backtracking algorithm if other mappings are missing.
- **Manual Patches (`postprocess/fix/catalog/manual.csv`):** A CSV database containing manually mapped IDs to override automated errors and avoid empty catalog entries.
- **Automated Versioning:** The addon automatically bumps its version (`YY.SeasonIndex.0`) whenever a season shift is detected by the generation process.

### How to Install on Stremio
1. Copy the following manifest link:
   ```
   https://kevinazhd.github.io/animes-season-addon/manifest.json
   ```
2. Open Stremio, navigate to the **Addons** section, paste the link into the search bar, and install it.
3. **Important:** Make sure you have the official **Kitsu** addon installed in Stremio so that streams and video links resolve correctly.

# Animes' Seasons Addon (Stremio)

<p align="center">
  <img src="https://media.craiyon.com/2023-06-27/6664b575d60846fe878fc9d1e1f09d09.webp" alt="Animes' Seasons Logo" width="150" height="150"/>
</p>

This Stremio addon displays anime catalogs organized by seasons (current and upcoming season). It is a **fork** of the original [victorgveloso/animes-season-addon](https://github.com/victorgveloso/animes-season-addon) repository with improvements and new features.

---

## English

### Why this Fork?
- **Upcoming Season Catalog:** Added a new catalog to view upcoming anime releases before the official season starts.
- **Merged Series & Movies:** Instead of separate lists, series and movies are mixed together in the same catalog.
- **Real Popularity Sorting:** Combines and orders movies and series based on live popularity stats from AniList.
- **No Service Down Time:** Automatic daily execution via GitHub Actions with fixes for December crashes and year limit overflows.
- **No Broken IDs:** Clean ID mapping to prevent invalid Kitsu format leaks.

### How to Install on Stremio
1. Copy the following manifest link:
   ```
   https://kevinazhd.github.io/animes-season-addon/manifest.json
   ```
2. Open Stremio, navigate to the **Addons** section, paste the link into the search bar, and install it.
3. **Important:** Make sure you have the official **Kitsu** addon installed in Stremio so that streams and video links resolve correctly.

---

## Español

Este addon de Stremio muestra catálogos de anime organizados por temporadas (actual y próxima temporada). Es un **fork** del repositorio original [victorgveloso/animes-season-addon](https://github.com/victorgveloso/animes-season-addon) con mejoras y características añadidas.

### ¿Por qué este Fork?
- **Catálogo de Próxima Temporada (Upcoming Season):** Añadido catálogo para ver futuros lanzamientos antes de que empiece la temporada oficial.
- **Series y Películas Mezcladas:** En lugar de tener listas separadas, las series y las películas de anime se muestran juntas en el mismo catálogo.
- **Orden de Popularidad Real:** Mezcla películas y series ordenándolas de forma descendente usando la popularidad de AniList.
- **Sin caída de servicio:** Mantenimiento automático diario en GitHub Actions con control de errores para diciembre y límites de años.
- **Evita IDs rotos:** Validación estricta para evitar fugas de IDs Kitsu mal mapeados.

### Instalación en Stremio
1. Copia el siguiente enlace de manifest:
   ```
   https://kevinazhd.github.io/animes-season-addon/manifest.json
   ```
2. Abre Stremio, ve a la sección de **Addons**, pega el enlace en el buscador e instálalo.
3. **Importante:** Asegúrate de tener instalado el addon oficial de **Kitsu** en Stremio para que los streams y los enlaces de reproducción se resuelvan correctamente.

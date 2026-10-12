# 📁 Directorio de Recursos Visuales (`docs/assets/`)

Este directorio contiene los recursos gráficos y capturas de pantalla técnicas que se renderizan automáticamente en el [**README.md**](../../README.md) principal del proyecto.

---

### 📸 Nomenclatura Estándar de Imágenes

Para que el `README.md` enlace y muestre tus capturas automáticamente, guárdalas en esta carpeta con los siguientes nombres:

| Nombre de Archivo | Contenido | Cómo obtenerlo |
| :--- | :--- | :--- |
| **`hero-banner.png`** | Banner panorámico principal del proyecto | Generado con IA o diseñado en 16:9 |
| **`scalar-api-docs.png`** | Interfaz interactiva de documentación OpenAPI | Entrar a `http://localhost:3000/api/docs` en Dark Mode |
| **`test-results.png`** | Resumen de la suite de pruebas unitarias (100% Passed) | Ejecutar `pnpm test` en la consola |
| **`docker-services.png`** | Estado de los 13 contenedores en verde | Ejecutar `docker compose ps` en la consola |
| **`prisma-studio.png`** | Panel de modelos de datos relacionales | Ejecutar `pnpm prisma studio` (`http://localhost:5555`) |
| **`benchmarks.png`** | Métricas de rendimiento y latencia | Ejecutar `pnpm run benchmark` o `pnpm test:stress` |
| **`health-telemetry.png`** | Diagnóstico JSON de salud de infraestructura | Consultar `http://localhost:3000/api/health` |

---

> [!TIP]
> **Consejo para portafolio:**  
> Guarda las imágenes en formato `.png` o `.webp`. Si usas herramientas como [shots.so](https://shots.so) para añadirles un marco sutil con bordes redondeados y sombra, el README lucirá con una presentación visual impecable.

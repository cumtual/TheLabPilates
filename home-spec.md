# Software Requirements Specification (SRS) - Landing Page (Optimized)

## 1. Contexto del Proyecto e Integración (Stitch MCP)
*   **Nombre del Proyecto en Stitch:** `The Lab Pilates Experience`
*   **Nombre de la Pantalla en Stitch:** `The Lab Pilates - Mobile with Mat Pilates Info`
*   **Directiva de Diseño:** Restricción estricta. Todos los componentes, espaciados, tipografías, variables de color y layouts generados deben apegarse fielmente a las especificaciones y tokens de diseño definidos en la pantalla provista por Stitch.

## 2. Stack Tecnológico Base & Arquitectura
*   **Framework:** Next.js (App Router).
*   **Lenguaje:** TypeScript (`.tsx` con tipado estricto).
*   **Estilos:** Tailwind CSS.
*   **Estrategia de Renderizado:** Server-Side Rendering (SSR) / Server Components por defecto para maximizar el rendimiento de carga y el rastreo de motores de búsqueda. Los componentes interactivos del lado del cliente deben estar claramente aislados usando la directiva `'use client'`.

## 3. SEO, Metadatos y Mejores Prácticas
*   **Meta Tags Avanzados:** Implementación del objeto estático/dinámico `metadata` oficial de Next.js en el archivo `layout.tsx` o `page.tsx`. Debe incluir:
    *   `title` y `description` optimizados para la landing del estudio.
    *   Configuración de Open Graph (`openGraph`) para previsualizaciones correctas en plataformas y redes sociales.
    *   Etiquetas de control de robots (`robots`) y canonical URLs.
*   **Rendimiento y Accesibilidad (A11y):** Uso estricto de componentes nativos de optimización (`next/image` con tamaños correctos para evitar Layout Shifts, `next/font`), marcado HTML5 semántico (`<main>`, `<section>`, `<article>`), y atributos `aria-*` donde sea necesario.

## 4. Alcance de la Página de Inicio (Home)
Estructuración modular orientada a la futura incorporación de más flujos de la app:
1.  **Hero Section:** Presentación del estudio "The Lab Pilates" alineado al diseño visual de Stitch.
2.  **Sección Informativa - Mat Pilates:** Bloque con la información específica de las clases y beneficios de Mat Pilates.
3.  **Módulos de Llamada a la Acción (CTA):** Botones modulares preparados para los futuros flujos de reserva.

## 5. Directiva de Agentes (.agents/skills)
*   **Uso de Skills Locales:** El desarrollo de la estructura, modularidad del código y los patrones de diseño aplicados deben guiarse y apoyarse estrictamente de las utilidades y *skills* instaladas en la carpeta `.agents/skills` del proyecto.
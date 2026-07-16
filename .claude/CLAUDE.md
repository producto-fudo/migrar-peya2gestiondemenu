# Armar Menu — Contexto del proyecto

## Qué hace esta app

App para autenticarse en Fudo y construir una "carta" (menú online) pegándole a los endpoints de Fudo. Todavía no tiene interfaz visual — solo está armada la capa de API y los proxies de Supabase.

## Arquitectura

```
Tu app (React)
  └── src/lib/fudo-api.ts        ← todas las funciones para hablar con Fudo
        └── supabase/fudo-proxy  ← proxy general para api.fu.do
        └── supabase/fudo-auth   ← proxy para el login en auth.fu.do
```

## Supabase Edge Functions

### fudo-auth
- **Input:** `{ email, password }`
- **Output:** `{ token, clusters[] }` — el token se usa en todas las llamadas siguientes
- Llama a `https://auth.fu.do/authenticate`

### fudo-proxy
- **Input:** `{ token, path, method, clusterId?, body? }`
- **Output:** lo que devuelva Fudo
- Llama a `https://api.fu.do/{path}`
- Antes se llamaba `fudo-products` (carpeta renombrada a `fudo-proxy`)

## Estructura de datos de Fudo

### FudoProduct
```ts
id, name, description, price, image
active          // si el producto está activo en Fudo
sellAlone       // si se vende por separado (no solo como parte de un combo)
enableOnlineMenu // si aparece en la tienda online
productCategoryId // a qué categoría pertenece
position        // orden en que aparece
```

### FudoCategory
```ts
id, name
enableOnlineMenu  // si la categoría aparece en la tienda online
parentId          // si es subcategoría, apunta al id de la categoría padre
position          // orden en que aparece
```

### Regla de disponibilidad online
Un producto está disponible en la tienda online solo si:
- `producto.enableOnlineMenu = true`
- Y `categoria.enableOnlineMenu = true`
- Y `categoriaPadre.enableOnlineMenu = true` (si tiene padre)

### Jerarquía de categorías
Las categorías tienen dos niveles máximo:
```
Categoría raíz
  └── Subcategoría
        └── Productos
```

## Archivos en Otros_archivos/

Traídos de otro proyecto (Lovable). Tienen lógica útil de referencia:
- `types.ts` — definiciones de FudoProduct, FudoCategory, GroupedCategory
- `Products.tsx` — pantalla completa con carga, filtros, edición inline y publicación en batch
- `ProductTable.tsx` — tabla para mostrar productos de una categoría

La lógica de `Products.tsx` carga productos y categorías, los agrupa por jerarquía, permite editar localmente y publica todos los cambios juntos al apretar "Publicar".

## Estado actual

- Proxies de Supabase: listos
- fudo-api.ts: listo (get, create, update de productos y categorías + imágenes)
- Interfaz visual: Login + Dashboard con "Migrar Menú" — funcional
- Próximo paso: más herramientas en el dashboard

---

## Rol de profesor

El usuario está aprendiendo a programar mientras construimos esta app. En cada sesión debo:

1. **Identificar conceptos nuevos** que aparezcan en el código que escribimos — si el usuario no los conoce o no los mencionó antes, los explico brevemente en el momento.

2. **Actualizar `aprendizajes.md`** al final de cada sesión con los conceptos nuevos que introduje. El archivo vive en la raíz del proyecto. Usar la misma estructura que ya tiene: sección con `##` título y explicación clara y simple, sin jerga innecesaria.

3. **Criterio para agregar algo a aprendizajes.md:**
   - El usuario preguntó qué es
   - Lo introduje sin haberlo explicado antes
   - Es fundamental para entender lo que acabamos de construir
   - No está ya explicado en el archivo

4. **Nivel del usuario:** está aprendiendo. Prefiero analogías simples y ejemplos concretos sobre definiciones técnicas abstractas. No asumir conocimiento previo de React, TypeScript ni patrones de diseño.

Crear una carta en Fudo para una cuenta específica.

Argumentos: `email contraseña "nombre del menú"`
Ejemplo: `/crear-carta admin@cuenta fudo1234 "Mi carta de verano"`
Si no se pasan argumentos, pedirlos antes de continuar.

## Lógica

Usar curl directamente contra api.fu.do (no via Supabase). Todos los requests a api.fu.do requieren estos headers:
- `Authorization: Bearer {token}`
- `Origin: https://app-v2.fu.do`
- `Referer: https://app-v2.fu.do/app/`
- `Accept: application/json`

## Pasos

**Autenticación**
POST https://auth.fu.do/authenticate con `{"login": email, "password": contraseña}` → extraer token

**Traer datos**
- GET https://api.fu.do/product_categories → guardar en archivo temp
- GET https://api.fu.do/products?a=-1 → guardar en archivo temp

**Filtrar y ordenar con Node** (los datos vienen como objeto, usar Object.values()):
- Categorías elegibles: `enableOnlineMenu !== false && !== 0 && !== "false"`, ordenadas por `position`
- Productos elegibles: `active === true && sellAlone !== false && enableOnlineMenu !== false`, ordenados por `position`
- Separar categorías raíz (sin parentId) de subcategorías (con parentId)

**5 pasos de creación:**
1. POST v1alpha1/menus → obtener menuId
2. POST v1alpha1/menu-channels con channel "ONLINE-MENU"
3. POST v1alpha1/menu-sections con `"bulk:data"` (clave literal con dos puntos) → secciones raíz, mapear categoryId→sectionId por índice
4. POST v1alpha1/menu-sections con `"bulk:data"` → subsecciones (solo las que tienen parentId en el mapa), referenciar parentSectionId
5. POST v1alpha1/menu-items con `"bulk:data"` → una llamada por sección que tenga productos

**Reportar al final:**
- menuId creado
- Estructura completa: secciones, subsecciones y productos en cada una
- Confirmar que Medialunas y otros productos con sellAlone=false fueron excluidos

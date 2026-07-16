# Contexto técnico — descubrimientos de conversación

Todo lo que no está en CLAUDE.md pero es importante para continuar el trabajo.

---

## api.fu.do requiere headers especiales

Las llamadas directas a `api.fu.do` devuelven 404 sin estos headers:
```
Origin: https://app-v2.fu.do
Referer: https://app-v2.fu.do/app/
```
El proxy `fudo-proxy/index.ts` los agrega automáticamente — por eso las llamadas desde la app funcionan sin pensarlo. Pero si alguna vez llamás directo (curl, scripts), hay que incluirlos.

---

## Filtros de productos para la carta

Un producto va a la carta solo si cumple las tres condiciones:
```ts
p.active === true && p.sellAlone !== false && !isDisabled(p.enableOnlineMenu)
```
- `sellAlone: false` significa que el producto solo existe dentro de un combo (ej: Medialunas). No se vende solo, no va a la carta.
- `isDisabled` maneja `false`, `0` y `"false"` como deshabilitado — Fudo no es consistente con los tipos.

---

## Ordenamiento por position

Tanto categorías como productos tienen un campo `position` numérico. `Object.values()` no respeta ese orden — hay que ordenar explícitamente:
```ts
const byPosition = <T extends { position?: number }>(a: T, b: T) =>
  (a.position ?? 0) - (b.position ?? 0);
```
Aplicarlo después de filtrar, tanto en categorías como en productos.

---

## Formato bulk:data

Las llamadas bulk a la API de Fudo usan una clave con dos puntos literal:
```json
{ "bulk:data": [ ... ] }
```
No es un error de sintaxis — es así como lo espera Fudo.

---

## Los 5 pasos para crear una carta

`buildMenuFromCategories` en `src/lib/fudo-api.ts` ya implementa este flujo:
1. `POST v1alpha1/menus` → obtener `menuId`
2. `POST v1alpha1/menu-channels` con channel `"ONLINE-MENU"`
3. `POST v1alpha1/menu-sections` con `bulk:data` → secciones raíz, mapear `categoryId → sectionId`
4. `POST v1alpha1/menu-sections` con `bulk:data` → subsecciones, referenciar `parentSectionId`
5. `POST v1alpha1/menu-items` con `bulk:data` → una llamada por sección que tenga productos

---

## Estado actual del proyecto

- `buildMenuFromCategories` está implementada y probada en `src/lib/fudo-api.ts`
- Las Edge Functions (`fudo-proxy`, `fudo-auth`) ya están desplegadas en Supabase — se usaban con Lovable
- No hay app React todavía — `src/` solo tiene `fudo-api.ts`
- Los errores que muestra VS Code son de configuración del editor (no conoce los tipos de Deno, no encuentra `@/integrations/supabase/client`). El código funciona bien igual.

---

## Modo carta de Fudo — bloqueado

Fudo tiene dos modos: el menú online viejo y la "carta nueva". Para activar la carta nueva hay que cambiar una configuración en la app "Dash" de Fudo, que tiene credenciales distintas y no es accesible desde la API normal. No hay endpoint para cambiarlo programáticamente.

---

## Comando /crear-carta

Existe en `.claude/commands/crear-carta.md`. Crea una carta completa en Fudo desde la terminal:
```
/crear-carta email contraseña "nombre del menú"
```
Incluye toda la lógica: autenticación, fetch de datos, filtros, orden y los 5 pasos de creación.

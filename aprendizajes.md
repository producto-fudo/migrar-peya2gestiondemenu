# Aprendizajes — Proyecto Fudo Tools

Conceptos que fui aprendiendo mientras construía la app.

---

## Herramientas y tecnologías

### React
Framework de JavaScript para construir interfaces visuales (pantallas, botones, formularios). El código se escribe en componentes `.tsx` y se compila en una web app. Es lo que va a ser el "frontend" de Fudo Tools.

### GitHub
Plataforma para guardar código. Un **repositorio** (repo) es como una carpeta en la nube con historial de todos los cambios. Puede ser público (cualquiera lo ve) o privado. Un mismo repo puede tener muchas apps o herramientas adentro. Se usa con `git` desde la terminal.

### Supabase
Backend-as-a-service: te da base de datos, autenticación, storage y Edge Functions listas para usar, sin tener que armar un servidor propio. Lo usaba Lovable para guardar datos. En este proyecto lo usamos solo para las Edge Functions (proxies hacia Fudo).

### Edge Functions
Pequeñas funciones que corren en los servidores de Supabase. Las usamos como intermediarios entre la app y Fudo, porque Fudo necesita headers especiales (`Origin`, `Referer`) que no se pueden mandar directo desde un browser. El código vive en el repo (`supabase/`) y se despliega con la CLI de Supabase.

### Deno
Motor para correr TypeScript/JavaScript. Supabase lo usa internamente para las Edge Functions. Por eso los archivos en `supabase/` usan `Deno.serve()`. VS Code marca errores porque no conoce los tipos de Deno por defecto — pero el código funciona bien igual.

### CLI (Command Line Interface)
Programa que se controla desde la terminal con comandos de texto. La **CLI de Supabase** permite deployar Edge Functions, correr Supabase localmente, etc. Es como manejar Supabase desde la terminal en vez del browser.

### .gitignore
Archivo en la raíz del proyecto que le dice a git qué archivos NO subir a GitHub. Por ejemplo: `node_modules/` (librerías que pesan mucho y se pueden reinstalar), `.env` (credenciales privadas).

---

## Arquitectura de la app

```
Tu app (React) → src/lib/fudo-api.ts → Supabase Edge Functions → api.fu.do (Fudo)
```

- **Frontend** (React): lo que ve el usuario
- **fudo-api.ts**: funciones para hablar con Fudo — vive en el frontend pero solo llama a Supabase
- **Edge Functions** (`fudo-proxy`, `fudo-auth`): intermediarios que agregan headers y hablan con Fudo directamente

### ¿Puede la lógica vivir en el frontend?
Sí, mientras no haya credenciales secretas en el código. El token de Fudo se obtiene en tiempo de ejecución (el usuario lo ingresa), no está hardcodeado. Moverlo al backend solo agregaría complejidad innecesaria.

---

## Datos de Fudo

### sellAlone
Campo en los productos. Si es `false`, el producto no se vende por separado (ej: Medialunas dentro de un combo). Estos se excluyen de la carta.

### position
Campo numérico en productos y categorías que define el orden en que aparecen. `Object.values()` no respeta este orden — hay que ordenar explícitamente con `.sort()`.

### Headers requeridos por api.fu.do
Fudo requiere que las llamadas vengan con `Origin: https://app-v2.fu.do` y `Referer: https://app-v2.fu.do/app/`. Sin estos headers, devuelve 404. El proxy los agrega automáticamente.

### Icono de las categorías → icono de las secciones
Las categorías traen un campo `iconName` (ej: `especiales-compartir`) que ya viene en `getProductCategories`. Las secciones del menú online guardan lo mismo pero en un campo llamado `icon`. Usan **el mismo vocabulario de strings**, así que al migrar se copia tal cual: `categoria.iconName` → `seccion.icon`. Solo las categorías raíz suelen tener icono.

---

## Conceptos de APIs

### Métodos HTTP: GET, POST, PATCH, DELETE
Cuando hablás con una API, además de la dirección (el "path") mandás un **método** que dice qué querés hacer:
- **GET** — leer (traer datos). No cambia nada.
- **POST** — crear algo nuevo.
- **PATCH** — actualizar (modificar) algo que ya existe.
- **DELETE** — borrar.

Es importante usar el correcto: en Fudo, si intentás actualizar el icono de una sección con POST, te tira **400** (error de "petición mal formada"), porque POST es solo para crear. Para modificar algo existente hay que usar PATCH.

### Patrón "crear primero, actualizar después"
Algunas APIs no dejan mandar todos los datos de una en la creación. Con las secciones de Fudo pasa esto: al **crearlas** (POST) no acepta el icono, hay que crearlas primero y **después** actualizarles el icono con un PATCH aparte. Por eso la migración hace dos pasos: crea todas las secciones y luego, en una sola llamada, les pone los iconos.

### Validación del servidor y el código 422
El servidor puede **rechazar** datos inválidos. Cuando mandamos un icono inventado (`icono-que-no-existe`), Fudo respondió **422** (`invalid_icon`) — un código que significa "entendí tu pedido pero los datos no son válidos". Esto nos sirvió para confirmar que el campo icono se procesa de verdad (no lo ignora) y que solo acepta iconos de una lista conocida.

---

## Claude Code

### .claude/commands/
Carpeta dentro del proyecto donde se guardan comandos personalizados para usar con `/nombre-del-comando`. Por ejemplo, `/crear-carta` automatiza todo el proceso de crear un menú en Fudo.

---

## Próximos pasos del proyecto
- Subir a GitHub
- Crear más herramientas para Fudo (gestionar productos, cartas en batch, etc.)

---

## React

### React Context

Imaginá que tenés datos que muchos componentes necesitan usar — por ejemplo, el token de Fudo después de hacer login. Sin Context, tendrías que pasarlo "de padre a hijo a nieto" con props, lo que se vuelve tedioso. Context es una forma de poner esos datos en un "globo" que cualquier componente de la app puede agarrar directamente.

En el proyecto, `AuthContext` guarda `{ token, clusterId, email }`. Cualquier página puede pedir esa info con `useAuth()` sin que se la pase nadie.

```tsx
// Así se "publica" el contexto (una vez, en lo alto del árbol):
<AuthContext.Provider value={{ auth, login, logout }}>
  {children}
</AuthContext.Provider>

// Así lo consume cualquier componente:
const { auth, logout } = useAuth();
```

### Custom hooks (hooks personalizados)

Un hook es una función de React que empieza con `use` y puede usar otras funciones especiales de React (`useState`, `useContext`, etc.). Los hooks "personalizados" son simplemente funciones que agrupan lógica reutilizable.

`useAuth()` es un custom hook: adentro llama a `useContext(AuthContext)` y te devuelve lo que necesitás. En vez de que cada componente sepa cómo acceder al contexto, solo llaman a `useAuth()`.

### React Router

React es una sola página (SPA — Single Page Application). El browser nunca recarga. React Router simula tener "páginas distintas" cambiando lo que se muestra según la URL, sin recargar el browser de verdad.

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/" element={<DashboardPage />} />
</Routes>
```

`useNavigate()` es el equivalente de "ir a esta URL" desde el código: `navigate('/')` lleva al dashboard.

### Variables de entorno en Vite

Las variables de entorno son valores que cambian según dónde corre la app (local, nube, producción). Se guardan en un archivo `.env.local` que **no se sube a GitHub** (está en `.gitignore`).

En Vite, las variables que la app puede leer **deben empezar con `VITE_`**. Sin ese prefijo, Vite las ignora por seguridad.

```
VITE_SUPABASE_URL=http://localhost:54321
```

En el código se acceden como:
```ts
import.meta.env.VITE_SUPABASE_URL
```

### localStorage

El browser tiene una pequeña "memoria" por pestaña/dominio llamada `localStorage`. Es como un diccionario clave→valor que persiste aunque cierres el browser. En el proyecto lo usamos para guardar la sesión de Fudo para que no tengas que hacer login cada vez que recargás.

```ts
localStorage.setItem('fudo_auth', JSON.stringify({ token, email }));  // guardar
localStorage.getItem('fudo_auth');   // leer
localStorage.removeItem('fudo_auth'); // borrar (logout)
```

---

## Concurrencia y manejo de errores

### Hacer varias cosas en paralelo (`Promise.all`)
Cuando tenés varias tareas que **no dependen entre sí**, no hace falta hacerlas en fila
(esperar que termine una para arrancar la otra). `Promise.all([...])` las arranca todas juntas
y espera a que terminen todas. Es la diferencia entre pagar 5 cajas de a una vs. abrir 5 cajas
al mismo tiempo.

```ts
// En fila (lento): cada await frena hasta terminar
for (const cuenta of cuentas) { await migrar(cuenta); }

// En paralelo: arrancan todas juntas
await Promise.all(cuentas.map((c) => migrar(c)));
```

### Tope de concurrencia (pool)
Hacer *todo* en paralelo a veces es demasiado: si mandás 50 pedidos juntos, el servidor te
puede frenar (rate limit). La solución es un "pool": correr **como mucho N a la vez**. Apenas
una termina, arranca la siguiente, manteniendo siempre N en vuelo. En el proyecto migramos 4
cuentas a la vez en vez de las 50 de golpe.

### Clases de error personalizadas (`class X extends Error`)
Un `Error` normal solo lleva un mensaje de texto. Podés crear tu **propio tipo de error** que
además cargue datos útiles. En la migración usamos `MenuMigrationError`, que lleva `step` (en
qué paso falló) y `menuId` (si el menú alcanzó a crearse). Así, cuando algo falla, quien lo
recibe puede preguntar "¿este error trae un menuId?" para saber si la cuenta quedó **a medio
hacer** o si no se creó nada.

```ts
class MenuMigrationError extends Error {
  constructor(message: string, readonly step: string, readonly menuId?: string) {
    super(message);
  }
}

// Y del otro lado se pregunta con `instanceof`:
if (err instanceof MenuMigrationError && err.menuId) {
  // el menú existe → quedó a medio hacer
}
```

`instanceof` es la forma de preguntar "¿este error es de este tipo?". `readonly` significa que
esos datos se setean una vez al crear el error y no se cambian después.

---

## Estructura del proyecto (actualizada)

```
fudo-tools/
├── index.html              ← punto de entrada del browser
├── vite.config.ts          ← configuración de Vite (alias @/, puerto, etc.)
├── tailwind.config.ts      ← configuración de estilos
├── .env.local              ← variables de entorno (no va a GitHub)
├── .env.example            ← template documentado de las variables
└── src/
    ├── main.tsx            ← arranca React, envuelve con AuthProvider
    ├── App.tsx             ← define las "rutas" de la app
    ├── index.css           ← estilos globales con Tailwind
    ├── context/
    │   └── AuthContext.tsx ← sesión del usuario (token, email, login, logout)
    ├── pages/
    │   ├── LoginPage.tsx   ← formulario de email + contraseña
    │   └── DashboardPage.tsx ← herramientas (primer herramienta: Migrar Menú)
    ├── lib/
    │   ├── fudo-api.ts     ← todas las funciones para hablar con Fudo
    │   └── utils.ts        ← función cn() para combinar clases de Tailwind
    └── integrations/supabase/
        └── client.ts       ← cliente de Supabase (inicializado con URL + anon key)
```

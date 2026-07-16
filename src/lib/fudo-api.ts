import { supabase } from "@/integrations/supabase/client";

interface FudoFetchOptions {
  path: string;
  method?: string;
  token: string;
  clusterId?: string;
  body?: unknown;
}

async function formatFunctionError(error: { message: string; context?: unknown }) {
  const context = error.context;

  if (context instanceof Response) {
    try {
      const responseText = await context.text();

      if (responseText) {
        try {
          const parsed = JSON.parse(responseText) as {
            error?: string;
            upstream_status?: number;
            upstream_url?: string;
            upstream_body?: string;
          };

          if (parsed.error) {
            const upstreamInfo = parsed.upstream_status ? ` [${parsed.upstream_status}]` : '';
            const upstreamBody = parsed.upstream_body ? ` — ${parsed.upstream_body}` : '';
            return `${parsed.error}${upstreamInfo}${upstreamBody}`;
          }
        } catch {
          return `Function error (${context.status}): ${responseText}`;
        }
      }

      return `Function error (${context.status})`;
    } catch {
      // Body already consumed by SDK — fall back to message
      return error.message;
    }
  }

  return error.message;
}

export async function fudoFetch({ path, method = 'GET', token, clusterId, body }: FudoFetchOptions) {
  const { data, error } = await supabase.functions.invoke('peya-migration-fudo-proxy', {
    body: { path, method, token, clusterId, body },
  });

  if (error) {
    throw new Error(await formatFunctionError(error as { message: string; context?: unknown }));
  }

  return data;
}

export async function testConnection(token: string, clusterId?: string) {
  return fudoFetch({ path: 'products?a=-1', token, clusterId });
}

export async function getSupportCredentials(accountId: string, dashCookie: string) {
  const { data, error } = await supabase.functions.invoke('peya-migration-dash-proxy', {
    body: { accountId, dashCookie },
  });

  if (error) {
    throw new Error(await formatFunctionError(error as { message: string; context?: unknown }));
  }

  return data as { login: string; password: string };
}

export async function authenticateWithCredentials(login: string, password: string) {
  const { data, error } = await supabase.functions.invoke('peya-migration-fudo-auth', {
    body: { login, password },
  });

  if (error) {
    throw new Error(await formatFunctionError(error as { message: string; context?: unknown }));
  }

  return data as { token: string; clusters?: Array<{ id: number; name: string }> };
}

export async function getProducts(token: string, clusterId?: string) {
  return fudoFetch({ path: 'products?a=-1', token, clusterId });
}

export async function getProductCategories(token: string, clusterId?: string) {
  return fudoFetch({ path: 'product_categories', token, clusterId });
}

export async function updateProductCategory(token: string, categoryId: number, body: { enableOnlineMenu?: boolean }, clusterId?: string) {
  return fudoFetch({ path: `product_categories/${categoryId}`, method: 'PUT', token, clusterId, body });
}

export async function updateProduct(token: string, productId: number, body: { name?: string; description?: string; price?: number; enableOnlineMenu?: boolean }, clusterId?: string) {
  return fudoFetch({ path: `products/${productId}`, method: 'PUT', token, clusterId, body });
}

export async function createProduct(token: string, body: { name: string; price: number; description?: string; productCategoryId?: number; active?: boolean; sellAlone?: boolean; ignoreAvailability?: boolean; enableOnlineMenu?: boolean | null; enableQrMenu?: boolean | null }, clusterId?: string) {
  return fudoFetch({ path: 'products', method: 'POST', token, clusterId, body: { active: true, sellAlone: true, ignoreAvailability: false, enableOnlineMenu: null, enableQrMenu: null, ...body } });
}

export async function createProductCategory(token: string, body: { name: string; parentId?: number; enableOnlineMenu?: boolean; enableQrMenu?: boolean }, clusterId?: string) {
  return fudoFetch({ path: 'product_categories', method: 'POST', token, clusterId, body: { enableOnlineMenu: true, enableQrMenu: true, ...body } });
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

export async function uploadProductImage(token: string, productId: number, file: File, clusterId?: string) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Solo se permiten archivos JPG o PNG');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(`El archivo excede el límite de 2MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'amgtvfpqmrqzwtkhyppx';
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const formData = new FormData();
  formData.append('image', file);

  const params = new URLSearchParams({
    path: `products/${productId}/image`,
    method: 'PUT',
    token,
  });

  if (clusterId) params.set('clusterId', clusterId);

  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/peya-migration-fudo-proxy?${params}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function uploadBackgroundImage(token: string, file: File | Blob, clusterId?: string): Promise<string> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'amgtvfpqmrqzwtkhyppx';
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const formData = new FormData();
  const filename = file instanceof File ? file.name : 'background.jpg';
  formData.append('file', file, filename);

  const params = new URLSearchParams({
    path: 'v1alpha1/online-menu/background-images',
    method: 'POST',
    token,
  });
  if (clusterId) params.set('clusterId', clusterId);

  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/peya-migration-fudo-proxy?${params}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  const jobId = parsed?.data?.id;
  if (!jobId) {
    throw new Error('Fudo no devolvió un jobId para la imagen');
  }
  return jobId as string;
}

export async function uploadLogoImage(token: string, file: File | Blob, clusterId?: string): Promise<string> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'amgtvfpqmrqzwtkhyppx';
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const formData = new FormData();
  const filename = file instanceof File ? file.name : 'logo.jpg';
  formData.append('file', file, filename);

  const params = new URLSearchParams({
    path: 'v1alpha1/images',
    method: 'POST',
    token,
  });
  if (clusterId) params.set('clusterId', clusterId);

  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/peya-migration-fudo-proxy?${params}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  const jobId = parsed?.data?.id;
  if (!jobId) {
    throw new Error('Fudo no devolvió un jobId para el logo');
  }
  return jobId as string;
}

export async function updateLogoInSettings(token: string, imageUrl: string, clusterId?: string, settingId: number | string = 31) {
  const body = {
    data: {
      type: 'Setting',
      id: String(settingId),
      attributes: {
        name: 'delivery_integrations',
        value: {
          onlineMenu: {
            logo: { url: imageUrl, shape: 'square' },
          },
        },
      },
    },
  };

  return fudoFetch({
    path: `v1alpha1/settings/${settingId}`,
    method: 'PATCH',
    token,
    clusterId,
    body,
  });
}

export async function downloadAndUploadLogoImage(token: string, imageUrl: string, clusterId?: string, onProgress?: CoverProgress) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'amgtvfpqmrqzwtkhyppx';
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  onProgress?.('uploading');

  const dlResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/peya-migration-download-image`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: imageUrl }),
  });

  if (!dlResponse.ok) {
    throw new Error('Error al descargar la imagen');
  }

  const contentType = dlResponse.headers.get('content-type') || 'image/jpeg';
  const blob = await dlResponse.blob();

  if (blob.size > 2 * 1024 * 1024) {
    throw new Error(`La imagen excede el límite de 2MB de Fudo (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  const isPng = contentType.includes('png');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const ext = isPng ? 'png' : 'jpg';
  const file = new File([blob], `logo.${ext}`, { type: mimeType });

  const jobId = await uploadLogoImage(token, file, clusterId);

  onProgress?.('processing');
  const finalUrl = await pollImageJob(token, jobId, clusterId);

  onProgress?.('activating');
  await updateLogoInSettings(token, finalUrl, clusterId);

  return { url: finalUrl };
}

export async function getImageJobStatus(token: string, jobId: string, clusterId?: string) {
  return fudoFetch({ path: `v1alpha1/images/jobs/${jobId}`, token, clusterId });
}

export async function pollImageJob(token: string, jobId: string, clusterId?: string, maxAttempts = 30, intervalMs = 1000): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await getImageJobStatus(token, jobId, clusterId);
    const attrs = res?.data?.attributes;
    const status = attrs?.status;

    if (attrs?.errors) {
      throw new Error(`Job falló: ${JSON.stringify(attrs.errors)}`);
    }
    if (status === 'complete') {
      const url = attrs?.result?.data?.links?.self;
      if (!url) throw new Error('Job completo sin URL de imagen');
      return url as string;
    }
    if (status === 'failed') {
      throw new Error('Fudo reportó el job como failed');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timeout esperando el procesamiento de la imagen');
}

export async function getSettings(token: string, settingId: number | string, clusterId?: string) {
  return fudoFetch({ path: `v1alpha1/settings/${settingId}`, token, clusterId });
}

export async function updateBackgroundImageInSettings(token: string, imageUrl: string, clusterId?: string, settingId: number | string = 31) {
  // Replicar lo que hace la app oficial: PATCH parcial en camelCase con URL que incluye ?updatedAt={ms}
  const finalUrl = imageUrl.includes('updatedAt=')
    ? imageUrl
    : `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}updatedAt=${Date.now()}`;

  const body = {
    data: {
      type: 'Setting',
      id: String(settingId),
      attributes: {
        name: 'delivery_integrations',
        value: {
          onlineMenu: {
            backgroundImage: { url: finalUrl },
          },
        },
      },
    },
  };

  return fudoFetch({
    path: `v1alpha1/settings/${settingId}`,
    method: 'PATCH',
    token,
    clusterId,
    body,
  });
}

type CoverProgress = (phase: 'uploading' | 'processing' | 'activating') => void;

export async function downloadAndUploadBackgroundImage(token: string, imageUrl: string, clusterId?: string, onProgress?: CoverProgress) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'amgtvfpqmrqzwtkhyppx';
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  onProgress?.('uploading');

  const dlResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/peya-migration-download-image`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: imageUrl }),
  });

  if (!dlResponse.ok) {
    throw new Error('Error al descargar la imagen');
  }

  const contentType = dlResponse.headers.get('content-type') || 'image/jpeg';
  const blob = await dlResponse.blob();

  if (blob.size > 2 * 1024 * 1024) {
    throw new Error(`La imagen excede el límite de 2MB de Fudo (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  const isPng = contentType.includes('png');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const ext = isPng ? 'png' : 'jpg';
  const file = new File([blob], `background.${ext}`, { type: mimeType });

  const jobId = await uploadBackgroundImage(token, file, clusterId);

  onProgress?.('processing');
  const finalUrl = await pollImageJob(token, jobId, clusterId);

  onProgress?.('activating');
  await updateBackgroundImageInSettings(token, finalUrl, clusterId);

  return { url: finalUrl };
}

// --- Carta (menú online v1alpha1) ---

export interface MenuAvailabilityDay {
  dayOfWeek: number;
  active: boolean;
  shifts: Array<{ startHour: number; startMinutes: number; endHour: number; endMinutes: number }>;
}

// Cada día se manda tal como lo ingresó la usuaria (uno o más turnos, con su
// propio activo/inactivo) — igual que el editor de horarios del propio Fudo.
// Ahí es donde hay que resolver a mano los cruces de medianoche: un turno
// que cierra pasada la medianoche (ej. 20:15 a 01:00) se ingresa como dos
// turnos separados, uno que cierra a las 23:59 en el día que abre y otro de
// 00:00 al cierre real en el día siguiente (Fudo no acepta que un turno
// cruce la medianoche, ni 00:00 como hora de cierre).
export function buildAvailability(days: MenuAvailabilityDay[]): MenuAvailabilityDay[] {
  const byDay = new Map(days.map((d) => [d.dayOfWeek, d]));
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const day = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      active: !!day?.active,
      shifts: day?.active ? day.shifts : [],
    };
  });
}

export async function createMenu(token: string, name: string, clusterId?: string, availability: MenuAvailabilityDay[] = []) {
  return fudoFetch({
    path: 'v1alpha1/menus',
    method: 'POST',
    token,
    clusterId,
    body: { data: { type: 'Menu', attributes: { name, availability } } },
  });
}

export async function createMenuChannel(token: string, menuId: string, clusterId?: string) {
  return fudoFetch({
    path: 'v1alpha1/menu-channels',
    method: 'POST',
    token,
    clusterId,
    body: {
      data: {
        type: 'MenuChannel',
        attributes: { channel: 'ONLINE-MENU' },
        relationships: { menu: { data: { type: 'Menu', id: menuId } } },
      },
    },
  });
}

export async function createMenuSections(
  token: string,
  menuId: string,
  sections: Array<{ name: string; parentSectionId?: string }>,
  clusterId?: string,
) {
  return fudoFetch({
    path: 'v1alpha1/menu-sections',
    method: 'POST',
    token,
    clusterId,
    body: {
      'bulk:data': sections.map((s) => ({
        type: 'MenuSection',
        attributes: { name: s.name },
        relationships: {
          menu: { data: { type: 'Menu', id: menuId } },
          ...(s.parentSectionId
            ? { parentSection: { data: { type: 'MenuSection', id: s.parentSectionId } } }
            : {}),
        },
      })),
    },
  });
}

// Fudo no acepta el icono al crear la sección: hay que crearla primero y
// después actualizarle el `icon` con un PATCH aparte (validado contra la API).
export async function updateMenuSectionIcons(
  token: string,
  sections: Array<{ id: string; icon: string }>,
  clusterId?: string,
) {
  return fudoFetch({
    path: 'v1alpha1/menu-sections',
    method: 'PATCH',
    token,
    clusterId,
    body: {
      'bulk:data': sections.map((s) => ({
        type: 'MenuSection',
        id: s.id,
        attributes: { icon: s.icon },
      })),
    },
  });
}

export interface MenuItemInput {
  sku: number;
  name?: string;
  description?: string;
  price?: number;
}

// Fudo no acepta `attributes` (name/description/price) al crear el MenuItem
// vía POST — igual que el icono de sección, la creación solo admite las
// relaciones. El override de nombre/descripción/precio se setea después con
// un PATCH aparte (ver updateMenuItemOverrides).
export async function createMenuItems(
  token: string,
  sectionId: string,
  items: MenuItemInput[],
  clusterId?: string,
) {
  return fudoFetch({
    path: 'v1alpha1/menu-items',
    method: 'POST',
    token,
    clusterId,
    body: {
      'bulk:data': items.map((item) => ({
        type: 'MenuItem',
        relationships: {
          menuSection: { data: { type: 'MenuSection', id: sectionId } },
          product: { data: { type: 'Product', id: String(item.sku) } },
        },
      })),
    },
  });
}

export interface MenuItemOverrideInput {
  id: string;
  name?: string;
  description?: string;
  price?: number;
}

// Confirmado contra un PATCH real del dash de Fudo: el override de un
// MenuItem no acepta el formato bulk (`bulk:data`) — hay que pegarle al
// recurso individual `v1alpha1/menu-items/{id}` con un PATCH por ítem.
export async function updateMenuItemOverride(
  token: string,
  item: MenuItemOverrideInput,
  clusterId?: string,
) {
  return fudoFetch({
    path: `v1alpha1/menu-items/${item.id}`,
    method: 'PATCH',
    token,
    clusterId,
    body: {
      data: {
        type: 'MenuItem',
        id: item.id,
        attributes: {
          ...(item.name ? { name: item.name } : {}),
          ...(item.description ? { description: item.description } : {}),
          ...(item.price !== undefined ? { price: item.price } : {}),
        },
      },
    },
  });
}

export async function updateMenuItemOverrides(
  token: string,
  items: MenuItemOverrideInput[],
  clusterId?: string,
) {
  for (const item of items) {
    await updateMenuItemOverride(token, item, clusterId);
  }
}

export async function publishMenu(token: string, menuId: string, clusterId?: string) {
  return fudoFetch({
    path: 'v1alpha1/menu-publications',
    method: 'POST',
    token,
    clusterId,
    body: {
      data: {
        type: 'MenuPublication',
        relationships: { menu: { data: { type: 'Menu', id: menuId } } },
      },
    },
  });
}

// --- Delivery apps (Pedidos Ya, etc.) ---

export interface DeliveryIntegration {
  id: string;
  partner: string;
  extraData?: unknown;
  menuPushEnabled?: boolean;
}

export async function getDeliveryIntegrations(token: string, clusterId?: string) {
  return fudoFetch({
    path: 'v1alpha1/delivery-integrations?fields[deliveryIntegration]=partner,extraData,menuPushEnabled',
    token,
    clusterId,
  });
}

export async function createDeliveryAppMenu(token: string, menuId: string, deliveryIntegrationId: string, clusterId?: string) {
  return fudoFetch({
    path: 'v1alpha1/delivery-app-menus',
    method: 'POST',
    token,
    clusterId,
    body: {
      data: {
        type: 'DeliveryAppMenu',
        relationships: {
          deliveryIntegration: { data: { type: 'DeliveryIntegration', id: deliveryIntegrationId } },
          menu: { data: { type: 'Menu', id: menuId } },
        },
      },
    },
  });
}

// Error de migración que carga el paso donde falló y —si el menú ya se había
// creado— su menuId, para poder detectar cuentas que quedaron "a medio hacer".
export class MenuMigrationError extends Error {
  constructor(
    message: string,
    readonly step: string,
    readonly menuId?: string,
  ) {
    super(message);
    this.name = 'MenuMigrationError';
  }
}

export async function buildMenuFromCategories(
  token: string,
  clusterId?: string,
  menuName = 'Menú tienda online',
) {
  const isEnabled = (val: unknown) => val === true || val === 1 || val === 'true';
  const isDisabled = (val: unknown) => val === false || val === 0 || val === 'false';

  // step = en qué punto vamos; menuId = se setea apenas el menú existe.
  // Si algo falla, el catch relanza un MenuMigrationError con ambos datos.
  let step = 'leer categorías y productos';
  let menuId: string | undefined;

  try {
    const [categoriesData, productsData] = await Promise.all([
      getProductCategories(token, clusterId),
      getProducts(token, clusterId),
    ]);

    const categories: Array<{ id: number; name: string; parentId?: number; enableOnlineMenu?: unknown; position?: number; iconName?: string | null }> =
      Array.isArray(categoriesData) ? categoriesData : Object.values(categoriesData as object);
    const products: Array<{ id: number; active?: boolean; sellAlone?: boolean; enableOnlineMenu?: unknown; productCategoryId?: number; position?: number }> =
      Array.isArray(productsData) ? productsData : Object.values(productsData as object);

    const byPosition = <T extends { position?: number }>(a: T, b: T) =>
      (a.position ?? 0) - (b.position ?? 0);

    const eligibleCategories = categories
      .filter((c) => isEnabled(c.enableOnlineMenu))
      .sort(byPosition);
    const rootCategories = eligibleCategories.filter((c) => !c.parentId);
    const subCategories = eligibleCategories.filter((c) => !!c.parentId);

    const eligibleProducts = products
      .filter((p) => p.active === true && p.sellAlone !== false && !isDisabled(p.enableOnlineMenu))
      .sort(byPosition);

    // Step 1 — create menu
    step = 'crear menú';
    const menuRes = await createMenu(token, menuName, clusterId);
    menuId = menuRes.data.id;

    // Step 2 — assign ONLINE-MENU channel
    step = 'crear canal';
    await createMenuChannel(token, menuId, clusterId);

    // Step 3 — create root sections (bulk), map categoryId → sectionId by index
    step = 'crear secciones';
    const categoryToSectionId = new Map<number, string>();

    if (rootCategories.length > 0) {
      const rootRes = await createMenuSections(
        token,
        menuId,
        rootCategories.map((c) => ({ name: c.name })),
        clusterId,
      );
      (rootRes.data as Array<{ id: string }>).forEach((section, i) => {
        categoryToSectionId.set(rootCategories[i].id, section.id);
      });
    }

    // Step 4 — create subsections (bulk), only those whose parent was created
    const eligibleSubs = subCategories.filter(
      (c) => c.parentId !== undefined && categoryToSectionId.has(c.parentId),
    );

    if (eligibleSubs.length > 0) {
      const subRes = await createMenuSections(
        token,
        menuId,
        eligibleSubs.map((c) => ({
          name: c.name,
          parentSectionId: categoryToSectionId.get(c.parentId!)!,
        })),
        clusterId,
      );
      (subRes.data as Array<{ id: string }>).forEach((section, i) => {
        categoryToSectionId.set(eligibleSubs[i].id, section.id);
      });
    }

    // Step 5 — add products to each section (one bulk call per section)
    step = 'agregar productos';
    const productsByCategory = new Map<number, number[]>();
    eligibleProducts.forEach((p) => {
      if (p.productCategoryId == null) return;
      if (!productsByCategory.has(p.productCategoryId)) productsByCategory.set(p.productCategoryId, []);
      productsByCategory.get(p.productCategoryId)!.push(p.id);
    });

    for (const [categoryId, sectionId] of categoryToSectionId) {
      const productIds = productsByCategory.get(categoryId);
      if (!productIds || productIds.length === 0) continue;
      await createMenuItems(token, sectionId, productIds.map((id) => ({ sku: id })), clusterId);
    }

    // Step 6 — copy each category's icon onto its section (Fudo needs this as a
    // separate PATCH; the icon can't be set at section-creation time).
    step = 'setear iconos';
    const sectionIcons = eligibleCategories
      .filter((c) => c.iconName && categoryToSectionId.has(c.id))
      .map((c) => ({ id: categoryToSectionId.get(c.id)!, icon: String(c.iconName) }));

    if (sectionIcons.length > 0) {
      await updateMenuSectionIcons(token, sectionIcons, clusterId);
    }

    // Step 7 — publish the menu
    step = 'publicar';
    await publishMenu(token, menuId, clusterId);

    return { menuId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MenuMigrationError(message, step, menuId);
  }
}

export interface DeliveryMenuItemInput {
  sku: number;
  imageUrl?: string;
  name?: string;
  description?: string;
  price?: number;
}

export interface DeliveryMenuSectionInput {
  name: string;
  items: DeliveryMenuItemInput[];
}

// El menú se conecta o bien a una integración de delivery real (Pedidos Ya,
// etc.) o —para poder probar el flujo en cuentas que todavía no tienen esa
// integración habilitada— al canal Tienda Online, que ya existe siempre.
export type DeliveryMenuChannel =
  | { type: 'delivery'; deliveryIntegrationId: string }
  | { type: 'online-menu-test' };

// Crea un menú a partir de secciones ya armadas (típicamente parseadas de un
// Excel). Solo asocia productos que ya existen en Fudo — el producto en sí
// nunca se edita (salvo la imagen, si no tenía). El nombre/descripción/precio
// que vienen del Excel se aplican al MenuItem (cómo se ve en esta carta
// puntual), no al producto. El precio del MenuItem solo se manda cuando
// difiere del precio actual del producto en Fudo. No publica el menú.
export async function buildDeliveryMenuFromSections(
  token: string,
  channel: DeliveryMenuChannel,
  sections: DeliveryMenuSectionInput[],
  clusterId?: string,
  menuName = 'Menú delivery',
  availability: MenuAvailabilityDay[] = [],
) {
  let step = 'leer productos existentes';
  let createdMenuId: string | undefined;

  try {
    const productsData = await getProducts(token, clusterId);
    const products: Array<{ id: number; name?: string; image?: string | null; price?: number }> =
      Array.isArray(productsData) ? productsData : Object.values(productsData as object);
    const productById = new Map(products.map((p) => [p.id, p]));

    const missingSkus: number[] = [];
    const sectionsWithValidItems = sections.map((s) => {
      const validItems = s.items.filter((item) => {
        if (productById.has(item.sku)) return true;
        missingSkus.push(item.sku);
        return false;
      });
      return { name: s.name, items: validItems };
    });

    step = 'crear menú';
    const menuRes = await createMenu(token, menuName, clusterId, availability);
    const menuId: string = String(menuRes.data.id);
    createdMenuId = menuId;

    step = 'conectar canal';
    if (channel.type === 'delivery') {
      await createDeliveryAppMenu(token, menuId, channel.deliveryIntegrationId, clusterId);
    } else {
      await createMenuChannel(token, menuId, clusterId);
    }

    step = 'crear secciones';
    const sectionsToCreate = sectionsWithValidItems.filter((s) => s.items.length > 0);
    const sectionIds: string[] = [];

    if (sectionsToCreate.length > 0) {
      const sectionRes = await createMenuSections(
        token,
        menuId,
        sectionsToCreate.map((s) => ({ name: s.name })),
        clusterId,
      );
      (sectionRes.data as Array<{ id: string }>).forEach((section) => sectionIds.push(section.id));
    }

    step = 'agregar productos';
    const priceOverrides: Array<{ name: string; fudoPrice: number; excelPrice: number }> = [];
    const overridesToApply: MenuItemOverrideInput[] = [];

    for (let i = 0; i < sectionsToCreate.length; i++) {
      const sectionItems = sectionsToCreate[i].items;
      const createRes = await createMenuItems(
        token,
        sectionIds[i],
        sectionItems.map((item) => ({ sku: item.sku })),
        clusterId,
      );
      const createdIds: string[] = (createRes.data as Array<{ id: string }>).map((mi) => mi.id);

      sectionItems.forEach((item, idx) => {
        const fudoPrice = productById.get(item.sku)?.price;
        const priceDiffers = item.price !== undefined && item.price !== fudoPrice;
        if (priceDiffers) {
          const displayName = item.name || productById.get(item.sku)?.name || `SKU ${item.sku}`;
          priceOverrides.push({ name: displayName, fudoPrice: fudoPrice ?? 0, excelPrice: item.price! });
        }
        if (item.name || item.description || priceDiffers) {
          overridesToApply.push({
            id: createdIds[idx],
            name: item.name,
            description: item.description,
            price: priceDiffers ? item.price : undefined,
          });
        }
      });
    }

    step = 'aplicar nombre/descripción/precio del Excel';
    if (overridesToApply.length > 0) {
      await updateMenuItemOverrides(token, overridesToApply, clusterId);
    }

    // Subir imagen solo a los productos que no tenían una — nunca se pisa
    // una imagen existente. Se sube una vez por SKU, aunque aparezca en más
    // de una sección.
    step = 'subir imágenes faltantes';
    const imageUrlBySku = new Map<number, string>();
    for (const item of sectionsWithValidItems.flatMap((s) => s.items)) {
      if (item.imageUrl && !imageUrlBySku.has(item.sku)) {
        imageUrlBySku.set(item.sku, item.imageUrl);
      }
    }

    let imagesUploaded = 0;
    const imageErrors: Array<{ sku: number; error: string }> = [];

    for (const [sku, imageUrl] of imageUrlBySku) {
      if (productById.get(sku)?.image) continue;
      try {
        await downloadAndUploadProductImage(token, sku, imageUrl, clusterId);
        imagesUploaded++;
      } catch (err) {
        imageErrors.push({ sku, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return {
      menuId,
      sectionsCreated: sectionsToCreate.length,
      missingSkus,
      imagesUploaded,
      imageErrors,
      priceOverrides,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MenuMigrationError(message, step, createdMenuId);
  }
}

export async function downloadAndUploadProductImage(token: string, productId: number, imageUrl: string, clusterId?: string) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'amgtvfpqmrqzwtkhyppx';
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Use raw fetch to get proper binary blob with content-type
  const dlResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/peya-migration-download-image`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: imageUrl }),
  });

  if (!dlResponse.ok) {
    throw new Error('Error al descargar la imagen');
  }

  const contentType = dlResponse.headers.get('content-type') || 'image/jpeg';
  const blob = await dlResponse.blob();

  // Edge function guarantees JPG/PNG ≤ 2MB, but keep a safety check
  if (blob.size > 2 * 1024 * 1024) {
    throw new Error(`La imagen excede el límite de 2MB de Fudo (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  const isPng = contentType.includes('png');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const ext = isPng ? 'png' : 'jpg';

  const file = new File([blob], `product-${productId}.${ext}`, { type: mimeType });

  // Skip the ALLOWED_IMAGE_TYPES check since we've normalized the type
  const projectIdForUpload = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'amgtvfpqmrqzwtkhyppx';
  const formData = new FormData();
  formData.append('image', file);

  const params = new URLSearchParams({
    path: `products/${productId}/image`,
    method: 'PUT',
    token,
  });
  if (clusterId) params.set('clusterId', clusterId);

  const response = await fetch(`https://${projectIdForUpload}.supabase.co/functions/v1/peya-migration-fudo-proxy?${params}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }

  return response.json();
}

import { useEffect, useState, ChangeEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { buildAvailability, buildDeliveryMenuFromSections, getDeliveryIntegrations, MenuAvailabilityDay } from '@/lib/fudo-api';
import { parseProductsExcel, ExcelMenuSection } from '@/lib/menu-excel';
import WeeklyScheduleEditor, { DaySchedule, emptyWeeklySchedule } from '@/components/WeeklyScheduleEditor';

interface Integration {
  id: string;
  partner: string;
  extraData?: unknown;
}

const PARTNER_LABELS: Record<string, string> = {
  pedidos_ya: 'PedidosYa',
};

function integrationLabel(integration: Integration) {
  const partnerLabel = PARTNER_LABELS[integration.partner] ?? integration.partner;
  const extra = integration.extraData as { name?: string } | undefined;
  return extra?.name ? `${partnerLabel} - ${extra.name}` : `${partnerLabel} (#${integration.id})`;
}

function nowDdmmyyHHmm() {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${String(d.getFullYear()).slice(-2)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// "HH:MM" (lo que devuelve un <input type="time">) -> [hora, minutos]
function parseTime(value: string): [number, number] | null {
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return [h, m];
}

function toAvailabilityInput(daySchedules: DaySchedule[]): MenuAvailabilityDay[] {
  return daySchedules.map((d) => {
    const shifts = d.shifts
      .map((s) => {
        const start = parseTime(s.start);
        const end = parseTime(s.end);
        if (!start || !end) return null;
        return { startHour: start[0], startMinutes: start[1], endHour: end[0], endMinutes: end[1] };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
    return { dayOfWeek: d.dayOfWeek, active: d.active && shifts.length > 0, shifts };
  });
}

type FileStatus = 'idle' | 'parsing' | 'ready' | 'error';
type IntegrationsStatus = 'idle' | 'loading' | 'ready' | 'error';
type CreateStatus = 'idle' | 'loading' | 'success' | 'error';

export default function PedidosYaDeliveryMenuCard() {
  const { auth } = useAuth();

  const [sections, setSections] = useState<ExcelMenuSection[]>([]);
  const [fileStatus, setFileStatus] = useState<FileStatus>('idle');
  const [fileError, setFileError] = useState('');

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [integrationsStatus, setIntegrationsStatus] = useState<IntegrationsStatus>('idle');
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [schedule, setSchedule] = useState<DaySchedule[]>(emptyWeeklySchedule());

  const [createStatus, setCreateStatus] = useState<CreateStatus>('idle');
  const [createError, setCreateError] = useState('');
  const [result, setResult] = useState<{
    menuId: string;
    sectionsCreated: number;
    missingSkus: number[];
    imagesUploaded: number;
    imageErrors: Array<{ sku: number; error: string }>;
    priceOverrides: Array<{ name: string; fudoPrice: number; excelPrice: number }>;
  } | null>(null);

  const canUseTestMode = !!auth?.username?.toLowerCase().startsWith('soporte-fudo@');

  useEffect(() => {
    if (!auth) return;
    setIntegrationsStatus('loading');
    getDeliveryIntegrations(auth.token, auth.clusterId || undefined)
      .then((res) => {
        const raw: Array<{ id: string; attributes: { partner: string; extraData?: unknown; menuPushEnabled?: boolean } }> =
          Array.isArray(res?.data) ? res.data : [];
        const enabled = raw
          .filter((r) => r.attributes.menuPushEnabled === true)
          .map((r) => ({ id: r.id, partner: r.attributes.partner, extraData: r.attributes.extraData }));
        setIntegrations(enabled);
        setIntegrationsStatus('ready');
      })
      .catch(() => setIntegrationsStatus('error'));
  }, [auth]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileStatus('parsing');
    setFileError('');
    setResult(null);
    setCreateStatus('idle');
    try {
      const parsed = await parseProductsExcel(file);
      setSections(parsed);
      setFileStatus('ready');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Error al leer el archivo');
      setFileStatus('error');
    }
  }

  async function handleCreate() {
    if (!auth || sections.length === 0) return;
    if (!testMode && !selectedIntegrationId) return;

    setCreateStatus('loading');
    setCreateError('');
    try {
      const menuName = testMode ? `Pedidos Ya (prueba) ${nowDdmmyyHHmm()}` : `Pedidos Ya ${nowDdmmyyHHmm()}`;
      const sectionsInput = sections.map((s) => ({
        name: s.name,
        items: s.items.map((i) => ({
          sku: i.sku,
          imageUrl: i.imageUrl,
          name: i.name,
          description: i.description,
          price: i.price,
        })),
      }));
      const availability = buildAvailability(toAvailabilityInput(schedule));
      const res = await buildDeliveryMenuFromSections(
        auth.token,
        testMode ? { type: 'online-menu-test' } : { type: 'delivery', deliveryIntegrationId: selectedIntegrationId },
        sectionsInput,
        auth.clusterId || undefined,
        menuName,
        availability,
      );
      setResult(res);
      setCreateStatus('success');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error desconocido');
      setCreateStatus('error');
    }
  }

  const totalSkus = sections.reduce((acc, s) => acc + s.items.length, 0);
  const hasSchedule = schedule.some((d) => d.active && d.shifts.some((s) => s.start && s.end));
  const canCreate =
    fileStatus === 'ready' &&
    sections.length > 0 &&
    (testMode || !!selectedIntegrationId) &&
    hasSchedule &&
    createStatus !== 'loading';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Crear Menú Pedidos Ya en Fudo</h2>
      <p className="text-sm text-gray-500 mb-4">
        Crea una carta nueva con el canal de Pedidos Ya, usando las secciones y los productos que
        vienen en tu Excel.
        <br /><br />
        Los productos se van a mostrar en tu menú con los nombres, descripciones y precios que
        tengas en PedidosYa (si el precio difiere del de Fudo, se ajusta solo para este menú).
        <br />
        Si un producto no tiene imagen en Fudo, se sube la de Pedidos Ya.
        <br /><br />
        El menú no se publica. Queda en borrador disponible para validar y publicar manualmente.
      </p>

      {/* Paso 1: archivo */}
      <label className="block text-sm font-medium text-gray-700 mb-1">Excel de productos</label>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-600 mb-1 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-sm"
      />
      {fileStatus === 'parsing' && <p className="text-xs text-gray-400 mb-3">Leyendo archivo...</p>}
      {fileStatus === 'ready' && (
        <p className="text-xs text-gray-500 mb-3">
          {sections.length} sección(es), {totalSkus} producto(s) encontrados en el Excel.
        </p>
      )}
      {fileStatus === 'error' && <p className="text-xs text-red-600 mb-3">{fileError}</p>}

      {canUseTestMode && (
        <label className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
            className="rounded border-gray-300"
          />
          Modo prueba: usar el canal Tienda Online en vez de Pedidos Ya (para cuentas sin esa integración habilitada)
        </label>
      )}

      {/* Paso 2: integración de delivery */}
      {!testMode && (
        <>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tienda Pedidos Ya</label>
          <select
            value={selectedIntegrationId}
            onChange={(e) => setSelectedIntegrationId(e.target.value)}
            disabled={integrationsStatus !== 'ready' || integrations.length === 0}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1 disabled:bg-gray-50"
          >
            <option value="">Elegir tienda...</option>
            {integrations.map((i) => (
              <option key={i.id} value={i.id}>
                {integrationLabel(i)}
              </option>
            ))}
          </select>
          {integrationsStatus === 'loading' && <p className="text-xs text-gray-400 mb-3">Buscando integraciones...</p>}
          {integrationsStatus === 'ready' && integrations.length === 0 && (
            <p className="text-xs text-amber-600 mb-3">Esta cuenta no tiene ninguna tienda de Pedidos Ya con push de menú habilitado.</p>
          )}
          {integrationsStatus === 'error' && <p className="text-xs text-red-600 mb-3">No se pudieron leer las integraciones de delivery.</p>}
        </>
      )}

      {/* Paso 3: horarios por día */}
      <label className="block text-sm font-medium text-gray-700 mb-2">Horarios</label>
      <WeeklyScheduleEditor value={schedule} onChange={setSchedule} />
      <p className="text-xs text-red-600 mb-3 min-h-[1em]">
        {!hasSchedule && 'Completá al menos un turno (apertura y cierre) en algún día.'}
      </p>

      <button
        onClick={handleCreate}
        disabled={!canCreate}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors mt-2"
      >
        {createStatus === 'loading' ? 'Creando...' : testMode ? 'Crear Menú de Prueba (Tienda Online)' : 'Crear Menú Pedidos Ya'}
      </button>

      {createStatus === 'success' && result && (
        <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <p className="font-medium">Menú creado correctamente (sin publicar)</p>
          <p className="text-xs text-green-600 mt-0.5">
            ID: {result.menuId} — {result.sectionsCreated} sección(es) con productos — {result.imagesUploaded} imagen(es) subida(s)
          </p>
          {result.missingSkus.length > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              SKUs del Excel no encontrados en Fudo (se saltearon): {result.missingSkus.join(', ')}
            </p>
          )}
          {result.imageErrors.length > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              Imágenes que no se pudieron subir: {result.imageErrors.map((e) => `${e.sku} (${e.error})`).join(', ')}
            </p>
          )}
          {result.priceOverrides.length > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              Precios ajustados solo en este menú (Fudo → Excel): {result.priceOverrides.map((p) => `${p.name} ($${p.fudoPrice} → $${p.excelPrice})`).join(', ')}
            </p>
          )}
        </div>
      )}

      {createStatus === 'error' && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="font-medium">Ocurrió un error</p>
          <p className="text-xs text-red-600 mt-0.5">{createError}</p>
        </div>
      )}
    </div>
  );
}

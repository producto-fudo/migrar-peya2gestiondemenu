import { useState, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getSupportCredentials,
  authenticateWithCredentials,
  buildMenuFromCategories,
  MenuMigrationError,
} from '@/lib/fudo-api';

type RowStatus = 'pending' | 'getting-credentials' | 'migrating' | 'done' | 'partial' | 'error';

interface AccountRow {
  accountId: string;
  status: RowStatus;
  menuId?: string;
  step?: string;
  error?: string;
}

// Cuántas cuentas migrar en paralelo. Conservador porque todo sale por la misma
// IP de Supabase y no hay reintentos; si Fudo empieza a frenar, bajarlo.
const CONCURRENCY = 4;

// Corre `worker` sobre `items` con como mucho `limit` en vuelo a la vez,
// manteniendo el pool lleno (no espera a la más lenta de cada tanda).
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  const runNext = async (): Promise<void> => {
    while (index < items.length) {
      await worker(items[index++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}

export default function SupportPage() {
  const { auth, logout } = useAuth();

  const [accountIdsInput, setAccountIdsInput] = useState('');
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  function updateRow(accountId: string, patch: Partial<AccountRow>) {
    setRows((prev) => prev.map((r) => (r.accountId === accountId ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!auth?.dashCookie) return;
    const dashCookie = auth.dashCookie;

    const ids = accountIdsInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) return;

    const initialRows: AccountRow[] = ids.map((id) => ({ accountId: id, status: 'pending' }));
    setRows(initialRows);
    setCopied(false);
    setRunning(true);

    const processAccount = async (accountId: string) => {
      // Paso 1: credenciales de soporte
      updateRow(accountId, { status: 'getting-credentials' });
      let login: string;
      let password: string;
      try {
        const creds = await getSupportCredentials(accountId, dashCookie);
        login = creds.login;
        password = creds.password;
      } catch (err) {
        updateRow(accountId, {
          status: 'error',
          step: 'obtener acceso',
          error: err instanceof Error ? err.message : 'Error al obtener credenciales',
        });
        return;
      }

      // Paso 2 + 3: auth + migración
      updateRow(accountId, { status: 'migrating' });
      try {
        const authData = await authenticateWithCredentials(login, password);
        const clusterId = String(authData.clusters?.[0]?.id ?? '');
        const today = new Date().toISOString().split('T')[0];
        const menuName = `Menu Tienda Online - ${today}`;
        const result = await buildMenuFromCategories(authData.token, clusterId || undefined, menuName);
        updateRow(accountId, { status: 'done', menuId: result.menuId });
      } catch (err) {
        if (err instanceof MenuMigrationError && err.menuId) {
          // El menú llegó a crearse antes de fallar → quedó a medio hacer.
          updateRow(accountId, {
            status: 'partial',
            menuId: err.menuId,
            step: err.step,
            error: err.message,
          });
        } else {
          updateRow(accountId, {
            status: 'error',
            step: err instanceof MenuMigrationError ? err.step : undefined,
            error: err instanceof Error ? err.message : 'Error al migrar',
          });
        }
      }
    };

    await runWithConcurrency(ids, CONCURRENCY, processAccount);

    setRunning(false);
  }

  function copyFailed() {
    const failed = rows.filter((r) => r.status === 'error' || r.status === 'partial');
    const text = failed
      .map((r) =>
        r.status === 'partial'
          ? `${r.accountId}\ta medio hacer — menú ${r.menuId} (falló en ${r.step})`
          : `${r.accountId}\tsin crear${r.error ? ` — ${r.error}` : ''}`,
      )
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const statusLabel: Record<RowStatus, string> = {
    'pending': '— En cola',
    'getting-credentials': '⏳ Obteniendo acceso...',
    'migrating': '⏳ Migrando menú...',
    'done': '✓ Listo',
    'partial': '⚠ A medio hacer',
    'error': '✗ No se creó',
  };

  const statusColor: Record<RowStatus, string> = {
    'pending': 'text-gray-400',
    'getting-credentials': 'text-blue-600',
    'migrating': 'text-blue-600',
    'done': 'text-green-600',
    'partial': 'text-amber-600',
    'error': 'text-red-600',
  };

  const doneCount = rows.filter((r) => r.status === 'done').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const partialCount = rows.filter((r) => r.status === 'partial').length;
  const failedCount = errorCount + partialCount;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        <div className="flex items-center justify-between mb-8 pt-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fudo Tools</h1>
            <p className="text-xs text-gray-400 mt-0.5">Modo soporte</p>
          </div>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Migrar menús en múltiples cuentas</h2>
          <p className="text-sm text-gray-500 mb-4">
            Pegá los account IDs (uno por línea). La app va a obtener acceso a cada cuenta y migrar su menú tienda online.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="accountIds" className="block text-sm font-medium text-gray-700 mb-1">
                Account IDs
              </label>
              <textarea
                id="accountIds"
                value={accountIdsInput}
                onChange={(e) => setAccountIdsInput(e.target.value)}
                rows={5}
                placeholder={"269453\n269454\n269455"}
                disabled={running}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-50"
              />
            </div>

            <button
              type="submit"
              disabled={running || !accountIdsInput.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {running ? 'Migrando...' : 'Migrar menús'}
            </button>
          </form>

          {rows.length > 0 && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-green-600 font-medium">✓ {doneCount}</span>
                <span className="text-gray-300 mx-1.5">·</span>
                <span className="text-red-600 font-medium">✗ {errorCount} sin crear</span>
                <span className="text-gray-300 mx-1.5">·</span>
                <span className="text-amber-600 font-medium">⚠ {partialCount} a medio hacer</span>
              </div>
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={copyFailed}
                  className="text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md px-2.5 py-1 transition-colors whitespace-nowrap"
                >
                  {copied ? '✓ Copiado' : 'Copiar fallidas'}
                </button>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Cuenta</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.accountId}>
                      <td className="px-4 py-2.5 font-mono text-gray-700 align-top">{row.accountId}</td>
                      <td className={`px-4 py-2.5 ${statusColor[row.status]}`}>
                        <span>{statusLabel[row.status]}</span>
                        {row.status === 'done' && row.menuId && (
                          <span className="text-xs text-gray-400 ml-2">({row.menuId})</span>
                        )}
                        {row.status === 'partial' && (
                          <>
                            <span className="text-xs text-gray-500 ml-2">
                              menú {row.menuId} · falló en {row.step}
                            </span>
                            {row.error && (
                              <span className="block text-xs text-amber-500 mt-0.5">{row.error}</span>
                            )}
                          </>
                        )}
                        {row.status === 'error' && (
                          <>
                            {row.step && (
                              <span className="text-xs text-gray-500 ml-2">(falló en {row.step})</span>
                            )}
                            {row.error && (
                              <span className="block text-xs text-red-400 mt-0.5">{row.error}</span>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

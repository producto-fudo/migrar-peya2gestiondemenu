import { useAuth } from '@/context/AuthContext';
import PedidosYaDeliveryMenuCard from '@/components/PedidosYaDeliveryMenuCard';
import { APP_TITLE } from '@/lib/app-info';

export default function DashboardPage() {
  const { auth, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-8 pt-4">
          <h1 className="text-base font-bold text-gray-900">{APP_TITLE}</h1>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
          >
            Cerrar sesión
          </button>
        </div>

        {/* Bienvenida */}
        <p className="text-sm text-gray-500 mb-6">
          Conectado como <span className="font-medium text-gray-700">{auth?.username}</span>
        </p>

        <PedidosYaDeliveryMenuCard />

      </div>
    </div>
  );
}

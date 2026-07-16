export interface DayShift {
  start: string; // "HH:MM"
  end: string;
}

export interface DaySchedule {
  dayOfWeek: number; // 0 = domingo, igual que Date.getDay()
  active: boolean;
  shifts: DayShift[];
}

// Orden de visualización (Lunes a Domingo) — el dato interno sigue usando
// dayOfWeek 0=domingo para que coincida con lo que espera Fudo.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

export function emptyWeeklySchedule(): DaySchedule[] {
  return DAY_ORDER.map((dayOfWeek) => ({ dayOfWeek, active: true, shifts: [{ start: '', end: '' }] }));
}

interface Props {
  value: DaySchedule[];
  onChange: (value: DaySchedule[]) => void;
}

export default function WeeklyScheduleEditor({ value, onChange }: Props) {
  function toggleActive(dayOfWeek: number) {
    onChange(value.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, active: !d.active } : d)));
  }

  function updateShift(dayOfWeek: number, index: number, field: 'start' | 'end', time: string) {
    onChange(
      value.map((d) =>
        d.dayOfWeek === dayOfWeek
          ? { ...d, shifts: d.shifts.map((s, i) => (i === index ? { ...s, [field]: time } : s)) }
          : d,
      ),
    );
  }

  function addShift(dayOfWeek: number) {
    onChange(value.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, shifts: [...d.shifts, { start: '', end: '' }] } : d)));
  }

  function removeShift(dayOfWeek: number, index: number) {
    onChange(
      value.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, shifts: d.shifts.filter((_, i) => i !== index) } : d)),
    );
  }

  function applyToAllDays(dayOfWeek: number) {
    const source = value.find((d) => d.dayOfWeek === dayOfWeek);
    if (!source) return;
    onChange(
      value.map((d) => ({
        ...d,
        active: source.active,
        shifts: source.shifts.map((s) => ({ ...s })),
      })),
    );
  }

  return (
    <div className="space-y-2 mb-3">
      {DAY_ORDER.map((dayOfWeek) => {
        const day = value.find((d) => d.dayOfWeek === dayOfWeek);
        if (!day) return null;
        return (
          <div key={dayOfWeek} className="border border-gray-200 rounded-lg p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <input
                type="checkbox"
                checked={day.active}
                onChange={() => toggleActive(dayOfWeek)}
                className="rounded border-gray-300"
              />
              {DAY_LABELS[dayOfWeek]}
            </label>

            {day.active && (
              <div className="space-y-2">
                {day.shifts.map((shift, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={shift.start}
                      onChange={(e) => updateShift(dayOfWeek, i, 'start', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                    <span className="text-gray-400 text-xs">a</span>
                    <input
                      type="time"
                      value={shift.end}
                      onChange={(e) => updateShift(dayOfWeek, i, 'end', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                    {day.shifts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeShift(dayOfWeek, i)}
                        className="text-gray-400 hover:text-red-600 text-sm px-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => addShift(dayOfWeek)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    + Agregar horario
                  </button>
                  <button
                    type="button"
                    onClick={() => applyToAllDays(dayOfWeek)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Repetir en todos los días
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

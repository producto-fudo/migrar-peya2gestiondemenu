import * as XLSX from 'xlsx';

export interface ExcelMenuItem {
  sku: number;
  indice: number;
  imageUrl?: string;
  name?: string;
  description?: string;
  price?: number;
}

export interface ExcelMenuSection {
  name: string;
  items: ExcelMenuItem[];
}

// Usamos Sección, SKU, Indice, Imagen, Nombre, Descripción y Precio del
// Excel de productos. El producto de Fudo nunca se modifica (salvo la
// imagen, que solo se sube si no tenía una) — Nombre, Descripción y Precio
// se aplican al ítem del menú puntual, no al producto en sí.
export async function parseProductsExcel(file: File): Promise<ExcelMenuSection[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const sections: ExcelMenuSection[] = [];
  const sectionByName = new Map<string, ExcelMenuSection>();

  for (const row of rows) {
    const name = String(row['Sección'] ?? '').trim();
    const sku = Number(row['SKU']);
    const indice = Number(row['Indice'] ?? 0);
    const imageUrl = row['Imagen'] ? String(row['Imagen']).trim() : undefined;
    const itemName = row['Nombre'] ? String(row['Nombre']).trim() : undefined;
    const description = row['Descripción'] ? String(row['Descripción']).trim() : undefined;
    const priceRaw = row['Precio'];
    const price = priceRaw !== null && priceRaw !== undefined && priceRaw !== ''
      ? Number(priceRaw)
      : undefined;

    if (!name || !sku || Number.isNaN(sku)) continue;

    let section = sectionByName.get(name);
    if (!section) {
      section = { name, items: [] };
      sectionByName.set(name, section);
      sections.push(section);
    }
    section.items.push({
      sku,
      indice,
      imageUrl,
      name: itemName,
      description,
      price: price !== undefined && !Number.isNaN(price) ? price : undefined,
    });
  }

  sections.forEach((s) => s.items.sort((a, b) => a.indice - b.indice));
  return sections;
}

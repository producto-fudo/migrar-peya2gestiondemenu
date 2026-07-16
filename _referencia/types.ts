export const isDisabledOnline = (val: unknown) => val === false || val === 0 || val === "false";

export interface FudoCategory {
  id: number;
  name: string;
  enableOnlineMenu?: boolean;
  parentId?: number;
  position?: number;
}

export interface FudoProduct {
  id: number;
  name: string;
  description?: string;
  price?: number;
  image?: string | null;
  sellAlone?: boolean;
  active?: boolean;
  enableOnlineMenu?: boolean;
  productCategoryId?: number;
  categoryName?: string;
  position?: number;
}

export interface GroupedCategory {
  categoryId: number | null;
  categoryName: string;
  categoryOnlineMenu: unknown;
  parentOnlineMenu?: unknown;
  categoryPosition?: number;
  products: FudoProduct[];
  children: GroupedCategory[];
}

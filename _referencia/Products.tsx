import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getProducts, getProductCategories, uploadProductImage, updateProduct, updateProductCategory } from "@/lib/fudo-api";
import { useFudoAuth } from "@/hooks/useFudoAuth";
import { AppHeader } from "@/components/AppHeader";
import { CategoryCard } from "@/components/products/CategoryCard";
import { CreateProductDialog } from "@/components/products/CreateProductDialog";
import { CreateCategoryDialog } from "@/components/products/CreateCategoryDialog";
import { FudoCategory, FudoProduct, GroupedCategory, isDisabledOnline } from "@/components/products/types";

const Products = () => {
  const { token, clusterId, isConnected } = useFudoAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  // Server snapshots - used for filtering only
  const [serverProducts, setServerProducts] = useState<FudoProduct[]>([]);
  const [serverCategories, setServerCategories] = useState<FudoCategory[]>([]);
  // Live state with pending changes applied - used for rendering
  const [allProducts, setAllProducts] = useState<FudoProduct[]>([]);
  const [allCategories, setAllCategories] = useState<FudoCategory[]>([]);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);

  const [filterActive, setFilterActive] = useState<"active" | "inactive" | "all">("active");
  const [filterSellAlone, setFilterSellAlone] = useState<"true" | "false" | "all">("true");
  const [filterOnlineMenu, setFilterOnlineMenu] = useState<"available" | "unavailable" | "all">("available");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<"name" | "description" | null>(null);
  const [editValue, setEditValue] = useState("");

  // Batch pending changes
  const [pendingProductChanges, setPendingProductChanges] = useState<Map<number, Partial<Pick<FudoProduct, "name" | "description" | "enableOnlineMenu">>>>(new Map());
  const [pendingCategoryChanges, setPendingCategoryChanges] = useState<Map<number, { enableOnlineMenu?: boolean }>>(new Map());
  const [publishing, setPublishing] = useState(false);

  const totalPendingChanges = pendingProductChanges.size + pendingCategoryChanges.size;

  useEffect(() => {
    if (!isConnected) navigate("/", { replace: true });
  }, [isConnected, navigate]);

  useEffect(() => {
    if (isConnected && token) loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [productsData, categoriesData] = await Promise.all([
        getProducts(token, clusterId || undefined),
        getProductCategories(token, clusterId || undefined),
      ]);

      let categories: FudoCategory[] = [];
      if (Array.isArray(categoriesData)) {
        categories = categoriesData;
      } else if (categoriesData && typeof categoriesData === "object") {
        categories = Object.values(categoriesData) as FudoCategory[];
      }
      setServerCategories(categories);
      setAllCategories(categories);

      let parsed: FudoProduct[] = [];
      if (Array.isArray(productsData)) {
        parsed = productsData;
      } else if (productsData && typeof productsData === "object") {
        parsed = Object.values(productsData) as FudoProduct[];
      }
      setServerProducts(parsed);
      setAllProducts(parsed);
      setPendingProductChanges(new Map());
      setPendingCategoryChanges(new Map());
      toast.success(`${parsed.length} productos cargados`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Use SERVER snapshots for filtering, but LIVE state for rendering
  const grouped = useMemo(() => {
    const byPosition = (a: { position?: number }, b: { position?: number }) => (a.position ?? Infinity) - (b.position ?? Infinity);
    const serverCategoryMap = new Map(serverCategories.map((c) => [c.id, c]));
    const liveCategoryMap = new Map(allCategories.map((c) => [c.id, c]));

    const isProductAvailableOnlineServer = (p: FudoProduct) => {
      if (isDisabledOnline(p.enableOnlineMenu)) return false;
      if (p.productCategoryId) {
        const cat = serverCategoryMap.get(p.productCategoryId);
        if (cat && isDisabledOnline(cat.enableOnlineMenu)) return false;
        if (cat?.parentId) {
          const parent = serverCategoryMap.get(cat.parentId);
          if (parent && isDisabledOnline(parent.enableOnlineMenu)) return false;
        }
      }
      return true;
    };

    // Filter based on SERVER data
    let filtered = serverProducts;
    if (filterActive === "active") filtered = filtered.filter((p) => p.active === true);
    else if (filterActive === "inactive") filtered = filtered.filter((p) => p.active !== true);

    if (filterSellAlone === "true") filtered = filtered.filter((p) => p.sellAlone !== false);
    else if (filterSellAlone === "false") filtered = filtered.filter((p) => p.sellAlone === false);

    if (filterOnlineMenu === "available") {
      filtered = filtered.filter(isProductAvailableOnlineServer);
    } else if (filterOnlineMenu === "unavailable") {
      filtered = filtered.filter((p) => !isProductAvailableOnlineServer(p));
    }

    // Get the filtered product IDs, then map to LIVE versions for rendering
    const filteredIds = new Set(filtered.map((p) => p.id));
    const liveProductMap = new Map(allProducts.map((p) => [p.id, p]));

    const productsByCategory = new Map<number | null, FudoProduct[]>();
    filtered.forEach((serverP) => {
      const liveP = liveProductMap.get(serverP.id) || serverP;
      const catId = liveP.productCategoryId ?? null;
      if (!productsByCategory.has(catId)) productsByCategory.set(catId, []);
      productsByCategory.get(catId)!.push(liveP);
    });

    const childrenMap = new Map<number, FudoCategory[]>();
    const rootCategories: FudoCategory[] = [];

    // Use LIVE categories for rendering (shows pending toggle state)
    allCategories.forEach((cat) => {
      if (cat.parentId) {
        if (!childrenMap.has(cat.parentId)) childrenMap.set(cat.parentId, []);
        childrenMap.get(cat.parentId)!.push(cat);
      } else {
        rootCategories.push(cat);
      }
    });

    // Filter categories based on SERVER data
    const categoryMatchesFilter = (catId: number, parentCatId?: number) => {
      if (filterOnlineMenu === "all") return true;
      const serverCat = serverCategoryMap.get(catId);
      const serverParent = parentCatId ? serverCategoryMap.get(parentCatId) : undefined;
      const catDisabled = serverCat ? isDisabledOnline(serverCat.enableOnlineMenu) : false;
      const parentDisabled = serverParent ? isDisabledOnline(serverParent.enableOnlineMenu) : false;
      const effectivelyDisabled = catDisabled || parentDisabled;
      return filterOnlineMenu === "available" ? !effectivelyDisabled : effectivelyDisabled;
    };

    const result: GroupedCategory[] = [];
    const usedCategoryIds = new Set<number>();

    rootCategories.forEach((rootCat) => {
      const children = childrenMap.get(rootCat.id) || [];
      const rootProducts = productsByCategory.get(rootCat.id) || [];

      const childGroups: GroupedCategory[] = [];
      children.forEach((childCat) => {
        usedCategoryIds.add(childCat.id);
        const childProducts = productsByCategory.get(childCat.id) || [];
        const hasProducts = childProducts.length > 0;
        const matchesFilter = categoryMatchesFilter(childCat.id, rootCat.id);

        if (hasProducts || matchesFilter) {
          childGroups.push({
            categoryId: childCat.id,
            categoryName: childCat.name,
            categoryOnlineMenu: childCat.enableOnlineMenu,
            parentOnlineMenu: rootCat.enableOnlineMenu,
            categoryPosition: childCat.position,
            products: childProducts.sort(byPosition),
            children: [],
          });
        }
      });

      usedCategoryIds.add(rootCat.id);
      const hasContent = rootProducts.length > 0 || childGroups.length > 0;
      const matchesFilter = categoryMatchesFilter(rootCat.id);

      if (hasContent || matchesFilter) {
        childGroups.sort((a, b) => (a.categoryPosition ?? Infinity) - (b.categoryPosition ?? Infinity));
        result.push({
          categoryId: rootCat.id,
          categoryName: rootCat.name,
          categoryOnlineMenu: rootCat.enableOnlineMenu,
          categoryPosition: rootCat.position,
          products: rootProducts.sort(byPosition),
          children: childGroups,
        });
      }
    });

    productsByCategory.forEach((products, catId) => {
      if (catId === null || usedCategoryIds.has(catId)) return;
      const cat = liveCategoryMap.get(catId);
      result.push({
        categoryId: catId,
        categoryName: cat?.name || "Sin categoría",
        categoryOnlineMenu: cat?.enableOnlineMenu,
        products,
        children: [],
      });
    });

    result.sort((a, b) => (a.categoryPosition ?? Infinity) - (b.categoryPosition ?? Infinity));

    const uncategorized = productsByCategory.get(null);
    if (uncategorized && uncategorized.length > 0) {
      result.push({
        categoryId: null,
        categoryName: "Sin categoría",
        categoryOnlineMenu: undefined,
        products: uncategorized,
        children: [],
      });
    }

    return result;
  }, [serverProducts, serverCategories, allProducts, allCategories, filterActive, filterSellAlone, filterOnlineMenu]);

  // --- Handlers ---
  const handleUploadClick = (productId: number) => {
    setSelectedProductId(productId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selectedProductId === null) return;
    setUploadingId(selectedProductId);
    try {
      await uploadProductImage(token, selectedProductId, file, clusterId || undefined);
      toast.success(`Imagen subida para producto #${selectedProductId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al subir: ${message}`);
    } finally {
      setUploadingId(null);
      setSelectedProductId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startEditing = (product: FudoProduct, field: "name" | "description") => {
    setEditingId(product.id);
    setEditingField(field);
    setEditValue(field === "name" ? product.name : product.description || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingField(null);
    setEditValue("");
  };

  const saveEdit = useCallback(() => {
    if (editingId === null || !editingField) return;
    // Apply locally
    setAllProducts((prev) =>
      prev.map((p) => (p.id === editingId ? { ...p, [editingField]: editValue } : p))
    );
    // Track pending change
    setPendingProductChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(editingId) || {};
      next.set(editingId, { ...existing, [editingField]: editValue });
      return next;
    });
    cancelEditing();
  }, [editingId, editingField, editValue]);

  const handleToggleOnlineMenu = useCallback((product: FudoProduct) => {
    const newValue = !product.enableOnlineMenu;
    // Apply locally
    setAllProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, enableOnlineMenu: newValue } : p))
    );
    // Track pending change
    setPendingProductChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(product.id) || {};
      next.set(product.id, { ...existing, enableOnlineMenu: newValue });
      return next;
    });
  }, []);

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEditing();
  };

  const handleToggleCategoryOnlineMenu = useCallback((categoryId: number, currentValue: unknown) => {
    const newValue = isDisabledOnline(currentValue) ? true : false;
    // Apply locally
    setAllCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, enableOnlineMenu: newValue } : c))
    );
    // Track pending change
    setPendingCategoryChanges((prev) => {
      const next = new Map(prev);
      next.set(categoryId, { enableOnlineMenu: newValue });
      return next;
    });
  }, []);

  const handlePublish = async () => {
    setPublishing(true);
    let successCount = 0;
    let failCount = 0;
    const failedProducts = new Map(pendingProductChanges);
    const failedCategories = new Map(pendingCategoryChanges);

    // Publish product changes
    for (const [productId, changes] of pendingProductChanges) {
      try {
        await updateProduct(token, productId, changes, clusterId || undefined);
        failedProducts.delete(productId);
        successCount++;
      } catch {
        failCount++;
      }
    }

    // Publish category changes
    for (const [categoryId, changes] of pendingCategoryChanges) {
      try {
        await updateProductCategory(token, categoryId, changes, clusterId || undefined);
        failedCategories.delete(categoryId);
        successCount++;
      } catch {
        failCount++;
      }
    }

    setPendingProductChanges(failedProducts);
    setPendingCategoryChanges(failedCategories);
    setPublishing(false);

    if (failCount === 0) {
      toast.success(`${successCount} cambio${successCount !== 1 ? "s" : ""} publicado${successCount !== 1 ? "s" : ""}`);
    } else {
      toast.error(`${failCount} cambio${failCount !== 1 ? "s" : ""} fallaron. ${successCount} publicados.`);
    }
  };

  const handleDiscard = () => {
    // Reload to reset to server state
    loadProducts();
  };

  const totalProducts = grouped.reduce((sum, g) => sum + g.products.length + g.children.reduce((s, c) => s + c.products.length, 0), 0);

  if (!isConnected) return null;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AppHeader />
      <div className="mx-auto max-w-7xl space-y-6 p-6 overflow-hidden">
        {loading && allProducts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">Cargando productos...</p>
          </div>
        ) : allProducts.length > 0 ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Filtros</CardTitle>
                  <CardDescription>
                    Mostrando {totalProducts} de {allProducts.length} productos
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowCreateCategory(true)}>
                    <Plus className="h-4 w-4" />
                    Categoría
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowCreateProduct(true)}>
                    <Plus className="h-4 w-4" />
                    Producto
                  </Button>
                  <Button variant="outline" size="sm" onClick={loadProducts} disabled={loading}>
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    Actualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="space-y-1">
                    <Label>Activo</Label>
                    <Select value={filterActive} onValueChange={(v) => setFilterActive(v as typeof filterActive)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Activos</SelectItem>
                        <SelectItem value="inactive">Inactivos</SelectItem>
                        <SelectItem value="all">Todos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Venta individual</Label>
                    <Select value={filterSellAlone} onValueChange={(v) => setFilterSellAlone(v as typeof filterSellAlone)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Sí</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="all">Todos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Tienda online</Label>
                    <Select value={filterOnlineMenu} onValueChange={(v) => setFilterOnlineMenu(v as typeof filterOnlineMenu)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Disponible</SelectItem>
                        <SelectItem value="unavailable">No disponible</SelectItem>
                        <SelectItem value="all">Todos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {grouped.map((group) => (
              <CategoryCard
                key={group.categoryId ?? "uncategorized"}
                group={group}
                onToggleCategoryOnlineMenu={handleToggleCategoryOnlineMenu}
                editingId={editingId}
                editingField={editingField}
                editValue={editValue}
                uploadingId={uploadingId}
                onStartEditing={startEditing}
                onCancelEditing={cancelEditing}
                onSaveEdit={saveEdit}
                onEditValueChange={setEditValue}
                onEditKeyDown={handleEditKeyDown}
                onToggleOnlineMenu={handleToggleOnlineMenu}
                onUploadClick={handleUploadClick}
              />
            ))}
          </>
        ) : (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">No se encontraron productos</p>
          </div>
        )}
      </div>

      <CreateProductDialog open={showCreateProduct} onOpenChange={setShowCreateProduct} token={token} clusterId={clusterId || undefined} categories={allCategories} onCreated={loadProducts} />
      <CreateCategoryDialog open={showCreateCategory} onOpenChange={setShowCreateCategory} token={token} clusterId={clusterId || undefined} categories={allCategories} onCreated={loadProducts} />

      {/* Sticky publish bar */}
      {totalPendingChanges > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
            <span className="text-sm text-muted-foreground">
              {totalPendingChanges} cambio{totalPendingChanges !== 1 ? "s" : ""} pendiente{totalPendingChanges !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleDiscard} disabled={publishing}>
                Descartar
              </Button>
              <Button onClick={handlePublish} disabled={publishing}>
                {publishing ? "Publicando..." : "Publicar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;

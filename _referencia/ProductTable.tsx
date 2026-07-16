import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Check, X, Pencil } from "lucide-react";
import { FudoProduct } from "./types";

interface ProductTableProps {
  products: FudoProduct[];
  editingId: number | null;
  editingField: "name" | "description" | null;
  editValue: string;
  uploadingId: number | null;
  onStartEditing: (product: FudoProduct, field: "name" | "description") => void;
  onCancelEditing: () => void;
  onSaveEdit: () => void;
  onEditValueChange: (value: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onToggleOnlineMenu: (product: FudoProduct) => void;
  onUploadClick: (productId: number) => void;
}

export const ProductTable = ({
  products,
  editingId,
  editingField,
  editValue,
  uploadingId,
  onStartEditing,
  onCancelEditing,
  onSaveEdit,
  onEditValueChange,
  onEditKeyDown,
  onToggleOnlineMenu,
  onUploadClick,
}: ProductTableProps) => {
  if (products.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-2 px-4">
        No hay productos en esta categoría
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
    <Table className="w-full table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">ID</TableHead>
          <TableHead className="w-[30%]">Nombre</TableHead>
          <TableHead className="w-[30%]">Descripción</TableHead>
          <TableHead className="w-24">Precio</TableHead>
          <TableHead className="w-20">Online</TableHead>
          <TableHead className="w-32">Imagen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-mono">{p.id}</TableCell>
            <TableCell>
              {editingId === p.id && editingField === "name" ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editValue}
                    onChange={(e) => onEditValueChange(e.target.value)}
                    onKeyDown={onEditKeyDown}
                    className="h-8"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onSaveEdit}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelEditing}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="group flex items-center gap-1 cursor-pointer min-w-0" onClick={() => onStartEditing(p, "name")}>
                  <span className="font-medium truncate">{p.name}</span>
                  <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </TableCell>
            <TableCell>
              {editingId === p.id && editingField === "description" ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editValue}
                    onChange={(e) => onEditValueChange(e.target.value)}
                    onKeyDown={onEditKeyDown}
                    className="h-8"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onSaveEdit}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelEditing}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="group flex items-center gap-1 cursor-pointer min-w-0" onClick={() => onStartEditing(p, "description")}>
                  <span className="text-muted-foreground truncate">{p.description || "—"}</span>
                  <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </TableCell>
            <TableCell>{p.price != null ? `$${p.price}` : "—"}</TableCell>
            <TableCell>
              <Switch
                checked={p.enableOnlineMenu !== false}
                onCheckedChange={() => onToggleOnlineMenu(p)}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {p.image && (
                  <img src={p.image} alt={p.name} className="h-8 w-8 rounded object-cover" />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploadingId === p.id}
                  onClick={() => onUploadClick(p.id)}
                >
                  {uploadingId === p.id ? "Subiendo..." : p.image ? "Cambiar" : "Subir"}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
};

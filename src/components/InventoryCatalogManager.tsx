import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inventoryRoutesQuery, type InventoryProduct } from "@/lib/inventory-catalog";
import { productsQuery } from "@/lib/payments";
import { dbErrorMessage } from "@/lib/app";
import { Button } from "@/components/ui/button";
import { InventoryProductEditor } from "@/components/InventoryProductEditor";
export function InventoryCatalogManager() {
 const qc=useQueryClient();const {data:products}=useQuery(productsQuery);const {data:routes}=useQuery(inventoryRoutesQuery);
 const [selected,setSelected]=useState("");const [editing,setEditing]=useState<InventoryProduct|null>(null);const [busy,setBusy]=useState(false);
 const routeName=(id:string|null)=>routes?.find(r=>r.id===id)?.name??"미지정";
 return <details className="space-y-3 rounded-lg border p-4"><summary className="cursor-pointer font-semibold">제품 수정·삭제·복구</summary>
  <div className="flex gap-2"><select aria-label="수정할 제품 선택" className="h-10 min-w-0 flex-1 rounded border bg-background px-2 text-sm" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">제품 선택</option>{products?.filter(p=>!p.deleted_at).map(p=><option key={p.id} value={p.id}>{routeName(p.route_id)} · {p.name}</option>)}</select><Button disabled={!selected} onClick={()=>setEditing(products?.find(p=>p.id===selected)??null)}>수정·삭제</Button></div>
  <details className="text-sm"><summary className="cursor-pointer">삭제한 제품</summary>{products?.filter(p=>p.deleted_at).map(p=><div key={p.id} className="flex items-center gap-2 border-b py-2"><span className="flex-1">{routeName(p.route_id)} · {p.name}</span><Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{const {error}=await supabase.rpc("set_inventory_product_deleted",{_id:p.id,_event:crypto.randomUUID(),_deleted:false});if(error)throw error;await Promise.all(["products","product-overview","product-ledger"].map(k=>qc.invalidateQueries({queryKey:[k]})));toast.success("제품을 복구했습니다.");}catch(e){toast.error(dbErrorMessage(e));}finally{setBusy(false);}}}>복구</Button></div>)}{products?.every(p=>!p.deleted_at)&&<p className="py-2 text-muted-foreground">삭제한 제품이 없습니다.</p>}</details>
  {editing&&<InventoryProductEditor key={editing.id} product={editing} onClose={()=>{setEditing(null);setSelected("");}} />}
 </details>;
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inventoryRoutesQuery, type InventoryProduct } from "@/lib/inventory-catalog";
import { dbErrorMessage } from "@/lib/app";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function InventoryProductEditor({product,onClose}:{product:InventoryProduct;onClose:()=>void}) {
 const qc=useQueryClient(); const {data:routes}=useQuery(inventoryRoutesQuery);
 const [name,setName]=useState(product.name),[price,setPrice]=useState(String(product.price)),[unit,setUnit]=useState(product.unit),[route,setRoute]=useState(product.route_id??"");
 const [initial,setInitial]=useState(""); const [event]=useState(()=>crypto.randomUUID());const [deleteEvent]=useState(()=>crypto.randomUUID());
 const [busy,setBusy]=useState(false),[deleting,setDeleting]=useState(false);
 const refresh=()=>Promise.all(["products","product-overview","product-ledger","product-sales-report"].map(key=>qc.invalidateQueries({queryKey:[key]})));
 async function save(e:React.FormEvent) {e.preventDefault();if(busy)return;setBusy(true);try{
  const {error}=await supabase.rpc("edit_inventory_product",{_id:product.id,_event:event,_name:name.trim(),_price:Number(price),_unit:unit.trim(),...(route?{_route:route}:{}),...(!product.stock_confirmed&&initial!==""?{_initial_stock:Number(initial)}:{})});if(error)throw error;
  await refresh();toast.success("제품 정보를 수정했습니다.");onClose();
 }catch(e){toast.error(dbErrorMessage(e));}finally{setBusy(false);}}
 async function remove(){if(busy)return;setBusy(true);try{const {error}=await supabase.rpc("set_inventory_product_deleted",{_id:product.id,_event:deleteEvent,_deleted:true});if(error)throw error;await refresh();toast.success("제품을 삭제했습니다. 삭제 목록에서 복구할 수 있습니다.");onClose();}catch(e){toast.error(dbErrorMessage(e));}finally{setBusy(false);setDeleting(false);}}
 return <><Dialog open onOpenChange={o=>!o&&!busy&&onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>제품 수정·삭제</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-3">
  <label className="block text-sm">경로<select aria-label="제품 수정 경로" className="h-10 w-full rounded border bg-background px-2" disabled={busy} value={route} onChange={e=>setRoute(e.target.value)}><option value="">미지정</option>{routes?.filter(r=>!r.deleted_at).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
  <label className="block text-sm">제품명<Input aria-label="수정 제품명" required maxLength={100} disabled={busy} value={name} onChange={e=>setName(e.target.value)} /></label>
  <div className="grid grid-cols-2 gap-3"><label className="text-sm">판매가(원)<Input aria-label="수정 판매가" required type="number" min={0} max={999999999999} step="0.01" disabled={busy} value={price} onChange={e=>setPrice(e.target.value)} /></label><label className="text-sm">단위<Input aria-label="수정 제품 단위" required maxLength={20} disabled={busy} value={unit} onChange={e=>setUnit(e.target.value)} /></label></div>
  {!product.stock_confirmed&&<label className="block text-sm">초기 재고 (확인 후 입력)<Input aria-label="초기 재고 확인 수량" type="number" min={0} max={100000000} step="0.001" disabled={busy} value={initial} onChange={e=>setInitial(e.target.value)} placeholder="비워두면 미확인 상태 유지" /><span className="text-xs text-muted-foreground">실제 현재 보유 수량을 확인한 뒤 입력하세요.</span></label>}
  <div className="flex flex-wrap gap-2"><Button disabled={busy}>수정 저장</Button><Button type="button" variant="destructive" disabled={busy} onClick={()=>setDeleting(true)}>제품 삭제</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>닫기</Button></div>
 </form></DialogContent></Dialog><AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 제품을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>목록에서 숨기고 판매·입출고 이력은 보관합니다. 삭제 목록에서 복구할 수 있습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>취소</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();void remove();}}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

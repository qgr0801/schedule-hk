import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { dbErrorMessage } from "@/lib/app";
import { productsQuery } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Movement = Database["public"]["Tables"]["stock_movements"]["Row"];
const labels:Record<string,string>={initial:"기초",receipt:"입고",usage:"내부소진",internal:"사은품",adjustment:"재고 조정",sale:"판매"};
const editable = ["receipt","usage","internal","adjustment"];
const views = {
  purchases: ["매입 내역", ["receipt"]],
  product: ["제품별 매입 내역", ["receipt"]],
  usage: ["내부소모 내역", ["usage"]],
  adjustments: ["재고조정 내역", ["adjustment"]],
  outbound: ["출고 내역", ["sale","usage","internal"]],
  all: ["입출고 현황", []],
} as const;
export type InventoryHistoryView = keyof typeof views;

export function InventoryMovementHistory({view,from,to,products}:{view:InventoryHistoryView;from:string;to:string;products:{id:string;name:string}[]}) {
 const [page,setPage]=useState(0),[product,setProduct]=useState(""),[edit,setEdit]=useState<{row:Movement;cancel:boolean}|null>(null);
 const [title,kinds]=views[view];
 const rows=useQuery({queryKey:["inventory-movements",view,from,to,product,page],enabled:view!=="product"||!!product,queryFn:async()=>{
  let q=supabase.from("stock_movements").select("*").gte("effective_on",from).lte("effective_on",to).order("effective_on",{ascending:false}).order("created_at",{ascending:false}).order("id");
  if(kinds.length)q=q.in("movement_kind",kinds);
  if(product)q=q.eq("product_id",product);
  const {data,error}=await q.range(page*30,page*30+29);
  if(error)throw error;
  return data;
 }});
 return <section className="space-y-3 rounded-lg border p-4">
  <h4 className="font-semibold">{title}</h4>
  <label className="block max-w-72 text-sm">제품<select className="mt-1 h-10 w-full rounded border bg-background px-2" value={product} onChange={e=>{setProduct(e.target.value);setPage(0);}}><option value="">{view==="product"?"제품 선택":"전체 제품"}</option>{products.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  <p className="text-xs text-muted-foreground">조회 기간 {from} ~ {to}</p>
  {rows.isFetching&&<p>내역을 불러오는 중입니다.</p>}
  {rows.error&&<p role="alert">재고 내역을 불러오지 못했습니다.</p>}
  {rows.data?.length===0&&<p>조회 기간에 해당 기록이 없습니다.</p>}
  {!!rows.data?.length&&<div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
   <thead className="bg-muted"><tr>{["날짜","제품","구분","수량","메모","관리"].map(label=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
   <tbody>{rows.data.map(row=><tr key={row.id} className="border-b">
    <td className="whitespace-nowrap p-2">{row.effective_on}</td><td className="p-2">{products.find(item=>item.id===row.product_id)?.name??"제품"}</td>
    <td className="p-2">{labels[row.movement_kind]??row.movement_kind}</td><td className="p-2">{Number(row.quantity).toLocaleString("ko-KR",{maximumFractionDigits:3})}</td><td className="p-2">{row.reason}</td>
    <td className="p-2">{!row.reservation_id&&editable.includes(row.movement_kind)&&<div className="flex gap-1"><Button type="button" variant="outline" size="sm" onClick={()=>setEdit({row,cancel:false})}>정정</Button><Button type="button" variant="outline" size="sm" onClick={()=>setEdit({row,cancel:true})}>기록 취소</Button></div>}</td>
   </tr>)}</tbody>
  </table></div>}
  {edit&&<MovementCorrection row={edit.row} cancel={edit.cancel} onClose={()=>setEdit(null)}/>}
  {((rows.data?.length??0)>=30||page>0)&&<div className="flex gap-2"><Button variant="outline" size="sm" disabled={!page||rows.isFetching} onClick={()=>setPage(page-1)}>이전</Button><Button variant="outline" size="sm" disabled={rows.data?.length!==30||rows.isFetching} onClick={()=>setPage(page+1)}>다음</Button></div>}
 </section>;
}

function MovementCorrection({row,cancel,onClose}:{row:Movement;cancel:boolean;onClose:()=>void}) {
 const qc=useQueryClient();
 const [event]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false);
 const [quantity,setQuantity]=useState(row.movement_kind==="adjustment"?row.quantity:Math.abs(row.quantity));
 const [date,setDate]=useState(row.effective_on),[note,setNote]=useState(row.reason);
 async function save(e:React.FormEvent){
  e.preventDefault();
  if(busy)return;
  setBusy(true);
  try{
   const {error}=await supabase.rpc("correct_inventory_movement",{
    _id:row.id,_event:event,_expected_quantity:row.quantity,_expected_date:row.effective_on,_expected_note:row.reason,
    _quantity:quantity,_date:date,_note:note,_cancel:cancel,
   });
   if(error)throw error;
   await Promise.all([["inventory-movements"],productsQuery.queryKey,["product-ledger"],["product-overview"]].map(queryKey=>qc.invalidateQueries({queryKey})));
   toast.success(cancel?"기록을 취소하고 재고를 반영했습니다.":"기록을 정정하고 재고를 반영했습니다.");
   onClose();
  }catch(error){toast.error(dbErrorMessage(error));}finally{setBusy(false);}
 }
 return <form onSubmit={save} className="space-y-3 rounded border bg-muted/30 p-3">
  <h5 className="font-medium">{cancel?"재고 기록 취소":"재고 기록 정정"} · {row.effective_on} · {labels[row.movement_kind]} · {row.quantity}</h5>
  {cancel?<p className="text-sm">이 기록의 수량을 재고에서 되돌립니다.</p>:<div className="grid gap-3 sm:grid-cols-3">
   <label className="text-sm">날짜<Input type="date" required disabled={busy} value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label className="text-sm">수량<Input type="number" step="0.001" min={row.movement_kind==="adjustment"?-100000000:0.001} max={100000000} required disabled={busy} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>
   <label className="text-sm">메모<Input required maxLength={200} disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/></label>
  </div>}
  <div className="flex gap-2"><Button type="submit" variant={cancel?"destructive":"default"} disabled={busy}>{cancel?"기록 취소 확인":"정정 저장"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>닫기</Button></div>
 </form>;
}

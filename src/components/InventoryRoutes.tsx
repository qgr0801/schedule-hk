import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inventoryRoutesQuery } from "@/lib/inventory-catalog";
import { dbErrorMessage } from "@/lib/app";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function InventoryRoutes() {
 const qc=useQueryClient();
 const routes=useQuery(inventoryRoutesQuery);
 const [id,setId]=useState<string>(()=>crypto.randomUUID());
 const [name,setName]=useState(""); const [editing,setEditing]=useState(false); const [busy,setBusy]=useState(false);
 const live=routes.data?.filter(r=>!r.deleted_at) ?? [];
 async function save(e:React.FormEvent) {
  e.preventDefault(); if(busy || !name.trim()) return; setBusy(true);
  try { const {error}=await supabase.rpc("save_inventory_route",{_id:id,_name:name.trim()}); if(error) throw error;
    await qc.invalidateQueries({queryKey:inventoryRoutesQuery.queryKey}); setName("");setId(crypto.randomUUID());setEditing(false);toast.success("경로를 저장했습니다.");
  } catch(e){toast.error(dbErrorMessage(e));} finally{setBusy(false);}
 }
 async function remove(routeId:string) { if(busy)return;setBusy(true);try{const {error}=await supabase.rpc("delete_inventory_route",{_id:routeId});if(error)throw error;await qc.invalidateQueries({queryKey:inventoryRoutesQuery.queryKey});toast.success("경로를 삭제했습니다.");}catch(e){toast.error(dbErrorMessage(e));}finally{setBusy(false);} }
 return <details className="space-y-3 rounded-lg border p-4"><summary className="cursor-pointer font-semibold">경로 등록·관리 ({live.length}/10개)</summary>
  <form onSubmit={save} className="flex flex-wrap gap-2"><Input className="min-w-32 flex-1" aria-label="경로명" maxLength={30} required placeholder="경로명 (예: R)" value={name} onChange={e=>setName(e.target.value)} /><Button disabled={busy || (!editing && live.length>=10)}>{editing?"경로 수정 저장":"경로 등록"}</Button>{editing&&<Button type="button" variant="outline" onClick={()=>{setEditing(false);setName("");setId(crypto.randomUUID());}}>취소</Button>}</form>
  {routes.error&&<p role="alert">경로를 불러오지 못했습니다.</p>}
  <div className="space-y-1">{live.map(r=><div key={r.id} className="flex items-center gap-2 border-b py-1 text-sm"><span className="flex-1">{r.name}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{setId(r.id);setName(r.name);setEditing(true);}}>수정</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>remove(r.id)}>삭제</Button></div>)}</div>
  {routes.data?.some(r=>r.deleted_at)&&<details className="text-sm"><summary className="cursor-pointer">삭제한 경로</summary>{routes.data.filter(r=>r.deleted_at).map(r=><div className="flex gap-2 py-1" key={r.id}><span className="flex-1">{r.name}</span><Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{const {error}=await supabase.rpc("save_inventory_route",{_id:r.id,_name:r.name});if(error)throw error;await qc.invalidateQueries({queryKey:inventoryRoutesQuery.queryKey});}catch(e){toast.error(dbErrorMessage(e));}finally{setBusy(false);}}}>복구</Button></div>)}</details>}
 </details>;
}

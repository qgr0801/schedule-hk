import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { bookingRoutesQuery } from "@/lib/booking-routes";
import { meQuery,dbErrorMessage } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog,DialogContent,DialogHeader,DialogTitle } from "@/components/ui/dialog";
export function BookingRouteManager() {
 const {data:me}=useQuery(meQuery),{data:routes,error}=useQuery(bookingRoutesQuery);const qc=useQueryClient();
 const [open,setOpen]=useState(false),[name,setName]=useState(""),[id,setId]=useState<string>(()=>crypto.randomUUID()),[busy,setBusy]=useState(false);
 if(me?.role!=="admin")return null;
 async function save(target=id,label=name,active=true){if(busy)return;setBusy(true);try{const {error}=await supabase.rpc("save_booking_route",{_id:target,_name:label.trim(),_active:active});if(error)throw error;await Promise.all(["booking-routes","booking-activity","route-settlement-summary"].map(key=>qc.invalidateQueries({queryKey:[key]})));setId(crypto.randomUUID());setName("");toast.success("경로를 저장했습니다.");}catch(e){toast.error(dbErrorMessage(e));}finally{setBusy(false);}}
 return <><Button type="button" size="sm" variant="outline" onClick={()=>setOpen(true)}>경로 등록·관리</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>고객 예약 경로 등록·관리</DialogTitle></DialogHeader><p className="text-xs text-muted-foreground">대표 관리자만 등록·수정할 수 있습니다. 사용 중지해도 기존 내역은 유지됩니다.</p>
 <div className="flex gap-2"><Input aria-label="예약 경로명" maxLength={50} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="예: 소개 · 인스타그램 · 일본 파트너"/><Button type="button" disabled={busy||!name.trim()} onClick={()=>void save()}>등록·저장</Button></div>
 {error&&<p role="alert">경로를 불러오지 못했습니다.</p>}{routes?.map(r=><div key={r.id} className="flex items-center gap-2 border-b py-2 text-sm"><span className="min-w-0 flex-1 break-words">{r.name}{!r.is_active&&" · 중지"}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{setId(r.id);setName(r.name);}}>수정</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void save(r.id,r.name,!r.is_active)}>{r.is_active?"중지":"재사용"}</Button></div>)}</DialogContent></Dialog></>;
}
export function BookingRouteField({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
 const {data:routes,error}=useQuery(bookingRoutesQuery);
 return <div className="space-y-2"><div className="flex items-center justify-between gap-2"><label htmlFor="reservation-booking-route" className="text-sm font-medium">경로</label><BookingRouteManager/></div><select id="reservation-booking-route" aria-label="예약 경로 선택" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">미지정</option>{routes?.filter(r=>r.is_active||r.id===value).map(r=><option key={r.id} value={r.id}>{r.name}{!r.is_active&&" (중지)"}</option>)}</select>{error&&<p role="alert" className="text-xs text-destructive">경로를 불러오지 못했습니다. 새로고침 후 확인해 주세요.</p>}</div>;
}

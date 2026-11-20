import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { meQuery,profilesQuery,STATUS_LABEL } from "@/lib/app";
import { bookingRoutesQuery } from "@/lib/booking-routes";
import { type ReviewPeriod,collectedKrw,won } from "@/lib/admin-review";
import { MONEY_COLUMNS,PAYMENT_KINDS,type PaymentLine } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function BookingActivityReport({period}:{period:ReviewPeriod}){
 const {data:me}=useQuery(meQuery);const admin=me?.role==="admin";
 const [mode,setMode]=useState("route"),[route,setRoute]=useState(""),[staff,setStaff]=useState(""),[customer,setCustomer]=useState(""),[page,setPage]=useState(0);
 const [search,setSearch]=useState<{mode:string;route:string;staff:string;customer:string}|null>(null);
 const {data:routes,error:routeError}=useQuery({...bookingRoutesQuery,enabled:admin}),{data:profiles,error:staffError}=useQuery({...profilesQuery,enabled:admin});
 const rows=useQuery({queryKey:["booking-activity",period,search,page],enabled:admin&&!!search,queryFn:async()=>{
  const {data,error}=await supabase.rpc("booking_activity_report",{_from:period.from,_to:period.to,_offset:page*30,...(search?.mode==="route"&&search.route?{_route:search.route}:{}),...(search?.mode==="staff"&&search.staff?{_staff:search.staff}:{}),...(search?.mode==="customer"&&search.customer?{_customer:search.customer}:{})});if(error)throw error;return data;
 }});
 if(!admin)return <p>ADMIN은 최고관리자만 열람할 수 있습니다.</p>;
 return <section className="space-y-3"><h3 className="text-lg font-semibold">예약·시술·결제 상세내역</h3><p className="text-xs text-muted-foreground">예약 날짜 기준 {period.from} ~ {period.to} · 조건을 선택하고 상세 조회를 눌러 주세요.</p>
 <form onSubmit={e=>{e.preventDefault();setPage(0);setSearch({mode,route,staff,customer});}} className="flex flex-wrap items-end gap-2"><div className="flex gap-1">{([["customer","고객"],["staff","담당자"],["route","경로"]] as const).map(([v,label])=><Button type="button" key={v} variant={mode===v?"default":"outline"} aria-pressed={mode===v} onClick={()=>setMode(v)}>{label}</Button>)}</div>
 {mode==="route"&&<select aria-label="상세 조회 경로" className="h-10 rounded border bg-background px-2" value={route} onChange={e=>setRoute(e.target.value)}><option value="">전체 경로</option>{routes?.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>}
 {mode==="staff"&&<select aria-label="상세 조회 담당자" className="h-10 rounded border bg-background px-2" value={staff} onChange={e=>setStaff(e.target.value)}><option value="">전체 담당자</option>{profiles?.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}
 {mode==="customer"&&<Input aria-label="상세 조회 고객명" className="w-48" placeholder="고객명" value={customer} maxLength={50} onChange={e=>setCustomer(e.target.value)}/>}
 <Button>상세 조회</Button></form>
 {(routeError||staffError||rows.error)&&<p role="alert">조회 항목 또는 내역을 불러오지 못했습니다.</p>}
 {!search?<p className="rounded border p-6 text-sm text-muted-foreground">상세 조회 전에는 긴 목록을 표시하지 않습니다.</p>:<>{rows.isPending&&<p>상세 내역을 불러오는 중입니다.</p>}<div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="bg-muted"><tr>{["날짜","고객명","담당자","경로","시술내용","관리내용","결제내용"].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead><tbody>{rows.data?.map(r=><tr key={r.reservation_id} className="border-b align-top"><td className="whitespace-nowrap p-2">{format(new Date(r.start_at),"yyyy.MM.dd HH:mm")}<p className="text-xs text-muted-foreground">{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]??r.status}</p></td><td className="p-2"><Link className="underline" to="/reservations/new" search={{id:r.reservation_id}}>{r.customer_name}</Link></td><td className="p-2">{r.staff_name}</td><td className="p-2">{r.route_name}</td><td className="max-w-48 whitespace-pre-wrap p-2">{r.service_content||"—"}</td><td className="max-w-48 whitespace-pre-wrap p-2">{r.care_content||"—"}</td><td className="min-w-48 p-2">{r.paid_on?<details><summary className="cursor-pointer">수납(원화) {won(collectedKrw(r.payment_rows as unknown as Record<string,unknown>[]))}원 · 펼치기</summary><p className="text-xs">결제일 {r.paid_on}</p>{(r.payment_rows as unknown as PaymentLine[]).map(line=><p key={line.kind}>{PAYMENT_KINDS.find(([k])=>k===line.kind)?.[1]} · {MONEY_COLUMNS.filter(([k])=>Number(line[k]??0)>0).map(([k,label])=>`${label} ${won(line[k])}`).join(" / ")||"금액 없음"}</p>)}{r.payment_memo&&<p className="whitespace-pre-wrap text-xs">{r.payment_memo}</p>}</details>:"미등록"}</td></tr>)}</tbody></table></div>{rows.data?.length===0&&<p>해당 기간·조건에 내역이 없습니다.</p>}<div className="flex gap-2"><Button type="button" variant="outline" disabled={page===0||rows.isFetching} onClick={()=>setPage(page-1)}>이전</Button><Button type="button" variant="outline" disabled={rows.data?.length!==30||rows.isFetching} onClick={()=>setPage(page+1)}>다음</Button></div></>}
 </section>;
}

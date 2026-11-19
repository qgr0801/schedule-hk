import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format,startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { meQuery,profilesQuery,STATUS_LABEL } from "@/lib/app";
import { bookingRoutesQuery } from "@/lib/booking-routes";
import { MONEY_COLUMNS,PAYMENT_KINDS,type PaymentLine } from "@/lib/payments";
import { BookingRouteManager } from "@/components/BookingRoutes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function BookingActivityReport(){
 const {data:me}=useQuery(meQuery); const admin=me?.role==="admin";
 const [mode,setMode]=useState("route"),[from,setFrom]=useState(format(startOfMonth(new Date()),"yyyy-MM-dd")),[to,setTo]=useState(format(new Date(),"yyyy-MM-dd"));
 const [route,setRoute]=useState(""),[staff,setStaff]=useState(""),[customer,setCustomer]=useState(""),[page,setPage]=useState(0);
 const {data:routes,error:routeError}=useQuery(bookingRoutesQuery),{data:profiles,error:staffError}=useQuery(profilesQuery);
 const valid=!!from&&!!to&&from<=to;
 const rows=useQuery({queryKey:["booking-activity",mode,from,to,route,staff,customer,page],enabled:valid&&admin,queryFn:async()=>{
  const {data,error}=await supabase.rpc("booking_activity_report",{_from:from,_to:to,_offset:page*30,...(mode==="route"&&route?{_route:route}:{}),...(mode==="staff"&&staff?{_staff:staff}:{}),...(mode==="customer"&&customer?{_customer:customer}:{} )});if(error)throw error;return data;
 }});
 const summary=useQuery({queryKey:["route-settlement-summary",mode,from,to,route,staff,customer],enabled:valid&&admin,queryFn:async()=>{
  const {data,error}=await supabase.rpc("route_settlement_summary",{_from:from,_to:to,...(mode==="route"&&route?{_route:route}:{}),...(mode==="staff"&&staff?{_staff:staff}:{}),...(mode==="customer"&&customer?{_customer:customer}:{} )});if(error)throw error;return data;
 }});
 if(!admin)return <p>ADMIN은 최고관리자만 열람할 수 있습니다.</p>;
 return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">ADMIN · 고객·담당자·경로별 내역</h2><BookingRouteManager/></div>
 <div className="flex gap-2">{([["customer","고객"],["staff","담당자"],["route","경로"]] as const).map(([v,label])=><Button key={v} type="button" variant={mode===v?"default":"outline"} aria-pressed={mode===v} onClick={()=>{setMode(v);setPage(0);}}>{label}</Button>)}</div>
 <div className="flex flex-wrap items-end gap-3"><label className="text-sm">조회 시작일<Input type="date" aria-label="내역 조회 시작일" value={from} onChange={e=>{setFrom(e.target.value);setPage(0);}}/></label><label className="text-sm">조회 종료일<Input type="date" aria-label="내역 조회 종료일" value={to} onChange={e=>{setTo(e.target.value);setPage(0);}}/></label>
 {mode==="route"&&<label className="text-sm">경로<select className="block h-10 max-w-64 rounded border bg-background px-2" aria-label="조회 경로" value={route} onChange={e=>{setRoute(e.target.value);setPage(0);}}><option value="">전체 경로</option>{routes?.map(r=><option key={r.id} value={r.id}>{r.name}{!r.is_active&&" (중지)"}</option>)}</select></label>}
 {mode==="staff"&&<label className="text-sm">담당자<select className="block h-10 rounded border bg-background px-2" aria-label="조회 담당자" value={staff} onChange={e=>{setStaff(e.target.value);setPage(0);}}><option value="">전체 담당자</option>{profiles?.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>}
 {mode==="customer"&&<label className="text-sm">고객명<Input aria-label="조회 고객명" value={customer} maxLength={50} placeholder="고객명 검색" onChange={e=>{setCustomer(e.target.value);setPage(0);}}/></label>}</div>
 <p className="text-xs text-muted-foreground">예약 날짜(한국 시간) 기준으로 조회합니다. 결제일은 결제 내역에 함께 표시됩니다.</p>
 {!valid&&<p role="alert">조회 기간을 확인해 주세요.</p>}{(rows.error||routeError||staffError)&&<p role="alert">내역 또는 조회 항목을 불러오지 못했습니다.</p>}{valid&&rows.isPending&&<p>내역을 불러오는 중입니다.</p>}
 <div className="space-y-2 rounded-lg border p-3"><h3 className="font-semibold">경로별 시술·관리 정산 · 조회 기간 전체 집계</h3><p className="text-xs text-muted-foreground">정산이 등록된 항목의 건수·고객 수입니다. 한 고객이 여러 경로나 시술·관리 항목에 포함될 수 있으며, 비용과 수납액·통화는 각각 표시합니다.</p>{summary.error&&<p role="alert">정산 합계를 불러오지 못했습니다.</p>}{summary.isPending&&valid&&<p>정산을 불러오는 중입니다.</p>}<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted"><tr>{["경로","구분","정산 건수","고객 수",...MONEY_COLUMNS.map(([,label])=>label)].map(t=><th key={t} className="whitespace-nowrap p-2 text-right first:text-left">{t}</th>)}</tr></thead><tbody>{summary.data?.map(row=><tr key={`${row.route_id??"none"}-${row.kind}`} className="border-b"><th className="p-2 text-left">{row.route_name}</th><td className="p-2">{row.kind==="service"?"시술":"관리"}</td><td className="p-2 text-right">{row.settlement_count}</td><td className="p-2 text-right">{row.customer_count}</td>{MONEY_COLUMNS.map(([k])=><td key={k} className="p-2 text-right">{Number(row[k]).toLocaleString("ko-KR")}</td>)}</tr>)}</tbody></table></div>{summary.data?.length===0&&<p className="text-sm">해당 기간에 시술·관리 정산이 없습니다.</p>}</div>
 <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="bg-muted"><tr>{["날짜","고객명","담당자","경로","시술내용","관리내용","결제내용"].map(s=><th key={s} className="p-2 text-left">{s}</th>)}</tr></thead><tbody>{rows.data?.map(r=><tr key={r.reservation_id} className="border-b align-top"><td className="whitespace-nowrap p-2">{format(new Date(r.start_at),"yyyy.MM.dd HH:mm")}<p className="text-xs text-muted-foreground">{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]??r.status}</p></td><td className="p-2"><Link className="underline" to="/reservations/new" search={{id:r.reservation_id}}>{r.customer_name}</Link></td><td className="p-2">{r.staff_name}</td><td className="p-2">{r.route_name}</td><td className="max-w-48 whitespace-pre-wrap p-2">{r.service_content||"—"}</td><td className="max-w-48 whitespace-pre-wrap p-2">{r.care_content||"—"}</td><td className="min-w-60 p-2">{r.paid_on?<><p className="text-xs">결제일 {r.paid_on}</p>{(r.payment_rows as unknown as PaymentLine[]).map(line=><p key={line.kind}>{PAYMENT_KINDS.find(([k])=>k===line.kind)?.[1]} · {MONEY_COLUMNS.filter(([k])=>Number(line[k]??0)>0).map(([k,label])=>`${label} ${Number(line[k]).toLocaleString("ko-KR")}`).join(" / ")||"금액 없음"}</p>)}{r.payment_memo&&<p className="whitespace-pre-wrap text-xs">{r.payment_memo}</p>}</>:"미등록"}</td></tr>)}</tbody></table></div>
 {rows.data?.length===0&&<p>해당 기간에 내역이 없습니다.</p>}<div className="flex gap-2"><Button type="button" variant="outline" disabled={page===0||rows.isFetching} onClick={()=>setPage(page-1)}>이전</Button><Button type="button" variant="outline" disabled={rows.data?.length!==30||rows.isFetching} onClick={()=>setPage(page+1)}>다음</Button></div></section>;
}

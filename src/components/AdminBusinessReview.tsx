import { workMetricLabelsQuery } from "@/components/WorkLog";
import { WORK_EXTRA_KEYS, WORK_PRIMARY_ITEMS, WORK_CHECK_ITEMS, workMetricLabel } from "@/lib/work-log";
import { BookingActivityReport } from "@/components/BookingActivityReport";
import { Fragment,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { format,startOfMonth } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery,dbErrorMessage } from "@/lib/app";
import { categoriesQuery } from "@/lib/display";
import { employeesQuery } from "@/lib/employees";
import { bookingRoutesQuery } from "@/lib/booking-routes";
import { type ReviewPeriod,type AdminOverview,type SettlementReview,won,minutesText } from "@/lib/admin-review";
import { BookingRouteManager } from "@/components/BookingRoutes";
import { MoneyInput } from "@/components/MoneyInput";
import { Tabs,TabsList,TabsTrigger,TabsContent } from "@/components/ui/tabs";
import { Dialog,DialogContent,DialogTitle,DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
const salesViews = [["all", "전체"], ["route", "경로별"], ["category", "고객구분별"], ["service", "시술별"], ["care", "관리별"]] as const;
type SalesView = typeof salesViews[number][0];
type SettlementGrouping = "route" | "service" | "care";

export function AdminBusinessReview(){
 const [tab, setTab] = useState("sales");
 const [salesView, setSalesView] = useState<SalesView>("all");
 const {data:me}=useQuery(meQuery);const admin=me?.role==="admin";
 const [from,setFrom]=useState(format(startOfMonth(new Date()),"yyyy-MM-dd")),[to,setTo]=useState(format(new Date(),"yyyy-MM-dd"));
 const [period,setPeriod]=useState<ReviewPeriod|null>(null),[timeStaff,setTimeStaff]=useState(""),[workStaff,setWorkStaff]=useState("");
 const [route,setRoute]=useState("");
 const {data:routes,error:routesError}=useQuery({...bookingRoutesQuery,enabled:admin&&tab==="settlements"&&salesView==="route"});
 const [category,setCategory]=useState("");
 const {data:categories,error:categoriesError}=useQuery({...categoriesQuery,enabled:admin&&tab==="sales"});
 const {data:employees}=useQuery({...employeesQuery,enabled:admin});
 const overview=useQuery({queryKey:["admin-business-overview",period],enabled:admin&&!!period,queryFn:async()=>{const {data,error}=await supabase.rpc("admin_business_overview",{_from:period!.from,_to:period!.to});if(error)throw error;return data as unknown as AdminOverview;}});
 const {data:metricLabels}=useQuery({...workMetricLabelsQuery,enabled:admin&&!!period});
 if(!admin)return <p>ADMIN은 최고관리자만 열람할 수 있습니다.</p>;
 const valid=!!from&&!!to&&from<=to;
 const sales=overview.data?.sales ?? [];
 const visibleSales=sales.filter(row=>!category||row.category===category);
 const categoryNames=Array.from(new Set([...(categories??[]).map(item=>item.name),...sales.map(row=>row.category)].filter(name=>name!=="미지정")));
 const times=(overview.data?.times??[]).filter(r=>!timeStaff||r.employee_id===timeStaff),work=(overview.data?.work??[]).filter(r=>!workStaff||r.employee_id===workStaff);
 const extraKeys=WORK_EXTRA_KEYS.filter(key=>workMetricLabel(metricLabels,key,""));
 const keys=["shot","video","feed","sponsored","youtube","dm","dmr","dm_confirmed","dm_visited",...extraKeys] as const;
 const labels=[...WORK_PRIMARY_ITEMS,...WORK_CHECK_ITEMS,...extraKeys.map(key=>[key,""] as const)].map(([key,label])=>workMetricLabel(metricLabels,key,label));
 const selector=(value:string,set:(value:string)=>void,label:string)=><label className="text-sm">직원선택<select aria-label={label} className="ml-2 h-10 rounded border bg-background px-2" value={value} onChange={e=>set(e.target.value)}><option value="">전체 직원</option>{employees?.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>;
 return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">ADMIN · 운영 검토</h2><div className="flex flex-wrap items-center gap-2">
   <div role="group" aria-label="매출 조회 구분" className="flex flex-wrap gap-1">
    {salesViews.map(([view, label]) => {
     const active=view==="category" ? tab==="sales" : tab==="settlements"&&salesView===view;
     return (
     <Button key={view} type="button" size="sm"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={() => { if(view==="category"){setTab("sales");return;} setSalesView(view);setTab("settlements"); }}>
      {label}
     </Button>
     );
    })}
    <Button type="button" size="sm" variant={tab==="time-log"?"default":"outline"} aria-pressed={tab==="time-log"} onClick={()=>setTab("time-log")}>직원선택</Button>
   </div>
   <BookingRouteManager/>
  </div></div>
 <form onSubmit={e=>{e.preventDefault();if(valid)setPeriod({from,to});}} className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3"><label className="text-sm">조회 시작일<Input aria-label="ADMIN 조회 시작일" type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">조회 종료일<Input aria-label="ADMIN 조회 종료일" type="date" required min={from} value={to} onChange={e=>setTo(e.target.value)}/></label><Button disabled={!valid}>기간 조회</Button></form>
 {tab==="settlements"&&salesView==="route"&&<label className="block max-w-sm text-sm">경로<select aria-label="정산 경로" className="mt-1 h-10 w-full rounded border bg-background px-2" value={route} onChange={e=>setRoute(e.target.value)}><option value="">경로 선택</option><option value="unassigned">미지정</option>{routes?.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>{routesError&&<span role="alert">경로를 불러오지 못했습니다.</span>}</label>}
 {tab==="sales"&&<label className="block max-w-sm text-sm">고객구분<select aria-label="판매매출 고객구분" className="mt-1 h-10 w-full rounded border bg-background px-2" value={category} onChange={e=>setCategory(e.target.value)}><option value="">전체 고객구분</option><option value="미지정">선택 안 함</option>{categoryNames.map(name=><option key={name} value={name}>{name}</option>)}</select>{categoriesError&&<span role="alert">고객구분을 불러오지 못했습니다.</span>}</label>}
 {tab==="time-log"&&<label className="block max-w-sm text-sm">직원명<select aria-label="ADMIN TIME LOG 직원" className="mt-1 h-10 w-full rounded border bg-background px-2" value={timeStaff} onChange={e=>setTimeStaff(e.target.value)}><option value="">전체 직원</option>{employees?.map(employee=><option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
 {period&&<p className="text-sm font-medium">조회 기간: {period.from} ~ {period.to}</p>}
 {period&&<>{overview.error&&<p role="alert">운영 집계를 불러오지 못했습니다.</p>}{overview.isPending&&<p>운영 집계를 불러오는 중입니다.</p>}</>}
 <Tabs value={tab} onValueChange={setTab}><TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-4"><TabsTrigger value="sales">판매매출</TabsTrigger><TabsTrigger value="time-log">TIME LOG</TabsTrigger><TabsTrigger value="work-log">WORK LOG</TabsTrigger><TabsTrigger value="settlements">매출</TabsTrigger></TabsList>
 {!period&&<p className="rounded border p-6 text-sm text-muted-foreground">기간을 설정한 뒤 ‘기간 조회’를 눌러 주세요.</p>}
 <TabsContent value="sales" className="space-y-5">{period&&<>
 <section className="space-y-2 rounded border p-3"><h3 className="font-semibold">판매 · 고객구분</h3><div className="rounded bg-muted p-3 font-semibold">전체 매출(원화)  {overview.data?`${won(overview.data.sales.reduce((s,r)=>s+Number(r.collected),0))}원`:"—"}</div><p className="text-xs text-muted-foreground">결제일 기준 카드+계좌+원화 현금 합계입니다. 비용은 중복 합산하지 않으며, 외화는 통화별로 표시합니다. 고객구분은 현재 설정 기준입니다.</p><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="bg-muted"><tr>{["고객구분","고객 수","수납(원)","엔","달러","위엔"].map(t=><th key={t} className="p-2 text-right first:text-left">{t}</th>)}</tr></thead><tbody>{visibleSales.map(r=><tr key={r.category} className="border-b"><th className="p-2 text-left">{r.category}</th>{[r.customers,r.collected,r.jpy,r.usd,r.cny].map((n,i)=><td key={i} className="p-2 text-right">{won(n)}</td>)}</tr>)}</tbody></table></div>{overview.data&&visibleSales.length===0&&<p className="text-sm text-muted-foreground">조회 기간에 해당 고객구분의 판매 내역이 없습니다.</p>}</section>
 </>}</TabsContent>
 <TabsContent value="time-log">{period&&<>
 <section className="space-y-2 rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">TIME LOG</h3></div><p className="rounded bg-muted p-3 font-semibold">전체시간 합산 · {overview.data?minutesText(times.reduce((s,r)=>s+Number(r.minutes),0)):"—"}</p>{overview.data&&times.length===0&&<p className="text-sm text-muted-foreground">조회 기간에 근무 기록이 없습니다.</p>}{times.map(r=><p key={r.employee_id} className="flex justify-between text-sm"><span>{r.name}</span><span>{minutesText(Number(r.minutes))}</span></p>)}</section>
 </>}</TabsContent>
 <TabsContent value="work-log">{period&&<>
 <section className="space-y-2 rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">WORK LOG</h3>{selector(workStaff,setWorkStaff,"ADMIN WORK LOG 직원")}</div><p className="text-xs text-muted-foreground">일별 기록은 조회 기간으로 집계합니다. 기존 월간 기록은 조회 기간과 겹치는 월의 전체 건수를 포함합니다.</p><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-muted"><tr><th className="p-2 text-left">직원</th>{labels.map((t,i)=><th key={i} className="p-2 text-right">{t}</th>)}</tr></thead><tbody>{overview.data&&work.length===0&&<tr><td colSpan={keys.length+1} className="p-2">조회 기간에 업무 기록이 없습니다.</td></tr>}{work.map(r=><tr key={r.employee_id} className="border-b"><th className="p-2 text-left">{r.name}</th>{keys.map(k=><td key={k} className="p-2 text-right">{won(r[k])}</td>)}</tr>)}<tr className="bg-muted font-semibold"><th className="p-2 text-left">합계(건)</th>{keys.map(k=><td key={k} className="p-2 text-right">{won(work.reduce((s,r)=>s+Number(r[k]??0),0))}</td>)}</tr></tbody></table></div></section></>}</TabsContent>
 <TabsContent value="settlements">{period&&(salesView==="route"&&!route?<p className="rounded border p-6 text-sm text-muted-foreground">조회할 경로를 선택해 주세요.</p>:<RouteCollections key={`${period.from}-${period.to}-${salesView}`} period={period} grouping={salesView==="service"||salesView==="care"?salesView:"route"} route={salesView==="route"?route:""}/>)}</TabsContent></Tabs></section>;
}
function RouteCollections({period,grouping,route}:{period:ReviewPeriod;grouping:SettlementGrouping;route:string}){
 const [kind,setKind]=useState<string>(grouping === "route" ? "" : grouping);const [editing,setEditing]=useState<SettlementReview|null|undefined>(undefined);
 const report=useQuery({queryKey:["admin-route-collections",period,route,kind],queryFn:async()=>{const {data,error}=await supabase.rpc("admin_route_collection_report",{_from:period.from,_to:period.to,...(route&&route!=="unassigned"?{_route:route}:{}),...(kind?{_kind:kind}:{})});if(error)throw error;return data as unknown as SettlementReview[];}});
 const rows=(report.data ?? []).filter(row=>route!=="unassigned"||row.route_id===null);
 const totals=(items:SettlementReview[],key:"collected"|"amount"|"completed"|"jpy"|"usd"|"cny")=>won(items.reduce((sum,row)=>sum+Number(row[key]),0));
 const orderedRows=[...rows].sort((a,b)=>grouping==="route"?a.route_name.localeCompare(b.route_name,"ko"):Number(b.kind===grouping)-Number(a.kind===grouping)||a.route_name.localeCompare(b.route_name,"ko"));
 return <section className="space-y-3"><h3 className="text-lg font-semibold">매출·정산</h3>
 <Tabs defaultValue={grouping==="route"?"totals":"entries"}>
  <TabsList aria-label="매출 보기">
   <TabsTrigger value="totals">합계</TabsTrigger>
   <TabsTrigger value="entries">상세 내용</TabsTrigger>
  </TabsList>
  <TabsContent value="entries"><BookingActivityReport key={route} period={period} selection={grouping==="route"?{route}:{kind:grouping,route}} /></TabsContent>
  <TabsContent value="totals" className="space-y-3"><div className="flex flex-wrap items-end gap-2"><label className="text-sm">내용<select aria-label="매출 내용" className="h-10 rounded border bg-background px-2" value={kind} onChange={e=>setKind(e.target.value)}><option value="">시술·관리 전체</option><option value="service">시술</option><option value="care">관리</option></select></label><Button type="button" variant="outline" onClick={()=>setEditing(null)}>정산 기록 추가</Button></div><p className="text-xs text-muted-foreground">수납은 결제일 기준 자동 집계입니다. 정산·정산완료(원)·메모는 직접 저장하며, 선택한 시작일·종료일이 같은 기간의 기록을 표시합니다.</p>
 {report.error&&<p role="alert">경로별 내역을 불러오지 못했습니다.</p>}{report.isPending&&<p>정산을 불러오는 중입니다.</p>}<div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted"><tr>{["경로","구분","수납(원)","정산(원)","정산완료(원)","메모","작성"].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead><tbody>{orderedRows.map((r,index)=><Fragment key={`${r.route_id??"none"}-${r.kind}`}>{grouping!=="route"&&orderedRows[index-1]?.kind!==r.kind&&<tr className="bg-muted/60"><th colSpan={2} className="p-2 text-left">{r.kind==="service"?"시술":"관리"} 소계</th>{(["collected","amount","completed"] as const).map(k=><td key={k} className="p-2 text-right">{totals(rows.filter(item=>item.kind===r.kind),k)}</td>)}<td colSpan={2}/></tr>}<tr key={`${r.route_id??"none"}-${r.kind}`} className="border-b align-top"><td className="p-2">{r.route_name}</td><td className="p-2">{r.kind==="service"?"시술":"관리"}</td><td className="p-2 text-right">{won(r.collected)}{(Number(r.jpy)>0||Number(r.usd)>0||Number(r.cny)>0)&&<p className="text-xs text-muted-foreground">엔 {won(r.jpy)} / 달러 {won(r.usd)} / 위엔 {won(r.cny)}</p>}</td><td className="p-2 text-right">{won(r.amount)}</td><td className="p-2 text-right">{won(r.completed)}</td><td className="max-w-64 whitespace-pre-wrap p-2">{r.memo||"—"}</td><td className="p-2"><Button type="button" variant="outline" size="sm" onClick={()=>setEditing(r)}>수정</Button></td></tr></Fragment>)}<tr className="bg-muted font-semibold"><th className="p-2" colSpan={2}>합계</th>{(["collected","amount","completed"] as const).map(k=><td key={k} className="p-2 text-right">{totals(rows,k)}{k==="collected"&&rows.some(r=>Number(r.jpy)||Number(r.usd)||Number(r.cny))&&<p className="text-xs">엔 {totals(rows,"jpy")} / 달러 {totals(rows,"usd")} / 위엔 {totals(rows,"cny")}</p>}</td>)}<td colSpan={2}/></tr></tbody></table></div>{report.data?.length===0&&<p>해당 기간에 내역이 없습니다.</p>}{editing!==undefined&&<SettlementEditor period={period} row={editing} onClose={()=>setEditing(undefined)}/>}</TabsContent></Tabs></section>;
}
function SettlementEditor({period,row,onClose}:{period:ReviewPeriod;row:SettlementReview|null;onClose:()=>void}){
 const {data:routes}=useQuery(bookingRoutesQuery);const qc=useQueryClient();const [id]=useState(()=>row?.record_id??crypto.randomUUID()),[event]=useState(()=>crypto.randomUUID());
 const [route,setRoute]=useState(row?.route_id??""),[kind,setKind]=useState(row?.kind??"service"),[amount,setAmount]=useState(Number(row?.amount??0)),[completed,setCompleted]=useState(Number(row?.completed??0)),[memo,setMemo]=useState(row?.memo??""),[busy,setBusy]=useState(false);
 async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);try{const {error}=await supabase.rpc("save_admin_settlement",{_id:id,_event:event,_from:period.from,_to:period.to,_route:route||null,_kind:kind,_amount:amount,_completed:completed,_memo:memo,_version:row?.version??0});if(error)throw error;await qc.invalidateQueries({queryKey:["admin-route-collections"]});toast.success("정산을 저장했습니다.");onClose();}catch(e){toast.error(dbErrorMessage(e));}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>!open&&!busy&&onClose()}><DialogContent><DialogHeader><DialogTitle>기간별 정산 작성</DialogTitle></DialogHeader><p className="text-sm">{period.from} ~ {period.to}</p><form onSubmit={save} className="space-y-3"><select aria-label="정산 작성 경로" className="h-10 w-full rounded border bg-background px-2" disabled={!!row||busy} value={route} onChange={e=>setRoute(e.target.value)}><option value="">미지정</option>{routes?.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><select aria-label="정산 작성 구분" className="h-10 w-full rounded border bg-background px-2" disabled={!!row||busy} value={kind} onChange={e=>setKind(e.target.value)}><option value="service">시술</option><option value="care">관리</option></select><label className="block text-sm">정산(원)<MoneyInput aria-label="정산 금액" value={amount} onValueChange={setAmount} disabled={busy}/></label><label className="block text-sm">정산완료(원)<MoneyInput aria-label="정산완료 금액" value={completed} onValueChange={setCompleted} disabled={busy}/></label><label className="block text-sm">메모<Textarea aria-label="정산 메모" maxLength={1000} value={memo} disabled={busy} onChange={e=>setMemo(e.target.value)}/></label><Button disabled={busy}>정산 저장</Button></form></DialogContent></Dialog>;
}

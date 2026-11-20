import { workMetricLabelsQuery } from "@/components/WorkLog";
import { WORK_EXTRA_KEYS, WORK_PRIMARY_ITEMS, WORK_CHECK_ITEMS, workMetricLabel } from "@/lib/work-log";
import { Fragment,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format,startOfMonth } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery,dbErrorMessage } from "@/lib/app";
import { categoriesQuery } from "@/lib/display";
import { employeesQuery } from "@/lib/employees";
import { bookingRoutesQuery } from "@/lib/booking-routes";
import { type ReviewPeriod,type AdminOverview,type SettlementReview,collectedKrw,won,minutesText } from "@/lib/admin-review";
import { MONEY_COLUMNS,PAYMENT_KINDS,type PaymentLine } from "@/lib/payments";
import { BookingRouteManager } from "@/components/BookingRoutes";
import { MoneyInput } from "@/components/MoneyInput";
import { Tabs,TabsList,TabsTrigger,TabsContent } from "@/components/ui/tabs";
import { Dialog,DialogContent,DialogTitle,DialogHeader } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
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
 const routesLookup=useQuery({...bookingRoutesQuery,enabled:admin});
 const routes=routesLookup.data;
 const routeOptions=[{value:"",label:"전체 경로"},{value:"unassigned",label:"미지정"},...(routes??[]).map(item=>({value:item.id,label:item.name}))];
 const [category,setCategory]=useState("");
 const categoriesLookup=useQuery({...categoriesQuery,enabled:admin});
 const categories=categoriesLookup.data;
 const employeesLookup=useQuery({...employeesQuery,enabled:admin});
 const employees=employeesLookup.data;
 const overview=useQuery({queryKey:["admin-business-overview",period],enabled:admin&&!!period,queryFn:async()=>{const {data,error}=await supabase.rpc("admin_business_overview",{_from:period!.from,_to:period!.to});if(error)throw error;return data as unknown as AdminOverview;}});
 const filteredSales=useQuery({queryKey:["admin-sales-by-route-category",period,route],enabled:admin&&tab==="sales"&&!!(route&&period),queryFn:async()=>{
  const {data,error}=await supabase.rpc("admin_sales_by_route_category",{_from:period!.from,_to:period!.to,...routeArgs(route)});
  if(error)throw error;
  return data as unknown as AdminOverview["sales"];
 }});
 const {data:metricLabels}=useQuery({...workMetricLabelsQuery,enabled:admin&&!!period});
 if(!admin)return <p>ADMIN은 최고관리자만 열람할 수 있습니다.</p>;
 const valid=!!from&&!!to&&from<=to;
 const ensurePeriod=()=>{if(!period&&valid)setPeriod({from,to});};
 const salesResult=route?filteredSales:overview;
 const sales=(route?filteredSales.data:overview.data?.sales)??[];
 const visibleSales=sales.filter(row=>!category||row.category===category);
 const categoryNames=Array.from(new Set([...(categories??[]).map(item=>item.name),...(overview.data?.sales??[]).map(row=>row.category)].filter(name=>name!=="미지정")));
 const times=(overview.data?.times??[]).filter(r=>!timeStaff||r.employee_id===timeStaff),work=(overview.data?.work??[]).filter(r=>!workStaff||r.employee_id===workStaff);
 const extraKeys=WORK_EXTRA_KEYS.filter(key=>workMetricLabel(metricLabels,key,""));
 const keys=["shot","video","feed","sponsored","youtube","dm","dmr","dm_confirmed","dm_visited",...extraKeys] as const;
 const labels=[...WORK_PRIMARY_ITEMS,...WORK_CHECK_ITEMS,...extraKeys.map(key=>[key,""] as const)].map(([key,label])=>workMetricLabel(metricLabels,key,label));
 const selector=(value:string,set:(value:string)=>void,label:string)=><label className="text-sm">직원선택<select aria-label={label} className="ml-2 h-10 rounded border bg-background px-2" value={value} onChange={e=>set(e.target.value)}><option value="">전체 직원</option>{employees?.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>;
 return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">ADMIN · 운영 검토</h2><div className="flex flex-wrap items-center gap-2">
   <div role="group" aria-label="매출 조회 구분" className="flex flex-wrap gap-1">
    {salesViews.map(([view,label])=>{
     const inSales=tab==="sales"||tab==="settlements";
     const active=view==="category"?tab==="sales"||(inSales&&!!category):
      view==="route"?inSales&&(!!route||(tab==="settlements"&&salesView==="route")):
      tab==="settlements"&&salesView===view&&!(view==="all"&&(route||category));
     const activate=()=>{
      ensurePeriod();
      const preserveKind=tab==="settlements"&&(salesView==="service"||salesView==="care");
      if(view==="category"){if(!preserveKind)setTab("sales");return;}
      if(view==="all"){setRoute("");setCategory("");}
      if(view!=="route"||!preserveKind)setSalesView(view);
      setTab("settlements");
     };
     if(view==="route")return <AdminFilterMenu key={view} label={label} active={active} onOpen={activate} value={route} onChange={setRoute} pending={routesLookup.isPending} failed={!!routesLookup.error} options={routeOptions}/>;
     if(view==="category")return <AdminFilterMenu key={view} label={label} active={active} onOpen={activate} value={category} onChange={setCategory} pending={categoriesLookup.isPending} failed={!!categoriesLookup.error} options={[{value:"",label:"전체 고객구분"},{value:"미지정",label:"선택 안 함"},...categoryNames.map(name=>({value:name,label:name}))]}/>;
     return <Button key={view} type="button" size="sm" variant={active?"default":"outline"} aria-pressed={active} onClick={activate}>{label}</Button>;
    })}
    <AdminFilterMenu label="직원선택" active={tab==="time-log"} onOpen={()=>{ensurePeriod();setTab("time-log");}} value={timeStaff} onChange={setTimeStaff} pending={employeesLookup.isPending} failed={!!employeesLookup.error} options={[{value:"",label:"전체 직원"},...(employees??[]).map(employee=>({value:employee.id,label:employee.name}))]}/>

   </div>
   <BookingRouteManager/>
  </div></div>
 <Tabs className="space-y-4" value={tab} onValueChange={value=>{if(value==="settlements")ensurePeriod();setTab(value);}}><TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-4"><TabsTrigger value="sales">판매</TabsTrigger><TabsTrigger value="time-log">TIME LOG</TabsTrigger><TabsTrigger value="work-log">WORK LOG</TabsTrigger><TabsTrigger value="settlements">매출</TabsTrigger></TabsList>
 <form onSubmit={e=>{e.preventDefault();if(valid)setPeriod({from,to});}} className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3"><label className="text-sm">조회 시작일<Input aria-label="ADMIN 조회 시작일" type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">조회 종료일<Input aria-label="ADMIN 조회 종료일" type="date" required min={from} value={to} onChange={e=>setTo(e.target.value)}/></label><Button disabled={!valid}>기간 조회</Button></form>
 {(tab==="settlements"||tab==="sales")&&route&&<p className="text-sm">경로 {route==="unassigned"?"미지정":routes?.find(item=>item.id===route)?.name}</p>}
 {(tab==="settlements"||tab==="sales")&&category&&<p className="text-sm">고객구분 {category==="미지정"?"선택 안 함":category}</p>}
 {tab==="time-log"&&timeStaff&&<p className="text-sm">직원명 {employees?.find(employee=>employee.id===timeStaff)?.name}</p>}
 {period&&<p className="text-sm font-medium">조회 기간: {period.from} ~ {period.to}</p>}
 {period&&<>{overview.error&&<p role="alert">운영 집계를 불러오지 못했습니다.</p>}{overview.isPending&&<p>운영 집계를 불러오는 중입니다.</p>}</>}
 {!period&&<p className="rounded border p-6 text-sm text-muted-foreground">기간을 설정한 뒤 ‘기간 조회’를 눌러 주세요.</p>}
 <TabsContent value="sales" className="space-y-5">{period&&<Tabs key={JSON.stringify([route,category])} defaultValue="totals"><ReviewDetailTabs label="고객구분별 매출 보기"/><TabsContent value="entries"><SalesEntries key={period.from+period.to} period={period} scope="category" route={route} category={category}/></TabsContent><TabsContent value="totals">
 <section className="space-y-2 rounded border p-3"><h3 className="font-semibold">판매 · 고객구분</h3><div className="rounded bg-muted p-3 font-semibold">{category?"선택 구분 매출(원화)":"전체 매출(원화)"}  {salesResult.data?`${won(visibleSales.reduce((s,r)=>s+Number(r.collected),0))}원`:"—"}</div><p className="text-xs text-muted-foreground">결제일 기준 카드+계좌+원화 현금 합계입니다. 비용은 중복 합산하지 않으며, 외화는 통화별로 표시합니다. 고객구분은 현재 설정 기준입니다.</p><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="bg-muted"><tr>{["고객구분","고객 수","수납(원)","엔","달러","위엔"].map(t=><th key={t} className="p-2 text-right first:text-left">{t}</th>)}</tr></thead><tbody>{visibleSales.map(r=><tr key={r.category} className="border-b"><th className="p-2 text-left">{r.category}</th>{[r.customers,r.collected,r.jpy,r.usd,r.cny].map((n,i)=><td key={i} className="p-2 text-right">{won(n)}</td>)}</tr>)}</tbody></table></div>{salesResult.error&&<p role="alert">판매 내역을 불러오지 못했습니다.</p>}{salesResult.isPending&&<p>판매 내역을 불러오는 중입니다.</p>}{salesResult.data&&visibleSales.length===0&&<p className="text-sm text-muted-foreground">조회 기간에 해당 고객구분의 판매 내역이 없습니다.</p>}</section>
 </TabsContent></Tabs>}</TabsContent>
 <TabsContent value="time-log">{period&&<Tabs key={timeStaff} defaultValue="totals"><ReviewDetailTabs label="근무시간 보기"/><TabsContent value="entries"><TimeEntries key={period.from+period.to} period={period} employee={timeStaff} employees={employees??[]}/></TabsContent><TabsContent value="totals">
 <section className="space-y-2 rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">TIME LOG</h3></div><p className="rounded bg-muted p-3 font-semibold">전체시간 합산 · {overview.data?minutesText(times.reduce((s,r)=>s+Number(r.minutes),0)):"—"}</p>{overview.data&&times.length===0&&<p className="text-sm text-muted-foreground">조회 기간에 근무 기록이 없습니다.</p>}{times.map(r=><p key={r.employee_id} className="flex justify-between text-sm"><span>{r.name}</span><span>{minutesText(Number(r.minutes))}</span></p>)}</section>
 </TabsContent></Tabs>}</TabsContent>
 <TabsContent value="work-log">{period&&<>
 <section className="space-y-2 rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">WORK LOG</h3>{selector(workStaff,setWorkStaff,"ADMIN WORK LOG 직원")}</div><p className="text-xs text-muted-foreground">일별 기록은 조회 기간으로 집계합니다. 기존 월간 기록은 조회 기간과 겹치는 월의 전체 건수를 포함합니다.</p><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-muted"><tr><th className="p-2 text-left">직원</th>{labels.map((t,i)=><th key={i} className="p-2 text-right">{t}</th>)}</tr></thead><tbody>{overview.data&&work.length===0&&<tr><td colSpan={keys.length+1} className="p-2">조회 기간에 업무 기록이 없습니다.</td></tr>}{work.map(r=><tr key={r.employee_id} className="border-b"><th className="p-2 text-left">{r.name}</th>{keys.map(k=><td key={k} className="p-2 text-right">{won(r[k])}</td>)}</tr>)}<tr className="bg-muted font-semibold"><th className="p-2 text-left">합계(건)</th>{keys.map(k=><td key={k} className="p-2 text-right">{won(work.reduce((s,r)=>s+Number(r[k]??0),0))}</td>)}</tr></tbody></table></div></section></>}</TabsContent>
 <TabsContent value="settlements">{period&&<RouteCollections key={`${period.from}-${period.to}-${salesView}`} period={period} grouping={salesView==="service"||salesView==="care"?salesView:"route"} route={route} onRouteChange={setRoute} routeOptions={routeOptions} category={category}/>}</TabsContent></Tabs></section>;
}
function AdminFilterMenu({label,active,onOpen,value,onChange,pending,failed,options}:{
 label:string;active:boolean;onOpen:()=>void;value:string;onChange:(value:string)=>void;
 pending:boolean;failed:boolean;options:{value:string;label:string}[];
}){
 return <DropdownMenu onOpenChange={open=>{if(open)onOpen();}}>
  <DropdownMenuTrigger asChild>
   <Button type="button" size="sm" variant={active?"default":"outline"}>{label}<ChevronDown aria-hidden className="ml-1 size-4"/></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="max-h-[min(65vh,var(--radix-dropdown-menu-content-available-height))] min-w-48 overflow-y-auto">
   {pending&&<DropdownMenuLabel>목록을 불러오는 중입니다.</DropdownMenuLabel>}
   {failed&&<DropdownMenuLabel>목록을 불러오지 못했습니다.</DropdownMenuLabel>}
   <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
    {options.map(option=><DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
   </DropdownMenuRadioGroup>
  </DropdownMenuContent>
 </DropdownMenu>;
}

function RouteCollections({period,grouping,route,onRouteChange,routeOptions,category}:{period:ReviewPeriod;grouping:SettlementGrouping;route:string;onRouteChange:(route:string)=>void;routeOptions:{value:string;label:string}[];category:string}){
 const [kind,setKind]=useState<string>(grouping === "route" ? "" : grouping);const [editing,setEditing]=useState<SettlementReview|null|undefined>(undefined);
 const report=useQuery({queryKey:["admin-route-collections",period,route,kind,category],queryFn:async()=>{const {data,error}=await supabase.rpc("admin_filtered_collections",{_from:period.from,_to:period.to,...routeArgs(route),...(kind?{_kind:kind}:{}),...(category?{_category:category}:{})});if(error)throw error;return data as unknown as SettlementReview[];}});
 const rows=report.data??[];
 const amountKeys=category?(["collected"] as const):(["collected","amount","completed"] as const);
 const totals=(items:SettlementReview[],key:"collected"|"amount"|"completed"|"jpy"|"usd"|"cny")=>won(items.reduce((sum,row)=>sum+Number(row[key]),0));
 const orderedRows=[...rows].sort((a,b)=>grouping==="route"?a.route_name.localeCompare(b.route_name,"ko"):Number(b.kind===grouping)-Number(a.kind===grouping)||a.route_name.localeCompare(b.route_name,"ko"));
 return <section className="space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="text-lg font-semibold">매출·정산</h3>
   {report.data && <p className="ml-auto text-right font-semibold">매출 합계 {totals(rows,"collected")}원
    {(["jpy","usd","cny"] as const).map(currency=>rows.some(row=>Number(row[currency])!==0)&&<span key={currency} className="ml-2 whitespace-nowrap">{totals(rows,currency)}{{jpy:"엔",usd:"달러",cny:"위안"}[currency]}</span>)}
   </p>}
  </div>
  <div className="flex flex-wrap items-end gap-2"><label className="text-sm">내용<select aria-label="매출 내용" className="h-10 rounded-md border border-primary bg-primary px-2 text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>option]:bg-background [&>option]:text-foreground" value={kind} onChange={e=>setKind(e.target.value)}>{grouping==="route"&&<option value="">시술·관리 전체</option>}{grouping!=="care"&&<option value="service">시술</option>}{grouping!=="service"&&<option value="care">관리</option>}</select></label><label className="text-sm">경로<select aria-label="매출 경로" className="h-10 rounded-md border border-primary bg-primary px-2 text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>option]:bg-background [&>option]:text-foreground" value={route} onChange={e=>onRouteChange(e.target.value)}>{routeOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
  <SalesEntries key={JSON.stringify([period,kind,route,category])} period={period} scope="settlement" route={route} category={category} kind={kind}/>
  <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">합계</summary><div className="mt-3 space-y-3"><div className="flex flex-wrap items-end gap-2">{!category&&<Button type="button" variant="outline" onClick={()=>setEditing(null)}>정산 기록 추가</Button>}</div><p className="text-xs text-muted-foreground">{category?"수납은 선택한 고객구분의 결제일 기준입니다.":"수납은 결제일 기준 자동 집계입니다. 정산·정산완료(원)·메모는 직접 저장하며, 선택한 시작일·종료일이 같은 기간의 기록을 표시합니다."}</p>
 {report.error&&<p role="alert">경로별 내역을 불러오지 못했습니다.</p>}{report.isPending&&<p>정산을 불러오는 중입니다.</p>}<div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted"><tr>{["경로","구분","수납(원)",...(category?[]:["정산(원)","정산완료(원)","메모","작성"])].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead><tbody>{orderedRows.map((r,index)=><Fragment key={`${r.route_id??"none"}-${r.kind}`}>{grouping!=="route"&&orderedRows[index-1]?.kind!==r.kind&&<tr className="bg-muted/60"><th colSpan={2} className="p-2 text-left">{r.kind==="service"?"시술":"관리"} 소계</th>{amountKeys.map(k=><td key={k} className="p-2 text-right">{totals(rows.filter(item=>item.kind===r.kind),k)}</td>)}{!category&&<td colSpan={2}/>}</tr>}<tr key={`${r.route_id??"none"}-${r.kind}`} className="border-b align-top"><td className="p-2">{r.route_name}</td><td className="p-2">{r.kind==="service"?"시술":"관리"}</td><td className="p-2 text-right">{won(r.collected)}{(Number(r.jpy)>0||Number(r.usd)>0||Number(r.cny)>0)&&<p className="text-xs text-muted-foreground">엔 {won(r.jpy)} / 달러 {won(r.usd)} / 위엔 {won(r.cny)}</p>}</td>{!category&&<><td className="p-2 text-right">{won(r.amount)}</td><td className="p-2 text-right">{won(r.completed)}</td><td className="max-w-64 whitespace-pre-wrap p-2">{r.memo||"—"}</td><td className="p-2"><Button type="button" variant="outline" size="sm" onClick={()=>setEditing(r)}>수정</Button></td></>}</tr></Fragment>)}<tr className="bg-muted font-semibold"><th className="p-2" colSpan={2}>합계</th>{amountKeys.map(k=><td key={k} className="p-2 text-right">{totals(rows,k)}{k==="collected"&&rows.some(r=>Number(r.jpy)||Number(r.usd)||Number(r.cny))&&<p className="text-xs">엔 {totals(rows,"jpy")} / 달러 {totals(rows,"usd")} / 위엔 {totals(rows,"cny")}</p>}</td>)}{!category&&<td colSpan={2}/>}</tr></tbody></table></div>{report.data?.length===0&&<p>해당 기간에 내역이 없습니다.</p>}{editing!==undefined&&<SettlementEditor period={period} row={editing} onClose={()=>setEditing(undefined)}/>}</div></details></section>;
}
function SettlementEditor({period,row,onClose}:{period:ReviewPeriod;row:SettlementReview|null;onClose:()=>void}){
 const {data:routes}=useQuery(bookingRoutesQuery);const qc=useQueryClient();const [id]=useState(()=>row?.record_id??crypto.randomUUID()),[event]=useState(()=>crypto.randomUUID());
 const [route,setRoute]=useState(row?.route_id??""),[kind,setKind]=useState(row?.kind??"service"),[amount,setAmount]=useState(Number(row?.amount??0)),[completed,setCompleted]=useState(Number(row?.completed??0)),[memo,setMemo]=useState(row?.memo??""),[busy,setBusy]=useState(false);
 async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);try{const {error}=await supabase.rpc("save_admin_settlement",{_id:id,_event:event,_from:period.from,_to:period.to,_route:route||null,_kind:kind,_amount:amount,_completed:completed,_memo:memo,_version:row?.version??0});if(error)throw error;await qc.invalidateQueries({queryKey:["admin-route-collections"]});toast.success("정산을 저장했습니다.");onClose();}catch(e){toast.error(dbErrorMessage(e));}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>!open&&!busy&&onClose()}><DialogContent><DialogHeader><DialogTitle>기간별 정산 작성</DialogTitle></DialogHeader><p className="text-sm">{period.from} ~ {period.to}</p><form onSubmit={save} className="space-y-3"><select aria-label="정산 작성 경로" className="h-10 w-full rounded border bg-background px-2" disabled={!!row||busy} value={route} onChange={e=>setRoute(e.target.value)}><option value="">미지정</option>{routes?.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><select aria-label="정산 작성 구분" className="h-10 w-full rounded border bg-background px-2" disabled={!!row||busy} value={kind} onChange={e=>setKind(e.target.value)}><option value="service">시술</option><option value="care">관리</option></select><label className="block text-sm">정산(원)<MoneyInput aria-label="정산 금액" value={amount} onValueChange={setAmount} disabled={busy}/></label><label className="block text-sm">정산완료(원)<MoneyInput aria-label="정산완료 금액" value={completed} onValueChange={setCompleted} disabled={busy}/></label><label className="block text-sm">메모<Textarea aria-label="정산 메모" maxLength={1000} value={memo} disabled={busy} onChange={e=>setMemo(e.target.value)}/></label><Button disabled={busy}>정산 저장</Button></form></DialogContent></Dialog>;
}

function ReviewDetailTabs({label}:{label:string}) {
 return <TabsList aria-label={label}><TabsTrigger value="totals">합계</TabsTrigger><TabsTrigger value="entries">상세 내용</TabsTrigger></TabsList>;
}

function routeArgs(route:string) {
 return route==="unassigned"?{_unassigned:true}:route?{_route:route}:{};
}

export function PerformanceReview() {
 const {data:me}=useQuery(meQuery);
 const [from,setFrom]=useState(()=>format(startOfMonth(new Date()),"yyyy-MM-dd"));
 const [to,setTo]=useState(()=>format(new Date(),"yyyy-MM-dd"));
 const [period,setPeriod]=useState<ReviewPeriod>({from,to});
 if(me?.role!=="admin")return null;
 const valid=!!from&&!!to&&from<=to;
 return <section className="space-y-4">
  <h2 className="text-xl font-semibold">성과</h2>
  <form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();if(valid)setPeriod({from,to});}}>
   <label className="grid gap-1 text-sm">시작일<Input type="date" required value={from} max={to} onChange={event=>setFrom(event.target.value)}/></label>
   <label className="grid gap-1 text-sm">종료일<Input type="date" required value={to} min={from} onChange={event=>setTo(event.target.value)}/></label>
   <Button type="submit" disabled={!valid}>기간 조회</Button>
  </form>
  <SalesEntries key={JSON.stringify(period)} period={period} scope="settlement" hideTotal/>
 </section>;
}

function SalesEntries({period,scope,route="",category="",kind="",hideTotal=false}:{
 period:ReviewPeriod;scope:"category"|"settlement";route?:string;category?:string;kind?:string;hideTotal?:boolean;
}) {
 const [page,setPage]=useState(0);
 const entries=useQuery({queryKey:["admin-sales-entries",period,scope,route,category,kind,page],queryFn:async()=>{
  const {data,error}=await supabase.rpc("admin_sales_entries",{
   _from:period.from,_to:period.to,_scope:scope,_offset:page*30,
   ...routeArgs(route),
   ...(category?{_category:category}:{}),
   ...(kind==="service"||kind==="care"?{_kind:kind}:{}),
  });
  if(error)throw error;
  return data;
 }});
 return <section className="space-y-3">
  <p className="text-sm text-muted-foreground">결제일 기준 매출 상세</p>
  {entries.isPending&&<p>상세 내역을 불러오는 중입니다.</p>}
  {entries.error&&<p role="alert">매출 상세 내역을 불러오지 못했습니다.</p>}
  {entries.data?.length===0&&<p>조회 기간에 매출 상세 내역이 없습니다.</p>}
  {entries.data&&entries.data.length>0&&<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
   <thead className="bg-muted"><tr>{scope==="settlement"&&!hideTotal&&<th scope="col" className="w-12 p-2 text-center">NO</th>}{[scope==="settlement"?"최근 결제일":"결제일","고객 이름",...(scope==="category"?["고객구분"]:[]),"경로","시술 내용","관리 내용",scope==="category"?"제품·메모":"메모","수납 내역"].map(label=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
   <tbody>{entries.data.map((entry,index)=>{
    const lines=entry.payment_rows as unknown as PaymentLine[];
    return <tr key={entry.entry_id} className="border-b align-top">
     {scope==="settlement"&&!hideTotal&&<td className="p-2 text-center tabular-nums">{page*30+index+1}</td>}
     <td className="whitespace-nowrap p-2">{entry.paid_on}</td>
     <td className="p-2">{entry.reservation_id?<Link className="underline" to="/reservations/new" search={{id:entry.reservation_id}}>{entry.customer_name}</Link>:entry.customer_name}</td>
     {scope==="category"&&<td className="p-2">{entry.category}</td>}<td className="p-2">{entry.route_name}</td>
     <td className="whitespace-pre-wrap p-2">{(kind!=="care"&&entry.service_content)||"—"}</td>
     <td className="whitespace-pre-wrap p-2">{(kind!=="service"&&entry.care_content)||"—"}</td>
     <td className="whitespace-pre-wrap p-2">
      {lines.filter(line=>line.kind==="product"&&line.description).map((line,i)=><p key={i}>제품 · {line.description}</p>)}
      {entry.payment_memo&&<p className="text-muted-foreground">{entry.payment_memo}</p>}
     </td>
     <td className="p-2">{!hideTotal&&<p className="font-medium">원화 {won(collectedKrw(lines as unknown as Record<string,unknown>[]))}원</p>}
      {lines.map((line,i)=><p key={i}>{PAYMENT_KINDS.find(([key])=>key===line.kind)?.[1]} · {MONEY_COLUMNS.filter(([key])=>key!=="cost"&&Number(line[key])).map(([key,label])=>`${label} ${won(line[key])}`).join(" / ")||"수납 없음"}</p>)}
     </td>
    </tr>;
   })}</tbody>
  </table></div>}
  <DetailPages page={page} setPage={setPage} count={entries.data?.length} busy={entries.isFetching}/>
 </section>;
}

function DetailPages({page,setPage,count,busy}:{page:number;setPage:(page:number)=>void;count:number|undefined;busy:boolean}) {
 return <div className="flex gap-2">
  <Button type="button" variant="outline" disabled={!page||busy} onClick={()=>setPage(page-1)}>이전</Button>
  <Button type="button" variant="outline" disabled={count!==30||busy} onClick={()=>setPage(page+1)}>다음</Button>
 </div>;
}

function TimeEntries({period,employee,employees}:{period:ReviewPeriod;employee:string;employees:{id:string;name:string}[]}) {
 const [page,setPage]=useState(0);
 const start=new Date(`${period.from}T00:00:00+09:00`).toISOString();
 const end=new Date(Date.parse(`${period.to}T00:00:00+09:00`)+86_400_000).toISOString();
 const entries=useQuery({queryKey:["admin-time-entries",period,employee,page],queryFn:async()=>{
  let query=supabase.from("freelancer_attendance").select("id,employee_id,start_at,end_at,work_type,memo").lt("start_at",end).gt("end_at",start).order("start_at",{ascending:false}).order("id");
  if(employee)query=query.eq("employee_id",employee);
  const {data,error}=await query.range(page*30,page*30+29);
  if(error)throw error;
  return data;
 }});
 const dateTime=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"short"});
 return <section className="space-y-3">
  {entries.isPending&&<p>근무 기록을 불러오는 중입니다.</p>}
  {entries.error&&<p role="alert">근무 기록을 불러오지 못했습니다.</p>}
  {entries.data?.length===0&&<p>조회 기간에 근무 기록이 없습니다.</p>}
  {entries.data&&entries.data.length>0&&<div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
   <thead className="bg-muted"><tr>{["직원명","근무형태","시작","종료","조회 기간 근무시간","메모"].map(label=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
   <tbody>{entries.data.map(entry=><tr key={entry.id} className="border-b">
    <td className="p-2">{employees.find(employee=>employee.id===entry.employee_id)?.name??"직원"}</td>
    <td className="p-2">{entry.work_type==="internal"?"내부":entry.work_type==="external"?"외부":"미지정"}</td>
    <td className="p-2">{dateTime.format(new Date(entry.start_at))}</td><td className="p-2">{dateTime.format(new Date(entry.end_at))}</td>
    <td className="p-2">{minutesText((Math.min(Date.parse(end),Date.parse(entry.end_at))-Math.max(Date.parse(start),Date.parse(entry.start_at)))/60000)}</td>
    <td className="whitespace-pre-wrap p-2">{entry.memo||"—"}</td>
   </tr>)}</tbody>
  </table></div>}
  <DetailPages page={page} setPage={setPage} count={entries.data?.length} busy={entries.isFetching}/>
 </section>;
}

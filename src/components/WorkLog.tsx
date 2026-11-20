import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database,Json } from "@/integrations/supabase/types";
import { employeesQuery } from "@/lib/employees";
import { meQuery,dbErrorMessage } from "@/lib/app";
import { workLogValidation,WORK_CHECK_ITEMS,WORK_PRIMARY_ITEMS,WORK_METRICS,WORK_EXTRA_KEYS,workMetricLabel,readExtraWorkCounts,readWorkCounts,type WorkCounts,type WorkVideoLink } from "@/lib/work-log";
import { Panel } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
export const workMetricLabelsQuery={queryKey:["work-metric-labels"],queryFn:async()=>{
 const {data,error}=await supabase.from("work_metric_labels").select("id,label");
 if(error)throw error;
 return data;
}};

type Entry=Database["public"]["Tables"]["monthly_work_reports"]["Row"];
type Form={id:string;event:string;employee:string;date:string;legacy:boolean;shot:string;influencer:string;upload:string;feed:string;customerContent:string;memo:string;links:WorkVideoLink[];checks:WorkCounts;extra:ReturnType<typeof readExtraWorkCounts>;version:number};
const blank=():Form=>({id:crypto.randomUUID(),event:crypto.randomUUID(),employee:"",date:format(new Date(),"yyyy-MM-dd"),legacy:false,shot:"0",influencer:"0",upload:"0",feed:"0",customerContent:"",memo:"",links:[],checks:readWorkCounts(null),extra:readExtraWorkCounts(null),version:0});
export function WorkLog(){
 const {data:me}=useQuery(meQuery);const allowed=me?.role==="admin"||me?.role==="internal";
 const qc=useQueryClient(),{data:employees,error:employeeError}=useQuery({...employeesQuery,enabled:allowed});
 const [form,setForm]=useState<Form>(blank),[busy,setBusy]=useState(false);
 const {data:metricLabels,error:labelError}=useQuery({...workMetricLabelsQuery,enabled:allowed});
 const [draftLabels,setDraftLabels]=useState<Record<string,string>|null>(null);
 const [labelsBusy,setLabelsBusy]=useState(false);
 const labelFor=(key:string,fallback:string)=>workMetricLabel(metricLabels,key,fallback);
 const extraKeys=WORK_EXTRA_KEYS.filter(key=>labelFor(key,""));
 async function saveLabels(){
  if(!draftLabels||labelsBusy)return;
  setLabelsBusy(true);
  try{
   const labels=WORK_METRICS.map(([id])=>({id,label:draftLabels[id]?.trim()??""})).filter(item=>item.label);
   const {error}=await supabase.from("work_metric_labels").upsert(labels);
   if(error)throw error;
   await qc.invalidateQueries({queryKey:workMetricLabelsQuery.queryKey});
   setDraftLabels(null);
   toast.success("업무 항목을 저장했습니다.");
  }catch(error){toast.error(dbErrorMessage(error));}finally{setLabelsBusy(false);}
 }
 const [from,setFrom]=useState(format(new Date(),"yyyy-01")),[to,setTo]=useState(format(new Date(),"yyyy-MM")),[employee,setEmployee]=useState(""),[page,setPage]=useState(0);
 const valid=/^\d{4}-\d{2}$/.test(from)&&/^\d{4}-\d{2}$/.test(to)&&from<=to;
 const list=useQuery({queryKey:["monthly-work-reports",from,to,employee,page],enabled:allowed&&valid,queryFn:async()=>{
  let q=supabase.from("monthly_work_reports").select("*",{count:"exact"}).gte("report_month",`${from}-01`).lte("report_month",`${to}-01`).order("report_month",{ascending:false}).order("report_date",{ascending:false,nullsFirst:false}).order("id");if(employee)q=q.eq("employee_id",employee);
  const {data,error,count}=await q.range(page*25,page*25+24);if(error)throw error;return {entries:data,count:count??0};
 }});
 const set=(key:keyof Form,value:Form[keyof Form])=>setForm(p=>({...p,[key]:value}));
 const edit=(row:Entry)=>{setForm({id:row.id,event:crypto.randomUUID(),employee:row.employee_id,date:row.report_date??row.report_month,legacy:row.report_date===null,shot:String(row.shot_edit_count),influencer:String(row.influencer_upload_count),upload:String(row.upload_count),feed:String(row.feed_upload_count),customerContent:row.customer_content,memo:row.memo,links:row.links as unknown as WorkVideoLink[],checks:readWorkCounts(row.work_counts),extra:readExtraWorkCounts(row.work_counts),version:row.version});document.getElementById("work-log-form")?.scrollIntoView({behavior:"smooth",block:"start"});};
 async function save(e:React.FormEvent){e.preventDefault();if(busy||!allowed)return;const links=form.links.filter(l=>l.name.trim()||l.url.trim()).map(l=>({name:l.name.trim(),url:l.url.trim()}));const counts=[form.shot,form.upload,form.feed,form.influencer].map(Number);const month=form.date.slice(0,7);const problem=!/^\d{4}-\d{2}-\d{2}$/.test(form.date)?"작성일을 선택해 주세요.":workLogValidation(form.employee,month,[...counts,...Object.values(form.checks),...Object.values(form.extra)],form.memo,links,form.customerContent);if(problem){toast.error(problem);return;}setBusy(true);
  try{const {error}=await supabase.rpc("save_work_report_by_date",{_id:form.id,_event:form.event,_employee:form.employee,_month:`${month}-01`,_date:form.legacy?null:form.date,_shot_count:counts[0]!,_influencer_count:counts[3]!,_upload_count:counts[1]!,_feed_count:counts[2]!,_customer_content:form.customerContent,_memo:form.memo,_links:links as unknown as Json,_counts:{...form.checks,...form.extra},_version:form.version});if(error)throw error;await qc.invalidateQueries({queryKey:["monthly-work-reports"]});setEmployee(form.employee);setFrom(p=>p>month?month:p);setTo(p=>p<month?month:p);setPage(0);setForm(blank());toast.success("WORK LOG를 저장했습니다.");}catch(error){toast.error(dbErrorMessage(error));}finally{setBusy(false);}
 }
 if(!allowed)return <p>WORK LOG 작성·열람 권한이 없습니다.</p>;
 return <div className="space-y-4"><h2 className="text-lg font-semibold">WORK LOG · 직원별 업무 기록</h2>{labelError&&<p role="alert">업무 항목 이름을 불러오지 못했습니다.</p>}
 {me?.role==="admin"&&metricLabels&&<Panel className="space-y-3">
 <Button type="button" variant="outline" onClick={()=>setDraftLabels(draftLabels?null:Object.fromEntries(WORK_METRICS.map(([key,label])=>[key,labelFor(key,label)])))} disabled={labelsBusy}>{draftLabels?"항목 편집 닫기":"업무 항목 편집"}</Button>
 {draftLabels&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void saveLabels();}}>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{WORK_METRICS.map(([key,fallback],i)=><label key={key} className="text-sm">항목 {i+1}<Input maxLength={40} required={!!labelFor(key,fallback)} placeholder="추가 항목 이름" value={draftLabels[key]} disabled={labelsBusy} onChange={e=>setDraftLabels({...draftLabels,[key]:e.target.value})}/></label>)}</div>
 <Button disabled={labelsBusy}>항목 저장</Button></form>}
 </Panel>}
 <Panel><form id="work-log-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
 <label className="space-y-1 text-sm">직원명<select className="h-10 w-full rounded border bg-background px-2" aria-label="WORK LOG 작성 직원" required value={form.employee} disabled={busy||form.version>0} onChange={e=>set("employee",e.target.value)}><option value="">직원 선택</option>{employees?.filter(e=>e.is_active||e.id===form.employee).map(e=><option key={e.id} value={e.id}>{e.name}{!e.is_active&&" (중지)"}</option>)}</select></label>
 <label className="space-y-1 text-sm">{form.legacy?"작성 월 (기존 기록)":"작성일"}<Input aria-label="WORK LOG 작성일" type={form.legacy?"month":"date"} required disabled={busy||form.version>0} value={form.legacy?form.date.slice(0,7):form.date} onChange={e=>set("date",e.target.value)}/></label>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:col-span-2">{WORK_PRIMARY_ITEMS.map(([key,fallback])=><label key={key} className="text-sm">{labelFor(key,fallback)} (건)<Input aria-label={`WORK LOG ${labelFor(key,fallback)}`} type="number" inputMode="numeric" required min={0} max={100000} step={1} disabled={busy} value={form[key]} onChange={e=>set(key,e.target.value)}/></label>)}</div>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:col-span-2">{WORK_CHECK_ITEMS.map(([key,fallback])=><label key={key} className="text-sm">{labelFor(key,fallback)} (건)<Input type="number" inputMode="numeric" aria-label={`WORK LOG ${labelFor(key,fallback)} 건수`} min={0} max={100000} step={1} required disabled={busy} value={form.checks[key]} onChange={e=>set("checks",{...form.checks,[key]:Number(e.target.value)})}/></label>)}</div>
 {extraKeys.length>0&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:col-span-2">{extraKeys.map(key=><label key={key} className="text-sm">{labelFor(key,"")} (건)<Input type="number" inputMode="numeric" min={0} max={100000} step={1} required disabled={busy} value={form.extra[key]} onChange={e=>set("extra",{...form.extra,[key]:Number(e.target.value)})}/></label>)}</div>}
 <label className="space-y-1 text-sm sm:col-span-2">고객명 및 시술내용<Textarea aria-label="WORK LOG 고객명 및 시술내용" maxLength={5000} rows={3} disabled={busy} value={form.customerContent} onChange={e=>set("customerContent",e.target.value)} placeholder="고객명과 시술내용을 직접 작성하세요."/></label>
 <label className="space-y-1 text-sm sm:col-span-2">메모<Textarea aria-label="WORK LOG 메모" maxLength={5000} rows={4} disabled={busy} value={form.memo} onChange={e=>set("memo",e.target.value)} placeholder="영상 완성, DM·답장, 예약 확정·방문 고객, 채널별 업무 내용을 기록하세요."/></label>
 <div className="space-y-2 rounded border p-3 sm:col-span-2"><h3 className="text-sm font-semibold">영상링크</h3>{form.links.map((link,i)=><div key={i} className="flex flex-wrap items-end gap-2"><label className="min-w-32 flex-1 text-xs">영상 설명 (선택)<Input aria-label={`영상 설명 ${i+1}`} maxLength={100} disabled={busy} value={link.name} onChange={e=>set("links",form.links.map((l,n)=>n===i?{...l,name:e.target.value}:l))}/></label><label className="min-w-48 flex-[2] text-xs">영상 LINK<Input aria-label={`영상 링크 ${i+1}`} type="url" maxLength={2048} disabled={busy} value={link.url} placeholder="https://" onChange={e=>set("links",form.links.map((l,n)=>n===i?{...l,url:e.target.value}:l))}/></label><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>set("links",form.links.filter((_,n)=>n!==i))}>빼기</Button></div>)}<Button type="button" size="sm" variant="outline" disabled={busy||form.links.length>=50} onClick={()=>set("links",[...form.links,{name:"",url:""}])}>+ 영상 링크</Button></div>
 <p className="text-xs text-muted-foreground sm:col-span-2">직원별로 하루 1건씩 작성합니다. 등록한 내용은 아래 내역에서 수정할 수 있습니다.</p><div className="flex gap-2"><Button disabled={busy||!!employeeError}>{form.version>0?"수정 저장":"등록"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setForm(blank())}>{form.version>0?"수정 취소":"입력 초기화"}</Button></div>
 </form></Panel><Panel className="space-y-3"><h3 className="font-semibold">직원별 WORK LOG 조회</h3><div className="flex flex-wrap items-end gap-2"><label className="text-sm">조회 시작 월<Input aria-label="WORK LOG 조회 시작 월" type="month" value={from} onChange={e=>{setFrom(e.target.value);setPage(0);}}/></label><label className="text-sm">조회 종료 월<Input aria-label="WORK LOG 조회 종료 월" type="month" value={to} onChange={e=>{setTo(e.target.value);setPage(0);}}/></label><label className="text-sm">직원<select aria-label="WORK LOG 직원 필터" className="block h-10 rounded border bg-background px-2" value={employee} onChange={e=>{setEmployee(e.target.value);setPage(0);}}><option value="">전체 직원</option>{employees?.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div>
 {!valid&&<p role="alert">조회 기간을 확인해 주세요.</p>}{(employeeError||list.error)&&<p role="alert">직원 또는 WORK LOG를 불러오지 못했습니다.</p>}{list.isPending&&valid&&<p>업무 내역을 불러오는 중입니다.</p>}
 <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-muted"><tr>{["작성일","직원명",...[...WORK_PRIMARY_ITEMS,...WORK_CHECK_ITEMS].map(([key,label])=>labelFor(key,label)),...extraKeys.map(key=>labelFor(key,"")),"고객명 및 시술내용","메모","영상링크","수정"].map((s,i)=><th key={i} className="p-2 text-left">{s}</th>)}</tr></thead><tbody>{list.data?.entries.map(row=><tr key={row.id} className="border-b align-top"><td className="whitespace-nowrap p-2">{row.report_date??`${row.report_month.slice(0,7)} (월간)`}</td><td className="p-2">{employees?.find(e=>e.id===row.employee_id)?.name??"직원"}</td><td className="p-2 text-right">{row.shot_edit_count}</td><td className="p-2 text-right">{row.upload_count}</td><td className="p-2 text-right">{row.feed_upload_count}</td><td className="p-2 text-right">{row.influencer_upload_count}</td>{WORK_CHECK_ITEMS.map(([key,label])=><td key={key} aria-label={`${labelFor(key,label)} ${readWorkCounts(row.work_counts)[key]}건`} className="p-2 text-right">{readWorkCounts(row.work_counts)[key]}</td>)}{extraKeys.map(key=><td key={key} className="p-2 text-right">{readExtraWorkCounts(row.work_counts)[key]}</td>)}<td className="min-w-60 max-w-80 whitespace-pre-wrap break-words p-2">{row.customer_content||"—"}</td><td className="min-w-64 max-w-96 whitespace-pre-wrap break-words p-2">{row.memo||"—"}</td><td className="min-w-60 max-w-80 space-y-2 p-2">{(row.links as unknown as WorkVideoLink[]).map((link,i)=><div key={i}><p>{link.name}</p><a className="break-all text-primary underline" href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a></div>)}</td><td className="p-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>edit(row)}>수정</Button></td></tr>)}</tbody></table></div>
 {list.data?.entries.length===0&&<p>해당 직원·기간의 WORK LOG가 없습니다.</p>}<div className="flex gap-2"><Button type="button" variant="outline" disabled={page===0||list.isFetching} onClick={()=>setPage(page-1)}>이전</Button><span className="self-center text-xs">{page+1} / {Math.max(1,Math.ceil((list.data?.count??0)/25))}</span><Button type="button" variant="outline" disabled={list.isFetching||(page+1)*25>=(list.data?.count??0)} onClick={()=>setPage(page+1)}>다음</Button></div></Panel></div>;
}

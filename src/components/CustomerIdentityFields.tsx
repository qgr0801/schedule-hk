import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export function CustomerIdentityFields({birthDate,gender,onBirthDate,onGender,disabled=false}:{
  birthDate:string; gender:string; onBirthDate:(value:string)=>void; onGender:(value:string)=>void; disabled?:boolean;
}) {
  return <>
    <label className="space-y-1 text-sm">생년월일<Input type="date" min="1900-01-01" max={new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date())} value={birthDate} onChange={e=>onBirthDate(e.target.value)} disabled={disabled}/></label>
    <label className="space-y-1 text-sm">성별<select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={gender} onChange={e=>onGender(e.target.value)} disabled={disabled}><option value="">선택 안 함</option><option value="female">여성</option><option value="male">남성</option><option value="other">기타</option></select></label>
  </>;
}

export function registerCheckedCustomer({name,phone,birthDate,gender,memo=null,categoryId,confirmed}:{
  name:string;phone:string|null;birthDate:string;gender:string;memo?:string|null;categoryId:string;confirmed:boolean;
}) {
  return supabase.rpc("register_customer_checked",{
    _name:name,_phone:phone,_birth_date:birthDate||null,_gender:gender||null,_memo:memo,_category:categoryId||null,_confirm_same_name:confirmed,
  }).single();
}

export const normalizedCustomerName = (name:string) => name.replace(/\s+/g,"").toLowerCase();

export function SameNameCustomerList({customers,name}:{
  customers: {id:string;name:string;customer_no:number;birth_date:string|null;gender:string|null;phone:string|null}[] | undefined;
  name:string;
}) {
  const key=normalizedCustomerName(name);
  const matches=customers?.filter(customer=>normalizedCustomerName(customer.name)===key).slice(0,10);
  if(!matches?.length)return null;
  return <ul className="space-y-1">
    {matches.map(customer=><li key={customer.id}>
      No.{customer.customer_no} {customer.name} · {customer.gender==="female"?"여성":customer.gender==="male"?"남성":customer.gender==="other"?"기타":"성별 미입력"} · {customer.birth_date??"생년월일 미입력"} · {customer.phone?("전화 끝 "+customer.phone.replace(/\D/g,"").slice(-4)):"전화 미입력"}
    </li>)}
  </ul>;
}

import { useEffect,useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
const MAX_AMOUNT=999999999999;
export function parseMoneyInput(text:string):number|null {
 const plain=text.trim().replace(/원$/," ").trim().replace(/,/g,"");
 if(!/^\d*(?:\.\d{0,2})?$/.test(plain))return null;
 const amount=plain===""||plain==="."?0:Number(plain);
 return Number.isFinite(amount)&&amount<=MAX_AMOUNT?amount:null;
}
const display=(value:number)=>value===0?"":value.toLocaleString("ko-KR",{maximumFractionDigits:2});
export function MoneyInput({value,onValueChange,disabled,className,"aria-label":label}:{value:number;onValueChange:(value:number)=>void;disabled?:boolean;className?:string;"aria-label":string}){
 const [draft,setDraft]=useState(()=>display(value)),[focused,setFocused]=useState(false);
 useEffect(()=>{if(!focused||parseMoneyInput(draft)!==value)setDraft(display(value));},[value,focused,draft]);
 return <Input aria-label={label} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled} className={cn("min-w-[148px] text-right tabular-nums",className)} value={draft} placeholder="0" onFocus={()=>{setFocused(true);setDraft(value===0?"":String(value));}} onBlur={()=>{setFocused(false);setDraft(display(value));}} onChange={e=>{const amount=parseMoneyInput(e.target.value);if(amount===null)return;setDraft(e.target.value);onValueChange(amount);}}/>;
}

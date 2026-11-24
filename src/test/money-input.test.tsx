import { useState } from "react";
import { render,screen,fireEvent,cleanup } from "@testing-library/react";
import { afterEach,describe,it,expect,vi } from "vitest";
import { MoneyInput,parseMoneyInput } from "@/components/MoneyInput";
vi.mock("@tanstack/react-query",async(importOriginal)=>({...await importOriginal<typeof import("@tanstack/react-query")>(),useQuery:()=>({data:[],error:null})}));
vi.mock("@tanstack/react-router",()=>({Link:({children}:{children:React.ReactNode})=><span>{children}</span>}));
import { PaymentFields } from "@/components/PaymentFields";
import { blankPayment } from "@/lib/payments";
afterEach(cleanup);
function PaymentForm(){const [payment,setPayment]=useState(()=>blankPayment("2026-11-20"));const [saved,setSaved]=useState("");return <><PaymentFields value={payment} onChange={setPayment}/><button onClick={()=>setSaved(JSON.stringify(payment))}>저장 시험</button><output data-testid="payload">{saved}</output></>;}

function Form(){const [amount,setAmount]=useState(0);return <><MoneyInput aria-label="비용" value={amount} onValueChange={setAmount}/><output data-testid="stored">{amount}</output></>;}
describe("payment amount input",()=>{
 it("keeps all seven digits while typing 1,600,000 and formats it without changing the saved numeric amount",()=>{
  render(<Form/>);const input=screen.getByRole("textbox",{name:"비용"});fireEvent.focus(input);
  for(const value of ["1","16","160","1600","16000","160000","1600000"])fireEvent.change(input,{target:{value}});
  expect(input).toHaveValue("1600000");expect(screen.getByTestId("stored")).toHaveTextContent(/^1600000$/);
  fireEvent.blur(input);expect(input).toHaveValue("1,600,000");
 });
 it("accepts comma-formatted pasted amounts and replacement edits",()=>{
  render(<Form/>);const input=screen.getByRole("textbox",{name:"비용"});fireEvent.focus(input);fireEvent.change(input,{target:{value:"1,600,000"}});
  expect(screen.getByTestId("stored")).toHaveTextContent(/^1600000$/);
  fireEvent.change(input,{target:{value:"2,500,000원"}});fireEvent.blur(input);expect(input).toHaveValue("2,500,000");expect(screen.getByTestId("stored")).toHaveTextContent(/^2500000$/);
 });
 it("preserves decimal edits and allows clearing without creating NaN",()=>{
  render(<Form/>);const input=screen.getByRole("textbox",{name:"비용"});fireEvent.focus(input);
  for(const value of ["1","1.","1.2","1.25"])fireEvent.change(input,{target:{value}});
  expect(input).toHaveValue("1.25");fireEvent.change(input,{target:{value:""}});expect(screen.getByTestId("stored")).toHaveTextContent(/^0$/);
 });
 it("rejects unsupported amounts instead of silently storing another number",()=>{
  for(const value of ["-1","160만원","1e6","1.234","1000000000000"])expect(parseMoneyInput(value)).toBeNull();
  expect(parseMoneyInput("999,999,999,999")).toBe(999999999999);
  expect(parseMoneyInput("1,600,000")).toBe(1600000);
 });
 it("retains a 1.6 million payment split as numeric JSON in the real payment form",()=>{
  render(<PaymentForm/>);
  for(const [label,value] of [["시술 수납(원)","1,600,000"],["시술 카드(원)","1,000,000"],["시술 계좌(원)","600,000"]] as const){
   const input=screen.getByRole("textbox",{name:label});fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);
  }
  fireEvent.click(screen.getByRole("button",{name:"저장 시험"}));
  const payment=JSON.parse(screen.getByTestId("payload").textContent!);
  expect(payment.rows.find((r:{kind:string})=>r.kind==="service")).toMatchObject({cost:1600000,card:1000000,bank:600000,krw:0});
 });

});

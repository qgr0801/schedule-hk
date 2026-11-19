import { describe,it,expect } from "vitest";
import { workLogValidation } from "@/lib/work-log";
describe("monthly work log validation",()=>{
 it("accepts zero counts, multiline notes and multiple named video links",()=>{
  expect(workLogValidation("employee","2026-11",[25,3,17],"DM 답장 9명\n예약 확인",[{name:"인플루언서 A",url:"https://www.instagram.com/reel/example/"},{name:"인플루언서 B",url:"https://www.tiktok.com/@example/video/1"}])).toBeNull();
  expect(workLogValidation("employee","2026-11",[0,0,0],"",[])).toBeNull();
 });
 it("rejects missing staff, invalid months, negative or fractional counts",()=>{
  expect(workLogValidation("","2026-11",[0,0,0],"",[])).toBeTruthy();
  expect(workLogValidation("employee","2026-13",[0,0,0],"",[])).toBeTruthy();
  expect(workLogValidation("employee","2026-11",[1.5,-1,0],"",[])).toBeTruthy();
 });
 it("rejects unsafe links, partial name/link pairs and oversized records",()=>{
  for(const url of ["javascript:alert(1)","data:text/html,test","https://exa mple.com"])
   expect(workLogValidation("employee","2026-11",[0,0,0],"",[{name:"A",url}])).toBeTruthy();
  expect(workLogValidation("employee","2026-11",[0,0,0],"",[{name:"",url:"https://example.com"}])).toBeTruthy();
  expect(workLogValidation("employee","2026-11",[0,0,0],"x".repeat(5001),[])).toBeTruthy();
 });
});

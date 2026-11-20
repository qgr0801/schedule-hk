import { describe,it,expect } from "vitest";
import { workLogValidation,readWorkChecks,readWorkCounts } from "@/lib/work-log";
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
  expect(workLogValidation("employee","2026-11",[0,0,0,0],"",[{name:"",url:"https://example.com"}],"고객A · 진정관리")).toBeNull();
  expect(workLogValidation("employee","2026-11",[0,0,0,0],"",[],"가".repeat(5001))).toBeTruthy();
  expect(workLogValidation("employee","2026-11",[0,0,0],"x".repeat(5001),[])).toBeTruthy();
 });
});

describe("work log check items",()=>{
 it("defaults old records to unchecked and round-trips all five independent states",()=>{
  expect(readWorkChecks(null)).toEqual({youtube:false,dm:false,dmr:false,dm_confirmed:false,dm_visited:false});
  expect(readWorkChecks({youtube:true,dm:false,dmr:true,dm_confirmed:true,dm_visited:false})).toEqual({youtube:true,dm:false,dmr:true,dm_confirmed:true,dm_visited:false});
  expect(readWorkChecks({dm:"false",dm_visited:"true"}).dm_visited).toBe(false);
 });
});

describe("work log activity counts",()=>{
 it("preserves each count and never treats old boolean checks as numeric activity",()=>{
  expect(readWorkCounts({youtube:12,dm:83,dmr:9,dm_confirmed:6,dm_visited:3})).toEqual({youtube:12,dm:83,dmr:9,dm_confirmed:6,dm_visited:3});
  expect(readWorkCounts({youtube:true,dm:-1,dmr:1.5}).youtube).toBe(0);
 });
});

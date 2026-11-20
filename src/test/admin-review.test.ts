import { describe,it,expect } from "vitest";
import { collectedKrw } from "@/lib/admin-review";
describe("admin collection figures",()=>{
 it("sums KRW payment methods without counting costs or converting foreign currencies",()=>{
  expect(collectedKrw([{cost:1600000,card:1760000,bank:0,krw:0,jpy:50000},{cost:100000,bank:60000,krw:40000}])).toBe(1860000);
 });
});

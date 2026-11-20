import { render,screen,fireEvent,waitFor,cleanup } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { afterEach,beforeEach,describe,it,expect,vi } from "vitest";
const state=vi.hoisted(()=>({role:"admin",rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:state.rpc}}));
vi.mock("@/lib/app",()=>({meQuery:{queryKey:["me"],queryFn:async()=>({role:state.role})},profilesQuery:{queryKey:["profiles"],queryFn:async()=>[]},STATUS_LABEL:{confirmed:"예약 확정"}}));
vi.mock("@/lib/booking-routes",()=>({bookingRoutesQuery:{queryKey:["booking-routes"],queryFn:async()=>[]}}));
import { BookingActivityReport } from "@/components/BookingActivityReport";
afterEach(cleanup);beforeEach(()=>{state.role="admin";state.rpc.mockReset().mockResolvedValue({data:[],error:null});});
const renderReport=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><BookingActivityReport period={{from:"2026-11-01",to:"2026-11-20"}}/></QueryClientProvider>);
describe("admin details on demand",()=>{
 it("keeps the long table hidden and fetches only the chosen period after explicit lookup",async()=>{
  renderReport();await screen.findByRole("button",{name:"상세 조회"});expect(state.rpc).not.toHaveBeenCalled();expect(screen.queryByRole("table")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"상세 조회"}));await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith("booking_activity_report",expect.objectContaining({_from:"2026-11-01",_to:"2026-11-20",_offset:0})));expect(screen.getByRole("table")).toBeInTheDocument();
 });
 it("loads every customer for the selected kind without requiring a route filter",async()=>{
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><BookingActivityReport period={{from:"2026-11-01",to:"2026-11-20"}} selection={{kind:"care",route:""}}/></QueryClientProvider>);
  await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith("booking_activity_report_by_kind",{_from:"2026-11-01",_to:"2026-11-20",_offset:0,_kind:"care"}));
  expect(screen.getByRole("columnheader",{name:"관리내용"})).toBeInTheDocument();
  expect(screen.queryByRole("columnheader",{name:"시술내용"})).not.toBeInTheDocument();
 });
 it("does not request financial detail for an internal staff account",async()=>{
  state.role="internal";renderReport();await screen.findByText("ADMIN은 최고관리자만 열람할 수 있습니다.");expect(state.rpc).not.toHaveBeenCalled();expect(screen.queryByRole("table")).not.toBeInTheDocument();
 });
});

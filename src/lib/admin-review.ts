export type ReviewPeriod={from:string;to:string};
export type SalesReview={category:string;collected:number;jpy:number;usd:number;cny:number;customers:number};
export type TimeReview={employee_id:string;name:string;minutes:number};
export type WorkReview={employee_id:string;name:string;records:number;shot:number;video:number;feed:number;sponsored:number;youtube:number;dm:number;dmr:number;dm_confirmed:number;dm_visited:number};
export type AdminOverview={sales:SalesReview[];times:TimeReview[];work:WorkReview[]};
export type SettlementReview={route_id:string|null;route_name:string;kind:string;content:string|null;collected:number;jpy:number;usd:number;cny:number;record_id:string|null;version:number;amount:number;completed:number;memo:string};
export const won=(n:unknown)=>Number(n??0).toLocaleString("ko-KR",{maximumFractionDigits:2});
export const minutesText=(n:number)=>`${Math.floor(n/60)}시간 ${Math.round(n%60)}분`;
export const collectedKrw=(rows:Record<string,unknown>[])=>rows.reduce((sum,row)=>sum+Number(row["card"]??0)+Number(row["bank"]??0)+Number(row["krw"]??0),0);

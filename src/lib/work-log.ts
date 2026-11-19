export type WorkVideoLink = { name: string; url: string };
export function workLogValidation(employee:string, month:string, counts:number[], memo:string, links:WorkVideoLink[], customerContent=""):string|null {
 if(!employee||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return "직원과 작성 월을 선택해 주세요.";
 if(counts.some(n=>!Number.isInteger(n)||n<0||n>100000))return "건수는 0 이상 100000 이하의 정수로 입력해 주세요.";
 if(customerContent.length>5000)return "고객명 및 시술내용은 5000자까지 입력할 수 있습니다.";
 if(memo.length>5000)return "메모는 5000자까지 입력할 수 있습니다.";
 if(links.length>50)return "영상 링크는 최대 50개까지 등록할 수 있습니다.";
 for(const link of links){
  if(link.name.trim().length>100||link.url.length>2048)return "영상 설명과 영상 링크를 확인해 주세요.";
  try{const url=new URL(link.url);if(!["https:","http:"].includes(url.protocol)||!url.hostname||/\s/.test(link.url))return "영상 링크는 http 또는 https 주소를 입력해 주세요.";}catch{return "올바른 영상 링크를 입력해 주세요.";}
 }
 return null;
}

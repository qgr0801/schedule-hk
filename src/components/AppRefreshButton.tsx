import { useEffect,useRef,useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from "@/components/ui/alert-dialog";

export function AppRefreshButton(){
 const editedForms=useRef(new Set<HTMLFormElement>());
 const [confirm,setConfirm]=useState(false),[refreshing,setRefreshing]=useState(false);
 useEffect(()=>{
  const track=(event:Event)=>{const target=event.target;if(target instanceof Element){const form=target.closest("form");if(form)editedForms.current.add(form);}};
  document.addEventListener("input",track,true);document.addEventListener("change",track,true);
  return ()=>{document.removeEventListener("input",track,true);document.removeEventListener("change",track,true);};
 },[]);
 function reload(){setRefreshing(true);window.location.reload();}
 function refresh(){
  for(const form of editedForms.current){if(form.isConnected){setConfirm(true);return;}editedForms.current.delete(form);}
  reload();
 }
 return <><Button type="button" variant="outline" className="min-h-11 shrink-0 px-2.5" aria-label="새로고침" title="화면 새로고침" disabled={refreshing} onClick={refresh}><RefreshCw aria-hidden="true" className={refreshing?"animate-spin":""}/><span>새로고침</span></Button>
 <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>화면을 새로고침할까요?</AlertDialogTitle><AlertDialogDescription>입력한 내용이 있습니다. 저장하지 않은 내용은 사라질 수 있습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>계속 작성</AlertDialogCancel><AlertDialogAction onClick={reload}>새로고침</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

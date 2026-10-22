import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/** Read-only notice while the device has no connection. Nothing is cached for offline use. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">
      <WifiOff className="h-4 w-4 shrink-0" />
      인터넷 연결이 끊겼습니다. 화면은 읽기 전용이며 예약 저장·변경은 연결 후 해 주세요.
    </div>
  );
}

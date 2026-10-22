"""Trial-readiness checks against the live backend with fake QA4 data only.
Run tests/rls/qa4_staff_permissions.py first (creates /tmp/state.json). Every change made here is reverted."""
import json, requests

U = "https://urxnhvutlqwdqbuyeace.supabase.co"
K = "sb_publishable_cHR1yhA0yKn5m9rz8LU_EA_EPDi-T8e"
results = []

def check(name, ok, detail=""):
    results.append(("통과" if ok else "실패", name)); print(("PASS " if ok else "FAIL ") + name, detail)

def login(email, pw):
    r = requests.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey": K}, json={"email": email, "password": pw})
    return r.json().get("access_token") if r.ok else None

def H(tok=None):
    h = {"apikey": K, "Content-Type": "application/json", "Prefer": "return=representation"}
    if tok: h["Authorization"] = f"Bearer {tok}"
    return h

def req(m, tok, path, body=None):
    r = requests.request(m, f"{U}/rest/v1/{path}", headers=H(tok), json=body)
    try: j = r.json()
    except Exception: j = None
    return r.status_code, j

# ---------- 1. login for every test account ----------
toks = {}
for email, pw in [("qa4-admin-a@demo-bsm.com", "QaTest4!Schedule"), ("qa4-internal-b@demo-bsm.com", "QaTest4!Schedule"),
                  ("qa4-external-c@demo-bsm.com", "QaTest4!Schedule"), ("admin@demo-bsm.com", "Demo1234!x"),
                  ("internal@demo-bsm.com", "Demo1234!x"), ("external@demo-bsm.com", "Demo1234!x")]:
    toks[email] = login(email, pw)
    check(f"로그인: {email}", bool(toks[email]))
check("잘못된 비밀번호 로그인 거부", login("qa4-admin-a@demo-bsm.com", "wrong-password") is None)
A, B, C = toks["qa4-admin-a@demo-bsm.com"], toks["qa4-internal-b@demo-bsm.com"], toks["qa4-external-c@demo-bsm.com"]
me = {n: requests.get(f"{U}/auth/v1/user", headers=H(t)).json()["id"] for n, t in (("A", A), ("B", B), ("C", C))}
st = json.load(open("/tmp/state.json"))

# ---------- 2. signed-out visitors ----------
for t in ["customers", "reservations", "reservation_history", "customer_category_tags", "profiles", "user_roles",
          "staff_view_scopes", "staff_permission_log", "schedules", "reservation_view_grants", "trial_feedback"]:
    s, j = req("GET", None, f"{t}?select=*&limit=1")
    check(f"비로그인 차단: {t}", s in (401, 403) or j == [], f"{s}")
for fn, body in [("calendar_reservations", {"_from": "2020-01-01T00:00:00Z", "_to": "2030-01-01T00:00:00Z"}),
                 ("customer_visit_history", {"_reservation": st["A"]["res"]}),
                 ("has_role", {"_user_id": me["A"], "_role": "admin"}), ("staff_emails", {})]:
    s, _ = req("POST", None, f"rpc/{fn}", body)
    check(f"비로그인 차단: {fn}()", s in (401, 403), f"{s}")
s, _ = req("POST", None, "customers", {"name": "비로그인테스트"})
check("비로그인 고객 등록 차단", s in (401, 403), f"{s}")

# ---------- 3. staff e-mail addresses ----------
s, j = req("GET", B, "profiles?select=id,email")
check("직원 이메일: 내부 직원이 profiles에서 이메일 조회 불가", s in (401, 403), f"{s}")
s, j = req("GET", C, "profiles?select=*")
check("직원 이메일: 외부 직원 select=* 차단", s in (401, 403), f"{s}")
s, j = req("GET", C, "profiles?select=id,full_name")
check("직원 프로필 표: 외부 직원은 본인 행만", s == 200 and [r["id"] for r in j] == [me["C"]], f"{s} {len(j or [])}")
s, j = req("GET", B, "profiles?select=id,full_name")
check("직원 프로필 표: 내부 직원은 본인 행만", s == 200 and [r["id"] for r in j] == [me["B"]], f"{s} {len(j or [])}")
s, j = req("GET", A, "profiles?select=id,full_name")
check("직원 프로필 표: 관리자는 전체", s == 200 and len(j) >= 6, f"{s} {len(j or [])}")
s, j = req("POST", C, "rpc/staff_directory", {})
check("이름 전용 직원 목록: 이름만 오고 이메일 없음", s == 200 and len(j) >= 6 and all("email" not in r for r in j), f"{s} {sorted(j[0]) if j else None}")
s, _ = req("POST", None, "rpc/staff_directory", {})
check("비로그인 차단: staff_directory()", s in (401, 403), f"{s}")
s, j = req("POST", C, "rpc/staff_emails", {})
check("staff_emails(): 외부 직원은 본인 이메일만", s == 200 and [r["id"] for r in j] == [me["C"]], f"{len(j or [])}")
s, j = req("POST", A, "rpc/staff_emails", {})
check("staff_emails(): 관리자는 전체 이메일", s == 200 and len(j) >= 6, f"{len(j or [])}")

# ---------- 3b. shared settings: staff only, no personal data ----------
SETTINGS = {"booking_settings": {"id", "cancelled_slot_reusable", "updated_at", "slot_minutes", "trial_mode"},
            "calendar_display_settings": {"view", "fields", "color_mode", "updated_at"},
            "customer_categories": {"id", "slot", "position", "name", "color", "updated_at"},
            "day_sections": {"position", "name", "active"},
            "reservation_status_settings": {"status", "text_color", "bg_color", "border_color", "updated_at"},
            "staff_color_settings": {"user_id", "color", "updated_at"}}
for t, cols in SETTINGS.items():
    s, j = req("GET", C, f"{t}?select=*")
    check(f"공용 설정 {t}: 외부 직원 열람 가능(캘린더 동작)", s == 200 and len(j) >= 1, f"{s}")
    check(f"공용 설정 {t}: 개인정보 열 없음", s == 200 and set(j[0]) <= cols, f"{sorted(j[0]) if j else None}")
    s, _ = req("GET", None, f"{t}?select=*")
    check(f"공용 설정 {t}: 비로그인 차단", s in (401, 403), f"{s}")
    key = sorted(cols)[0]
    s, j = req("PATCH", C, f"{t}?{key}=not.is.null", {"color": "#000000"} if "color" in cols else {"name": "x"} if "name" in cols else {"color_mode": "status"} if "color_mode" in cols else {"slot_minutes": 15} if "slot_minutes" in cols else {"text_color": "#000000"})
    check(f"공용 설정 {t}: 외부 직원 수정 불가", (s == 200 and j == []) or s in (401, 403), f"{s}")

# ---------- 3c. customer PII per role ----------
s, j = req("GET", C, "customers?select=id,created_by")
check("고객정보: 외부 직원은 본인 등록 고객만", s == 200 and st["C"]["cust"] in {r["id"] for r in j} and all(r["created_by"] == me["C"] for r in j), f"{len(j or [])}")
s, j = req("GET", C, f"customers?customer_no=eq.{st['A']['no']}&select=id")
check("고객번호 검색: 외부 직원이 다른 직원 고객번호로 조회 불가", s == 200 and j == [], f"{j}")
s, j = req("GET", C, "reservations?select=id,created_by")
check("예약 상세: 외부 직원은 본인 예약만", s == 200 and st["C"]["res"] in {r["id"] for r in j} and all(r["created_by"] == me["C"] for r in j), f"{len(j or [])}")
s, j = req("POST", C, "rpc/calendar_reservations", {"_from": "2027-01-15T00:00:00+09:00", "_to": "2027-01-16T00:00:00+09:00"})
others = [r for r in (j or []) if r["id"] != st["C"]["res"]]
check("캘린더 블록: 외부 직원에게 다른 직원 예약의 고객명·번호·연락처·메모 없음",
      s == 200 and others and all(r["customer_name"] is None and r["customer_no"] is None and r["customer_phone"] is None and r["memo"] is None for r in others), f"{len(others)}")
check("캘린더 블록: 시간·공개용 시술명·상태는 공유", s == 200 and all(r["start_at"] and r["public_service"] and r["status"] for r in others))
s, j = req("GET", A, "customers?select=id")
check("고객정보: 관리자는 QA4 고객 3명 모두 열람", s == 200 and {st[n]["cust"] for n in "ABC"} <= {r["id"] for r in j}, f"{len(j or [])}")

# ---------- 4. drag move = reservations UPDATE ----------
def res(tok, rid):
    return req("GET", tok, f"reservations?id=eq.{rid}&select=start_at,end_at,staff_id,section")[1]
orig = res(C, st["C"]["res"])[0]
s, j = req("PATCH", C, f"reservations?id=eq.{st['C']['res']}", {"start_at": "2027-01-15T16:00:00+09:00", "end_at": "2027-01-15T17:30:00+09:00"})
check("드래그 이동: 외부 직원 본인 예약 시간·길이 변경 저장", s == 200 and len(j) == 1, f"{s}")
after = res(C, st["C"]["res"])[0]
check("드래그 이동: 다시 읽어도 변경된 시간 유지", after["start_at"].startswith("2027-01-15T07:00") and after["end_at"].startswith("2027-01-15T08:30"), after["start_at"])
s, h = req("GET", C, f"reservation_history?reservation_id=eq.{st['C']['res']}&order=created_at.desc&limit=1&select=action,old_data,new_data")
check("드래그 이동: 변경 이력 기록(이전·이후 시간)", s == 200 and h and h[0]["old_data"]["start_at"] != h[0]["new_data"]["start_at"], f"{h[0]['action'] if h else None}")
s, j = req("PATCH", C, f"reservations?id=eq.{st['C']['res']}", {"start_at": orig["start_at"], "end_at": orig["end_at"]})
check("드래그 되돌리기: 원래 시간 복구", s == 200 and res(C, st["C"]["res"])[0]["start_at"] == orig["start_at"])

s, j = req("PATCH", C, f"reservations?id=eq.{st['B']['res']}", {"start_at": "2027-01-15T18:00:00+09:00", "end_at": "2027-01-15T19:00:00+09:00"})
check("드래그 이동: 외부 직원이 다른 직원 예약 이동 불가", s == 200 and j == [] or s in (401, 403), f"{s} {j}")
s, j = req("PATCH", B, f"reservations?id=eq.{st['A']['res']}", {"start_at": "2027-01-15T18:00:00+09:00", "end_at": "2027-01-15T19:00:00+09:00"})
check("드래그 이동: 내부 직원이 관리자 예약 이동 불가", s == 200 and j == [] or s in (401, 403), f"{s} {j}")

b = res(A, st["B"]["res"])[0]
s, j = req("PATCH", A, f"reservations?id=eq.{st['A']['res']}", {"start_at": b["start_at"], "end_at": b["end_at"], "staff_id": me["B"]})
check("중복 방지: 같은 담당자 시간대로 이동 시 서버 거부(23P01)", s in (400, 409) and (j or {}).get("code") == "23P01", f"{s} {(j or {}).get('code')}")
s, j = req("POST", A, "rpc/find_overlaps", {"_start": b["start_at"], "_end": b["end_at"], "_staff": me["B"], "_section": None, "_exclude": st["A"]["res"]})
check("중복 방지: 이동 전 겹침 미리 확인(find_overlaps)", s == 200 and len(j) >= 1, f"{len(j or [])}")
s, j = req("POST", C, "reservations", {"customer_name": "QA4가상중복", "service": "보톡스", "start_at": b["start_at"], "end_at": b["end_at"], "staff_id": me["B"], "status": "confirmed"})
check("중복 방지: 다른 직원 담당 시간에 새 예약 등록 거부", s in (400, 409) and (j or {}).get("code") == "23P01", f"{s} {(j or {}).get('code') if isinstance(j, dict) else j}")
check("중복 방지 후 원래 예약 그대로", res(A, st["A"]["res"])[0]["start_at"] != b["start_at"])

# ---------- 5. 7-day trial (2026-10-23~29) ----------
s, j = req("POST", C, "rpc/calendar_reservations", {"_from": "2026-10-23T00:00:00+09:00", "_to": "2026-10-30T00:00:00+09:00"})
trial = [r for r in (j or []) if r["public_service"] and r["created_by"] != me["C"]]
check("시범 기간 예약 블록: 외부 직원에게 15건 이상 보임", s == 200 and len(trial) >= 15, f"{len(trial)}")
check("시범 기간 예약 블록: 고객명·번호·연락처·메모 없음",
      all(r["customer_name"] is None and r["customer_no"] is None and r["customer_phone"] is None and r["memo"] is None for r in trial))
s, j = req("GET", C, "customers?name=like.*시범*&select=id")
check("시범 가상 고객: 외부 직원은 관리자 등록 고객 조회 불가", s == 200 and j == [], f"{j}")
s, j = req("GET", A, "customers?name=like.*시범*&select=id,is_test")
check("시범 가상 고객 10명, 모두 테스트 표시", s == 200 and len(j) == 10 and all(r["is_test"] for r in j), f"{len(j or [])}")
s, j = req("PATCH", C, f"reservations?id=eq.{st['C']['res']}", {"is_test": False})
check("테스트 표시는 직원이 바꿀 수 없음", s == 200 and j and j[0]["is_test"] is True, f"{s}")
for who, tok in (("외부", C), ("내부", B)):
    s, j = req("GET", tok, "trial_feedback?select=*")
    check(f"피드백: {who} 직원 열람 불가", s in (401, 403) or j == [], f"{s}")
    s, j = req("POST", tok, "trial_feedback", {"reporter_id": me["C"], "menu": "캘린더", "content": "x"})
    check(f"피드백: {who} 직원 등록 불가", s in (401, 403), f"{s}")
s, j = req("POST", A, "trial_feedback", {"reporter_id": me["C"], "menu": "캘린더", "content": "[자동 점검] 삭제 예정", "device": "mobile", "severity": "high"})
check("피드백: 관리자 등록 가능", s == 201 and j and j[0]["status"] == "open", f"{s}")
if s == 201:
    s2, _ = req("DELETE", A, f"trial_feedback?id=eq.{j[0]['id']}")
    check("피드백: 관리자 삭제 가능(점검 기록 정리)", s2 in (200, 204), f"{s2}")
s, j = req("PATCH", C, "booking_settings?id=eq.true", {"trial_mode": False})
check("시범 운영 모드: 외부 직원 변경 불가", (s == 200 and j == []) or s in (401, 403), f"{s}")

fails = [n for r, n in results if r == "실패"]
print(f"\n{len(results) - len(fails)}/{len(results)} 통과. FAILED: {fails}")

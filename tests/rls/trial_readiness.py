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
          "staff_view_scopes", "staff_permission_log", "schedules", "reservation_view_grants"]:
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
check("직원 이름 목록은 정상 조회", s == 200 and len(j) >= 3, f"{s}")
s, j = req("POST", C, "rpc/staff_emails", {})
check("staff_emails(): 외부 직원은 본인 이메일만", s == 200 and [r["id"] for r in j] == [me["C"]], f"{len(j or [])}")
s, j = req("POST", A, "rpc/staff_emails", {})
check("staff_emails(): 관리자는 전체 이메일", s == 200 and len(j) >= 6, f"{len(j or [])}")

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
check("중복 방지: 같은 담당자 시간대로 이동 시 서버 거부(23P01)", s == 409 and (j or {}).get("code") == "23P01", f"{s} {(j or {}).get('code')}")
s, j = req("POST", A, "rpc/find_overlaps", {"_start": b["start_at"], "_end": b["end_at"], "_staff": me["B"], "_section": None, "_exclude": st["A"]["res"]})
check("중복 방지: 이동 전 겹침 미리 확인(find_overlaps)", s == 200 and len(j) >= 1, f"{len(j or [])}")
s, j = req("POST", C, "reservations", {"customer_name": "QA4가상중복", "service": "보톡스", "start_at": b["start_at"], "end_at": b["end_at"], "staff_id": me["B"], "status": "confirmed"})
check("중복 방지: 다른 직원 담당 시간에 새 예약 등록 거부", s in (409, 403, 401), f"{s} {(j or {}).get('code') if isinstance(j, dict) else j}")
check("중복 방지 후 원래 예약 그대로", res(A, st["A"]["res"])[0]["start_at"] != b["start_at"])

fails = [n for r, n in results if r == "실패"]
print(f"\n{len(results) - len(fails)}/{len(results)} 통과. FAILED: {fails}")

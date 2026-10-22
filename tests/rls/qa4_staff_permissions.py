import json, sys, requests
U = "https://urxnhvutlqwdqbuyeace.supabase.co"
K = "sb_publishable_cHR1yhA0yKn5m9rz8LU_EA_EPDi-T8e"
PW = "QaTest4!Schedule"
MODE = sys.argv[1] if len(sys.argv) > 1 else "run"
results = []

def login(email):
    r = requests.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey": K}, json={"email": email, "password": PW})
    r.raise_for_status(); return r.json()["access_token"]

def H(tok=None, extra=None):
    h = {"apikey": K, "Content-Type": "application/json", "Prefer": "return=representation"}
    if tok: h["Authorization"] = f"Bearer {tok}"
    if extra: h.update(extra)
    return h

def get(tok, path):
    r = requests.get(f"{U}/rest/v1/{path}", headers=H(tok)); return r.status_code, (r.json() if r.text else None)
def post(tok, path, body):
    r = requests.post(f"{U}/rest/v1/{path}", headers=H(tok), json=body); return r.status_code, (r.json() if r.text else None)
def patch(tok, path, body):
    r = requests.patch(f"{U}/rest/v1/{path}", headers=H(tok), json=body); return r.status_code, (r.json() if r.text else None)
def delete(tok, path):
    r = requests.delete(f"{U}/rest/v1/{path}", headers=H(tok)); return r.status_code, (r.json() if r.text else None)
def rpc(tok, fn, body):
    r = requests.post(f"{U}/rest/v1/rpc/{fn}", headers=H(tok), json=body); return r.status_code, (r.json() if r.text else None)

def check(name, ok, detail=""):
    results.append(("통과" if ok else "실패", name, detail)); print(("PASS " if ok else "FAIL ") + name, detail)

A, B, C = (login(f"qa4-{x}@demo-bsm.com") for x in ("admin-a", "internal-b", "external-c"))
me = {}
for n, t in (("A", A), ("B", B), ("C", C)):
    me[n] = requests.get(f"{U}/auth/v1/user", headers=H(t)).json()["id"]

# ---------- test data: each account creates its own fake customer + reservation ----------
state_path = "/tmp/state.json"
try:
    st = json.load(open(state_path))
except FileNotFoundError:
    st = {}
    # Re-use the fake QA4 data from an earlier run if it exists.
    for n in "ABC":
        _, c = get(A, f"customers?name=eq.QA4가상고객{n}&select=id,customer_no")
        _, r = get(A, f"reservations?customer_name=eq.QA4가상고객{n}&start_at=gte.2027-01-15T00:00:00%2B09:00&start_at=lte.2027-01-15T23:59:00%2B09:00&select=id")
        if c and r: st[n] = {"cust": c[0]["id"], "no": c[0]["customer_no"], "res": r[0]["id"]}
    if len(st) == 3: json.dump(st, open(state_path, "w"))
if len(st) < 3:
    st = {}
    for i, (n, t) in enumerate((("A", A), ("B", B), ("C", C))):
        s, c = post(t, "customers?select=id,customer_no", {"name": f"QA4가상고객{n}", "phone": f"010-0000-000{i+1}", "memo": f"QA4 테스트 메모 {n}"})
        assert s == 201, (s, c)
        s, r = post(t, "reservations?select=id", {
            "customer_id": c[0]["id"], "customer_name": f"QA4가상고객{n}", "customer_phone": f"010-0000-000{i+1}",
            "service": "보톡스", "public_service": "피부상담", "memo": f"QA4 예약 메모 {n}",
            "start_at": f"2027-01-15T{10+i*2:02d}:00:00+09:00", "end_at": f"2027-01-15T{11+i*2:02d}:00:00+09:00", "status": "confirmed"})
        assert s == 201, (s, r)
        st[n] = {"cust": c[0]["id"], "no": c[0]["customer_no"], "res": r[0]["id"]}
    json.dump(st, open(state_path, "w"))
print("data", st)
ids = ",".join(st[n]["res"] for n in "ABC")

# 1. Admin sees every reservation in full
s, d = get(A, f"reservations?id=in.({ids})&select=id,customer_name,customer_phone,memo")
check("관리자: 테스트 예약 3건 상세 열람", s == 200 and len(d) == 3 and all(x["customer_name"] for x in d), f"{len(d or [])}건")
s, d = get(A, f"customers?id=in.({','.join(st[n]['cust'] for n in 'ABC')})&select=id")
check("관리자: 테스트 고객 3명 열람", len(d) == 3)

# 2. Internal B sees own detail, not others
s, d = get(B, f"reservations?id=eq.{st['B']['res']}&select=customer_name,memo")
check("내부 B: 본인 예약 상세 열람", len(d) == 1 and d[0]["customer_name"] == "QA4가상고객B")
for who in "AC":
    s, d = get(B, f"reservations?id=eq.{st[who]['res']}")
    check(f"내부 B: {who}의 예약 직접 API 조회 차단", s == 200 and d == [], f"{len(d)}건")

# 3. External C full own lifecycle
s, d = get(C, f"reservations?id=eq.{st['C']['res']}&select=customer_name")
check("외부 C: 본인 예약 열람", len(d) == 1)
s, d = patch(C, f"reservations?id=eq.{st['C']['res']}&select=id,memo", {"memo": "QA4 수정됨"})
check("외부 C: 본인 예약 수정", s == 200 and len(d) == 1 and d[0]["memo"] == "QA4 수정됨")
for who in "AB":
    s, d = get(C, f"reservations?id=eq.{st[who]['res']}")
    check(f"외부 C: {who}의 예약 직접 API 조회 차단", d == [], f"{len(d)}건")
    s, d = patch(C, f"reservations?id=eq.{st[who]['res']}&select=id", {"memo": "hack"})
    check(f"외부 C: {who}의 예약 수정 차단", d == [] or s >= 400)
s, d = post(C, "reservations", {"created_by": me["B"], "customer_name": "x", "service": "x", "start_at": "2027-01-16T10:00:00+09:00", "end_at": "2027-01-16T11:00:00+09:00"})
check("외부 C: 다른 직원 이름으로 예약 등록 차단", s >= 400, str(s))
s, d = delete(C, f"reservations?id=eq.{st['C']['res']}")
s2, d2 = get(C, f"reservations?id=eq.{st['C']['res']}&select=id")
check("외부 C: 예약 삭제 차단 (취소만 가능)", len(d2) == 1, str(s))

# 4. Calendar blocks for everyone; customer fields only as granted (default template: 고객명 only, internal staff only)
DAY = {"_from": "2027-01-15T00:00:00+09:00", "_to": "2027-01-15T23:59:00+09:00"}
for n, t in (("B", B), ("C", C)):
    s, d = rpc(t, "calendar_reservations", DAY)
    others = [x for x in d if x["id"] in ids.split(",")]
    exp = {st[o]["res"] for o in "ABC" if o != n}
    check(f"{n}: 다른 직원 예약 시간 블록·공개 시술명·상태 표시", {x["id"] for x in others} == exp and all(x["public_service"] == "피부상담" and x["start_at"] and x["end_at"] and x["status"] for x in others), f"{len(others)}건")
    leaked = [k for x in others for k in ("customer_phone", "memo", "service", "category_id", "customer_no") if x.get(k)]
    check(f"{n}: 다른 직원 고객번호·연락처·메모·상세시술 비공개", not leaked and all("customer_id" not in x for x in others), ",".join(leaked))
    names = [x["customer_name"] for x in others if x.get("customer_name")]
    if n == "B":
        check("내부 B (고객명 허용): 다른 직원 예약 고객명 표시", len(names) == len(others), f"{len(names)}건")
    else:
        check("외부 C: 고객명 허용 템플릿이어도 다른 직원 고객명 비공개", names == [], f"{len(names)}건")
    for o in others:
        s, v = rpc(t, "customer_visit_history", {"_reservation": o["id"]})
        check(f"{n}: 방문 이력 권한 없이 다른 직원 고객 방문 이력 차단", v == [] or s >= 400, f"{len(v or [])}건")
        break

# 5. Customers / customer number / history isolation
for n, t, others in (("B", B, "AC"), ("C", C, "AB")):
    for o in others:
        s, d = get(t, f"customers?id=eq.{st[o]['cust']}")
        check(f"{n}: {o}의 고객 직접 조회 차단", d == [])
        s, d = get(t, f"customers?customer_no=eq.{st[o]['no']}")
        check(f"{n}: {o} 고객번호 No.{st[o]['no']} 검색 차단", d == [])
        s, d = get(t, f"customers?phone=eq.010-0000-000{'ABC'.index(o)+1}")
        check(f"{n}: {o} 고객 연락처 검색 차단", d == [])
        for tbl in ("reservation_history", "reservation_status_history"):
            s, d = get(t, f"{tbl}?reservation_id=eq.{st[o]['res']}")
            check(f"{n}: {o} 예약의 {'변경' if tbl=='reservation_history' else '상태'} 이력 차단", d == [])
        s, d = get(t, f"customer_category_tags?customer_id=eq.{st[o]['cust']}")
        check(f"{n}: {o} 고객 구분 태그 차단", d == [])
    s, d = get(t, f"customers?customer_no=eq.{st[n]['no']}&select=id")
    check(f"{n}: 본인 고객번호 검색 가능", len(d) == 1)

# 6. Linking someone else's customer to my reservation must not reveal it
s, d = post(C, "reservations?select=id", {"customer_id": st["B"]["cust"], "customer_name": "x", "service": "x", "public_service": "시술",
            "start_at": "2027-01-17T10:00:00+09:00", "end_at": "2027-01-17T11:00:00+09:00"})
s2, d2 = get(C, f"customers?id=eq.{st['B']['cust']}&select=name,phone,memo")
check("외부 C: 다른 직원 고객을 내 예약에 연결해 고객정보 열람 시도 차단", s >= 400 and d2 == [], f"등록 {s}, 노출 {len(d2)}건")
s, d = patch(C, f"reservations?id=eq.{st['C']['res']}&select=id", {"customer_id": st["A"]["cust"]})
s2, d2 = get(C, f"customers?id=eq.{st['A']['cust']}&select=name")
check("외부 C: 기존 예약 수정으로 다른 직원 고객 연결 차단", s >= 400 and d2 == [], f"수정 {s}, 노출 {len(d2)}건")
patch(C, f"reservations?id=eq.{st['C']['res']}", {"customer_id": st["C"]["cust"]})

# 7. Privilege escalation
s, d = patch(C, f"user_roles?user_id=eq.{me['C']}&select=role", {"role": "admin"})
check("외부 C: 스스로 관리자 되기 차단", d == [] or s >= 400)
s, d = post(B, "staff_view_scopes", {"user_id": me["B"], "scope": "all", "can_view_pii": True})
s2, d2 = patch(B, f"staff_view_scopes?user_id=eq.{me['B']}&select=scope", {"scope": "all", "can_view_pii": True})
check("내부 B: 스스로 열람 범위·개인정보 권한 올리기 차단", s >= 400 and (d2 == [] or s2 >= 400))
s, d = post(C, "reservation_view_grants", {"viewer_id": me["C"], "owner_id": me["B"]})
check("외부 C: 스스로 열람 허용 추가 차단", s >= 400)
s, d = patch(C, f"customers?id=eq.{st['B']['cust']}&select=id", {"memo": "hack"})
check("외부 C: 다른 직원 고객 수정 차단", d == [] or s >= 400)
s, d = rpc(C, "shared_reservations", {"_from": "2027-01-15T00:00:00+09:00", "_to": "2027-01-15T23:59:00+09:00"})
check("외부 C: 예전 공유 조회 함수로 상세 시술 열람 차단", s >= 400 or d == [], str(s))

# 8. Signed-out requests
for path in ("reservations?select=id&limit=1", "customers?select=id&limit=1", "reservation_history?select=id&limit=1"):
    s, d = get(None, path)
    check(f"로그인 없이 {path.split('?')[0]} 조회 차단", s >= 400 or d == [], str(s))
s, d = rpc(None, "calendar_reservations", {"_from": "2027-01-15T00:00:00+09:00", "_to": "2027-01-15T23:59:00+09:00"})
check("로그인 없이 캘린더 조회 차단", s >= 400 or d == [], str(s))

# 9. Cancel last (keeps record)
s, d = patch(C, f"reservations?id=eq.{st['C']['res']}&select=status", {"status": "cancelled", "cancel_reason": "QA4 취소 테스트"})
s2, d2 = get(C, f"reservation_status_history?reservation_id=eq.{st['C']['res']}&select=to_status")
check("외부 C: 본인 예약 취소 + 이력 보관", len(d) == 1 and d[0]["status"] == "cancelled" and any(x["to_status"] == "cancelled" for x in d2))
patch(A, f"reservations?id=eq.{st['C']['res']}", {"status": "confirmed"})  # admin restores for re-runs

# 10. Menu/field permissions: only admin changes them, changes apply on the next request, every change is logged
s, d = patch(B, f"staff_view_scopes?user_id=eq.{me['B']}&select=menus", {"menus": ["dashboard", "customers", "admin_staff"], "fields": ["phone", "memo"]})
check("내부 B: 스스로 메뉴·표시 권한 바꾸기 차단", d == [] or s >= 400)
s, d = get(B, "staff_permission_log?select=id&limit=1")
check("내부 B: 권한 변경 기록 열람 차단", d == [] or s >= 400)
s, d = get(A, f"staff_view_scopes?user_id=eq.{me['B']}&select=scope,menus,fields")
orig = d[0]
s, _ = patch(A, f"staff_view_scopes?user_id=eq.{me['B']}", {"fields": orig["fields"] + ["phone", "customerNo", "history"]})
s, d = rpc(B, "calendar_reservations", DAY)
o = [x for x in d if x["id"] == st["A"]["res"]][0]
check("관리자가 B에 연락처·고객번호 허용 → 다음 조회부터 바로 반영", o.get("customer_phone") == "010-0000-0001" and o.get("customer_no") == st["A"]["no"] and not o.get("memo"))
s, v = rpc(B, "customer_visit_history", {"_reservation": st["A"]["res"]})
check("방문 이력 허용 시 다른 직원 고객 방문 이력 표시", s == 200 and len(v) >= 1, f"{len(v or [])}건")
patch(A, f"staff_view_scopes?user_id=eq.{me['B']}", {"fields": orig["fields"]})
s, d = rpc(B, "calendar_reservations", DAY)
o = [x for x in d if x["id"] == st["A"]["res"]][0]
check("권한 되돌리면 다음 조회부터 다시 비공개", not o.get("customer_phone") and not o.get("customer_no"))
s, d = get(A, f"staff_permission_log?user_id=eq.{me['B']}&order=created_at.desc&limit=2&select=changed_by,old_data,new_data")
check("권한 변경 기록: 변경자·이전 권한·새 권한 저장", len(d) == 2 and d[0]["changed_by"] == me["A"] and d[0]["old_data"] and d[0]["new_data"])

json.dump(results, open("/tmp/results.json", "w"), ensure_ascii=False)
print("\nFAILED:", [r[1] for r in results if r[0] == "실패"])

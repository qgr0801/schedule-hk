"""Staff account management checks (fake QA4 accounts only).

Usage:
  python3 tests/rls/staff_account_mgmt.py pre   # role/profile write protection; saves C's token
  (deactivate 테스트외부C in the app)
  python3 tests/rls/staff_account_mgmt.py off   # C's still-open session and new sign-in are blocked; records kept
  (re-activate 테스트외부C in the app)
  python3 tests/rls/staff_account_mgmt.py on    # C works again
"""
import json, sys, requests

U = "https://urxnhvutlqwdqbuyeace.supabase.co"
K = "sb_publishable_cHR1yhA0yKn5m9rz8LU_EA_EPDi-T8e"
PW = "QaTest4!Schedule"
MODE = sys.argv[1] if len(sys.argv) > 1 else "pre"
TOK = "/tmp/qa4_c_token.json"
fails = []


def login(email):
    r = requests.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey": K}, json={"email": email, "password": PW})
    return r.json().get("access_token") if r.ok else None


def H(tok):
    return {"apikey": K, "Authorization": f"Bearer {tok}", "Content-Type": "application/json", "Prefer": "return=representation"}


def call(method, tok, path, body=None):
    r = requests.request(method, f"{U}/rest/v1/{path}", headers=H(tok), json=body)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, None


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name, detail)
    if not ok:
        fails.append(name)


def uid(tok):
    return requests.get(f"{U}/auth/v1/user", headers=H(tok)).json()["id"]


A = login("qa4-admin-a@demo-bsm.com")
ida = uid(A)

if MODE == "pre":
    B, C = login("qa4-internal-b@demo-bsm.com"), login("qa4-external-c@demo-bsm.com")
    idb, idc = uid(B), uid(C)
    s, d = call("PATCH", B, f"user_roles?user_id=eq.{idb}", {"role": "admin"})
    _, r = call("GET", B, f"user_roles?user_id=eq.{idb}&select=role")
    check("STAFF cannot make themselves ADMIN", r and r[0]["role"] == "internal", f"{s} {d}")
    s, d = call("PATCH", C, f"user_roles?user_id=eq.{idc}", {"role": "admin"})
    _, r = call("GET", C, f"user_roles?user_id=eq.{idc}&select=role")
    check("EXTERNAL cannot make themselves ADMIN", r and r[0]["role"] == "external", f"{s} {d}")
    s, d = call("POST", B, "user_roles", {"user_id": idb, "role": "admin"})
    check("STAFF cannot insert an ADMIN role row", s >= 400, f"{s}")
    s, d = call("PATCH", B, f"profiles?id=eq.{idb}", {"is_active": True, "full_name": "해킹"})
    check("staff cannot write their own profile (name / active flag)", s >= 400, f"{s}")
    s, d = call("PATCH", A, f"user_roles?user_id=eq.{ida}", {"role": "internal"})
    _, r = call("GET", A, f"user_roles?user_id=eq.{ida}&select=role")
    check("admin cannot demote themselves", s >= 400 and r[0]["role"] == "admin", f"{s} {d and d.get('message')}")
    s, d = call("PATCH", A, f"user_roles?user_id=eq.{idb}", {"role": "external"})
    s2, _ = call("PATCH", A, f"user_roles?user_id=eq.{idb}", {"role": "internal"})
    check("admin can change another staff role (and back)", s == 200 and s2 == 200, f"{s} {s2}")
    _, lg = call("GET", A, f"staff_permission_log?user_id=eq.{idb}&kind=eq.role&order=created_at.desc&limit=2")
    check("role changes are logged with the admin as changer", len(lg) == 2 and all(x["changed_by"] == ida for x in lg))
    _, lg = call("GET", B, "staff_permission_log?select=id&limit=1")
    check("STAFF cannot read the audit log", lg == [])
    _, r = call("GET", C, "reservations?select=id")
    check("C sees own reservations before deactivation", isinstance(r, list) and len(r) >= 1, f"{len(r)}")
    json.dump({"token": C, "id": idc, "own": len(r)}, open(TOK, "w"))

elif MODE == "off":
    st = json.load(open(TOK))
    C, idc = st["token"], st["id"]
    _, r = call("GET", C, "reservations?select=id")
    check("deactivated C: open session reads no reservations", r == [], str(r)[:80])
    _, r = call("GET", C, "customers?select=id")
    check("deactivated C: open session reads no customers", r == [], str(r)[:80])
    _, r = call("POST", C, "rpc/calendar_reservations", {"_from": "2026-01-01T00:00:00Z", "_to": "2027-12-31T00:00:00Z"})
    check("deactivated C: calendar blocks hidden", r == [], str(r)[:80])
    _, r = call("POST", C, "rpc/staff_directory", {})
    check("deactivated C: staff directory hidden", r == [], str(r)[:80])
    s, d = call("POST", C, "reservations", {"customer_name": "가상차단", "service": "보톡스", "public_service": "시술",
                                             "start_at": "2027-02-01T10:00:00+09:00", "end_at": "2027-02-01T11:00:00+09:00"})
    check("deactivated C: cannot create a reservation", s >= 400, f"{s}")
    check("deactivated C: new sign-in refused", login("qa4-external-c@demo-bsm.com") is None)
    _, r = call("GET", A, f"reservations?created_by=eq.{idc}&select=id,created_by")
    check("C's reservations are kept with C as creator", len(r) == st["own"], f"{len(r)}")
    _, lg = call("GET", A, f"staff_permission_log?user_id=eq.{idc}&kind=eq.account&order=created_at.desc&limit=1")
    check("deactivation is logged", lg and lg[0]["new_data"].get("is_active") is False and lg[0]["changed_by"] == ida)

elif MODE == "on":
    C = login("qa4-external-c@demo-bsm.com")
    check("re-activated C can sign in", C is not None)
    if C:
        _, r = call("GET", C, "reservations?select=id")
        check("re-activated C sees own reservations again", isinstance(r, list) and len(r) >= 1, f"{len(r)}")

print("FAILED:", fails)

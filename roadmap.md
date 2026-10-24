# Roadmap
- [x] DB schema + RLS
- [x] Login, dashboard, week/month calendar, reservation form, my reservations, staff permissions, admin all-reservations
- [x] Test RLS per role
- [x] Ask questions in Korean
- [x] Day view: 1–10 renamable sections with customer/staff shown
- [x] Colors & display: status colors, staff colors, 7 customer categories, card field settings, status buttons, customers page
- [x] Staff permissions: per-staff view scope 전체/본인; others' reservations show only status (예약현황) + service (시술항목)
- [x] Calendar visibility v2: everyone sees all blocks (time/section/public service/status); detail scope 전체/본인; separate PII permission; public service name; overlap by staff+section on server; admin setting for cancelled slot reuse; customer number search
- [x] 4차 직원 권한 테스트: 테스트 계정 A/B/C, 서버 직접 요청 55개 항목 (tests/rls/qa4_staff_permissions.py)
- [x] Staff permissions v3 (open: confirm template applies to all existing staff; customer name outside scope)
- [x] Calendar drag & drop (long-press not yet tested on a real phone)

## 시범 운영 준비 (no publish, no real data import without approval)
- [x] Login check for admin/internal/external test accounts
- [x] Menu + reservation permission check (qa4 script)
- [x] Drag move save + overlap prevention check
- [x] Signed-out access blocked (tables, RPCs)
- [x] Security scan + fixes (anon grants, staff emails hidden)
- [ ] Ahasoft Excel import: not built — user approved; waiting for blank template / fake-data sample file (no real data)
- [x] Backup/restore procedure explanation
- [x] Share/publish guidance (no publish)

## 모바일·태블릿 최적화 (uploaded spec)
- [x] Mobile bottom menu, large touch targets, rotation
- [x] Mobile calendar: day section dropdown + swipe date, week cards, month counts → day
- [x] Floating "예약 추가" button on mobile; vertical reservation form
- [x] "예약 이동" button (date/time/section) as drag fallback
- [x] Reservation card tap: 확정/완료/노쇼/취소/수정/이동 buttons
- [x] Mobile customers: search, register, visit history, 7 categories
- [x] PWA: home-screen manifest + icon; offline notice (no PII cache)
- [x] Device test report (unverified devices marked)

## 치명적 개인정보 경고 (Critical)
- [x] Cause found: profiles read rule open to all signed-in staff (staff e-mails) — e-mail column already blocked
- [x] Tighten profiles read to self/admin + name-only staff directory
- [x] Sign-up form removed from login page
- [ ] Server-side 'Disable sign-up' switch — user toggles in Cloud Users → Auth settings
- [x] Re-run scan and regression tests after approved changes

## Critical 재검토 (no blanket ignore)
- [x] List every table/policy in the remaining Critical; separate shared settings vs personal data
- [x] Probe PII exposure (customer name/no/phone/memo, staff PII) per role with fake data
- [x] Replace "everyone" read rules with a real staff-only rule where possible; keep booking features
- [x] Rescan and report whether Critical is gone

## 7일 시범 운영 준비 (2026-10-23~29, uploaded spec)
- [x] Trial mode + test-data flag; 10 fake customers + 15 fake reservations (10/23~29)
- [x] Staff invite by e-mail + set-own-password page + forgot password
- [x] Account activate/deactivate (sign-in ban)
- [x] Staff name change by admin (user question)
- [x] Trial feedback screen (admin)
- [x] Test-data badges + trial banner + trial-mode switch
- [x] Pre-release checks: dependency scan, quick/deep scan, signed-out block, per-role tests, mobile, backup guide
- [ ] Test-data reset: not built — only on admin request
- [x] Invite blank-screen diagnosis: site not published (link lands on 'Project not found'); account/role/menus OK
- [x] Invited-state fix + 설정 메일 다시 보내기 + /set-password → /calendar + no blank main area
- [ ] Publish (needs user approval) then resend setup mail to 아이스타; deep scan re-run

## 직원 목록 편집·삭제 및 관리자 1·2 (uploaded spec)
- [x] Staff list: search + role filter, columns (이름|이메일|역할|상태|열람 범위|메뉴|관리), 관리 modal with 4 tabs
- [x] Deactivate (sign-in ban + session revoke + data block) with audit log; bulk deactivate for selected
- [x] Safe delete: only accounts with no linked reservations/customers/logs, confirm dialog, never self/last admin
- [x] Invite: ADMIN role option (admin only), invite status (대기/수락/만료), resend, cancel
- [x] 관리자 1 / 관리자 2 (admin 2 = istarbeautylounge@gmail.com, promoted to ADMIN)
- [x] Server blocks self-promotion to ADMIN; regression tests

## 복원 스크립트 안전성 수정 (v2 ZIP, no real restore)
- [x] 04_restore_run.sh: explicit target project ID check + precheck ON_ERROR_STOP=1, stop on unexpected output
- [x] 02_target_precheck.sql: explicit STOP for failed/missing required checks
- [x] 90_post.sql: least-privilege default grants
- [x] Windows 10 / PostgreSQL 18 guide
- [x] Isolated fake-data test: restore, rollback, guard cases
- [x] New ZIP (schedule-hk-restore_v2.zip) differing from v1 + change report
- [ ] Real restore into schedule-hk-test — waiting for user approval

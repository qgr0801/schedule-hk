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
- [ ] Login check for admin/internal/external test accounts
- [ ] Menu + reservation permission check (qa4 script)
- [ ] Drag move save + overlap prevention check
- [ ] Signed-out access blocked (tables, RPCs)
- [ ] Security scan + fixes (anon grants, staff emails hidden)
- [ ] Ahasoft Excel import: check (not built yet → report)
- [ ] Backup/restore procedure explanation
- [ ] Share/publish guidance (no publish)

## 모바일·태블릿 최적화 (uploaded spec)
- [ ] Mobile bottom menu, large touch targets, rotation
- [ ] Mobile calendar: day section dropdown + swipe date, week cards, month counts → day
- [ ] Floating "예약 추가" button on mobile; vertical reservation form
- [ ] "예약 이동" button (date/time/section) as drag fallback
- [ ] Reservation card tap: 확정/완료/노쇼/취소/수정/이동 buttons
- [ ] Mobile customers: search, register, visit history, 7 categories
- [ ] PWA: home-screen manifest + icon; offline notice (no PII cache)
- [ ] Device test report (unverified devices marked)

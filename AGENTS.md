<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Role-based data access is enforced only by database RLS (has_role / can_view_owner security-definer helpers); UI checks are cosmetic. Why: the server must be the source of truth for staff permissions.
- Reservations are never deleted (no DELETE grant); cancellation is a status change and every insert/update is logged by trigger into reservation_history. Why: audit trail requirement.
- Double booking is blocked by gist exclusion constraints on treatment staff (COALESCE(staff_id, created_by)) and on section for non-cancelled rows, plus a trigger that also counts cancelled rows when booking_settings.cancelled_slot_reusable is false; the form warns live via find_overlaps(); the client maps 23P01 to Korean. Why: race-safe overlap prevention across all staff.
- No self sign-up: the login page is sign-in only and accounts are added by an admin (Cloud Users → Add user); new accounts default to external staff via the signup trigger and admins change roles in the staff screen. Why: a shared link must not grant calendar access.
- Day-view columns come from a fixed 10-slot day_sections table (position 1–10, active flag, admin-only update); reservations reference a slot by reservations.section. Why: renaming or hiding sections never breaks or deletes existing reservations.
- Card colors, staff colors, 7 fixed customer-category slots and per-view card fields live in admin-only settings tables; cards use background = status, left stripe = treatment staff (reservations.staff_id, null = creator), badge = customer category. Why: the three color signals never compete.
- Full reservation rows, history and customers are readable only by creator or admin (can_view_full). Every staff sees all other reservations only through the calendar_reservations() RPC: block level (time/section/public_service/status) for everyone, detailed service + category when can_view_owner allows (scope own/selected/all in staff_view_scopes), customer name/phone/memo only with staff_view_scopes.can_view_pii. Why: personal data never leaves the server without permission.
- Week and day calendar views share one TimeGrid component; drag math lives in pure helpers (src/lib/drag.ts) with tests, the client conflict check mirrors server rules, and every drop is re-checked with find_overlaps() and saved through the normal reservations UPDATE (RLS + history trigger). Why: one place for drag behaviour, server stays the authority.
- Signed-out visitors have no table grants and no EXECUTE on permission helpers; shared settings tables are readable only by active staff (is_active_staff()); profiles rows are readable only by self/admin (e-mail column also column-level revoked); every staff reads names through the staff_directory() RPC and admins get e-mails from staff_emails(). Why: staff and customer PII must never reach the browser without a server-side check.
- Mobile UI keeps one code path with desktop (same queries, same RLS); mobile-only affordances are a floating 예약 추가 button, swipe date change (useSwipe), and the 예약 이동 form in ReservationDialog as the drag fallback. PWA is manifest-only (no service worker), so nothing is cached offline. Why: identical permissions on PC and phone, no PII in device caches.
- Vulnerable transitive packages are fixed with exact pins in package.json "overrides" (patched release within the same major, never a major jump), keeping direct dependency versions unchanged; drop a pin once its parent package ships the fixed version. Why: minimal, reviewable security patches without framework upgrades.

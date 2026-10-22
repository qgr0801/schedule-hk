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
- Double booking is blocked by a gist exclusion constraint per creator on non-cancelled rows; the client maps error 23P01 to a Korean message. Why: race-safe overlap prevention.
- First signup becomes admin, later signups default to external staff; admins change roles in the staff screen. Why: safe default with least privilege.
- Day-view columns come from a fixed 10-slot day_sections table (position 1–10, active flag, admin-only update); reservations reference a slot by reservations.section. Why: renaming or hiding sections never breaks or deletes existing reservations.
- Card colors, staff colors, 7 fixed customer-category slots and per-view card fields live in admin-only settings tables; cards use background = status, left stripe = treatment staff (reservations.staff_id, null = creator), badge = customer category. Why: the three color signals never compete.
- Full reservation rows, history and customers are readable only by creator or admin (can_view_full); other staff's reservations allowed by can_view_owner (per-staff scope own/selected/all in staff_view_scopes) come only through the shared_reservations() RPC with time/status/service/section/staff columns. Why: privacy is enforced in the database, not by display settings.

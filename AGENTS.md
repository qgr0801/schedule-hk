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

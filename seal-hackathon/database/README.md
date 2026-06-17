# Database Setup

The SQL scripts target Microsoft SQL Server and use the database name
`SEAL_Hackathon_G06`.

## New Setup

Use this option when setting up the project for the first time or when existing
local data can be replaced.

Run the scripts in SQL Server Management Studio in this order:

1. `seal_hackathon.sql`
2. `seed_test_data.sql`

`seal_hackathon.sql` recreates the database. Do not run it when local data must
be preserved.

`seed_test_data.sql` now includes both the original demo accounts and the extra
test accounts for students, mentors, judges, and coordinators.

## Update Existing Database

Use this option when the database already exists and local data must be kept.

Run:

1. `team_management_migration.sql`

The migration adds:

- `Team.join_code`
- `TeamInvitation`
- `TR_TeamMember_ValidateRules`
- `TR_Submission_ValidateTeamSize`

## Team Management Rules

- Each team has one join code.
- A student may belong to at most one team in the same event.
- A team may contain at most five members.
- A submission requires a valid team with three to five members.

## Sample Accounts

After running `seed_test_data.sql`, all seeded accounts use:

```text
Password: Seal@2026
```

Use the `email` column below for login. `username` remains in the system only as profile data.

| Username | Email | Role |
| --- | --- | --- |
| `an.student` | `an.seal.demo@gmail.com` | Student |
| `linh.student` | `linh.seal.demo@gmail.com` | Student |
| `mai.student` | `mai.seal.demo@gmail.com` | Student |
| `toan.coordinator` | `toan.seal.demo@gmail.com` | Coordinator |
| `kiet.mentor` | `kiet.seal.demo@gmail.com` | Mentor |
| `ngon.judge` | `ngon.seal.demo@gmail.com` | Judge |

## Additional Test Accounts

`seed_test_data.sql` also includes these extra accounts with the same password:

```text
Password: Seal@2026
```

| Username | Email | Role |
| --- | --- | --- |
| `bao.student` | `bao.seal.demo@gmail.com` | Student |
| `quynh.student` | `quynh.seal.demo@gmail.com` | Student |
| `phuc.student` | `phuc.seal.demo@gmail.com` | Student |
| `nhat.student` | `nhat.seal.demo@gmail.com` | Student |
| `thao.student` | `thao.seal.demo@gmail.com` | Student |
| `lam.student` | `lam.seal.demo@gmail.com` | Student |
| `anh.coordinator` | `anh.seal.demo@gmail.com` | Coordinator |
| `vy.mentor` | `vy.seal.demo@gmail.com` | Mentor |
| `duc.mentor` | `duc.seal.demo@gmail.com` | Mentor |
| `hao.judge` | `hao.seal.demo@gmail.com` | Judge |
| `trinh.judge` | `trinh.seal.demo@gmail.com` | Judge |

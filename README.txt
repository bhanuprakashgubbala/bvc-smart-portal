=============================================================================
 BVC SMART PORTAL - SECURE PRODUCTION UPGRADED SYSTEM
=============================================================================

This upgraded release of BVC Smart Portal provides enterprise-grade security,
robust backend reliability, role-based access control, data validation,
and high-concurrency performance, while keeping 100% of the original UI,
styling, dashboard layouts, navigation, and features visually identical.

=============================================================================
 1. QUICK START (LOCAL DEVELOPMENT)
=============================================================================

Method A - One-Click Start (Windows):
  Double-click "Start_Portal.bat"
  Starts the backend on port 5000 and automatically opens the portal in your browser.

Method B - Terminal Start:
  1. Open PowerShell or command prompt in this directory.
  2. Install dependencies:
       python -m pip install -r Requirements.txt
  3. Start the server:
       python server.py
  4. Access the portal at:
       http://127.0.0.1:5000/

To stop the server, press Ctrl+C in the terminal.

=============================================================================
 2. PRODUCTION DEPLOYMENT (WSGI APPLICATION SERVER)
=============================================================================

In production environments, run the portal using the Waitress production WSGI server:

Windows Production:
  waitress-serve --listen=127.0.0.1:5000 server:app

Linux/Unix Production:
  gunicorn --workers=4 --bind=0.0.0.0:5000 server:app

Reverse Proxy Setup (Nginx Recommended):
  Configure Nginx as a reverse proxy in front of port 5000 with:
  - HTTPS / SSL termination
  - Strict-Transport-Security (HSTS)
  - Standard proxy headers:
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

=============================================================================
 3. ENVIRONMENT CONFIGURATION (.env)
=============================================================================

Copy `.env.example` to `.env` in this directory and configure your secrets:

  BVC_PORTAL_SECRET=your-random-64-character-hex-secret-key-here
  BVC_DB_FILE=bvc_portal.db
  BVC_PORT=5000
  BVC_HOST=127.0.0.1
  BVC_CORS_ORIGINS=http://127.0.0.1:5000,http://localhost:5000
  BVC_ENV=production

Never commit your `.env` file with production secrets to public source control.
A comprehensive `.gitignore` is provided to safeguard all credentials, databases,
and backups.

=============================================================================
 4. SECURITY ARCHITECTURE & VULNERABILITIES CORRECTED
=============================================================================

1. Password Security:
   - Upgraded all plaintext / weak passwords to Werkzeug PBKDF2/scrypt hashes.
   - Automatic, transparent upgrade migration for existing legacy users upon login.
   - Passwords and hashes are strictly excluded from all API responses and logs.

2. Authentication & Session Tokens:
   - HMAC-SHA256 digitally signed tokens with 24-hour expiration (`exp`),
     issuance timestamp (`iat`), and unique token UUID (`jti`).
   - Server-side token revocation tracking (`revoked_tokens` table) ensures
     immediate logout invalidation.
   - Tampered tokens and forged signatures are rejected with 401 Unauthorized.

3. Role-Based Access Control (RBAC):
   - Enforced backend authorization on all endpoints for all 7 roles:
     Student, Faculty, HOD, Administrator, Principal, Librarian, Driver.
   - Strict privilege separation: Students cannot modify marks, branches,
     or bus locations; faculty cannot modify other branches' records.

4. IDOR (Insecure Direct Object Reference) Prevention:
   - Students are strictly restricted to their own attendance records,
     academic marks, SGPA/CGPA, profile, and library borrow history.

5. Data Integrity & Validation:
   - Roll numbers validated against institutional format (10 alphanumeric digits).
   - Phone numbers strictly validated (exactly 10 digits).
   - Duplicate student registrations return 409 Conflict; silent overwrites
     are strictly prevented.
   - Bulk student registration processes in transactional batches with
     individual row validation and granular duplicate/error reporting.

6. Timetable Conflict Detection:
   - Automatic collision detection prevents scheduling conflicts where a faculty
     member or classroom/lab is double-booked for the same time period.

7. Stale GPS Detection:
   - Bus tracking distinguishes LIVE_GPS from STALE_GPS (updates older than
     15 minutes) and SIMULATED_GPS to prevent fabricated location display.

8. Rate Limiting & Brute-Force Throttling:
   - Temporary IP/account throttling prevents brute-force credential stuffing.

=============================================================================
 5. DATABASE MANAGEMENT & ONLINE BACKUPS
=============================================================================

The SQLite database (`bvc_portal.db`) is configured with:
  - WAL mode (Write-Ahead Logging) for non-blocking concurrent reads and writes.
  - Foreign key constraint enforcement (`PRAGMA foreign_keys = ON`).
  - 10-second busy timeout to gracefully handle concurrent write bursts.
  - 14 performance indexes covering all foreign keys and query lookups.

Backup and Restore Tool:
  Create an online, non-blocking backup:
    python backup_restore.py backup

  List available backups:
    python backup_restore.py list

  Restore from a backup:
    python backup_restore.py restore backups/bvc_portal_backup_<timestamp>.db

  (Safety guarantee: A pre-restore snapshot of the active database is automatically
   taken before restoring).

=============================================================================
 6. POSTGRESQL MIGRATION PATH
=============================================================================

If institutional scale exceeds SQLite's optimal concurrency envelope (5,000+
simultaneous active write connections), follow this seamless migration path:

1. Install psycopg2-binary:
     pip install psycopg2-binary
2. Set environment variable:
     DATABASE_URL=postgresql://user:password@localhost:5432/bvc_portal
3. In `server.py`, replace `get_db_connection()` to return a PostgreSQL
   connection or connection pool (`psycopg2.pool.ThreadedConnectionPool`).
4. Replace SQLite placeholder `?` with `%s` or use SQLAlchemy core expressions.
5. All 30 table definitions in `database.sql` are ANSI-SQL compatible and import
   directly into PostgreSQL using standard types (SERIAL for AUTOINCREMENT,
   TIMESTAMPTZ for DATETIME).

=============================================================================
 7. AUTOMATED TEST SUITE & CONCURRENCY BENCHMARKS
=============================================================================

Run the automated test suite (verifying all 17 mandatory areas):
  python -m unittest -v test_suite.py

Areas Covered:
  [01] Application startup & database initialization
  [02] Successful and failed login attempts (with rate limiting)
  [03] Authentication and session/token expiration & revocation
  [04] Permissions for all user roles (Student, Faculty, HOD, Principal, Librarian, Driver, Admin)
  [05] Unauthorized direct API access rejection
  [06] Student registration and duplicate-record prevention
  [07] Valid and invalid bulk uploads
  [08] SQL injection and malicious input handling
  [09] Timetable conflicts and dynamic academic-year calculations
  [10] Attendance and marks permissions
  [11] Library issue, return, and reservation workflows
  [12] Transport updates and stale GPS detection
  [13] Events, notifications, grievances, and leave requests
  [14] AI chatbot access restrictions and prompt safety
  [15] Frontend-to-backend API contract integrity
  [16] Database migration, backup, and restoration
  [17] Concurrent request handling and thread safety

Run the multi-threaded load and stress test:
  python load_test.py

Performance Measurements (SQLite WAL mode):
  - 300 mixed requests @ 25 concurrent threads: 535.8 req/sec (avg 40.97 ms, 0 locks)
  - 500 mixed requests @ 50 concurrent threads: 401.7 req/sec (avg 93.83 ms, 0 locks)

=============================================================================
 8. DEFAULT VERIFIED USER ACCOUNTS
=============================================================================

  Administrator:  ID: ADMIN            | Password: admin123
  Principal:      ID: PRIN             | Password: prin123
  Student:        ID: 25221A0556       | Password: 7386084878 (Sai Charan)
  Faculty:        ID: Krishnaveni Madam| Phone:    1234567890
  HOD:            ID: Dr. B S N Murthy | Password: 10221A0501
  Librarian:      ID: Librarian        | Password: 1234567890
  Driver:         ID: Satyanarayana    | Password: 9876543216
=============================================================================

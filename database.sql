-- =============================================================
-- BVC ENGINEERING COLLEGE - UNIFIED ENTERPRISE DATABASE SCHEMA 
-- =============================================================

-- 1. USERS & ROLES (UPGRADED WITH REGISTRATION & BRANCH FIELDS)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    password TEXT,
    email TEXT UNIQUE,
    branch TEXT,
    section TEXT,
    year_of_study INTEGER
);

-- 1.5 DYNAMIC BRANCHES (NEW FEATURE)
CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_code TEXT UNIQUE NOT NULL,
    branch_name TEXT NOT NULL
);

-- 2. TIMETABLE
CREATE TABLE IF NOT EXISTS timetable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    day TEXT NOT NULL,
    period INTEGER NOT NULL,
    subject TEXT NOT NULL,
    faculty_name TEXT NOT NULL,
    room TEXT NOT NULL
);

-- 3. EVENTS
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    venue TEXT NOT NULL,
    organizer TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS event_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    reg_no TEXT NOT NULL,
    domain TEXT NOT NULL,
    pitch_info TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, reg_no)
);

-- 4. LIBRARY
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    status TEXT DEFAULT 'Available',
    issued_to TEXT,
    fine INTEGER DEFAULT 0
);

-- 5. BUS TRACKING
CREATE TABLE IF NOT EXISTS buses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_no TEXT UNIQUE NOT NULL,
    route TEXT NOT NULL,
    total_seats INTEGER NOT NULL,
    filled_seats INTEGER DEFAULT 0,
    status TEXT DEFAULT 'STOPPED',
    driver_name TEXT NOT NULL,
    distance_remaining REAL DEFAULT 5.0,
    speed INTEGER DEFAULT 0
);

-- 6. RESULTS
CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no TEXT NOT NULL,
    semester TEXT NOT NULL,
    subject_code TEXT NOT NULL,
    subject TEXT NOT NULL,
    internal_marks INTEGER,
    external_marks INTEGER,
    total INTEGER,
    grade TEXT NOT NULL,
    grade_point REAL,
    credits INTEGER,
    status TEXT NOT NULL
);

-- 7. NOTIFICATIONS (MARQUEE PIPELINE)
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_tag TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. CAMPUS DIRECTORY (For AI Grounding)
CREATE TABLE IF NOT EXISTS directory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    designation TEXT NOT NULL,
    department TEXT NOT NULL,
    location TEXT NOT NULL,
    contact TEXT NOT NULL
);

-- 9. LEAVE REQUESTS (UPGRADED MULTI-TIER WORKFLOW: Student -> Class Teacher -> HOD)
CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    is_student_req BOOLEAN,
    requester TEXT NOT NULL,
    reg_no TEXT,
    branch TEXT,
    section TEXT,
    teacher TEXT,
    hod_name_assigned TEXT,
    type TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    date_requested TEXT,
    status TEXT DEFAULT 'Pending with Class Teacher',
    stu_signature TEXT,
    ct_signature TEXT,
    hod_signature TEXT,
    prin_signature TEXT,
    sub_signature TEXT,
    substitute TEXT,
    assignments TEXT,
    designation TEXT,
    department TEXT,
    prefix_suffix TEXT,
    leave_from TEXT,
    leave_to TEXT,
    ct_remarks TEXT,
    hod_remarks TEXT
);

-- ==========================================
-- INSERTING REQUIRED INITIAL DEMO DATA
-- ==========================================

-- 0. INITIAL BRANCH DATA (NEW)
INSERT OR IGNORE INTO branches (branch_code, branch_name) VALUES 
('CSE', 'Computer Science and Engineering'),
('ECE', 'Electronics and Communication Engineering'),
('EEE', 'Electrical and Electronics Engineering'),
('Civil', 'Civil Engineering'),
('Mechanical', 'Mechanical Engineering'),
('Science and Humanities', 'Science and Humanities'),
('AIML', 'Artificial Intelligence and Machine Learning'),
('AIDS', 'Artificial Intelligence and Data Science'),
('IT', 'Information Technology');

-- 1. Required Initial HODs (Assigned to Branches with 10-digit Register Numbers & Login Passwords)
INSERT OR REPLACE INTO users (reg_no, name, phone, role, password, email, branch) VALUES 
('10221A0501', 'Dr. B S N Murthy', '9493276456', 'hod', '10221A0501', 'bsnmurthy@bvcgroup.in', 'CSE'),
('10221A0401', 'Dr. Thoram Saran Kumar', '9493276457', 'hod', '10221A0401', 'thoramsaran@bvcgroup.in', 'ECE'),
('10221A0201', 'Dr. Samvanab Srikanth', '9493276458', 'hod', '10221A0201', 'samvanabsrikanth@bvcgroup.in', 'EEE'),
('10221A0101', 'Dr. Korakuti Hanumanthu', '9493276459', 'hod', '10221A0101', 'korakutihanumanthu@bvcgroup.in', 'Civil'),
('10221A0301', 'Dr. M. Nevven Srinivas', '9493276460', 'hod', '10221A0301', 'mnevvensrinivas@bvcgroup.in', 'Mechanical'),
('10221A0901', 'Mrs. Adapa Durga Madhuri', '9493276461', 'hod', '10221A0901', 'adapadurgamadhuri@bvcgroup.in', 'Science and Humanities');

-- 2. Registered Student (Auto-detected 2nd Year, institutional email)
INSERT OR REPLACE INTO users (reg_no, name, phone, role, password, email, branch, section, year_of_study) VALUES 
('25221A0556', 'Sai Charan', '9876543210', 'student', '9876543210', '25221A0556@bvcgroup.in', 'CSE', 'CSE-A', 2);

-- 3. Core Administrative & Role Accounts
INSERT OR REPLACE INTO users (reg_no, name, phone, role, password, email, branch) VALUES 
('ADMIN', 'Admin User', '0000000000', 'admin', 'admin123', 'admin@bvcgroup.in', NULL),
('PRIN001', 'Dr. A. Rama Rao', '8888888888', 'principal', 'prin123', 'principal@bvcgroup.in', NULL),
('LIB001', 'Librarian User', '1111111111', 'librarian', 'lib123', 'lib@bvcgroup.in', NULL),
('DRV001', 'Driver Raju', '2222222222', 'driver', 'drv123', 'drv@bvcgroup.in', NULL),
('FAC001', 'Krishnaveni Madam', '1234567890', 'faculty', '1234567890', 'krishnaveni@bvcgroup.in', 'CSE');

-- 4. Initial Timetable Data
INSERT INTO timetable (section, day, period, subject, faculty_name, room) VALUES 
('CSE-A', 'Monday', 1, 'OOPS', 'Krishnaveni Madam', 'Block-A 201'),
('CSE-A', 'Monday', 2, 'UHV', 'M Raju Sir', 'Block-A 201'),
('CSE-A', 'Monday', 3, 'Data Structures', 'Rao Sir', 'Block-A 202'),
('ECE-B', 'Tuesday', 1, 'Signals', 'Reddy Sir', 'Block-B 101');

-- 5. Events Data
INSERT INTO events (title, category, date, venue, organizer, description) VALUES 
('Smart India Hackathon 2026', 'Technical Hackathon', '2026-12-01', 'Online / Nodal Centers', 'Govt of India (MoE)', 'World''s biggest open innovation model. Solve complex real-world challenges faced by government and industry.'),
('Google Build for AI', 'AI/ML Hackathon', '2026-11-15', 'Virtual', 'Google Developers', 'A global hackathon to build generative AI solutions using Gemini APIs and Google Cloud platforms.'),
('ETHGlobal Web3 Summit', 'Blockchain/Web3', '2026-10-30', 'Online', 'ETHGlobal', 'Build decentralized applications (dApps), smart contracts, and Web3 infrastructure over a 72-hour sprint.');

-- 6. Books Data
INSERT INTO books (isbn, title, author, status, fine) VALUES 
('978-0132350884', 'Clean Code', 'Robert C. Martin', 'Available', 0),
('978-1593279288', 'Python Crash Course', 'Eric Matthes', 'Available', 0),
('978-0199566324', 'Engineering Physics', 'Gaur Gupta', 'Issued', 50);

-- 7. Buses Data
INSERT OR REPLACE INTO buses (bus_no, route, total_seats, driver_name) VALUES 
('BUS-01', 'Route 1: Kakinada -> Odalarevu', 50, 'Driver Raju'),
('BUS-02', 'Route 2: Amalapuram -> Odalarevu', 60, 'Driver Srinu');

-- 8. Results Data
INSERT INTO results (reg_no, semester, subject_code, subject, internal_marks, external_marks, total, grade, grade_point, credits, status) VALUES 
('25221A0556', '1-1', 'MAT101', 'Mathematics-I', 25, 60, 85, 'A', 8.5, 3, 'PASS'),
('25221A0556', '1-1', 'PHY101', 'Physics', 22, 63, 85, 'B+', 8.5, 3, 'PASS'),
('25221A0556', '1-2', 'CS102', 'Data Structures', 28, 65, 93, 'O', 10.0, 4, 'PASS');

-- 9. Notifications Data
INSERT INTO notifications (category_tag, message) VALUES 
('🚨 EMERGENCY', 'Cyclone warning: College will remain closed tomorrow.'),
('📝 EXAM NOTICE', 'Mid-Term Examinations for II B.Tech will commence next week.'),
('🎉 EVENT', 'TechnoFest 2026 early bird registration ends today!');

-- 10. Directory Data
INSERT INTO directory (name, designation, department, location, contact) VALUES 
('Dr. A. Rama Rao', 'Principal', 'Admin', 'Main Block, Ground Floor', 'principal@bvc.edu'),
('Dr. B S N Murthy', 'HOD', 'CSE', 'Block-A, 1st Floor', 'hodcse@bvc.edu'),
('Dr. Thoram Saran Kumar', 'HOD', 'ECE', 'Block-B, 1st Floor', 'hodece@bvc.edu'),
('Krishnaveni Madam', 'Asst Professor', 'CSE', 'Block-A, Staff Room 2', 'krishnaveni@bvc.edu'),
('Examination Cell', 'Office', 'Admin', 'Main Block, Room 10', 'exams@bvc.edu'),
('Canteen', 'Facility', 'Campus', 'Behind Block-B', 'N/A'),
('Central Library', 'Facility', 'Library', 'Main Block, 2nd Floor', 'lib@bvc.edu');

-- TRANSPORT SYSTEM UPGRADE

CREATE TABLE IF NOT EXISTS bus_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id TEXT UNIQUE NOT NULL,
    route_name TEXT NOT NULL,
    start_point TEXT,
    destination TEXT,
    distance_km REAL,
    is_active BOOLEAN DEFAULT 1
);
CREATE TABLE IF NOT EXISTS bus_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id TEXT NOT NULL,
    stop_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    stop_order INTEGER NOT NULL,
    FOREIGN KEY(route_id) REFERENCES bus_routes(route_id)
);
CREATE TABLE IF NOT EXISTS bus_trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_no TEXT NOT NULL,
    driver_name TEXT,
    route_id TEXT,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    status TEXT DEFAULT 'ACTIVE',
    total_distance REAL DEFAULT 0,
    average_speed REAL DEFAULT 0,
    max_speed REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bus_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER,
    bus_no TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    speed REAL,
    heading REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bus_pickup_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_reg TEXT NOT NULL,
    bus_no TEXT NOT NULL,
    stop_name TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    request_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bus_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_no TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_resolved BOOLEAN DEFAULT 0
);
-- 11. LIBRARY ENHANCEMENTS
CREATE TABLE IF NOT EXISTS book_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS book_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    reg_no TEXT NOT NULL,
    requested_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS digital_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    department TEXT,
    file_url TEXT NOT NULL,
    resource_type TEXT,
    download_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS borrow_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    reg_no TEXT NOT NULL,
    issue_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATETIME,
    return_date DATETIME,
    fine_calculated INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Issued'
);
-- Functional notification / workflow extensions (safe on fresh installs; server migration also creates them)
CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id INTEGER NOT NULL,
    reg_no TEXT NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(notification_id, reg_no)
);

CREATE TABLE IF NOT EXISTS placement_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    reg_no TEXT NOT NULL,
    status TEXT DEFAULT 'Applied',
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company, reg_no)
);

CREATE TABLE IF NOT EXISTS grievances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no TEXT,
    name TEXT,
    role TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'Open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch TEXT NOT NULL,
    year INTEGER NOT NULL,
    section TEXT NOT NULL,
    faculty_reg_no TEXT NOT NULL,
    faculty_name TEXT NOT NULL,
    faculty_phone TEXT,
    assigned_by TEXT,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch, year, section)
);

CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    ach_date TEXT,
    category TEXT,
    file_name TEXT,
    file_mime TEXT,
    file_data TEXT,
    stage TEXT DEFAULT 'CT',
    status TEXT DEFAULT 'Pending with Class Teacher',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievement_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    achievement_id INTEGER NOT NULL,
    stage TEXT,
    action TEXT,
    actor_name TEXT,
    actor_reg TEXT,
    actor_role TEXT,
    remarks TEXT,
    at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no TEXT NOT NULL,
    subject TEXT,
    total_classes INTEGER DEFAULT 0,
    attended_classes INTEGER DEFAULT 0,
    branch TEXT,
    section TEXT,
    year_of_study INTEGER,
    date DATE,
    marked_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    role TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti TEXT PRIMARY KEY,
    revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    last_attempt DATETIME,
    locked_until DATETIME
);

CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- ==========================================
-- PERFORMANCE & INTEGRITY INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_users_reg_no ON users(reg_no);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch_sec ON users(branch, year_of_study, section);
CREATE INDEX IF NOT EXISTS idx_results_reg_no ON results(reg_no, semester);
CREATE INDEX IF NOT EXISTS idx_attendance_reg_no ON attendance(reg_no);
CREATE INDEX IF NOT EXISTS idx_timetable_sec ON timetable(section, day, period);
CREATE INDEX IF NOT EXISTS idx_leave_reg_no ON leave_requests(reg_no);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_ach_reg_no ON achievements(reg_no);
CREATE INDEX IF NOT EXISTS idx_ach_stage ON achievements(stage, status);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_buses_bus_no ON buses(bus_no);
CREATE INDEX IF NOT EXISTS idx_notif_reads ON notification_reads(notification_id, reg_no);
CREATE INDEX IF NOT EXISTS idx_placements_reg ON placement_applications(reg_no);


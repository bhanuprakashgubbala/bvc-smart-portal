"""
BVC SMART PORTAL - SECURE DATABASE BACKUP & RESTORE UTILITY
Uses SQLite's native online backup API to ensure 100% consistent snapshots
even while the application is actively serving requests.

Usage:
    python backup_restore.py backup
    python backup_restore.py restore <backup_file_path>
    python backup_restore.py list
"""
import sqlite3
import os
import sys
import glob
from datetime import datetime

DB_FILE = os.environ.get('BVC_DB_FILE', 'bvc_portal.db')
BACKUP_DIR = 'backups'

def ensure_backup_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)

def backup_database():
    ensure_backup_dir()
    if not os.path.exists(DB_FILE):
        print(f"[ERROR] Database file '{DB_FILE}' not found.")
        return False

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(BACKUP_DIR, f"bvc_portal_backup_{timestamp}.db")

    print(f"[*] Starting online backup of '{DB_FILE}'...")
    src = sqlite3.connect(DB_FILE, timeout=15.0)
    dst = sqlite3.connect(backup_path)

    try:
        with dst:
            src.backup(dst, pages=100)
        size_kb = os.path.getsize(backup_path) / 1024
        print(f"[SUCCESS] Consistent backup created: {backup_path} ({size_kb:.1f} KB)")
        return backup_path
    except Exception as e:
        print(f"[ERROR] Backup failed: {e}")
        if os.path.exists(backup_path):
            os.remove(backup_path)
        return False
    finally:
        dst.close()
        src.close()

def restore_database(backup_path):
    if not os.path.exists(backup_path):
        print(f"[ERROR] Backup file '{backup_path}' does not exist.")
        return False

    # Verify backup is a valid SQLite database
    try:
        test_conn = sqlite3.connect(backup_path)
        test_conn.execute("SELECT COUNT(*) FROM users").fetchone()
        test_conn.close()
    except Exception as e:
        print(f"[ERROR] Backup file validation failed: {e}")
        return False

    # Create safety snapshot of current DB before restoring
    print("[*] Creating pre-restore safety snapshot of current database...")
    safety_snap = backup_database()

    print(f"[*] Restoring '{backup_path}' to '{DB_FILE}'...")
    src = sqlite3.connect(backup_path)
    dst = sqlite3.connect(DB_FILE, timeout=15.0)

    try:
        with dst:
            src.backup(dst, pages=100)
        print(f"[SUCCESS] Database '{DB_FILE}' restored successfully from '{backup_path}'.")
        return True
    except Exception as e:
        print(f"[ERROR] Restore failed: {e}")
        return False
    finally:
        dst.close()
        src.close()

def list_backups():
    ensure_backup_dir()
    files = sorted(glob.glob(os.path.join(BACKUP_DIR, "bvc_portal_backup_*.db")), reverse=True)
    if not files:
        print("[INFO] No backup files found in 'backups/' directory.")
        return

    print(f"[INFO] Available Backups ({len(files)}):")
    for f in files:
        size_kb = os.path.getsize(f) / 1024
        mtime = datetime.fromtimestamp(os.path.getmtime(f)).strftime('%Y-%m-%d %H:%M:%S')
        print(f"  - {f} | {size_kb:.1f} KB | Created: {mtime}")

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] == 'backup':
        backup_database()
    elif args[0] == 'list':
        list_backups()
    elif args[0] == 'restore':
        if len(args) < 2:
            print("Usage: python backup_restore.py restore <backup_file>")
        else:
            restore_database(args[1])
    else:
        print("Unknown command. Valid commands: backup, restore <path>, list")

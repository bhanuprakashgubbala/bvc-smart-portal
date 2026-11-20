# -*- mode: python ; coding: utf-8 -*-
# Builds the desktop package from the REAL backend (server.py) via the app.py launcher.

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[('index.html', '.'), ('style.css', '.'), ('app.js', '.'), ('sw.js', '.'), ('upgrades.js', '.'), ('upgrades.css', '.'), ('portal_features.js', '.'),
           ('bvc_portal.db', '.'), ('timetable_db.json', '.'), ('knowledge_base.json', '.'),
           ('database.sql', '.')],
    hiddenimports=['server', 'flask_cors'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='BVC Portal',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='BVC Portal',
)

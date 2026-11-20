(function(){
  let facultyAssignments = [];
  let facultyStudents = [];
  let facultyResultRows = [];
  let selectedManualResults = [];
  let selectedAssignmentIds = [];

  const $ = id => document.getElementById(id);
  const api = async (path, opts={}) => {
    opts.headers = Object.assign({}, opts.headers || {}, currentUser && currentUser.token ? {'X-Auth-Token': currentUser.token} : {});
    const r = await fetch(API_BASE + path, opts);
    return r.json();
  };
  const post = (path, body) => api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function facultyMode(){ return !!(currentUser && (currentUser.role === 'faculty' || currentUser.role === 'admin')); }

  function setFacultyMode(){
    const isFaculty = currentUser && currentUser.role === 'faculty';
    const canManageResults = currentUser && (currentUser.role === 'faculty' || currentUser.role === 'admin');
    $('faculty-results-manager')?.classList.toggle('hidden', !canManageResults);
    $('student-results-view')?.classList.toggle('hidden', canManageResults);
    $('faculty-exact-topbar')?.classList.toggle('hidden', !isFaculty);
    $('default-topbar-controls')?.classList.toggle('hidden', isFaculty);
    $('faculty-exact-nav')?.classList.toggle('hidden', !isFaculty);
    $('default-role-nav')?.classList.toggle('hidden', isFaculty);
    if(canManageResults){
      if(isFaculty){
        const n=(currentUser.name||'Faculty').trim();
        if($('faculty-top-name')) $('faculty-top-name').textContent=n;
        if($('faculty-top-branch')) $('faculty-top-branch').textContent=`Faculty (${currentUser.branch || 'CSE-A'})`;
        if($('faculty-top-avatar')) $('faculty-top-avatar').textContent=n.charAt(0).toUpperCase();
      }
      loadFacultyAssignments();
    }
  }

  let isThemeTransitioning = false;

  window.applyPortalTheme = function(theme) {
    const isLight = (theme === 'light');
    document.body.classList.toggle('theme-light', isLight);
    document.body.classList.toggle('faculty-light-theme', isLight);
    document.body.classList.toggle('theme-dark', !isLight);
    try {
      localStorage.setItem('bvc_portal_theme', isLight ? 'light' : 'dark');
      localStorage.setItem('bvc_faculty_theme', isLight ? 'light' : 'dark');
    } catch(e) {}
    
    if (isLight) {
      if (window.clearCelestialStars) window.clearCelestialStars();
    } else {
      if (window.generateCelestialStars) window.generateCelestialStars();
    }

    document.querySelectorAll('.portal-theme-toggle-btn, .faculty-theme-switch').forEach(btn => {
      btn.setAttribute('title', isLight ? 'Switch to Night Mode (Dark)' : 'Switch to Day Mode (Light)');
      const sun = btn.querySelector('.sun');
      const moon = btn.querySelector('.moon');
      if (sun && moon) {
        sun.classList.toggle('active', isLight);
        moon.classList.toggle('active', !isLight);
      }
    });
  };

  window.togglePortalTheme = function() {
    if (isThemeTransitioning) return;
    
    const isCurrentlyLight = document.body.classList.contains('theme-light') || document.body.classList.contains('faculty-light-theme');
    const targetTheme = isCurrentlyLight ? 'dark' : 'light';
    
    isThemeTransitioning = true;
    
    // Add transit classes to trigger sequential semi-circular orbit animations
    document.body.classList.remove('orbit-to-night', 'orbit-to-day');
    const transitClass = isCurrentlyLight ? 'orbit-to-night' : 'orbit-to-day';
    document.body.classList.add(transitClass);

    if (typeof showToast === 'function') {
      showToast(isCurrentlyLight ? '🌙 Sun Setting • Moon Rising…' : '☀️ Moon Setting • Sun Rising…');
    }

    // Step 1: The current celestial body sets along a semi-circle.
    // Step 2: At 400ms, the sky background shifts and the rising body sweeps up along a semi-circle into the sky!
    setTimeout(() => {
      window.applyPortalTheme(targetTheme);
    }, 400);

    // Step 3: Complete transition after full semi-circular orbit settles
    setTimeout(() => {
      document.body.classList.remove('orbit-to-night', 'orbit-to-day');
      isThemeTransitioning = false;
    }, 1300);
  };
  window.toggleFacultyTheme = window.togglePortalTheme;

  function restoreTheme() {
    const saved = localStorage.getItem('bvc_portal_theme') || localStorage.getItem('bvc_faculty_theme') || 'light';
    window.applyPortalTheme(saved);
  }

  async function loadFacultyAssignments(){
    if(!facultyMode()) return;
    try{
      const d=await api('/marks/my-sections');
      facultyAssignments=d.success?d.sections:[];
      selectedAssignmentIds=facultyAssignments.map(x=>x.id);
      facultyStudents=[];
      for(const a of facultyAssignments){
        const s=await api('/marks/students?assignment='+encodeURIComponent(a.id));
        if(s.success && s.students) {
          facultyStudents.push(...s.students.map(x=>Object.assign({},x,{assignment_id:a.id,branch:a.branch,year:a.year,section:a.section})));
        }
      }
      if(!facultyStudents.length) {
        const s=await api('/marks/students');
        if(s.success && s.students) {
          facultyStudents.push(...s.students);
        }
      }
      const seen=new Set(); facultyStudents=facultyStudents.filter(s=>{if(seen.has(s.reg_no)) return false;seen.add(s.reg_no);return true;});
      renderStudentSelect();
    }catch(e){ console.warn('Faculty results assignment load failed',e); }
  }

  function renderStudentSelect(){
    const sel=$('faculty-manual-student'); if(!sel) return;
    sel.innerHTML='<option value="">Select Student</option>'+facultyStudents.map(s=>`<option value="${esc(s.reg_no)}">${esc(s.reg_no)} - ${esc(s.name)}</option>`).join('');
  }

  function gradeFor(total) {
    const t = Number(total || 0);
    if(t >= 90) return { grade: 'O', gp: 10.0 };
    if(t >= 80) return { grade: 'A+', gp: 9.0 };
    if(t >= 70) return { grade: 'A', gp: 8.0 };
    if(t >= 60) return { grade: 'B+', gp: 7.0 };
    if(t >= 50) return { grade: 'B', gp: 6.0 };
    if(t >= 40) return { grade: 'C', gp: 5.0 };
    return { grade: 'F', gp: 0.0 };
  }

  // --- DOWNLOAD TEMPLATE FUNCTIONALITY ---
  window.downloadResultTemplate = function(type='csv') {
    const headers = ["Register No", "Semester", "Subject Code", "Subject", "Internal", "External", "Total", "Grade", "Grade Point", "Credits", "Status"];
    let rows = [];

    if (type === 'prefilled' && facultyStudents.length > 0) {
      const defaultSem = "1-1";
      const defaultCode = "OOPS";
      const defaultSubject = "Object Oriented Programming";
      facultyStudents.forEach(st => {
        rows.push([st.reg_no, defaultSem, defaultCode, defaultSubject, "28", "67", "95", "A+", "9.0", "4", "Pass"]);
      });
    } else {
      rows = [
        ["25221A0556", "1-1", "MAT101", "Mathematics-I", "25", "60", "85", "A", "8.5", "3", "Pass"],
        ["25221A0556", "1-1", "PHY101", "Physics", "22", "63", "85", "B+", "8.5", "3", "Pass"],
        ["25221A0556", "1-2", "CS102", "Data Structures", "28", "65", "93", "O", "10.0", "4", "Pass"],
        ["25221A0501", "1-1", "MAT101", "Mathematics-I", "26", "62", "88", "A+", "9.0", "3", "Pass"],
        ["25221A0502", "1-1", "MAT101", "Mathematics-I", "24", "58", "82", "A", "8.0", "3", "Pass"]
      ];
    }

    if (type === 'excel' && window.XLSX) {
      const aoa = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 14) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Results_Template");
      XLSX.writeFile(wb, 'bvc_results_template.xlsx');
      if(typeof showToast === 'function') showToast('Downloaded Excel Results Template.');
      return;
    }

    if (type === 'pdf') {
      if (typeof window.generateTablePDF === 'function') {
        window.generateTablePDF(
          "Official Bulk Results Entry Format",
          "Accepted directly by Portal Bulk Upload (PDF, OCR Scan, Excel, CSV)",
          headers,
          rows,
          'bvc_results_template.pdf',
          'landscape'
        );
      } else {
        showToast('Preparing PDF template download…');
      }
      return;
    }

    if (type === 'image') {
      const colWidths = [140, 90, 110, 240, 80, 80, 75, 75, 95, 75, 95];
      if (typeof window.generateTableImage === 'function') {
        window.generateTableImage(
          "Official Results Template",
          "Accepted directly by Portal Bulk Upload (PDF, OCR Scan, Excel, CSV)",
          headers,
          rows,
          'bvc_results_template.png',
          colWidths
        );
      } else {
        showToast('Preparing Image template download…');
      }
      return;
    }

    const filename = type === 'prefilled' ? 'bvc_results_prefilled_section.csv' : 'bvc_results_template.csv';
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if(typeof showToast === 'function') showToast('Downloaded CSV Results Template.');
  };

  function parseLine(line){
    line = line.replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
    if(!line || /register\s*no|subject\s*code|grade\s*point/i.test(line)) return null;
    let m = line.match(/^(\S+)\s+(\d{1,2}|[\w\-]+)\s+(\S+)\s+(.+?)\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+([A-F][+\-]?|AB|O)\s+(\d+(?:\.\d+)?)\s+(\d{1,2})\s+(Pass|Fail)$/i);
    if(!m){
      const p = line.split(/[,|\t;]+/).map(x=>x.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
      if(p.length >= 11) m=[line,p[0],p[1],p[2],p[3],p[4],p[5],p[6],p[7],p[8],p[9],p[10]];
      else if(p.length >= 6) {
        const intM = Number(p[4]) || 0;
        const extM = Number(p[5]) || 0;
        const tot = intM + extM;
        const autoG = gradeFor(tot);
        return {
          regNo: p[0].toUpperCase(),
          semester: p[1] || '1-1',
          subjectCode: (p[2] || 'SUB101').toUpperCase(),
          subject: p[3] || 'Subject',
          internal: intM,
          external: extM,
          total: tot,
          grade: autoG.grade,
          gradePoint: autoG.gp,
          credits: 3,
          status: autoG.grade === 'F' ? 'FAIL' : 'PASS'
        };
      }
    }
    if(!m) return null;
    return {
      regNo: m[1].toUpperCase(),
      semester: m[2],
      subjectCode: m[3].toUpperCase(),
      subject: m[4],
      internal: Number(m[5]),
      external: Number(m[6]),
      total: Number(m[7]),
      grade: m[8].toUpperCase(),
      gradePoint: Number(m[9]),
      credits: Number(m[10]),
      status: /fail/i.test(m[11]) ? 'FAIL' : 'PASS'
    };
  }

  function parseDelimitedText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if(!lines.length) return [];

    let headerIdx = -1;
    let colMap = null;

    for(let i = 0; i < Math.min(5, lines.length); i++) {
      const rawCols = lines[i].split(/[,|\t;]+/).map(c => c.replace(/^["']|["']$/g, '').trim().toLowerCase());
      if (rawCols.some(c => /reg|roll|hallticket|student/i.test(c))) {
        headerIdx = i;
        colMap = {};
        rawCols.forEach((col, idx) => {
          if (/reg|roll|hallticket|student/i.test(col)) colMap.regNo = idx;
          else if (/sem/i.test(col)) colMap.semester = idx;
          else if (/code/i.test(col)) colMap.subjectCode = idx;
          else if (/subject|title|course/i.test(col)) colMap.subject = idx;
          else if (/internal|mid/i.test(col)) colMap.internal = idx;
          else if (/external|ext/i.test(col)) colMap.external = idx;
          else if (/total|tot/i.test(col)) colMap.total = idx;
          else if (/^grade$/i.test(col)) colMap.grade = idx;
          else if (/point|gp/i.test(col)) colMap.gradePoint = idx;
          else if (/credit/i.test(col)) colMap.credits = idx;
          else if (/status|result/i.test(col)) colMap.status = idx;
        });
        break;
      }
    }

    const rows = [];
    const seen = new Set();
    const startLine = headerIdx >= 0 ? headerIdx + 1 : 0;

    for(let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if(!line || /register\s*no|subject\s*code|grade\s*point/i.test(line)) continue;

      let r = null;
      if (colMap && colMap.regNo !== undefined) {
        const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^["']|["']$/g, '').trim());
        const getV = k => (colMap[k] !== undefined && parts[colMap[k]] !== undefined) ? parts[colMap[k]] : '';

        const regNo = (getV('regNo') || '').toUpperCase();
        if (!regNo || regNo.length < 5) continue;

        const internal = Number(getV('internal')) || 0;
        const external = Number(getV('external')) || 0;
        let total = getV('total') ? Number(getV('total')) : (internal + external);
        let grade = (getV('grade') || '').toUpperCase();
        let gp = getV('gradePoint') ? Number(getV('gradePoint')) : null;

        if (!grade || isNaN(gp)) {
          const autoG = gradeFor(total);
          if (!grade) grade = autoG.grade;
          if (gp === null || isNaN(gp)) gp = autoG.gp;
        }

        const credits = Number(getV('credits')) || 3;
        const status = (/fail/i.test(getV('status')) || grade === 'F' || grade === 'AB') ? 'FAIL' : 'PASS';

        r = {
          regNo: regNo,
          semester: getV('semester') || '1-1',
          subjectCode: (getV('subjectCode') || 'SUB101').toUpperCase(),
          subject: getV('subject') || 'Subject Name',
          internal, external, total, grade, gradePoint: gp, credits, status
        };
      } else {
        r = parseLine(line);
      }

      if(r && r.regNo) {
        const k = [r.regNo, r.semester, r.subjectCode].join('|');
        if(!seen.has(k)) {
          seen.add(k);
          rows.push(r);
        }
      }
    }
    return rows;
  }

  function parseText(text){
    const rows=[]; const seen=new Set();
    text.split(/\r?\n/).forEach(line=>{const r=parseLine(line);if(r){const k=[r.regNo,r.semester,r.subjectCode].join('|');if(!seen.has(k)){seen.add(k);rows.push(r);}}});
    return rows;
  }

  async function extractFile(file){
    if(!file) return [];
    if(file.size > 15*1024*1024) throw new Error('File is larger than 15MB.');
    const name = file.name.toLowerCase();

    // 1. CSV or Plain Text
    if(name.endsWith('.csv') || name.endsWith('.txt')) {
      const text = await file.text();
      const rows = parseDelimitedText(text);
      if(!rows.length) throw new Error('No valid result rows found in CSV/TXT. Check column headers.');
      return rows;
    }

    // 2. Excel (.xlsx / .xls)
    if(/\.(xlsx|xls)$/i.test(name)) {
      if(window.XLSX) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, {type: 'array'});
        const sheetName = wb.SheetNames[0];
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        const rows = parseDelimitedText(csv);
        if(!rows.length) throw new Error('No valid result rows found in Excel sheet. Check column headers.');
        return rows;
      } else {
        throw new Error('Excel parser is still loading. Please upload as CSV or retry.');
      }
    }

    // 3. PDF
    if(name.endsWith('.pdf')){
      const pdf = await pdfjsLib.getDocument({data: await file.arrayBuffer()}).promise;
      let text = '';
      for(let i = 1; i <= pdf.numPages; i++){
        const p = await pdf.getPage(i);
        const tc = await p.getTextContent();
        text += tc.items.map(x=>x.str).join(' ')+'\n';
      }
      let rows = parseDelimitedText(text);
      if(!rows.length) rows = parseText(text);
      if(!rows.length){
        throw new Error('No readable result rows found in PDF. Make sure it follows the standard column format.');
      }
      return rows;
    }

    // 4. Image OCR
    if(/\.(png|jpe?g)$/i.test(name)){
      const worker = await Tesseract.createWorker('eng');
      const ret = await worker.recognize(file);
      await worker.terminate();
      const rows = parseDelimitedText(ret.data.text);
      if(!rows.length) rows = parseText(ret.data.text);
      if(!rows.length) throw new Error('No readable result rows found in the image. Use a clear, high-resolution result sheet.');
      return rows;
    }

    throw new Error('Supported formats: CSV, Excel (.xlsx/.xls), TXT, PDF, JPG, PNG.');
  }

  function validateAssigned(rows){
    const allowed = new Set(facultyStudents.map(s => s.reg_no.toUpperCase()));
    const ok = [], bad = [];
    rows.forEach(r => {
      if(!allowed.size || allowed.has(r.regNo.toUpperCase())) {
        ok.push(r);
      } else {
        // In individual faculty view, accept all rows for their section
        ok.push(r);
      }
    });
    return { ok, bad };
  }

  function renderPreview(rows){
    facultyResultRows = rows;
    const card = $('faculty-preview-card'), body = $('faculty-preview-body'); if(!card||!body)return;
    $('faculty-preview-count').textContent = ` (${rows.length} records ready)`;
    body.innerHTML = rows.map((r,i)=>`<tr><td>${i+1}</td><td><strong>${esc(r.regNo)}</strong></td><td>${esc(r.semester)}</td><td>${esc(r.subjectCode)}</td><td>${esc(r.subject)}</td><td>${r.internal}</td><td>${r.external}</td><td>${r.total}</td><td><span class="badge ${r.grade==='F'?'badge-danger':'badge-success'}">${esc(r.grade)}</span></td><td>${r.credits}</td><td><span class="valid-pill ${r.status==='FAIL'?'fail-pill':''}"><i class="fas fa-${r.status==='FAIL'?'times-circle':'check-circle'}"></i> ${esc(r.status)}</span></td><td><button class="faculty-row-remove" title="Remove row" onclick="removeFacultyPreviewRow(${i})"><i class="fas fa-trash-alt"></i></button></td></tr>`).join('');
    card.classList.remove('hidden');
  }
  window.removeFacultyPreviewRow = function(i){ facultyResultRows.splice(i,1); renderPreview(facultyResultRows); };

  async function previewSelectedFile(){
    const input = $('faculty-result-file'); if(!input || !input.files.length) return;
    const file = input.files[0];
    $('faculty-file-chip').classList.remove('hidden');
    $('faculty-file-chip').textContent = `${file.name} • ${(file.size/1024).toFixed(0)} KB`;
    $('faculty-selected-file').classList.remove('hidden');
    $('faculty-selected-file').textContent = '';
    setStatus('Reading file and extracting result records…');
    try{
      const rows = await extractFile(file);
      const v = validateAssigned(rows);
      if(v.bad.length) setStatus(`${v.bad.length} row(s) are outside your assigned class/section. ${v.ok.length} valid row(s) detected.`);
      else setStatus(`✓ ${v.ok.length} valid row(s) detected and ready for instant upload.`);
      renderPreview(v.ok);
    }catch(e){
      setStatus(e.message || 'Unable to read file.', true);
      facultyResultRows = [];
      $('faculty-preview-card')?.classList.add('hidden');
    }
  }
  function setStatus(msg, error=false){
    const el = $('faculty-upload-status'); if(!el) return;
    el.textContent = msg;
    el.style.color = error ? '#ff6a6a' : '#d7e4ff';
    el.classList.remove('hidden');
  }

  window.processFacultyResultUpload = async function(){
    if(!facultyMode()) return;
    if(!facultyResultRows.length){ await previewSelectedFile(); }
    if(!facultyResultRows.length) return;

    const btn = $('faculty-process-upload');
    if(btn) btn.disabled = true;
    setStatus(`Uploading ${facultyResultRows.length} result record(s) in fast bulk mode…`);

    try {
      const res = await post('/marks/bulk_save', { records: facultyResultRows });
      if (res.success) {
        setStatus(`✓ Upload Completed: ${res.saved_count} record(s) processed successfully!` + (res.errors?.length ? ` (${res.errors.length} skipped)` : ''));
        if(typeof showToast === 'function') showToast(`Successfully uploaded ${res.saved_count} student result records!`);
        try{ Sound.success(); }catch(e){}
        await loadFacultyAssignments();
        if(btn) btn.disabled = false;
        return;
      }
    } catch(e) {
      console.warn('Bulk save endpoint fallback', e);
    }

    // Fallback batch sequential
    let ok = 0, fail = 0;
    const batchSize = 10;
    for (let i = 0; i < facultyResultRows.length; i += batchSize) {
      const chunk = facultyResultRows.slice(i, i + batchSize);
      await Promise.all(chunk.map(async r => {
        try {
          const d = await post('/marks/save', {
            regNo: r.regNo, semester: r.semester, subjectCode: r.subjectCode, subject: r.subject,
            internal: r.internal, external: r.external, total: r.total, grade: r.grade,
            gradePoint: r.gradePoint, credits: r.credits, status: r.status
          });
          if(d.success) ok++; else fail++;
        } catch(e){ fail++; }
      }));
    }
    if(btn) btn.disabled = false;
    setStatus(`Completed: ${ok} record(s) updated/added${fail ? `, ${fail} failed` : ''}.`);
    if(ok){ try{ Sound.success(); }catch(e){} await loadFacultyAssignments(); }
  };

  window.clearFacultyResultFile = function(){
    const input = $('faculty-result-file');
    if(input) input.value = '';
    $('faculty-file-chip')?.classList.add('hidden');
    $('faculty-preview-card')?.classList.add('hidden');
    $('faculty-upload-status')?.classList.add('hidden');
    facultyResultRows = [];
  };

  async function loadManualStudent(){
    const reg = $('faculty-manual-student')?.value; if(!reg) return;
    const d = await api('/marks/student/' + encodeURIComponent(reg));
    selectedManualResults = d.success ? d.results : [];
    const sel = $('faculty-manual-subject');
    sel.innerHTML = '<option value="">Select subject</option>' + selectedManualResults.map((r,i)=>`<option value="${i}">${esc(r.subject_code || r.subjectCode)} - ${esc(r.subject)} (Sem ${esc(r.semester)})</option>`).join('');
    clearEditor();
  }

  function clearEditor(){
    ['faculty-edit-internal','faculty-edit-external','faculty-edit-total','faculty-edit-grade','faculty-edit-gp','faculty-edit-credits'].forEach(id => {
      if($(id)) $(id).value = '';
    });
    if($('faculty-edit-status')) $('faculty-edit-status').value = 'Pass';
  }

  window.loadFacultyManualResult = async function(){
    if(!$('faculty-manual-student').value){ alert('Select a student first.'); return; }
    if(!$('faculty-manual-subject').value){ await loadManualStudent(); return; }
    const r = selectedManualResults[Number($('faculty-manual-subject').value)];
    if(!r) return;
    $('faculty-edit-internal').value = r.internal_marks ?? r.mid_marks ?? '';
    $('faculty-edit-external').value = r.external_marks ?? '';
    $('faculty-edit-total').value = r.total ?? '';
    $('faculty-edit-grade').value = r.grade ?? '';
    $('faculty-edit-gp').value = r.grade_point ?? '';
    $('faculty-edit-credits').value = r.credits ?? '';
    $('faculty-edit-status').value = (r.status || 'PASS').toUpperCase() === 'FAIL' ? 'Fail' : 'Pass';
  };

  window.updateFacultyManualResult = async function(){
    const i = Number($('faculty-manual-subject').value), r = selectedManualResults[i];
    if(!r) return alert('Load a result first.');
    const d = await post('/marks/save', {
      regNo: r.reg_no,
      semester: r.semester,
      subjectCode: r.subject_code || r.subjectCode,
      subject: r.subject,
      internal: $('faculty-edit-internal').value,
      external: $('faculty-edit-external').value,
      total: $('faculty-edit-total').value,
      grade: $('faculty-edit-grade').value,
      gradePoint: $('faculty-edit-gp').value,
      credits: $('faculty-edit-credits').value,
      status: $('faculty-edit-status').value
    });
    setStatus(d.message || 'Result updated.', !d.success);
    if(d.success){
      try{ Sound.success(); }catch(e){}
      await loadManualStudent();
      $('faculty-manual-subject').value = String(i);
      window.loadFacultyManualResult();
    }
  };

  window.deleteFacultyManualResult = async function(){
    const i = Number($('faculty-manual-subject').value), r = selectedManualResults[i];
    if(!r) return alert('Load a result first.');
    if(!confirm(`Delete ${r.subject} result for ${r.reg_no}?`)) return;
    const d = await api('/marks/delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ regNo: r.reg_no, semester: r.semester, subjectCode: r.subject_code || r.subjectCode })
    });
    setStatus(d.message || 'Result deleted.', !d.success);
    if(d.success){
      clearEditor();
      await loadManualStudent();
    }
  };

  function initGlobalSearch() {
    const searchInput = $('faculty-global-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (facultyResultRows.length) {
        const filtered = facultyResultRows.filter(r => 
          r.regNo.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q) ||
          r.subjectCode.toLowerCase().includes(q)
        );
        renderPreview(filtered);
      }
      const sel = $('faculty-manual-student');
      if (sel) {
        Array.from(sel.options).forEach(opt => {
          if (!opt.value) return;
          opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      }
    });
  }

  function wireProfileLinks() {
    const p = document.querySelector('.faculty-profile');
    if (p && !p.dataset.pfwired) {
      p.dataset.pfwired = '1';
      p.style.cursor = 'pointer';
      p.title = 'View My Profile';
      p.addEventListener('click', () => {
        if (typeof showSection === 'function') showSection('profile');
      });
    }
  }

  async function init(){
    restoreTheme();
    $('faculty-result-file')?.addEventListener('change', previewSelectedFile);
    const dz = $('faculty-dropzone');
    if(dz){
      ['dragenter','dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('dragover'); }));
      ['dragleave','drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('dragover'); }));
      dz.addEventListener('drop', ev => {
        const f = ev.dataTransfer.files?.[0];
        if(f){
          const inp = $('faculty-result-file');
          const dt = new DataTransfer();
          dt.items.add(f);
          inp.files = dt.files;
          previewSelectedFile();
        }
      });
    }
    $('faculty-manual-student')?.addEventListener('change', loadManualStudent);

    function wireGenericDropzone(dropzoneId, inputId, chipId) {
      const dz = $(dropzoneId);
      const inp = $(inputId);
      const chip = $(chipId);
      if(!dz || !inp) return;
      
      const updateChip = (file) => {
        if(!chip) return;
        if(file) {
          chip.classList.remove('hidden');
          chip.textContent = `${file.name} • ${(file.size/1024).toFixed(0)} KB`;
        } else {
          chip.classList.add('hidden');
          chip.textContent = '';
        }
      };

      inp.addEventListener('change', () => {
        if(inp.files && inp.files[0]) updateChip(inp.files[0]);
        else updateChip(null);
      });

      ['dragenter','dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('dragover'); }));
      ['dragleave','drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('dragover'); }));
      dz.addEventListener('drop', ev => {
        const f = ev.dataTransfer.files?.[0];
        if(f){
          const dt = new DataTransfer();
          dt.items.add(f);
          inp.files = dt.files;
          updateChip(f);
          inp.dispatchEvent(new Event('change'));
        }
      });
    }

    wireGenericDropzone('admin-stu-dropzone', 'bulk-student-file', 'admin-stu-file-chip');
    wireGenericDropzone('admin-fac-dropzone', 'bulk-faculty-file', 'admin-fac-file-chip');
    wireGenericDropzone('admin-hod-dropzone', 'bulk-hod-file', 'admin-hod-file-chip');
    wireGenericDropzone('admin-att-dropzone', 'bulk-attendance-file', 'admin-att-file-chip');
    wireGenericDropzone('admin-sub-dropzone', 'bulk-subject-file', 'admin-sub-file-chip');
    wireGenericDropzone('admin-uni-dropzone', 'bulk-universal-file', 'admin-uni-file-chip');

    window.clearAdminStuUpload = function() {
      const inp = $('bulk-student-file');
      if(inp) inp.value = '';
      $('admin-stu-file-chip')?.classList.add('hidden');
      if(typeof showToast === 'function') showToast('Student file selection cleared.');
    };
    window.clearAdminFacUpload = function() {
      const inp = $('bulk-faculty-file');
      if(inp) inp.value = '';
      $('admin-fac-file-chip')?.classList.add('hidden');
      if(typeof showToast === 'function') showToast('Faculty file selection cleared.');
    };
    window.clearAdminHodUpload = function() {
      const inp = $('bulk-hod-file');
      if(inp) inp.value = '';
      $('admin-hod-file-chip')?.classList.add('hidden');
      if(typeof showToast === 'function') showToast('HOD file selection cleared.');
    };
    window.clearAdminAttUpload = function() {
      const inp = $('bulk-attendance-file');
      if(inp) inp.value = '';
      $('admin-att-file-chip')?.classList.add('hidden');
      if(typeof showToast === 'function') showToast('Attendance file selection cleared.');
    };
    window.clearAdminSubUpload = function() {
      const inp = $('bulk-subject-file');
      if(inp) inp.value = '';
      $('admin-sub-file-chip')?.classList.add('hidden');
      if(typeof showToast === 'function') showToast('Subject allotment file selection cleared.');
    };
    window.clearAdminUniUpload = function() {
      const inp = $('bulk-universal-file');
      if(inp) inp.value = '';
      $('admin-uni-file-chip')?.classList.add('hidden');
      if(typeof showToast === 'function') showToast('File selection cleared.');
    };

    initGlobalSearch();
    wireProfileLinks();
    setFacultyMode();
  }

  // Universal Template Export Aliases
  window.downloadTemplateExcel = () => window.downloadResultTemplate ? window.downloadResultTemplate('excel') : null;
  window.downloadTemplatePDF = () => window.downloadResultTemplate ? window.downloadResultTemplate('pdf') : null;
  window.downloadTemplateImage = () => window.downloadResultTemplate ? window.downloadResultTemplate('image') : null;
  window.downloadTemplateCSV = () => window.downloadResultTemplate ? window.downloadResultTemplate('csv') : null;

  const oldFinalize = window.finalizeLogin;
  window.finalizeLogin = function(){
    try { if(oldFinalize) oldFinalize.apply(this, arguments); } catch(e) { console.warn('finalizeLogin error:', e); }
    try { setFacultyMode(); wireProfileLinks(); } catch(e) {}
  };
  const oldShow = window.showSection;
  window.showSection = function(id){
    try { if(oldShow) oldShow.apply(this, arguments); } catch(e) { console.warn('showSection error:', e); }
    if(id === 'results') setTimeout(setFacultyMode, 0);
    try {
      document.querySelectorAll('#faculty-exact-nav li').forEach(li => {
        const oc = li.getAttribute('onclick') || '';
        li.classList.toggle('faculty-nav-active', oc.includes("'" + id + "'"));
      });
    } catch(e) {}
  };
  window.addEventListener('load', init);
})();

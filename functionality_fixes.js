// functionality_fixes.js - Universal bulk uploads, standardized template downloads,
// attendance system, password management, and global API auth interceptor.

(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  // =========================================================================
  // 1. GLOBAL FETCH INTERCEPTOR (Attaches X-Auth-Token automatically)
  // =========================================================================
  const rawFetch = window.fetch;
  window.fetch = function (url, opts = {}) {
    opts = Object.assign({}, opts);
    const headers = Object.assign({}, opts.headers || {});
    if (window.currentUser && window.currentUser.token) {
      if (!headers['X-Auth-Token'] && !headers['x-auth-token']) {
        headers['X-Auth-Token'] = window.currentUser.token;
      }
    }
    opts.headers = headers;
    return rawFetch.call(this, url, opts);
  };

  const api = async (path, opts = {}) => {
    const base = typeof API_BASE !== 'undefined' ? API_BASE : 'http://127.0.0.1:5000/api';
    const fullUrl = path.startsWith('http') ? path : (base + (path.startsWith('/') ? path : '/' + path));
    const r = await fetch(fullUrl, opts);
    return r.json();
  };
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });

  // Helper for downloading files
  function triggerDownload(content, filename, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Helper to parse file into rows of strings
  async function extractFileRows(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    
    // Excel file (.xlsx / .xls)
    if ((ext === 'xlsx' || ext === 'xls') && window.XLSX) {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      return rawRows.filter(r => Array.isArray(r) && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
    }

    // PDF extraction
    if (ext === 'pdf' && window.pdfjsLib) {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        text += tc.items.map(x => x.str).join(' ') + '\n';
      }
      return text.split(/\r?\n/).map(l => l.trim().split(/[,|\t]+/).map(c => c.trim())).filter(r => r.some(Boolean));
    }

    // Image OCR
    if (/^(png|jpe?g)$/i.test(ext) && window.Tesseract) {
      const worker = await Tesseract.createWorker('eng');
      const ret = await worker.recognize(file);
      await worker.terminate();
      const text = ret.data.text || '';
      return text.split(/\r?\n/).map(l => l.trim().split(/[,|\t]+/).map(c => c.trim())).filter(r => r.some(Boolean));
    }

    // Default text/CSV
    const text = await file.text();
    return text.split(/\r?\n/).map(l => l.trim().split(/[,|\t]+/).map(c => c.trim())).filter(r => r.some(Boolean));
  }

  // Universal Table PDF Generator
  window.generateTablePDF = function(title, subtitle, headers, dataRows, filename, orientation = 'landscape') {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = orientation === 'landscape' ? '1120px' : '820px';
    container.style.background = '#ffffff';
    container.style.color = '#0f172a';
    container.style.fontFamily = 'Arial, Helvetica, sans-serif';
    container.style.padding = '30px 35px';
    container.style.boxSizing = 'border-box';

    const rowsHtml = dataRows.map((r, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `<tr style="background:${bg};">` + 
        r.map(c => `<td style="border:1px solid #cbd5e1; padding:8px 6px; font-size:11px; text-align:center;">${esc(c)}</td>`).join('') +
        `</tr>`;
    }).join('');

    const blankRows = Array.from({length: 4}).map(() => {
      return `<tr style="background:#ffffff; height:28px;">` + 
        headers.map(() => `<td style="border:1px solid #cbd5e1; padding:8px 6px;"></td>`).join('') +
        `</tr>`;
    }).join('');

    container.innerHTML = `
      <div style="border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 15px; text-align: center;">
        <h2 style="margin: 0; color: #1e3a8a; font-size: 20px; text-transform: uppercase; font-weight: 800;">BVC INSTITUTE OF TECHNOLOGY &amp; SCIENCE</h2>
        <p style="margin: 4px 0 0; font-size: 12px; color: #475569;">Autonomous Institution • Approved by AICTE • Affiliated to JNTUK</p>
        <h3 style="margin: 8px 0 0; color: #b91c1c; font-size: 15px; font-weight: 700;">${esc(title)}</h3>
        <p style="margin: 4px 0 0; font-size: 11px; color: #64748b;">${esc(subtitle)}</p>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; margin-bottom: 12px; color: #334155;">
        <span>Academic Year: 2025 - 2026</span>
        <span>Date: ${new Date().toLocaleDateString('en-GB')}</span>
        <span>Status: Official Bulk Template Format</span>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #1e3a8a; color: #ffffff;">
            ${headers.map(h => `<th style="border: 1px solid #1e40af; padding: 9px 6px; font-size: 11px; font-weight: 700; text-align: center;">${esc(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${blankRows}
        </tbody>
      </table>
      <div style="margin-top: 35px; display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: #475569;">
        <div style="text-align: center;">____________________________<br>Faculty / Staff In-Charge</div>
        <div style="text-align: center;">____________________________<br>Head of Department (HOD)</div>
        <div style="text-align: center;">____________________________<br>Examination Cell / Principal</div>
      </div>
      <div style="margin-top: 20px; padding: 8px 12px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; font-size: 10px; color: #92400e;">
        <strong>Instructions:</strong> Use this official template format for bulk uploading data into the BVC Smart Portal. Scanned images or exported PDFs matching this layout will be automatically processed.
      </div>
    `;

    document.body.appendChild(container);

    if (window.html2pdf) {
      const opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: orientation }
      };
      window.html2pdf().set(opt).from(container).save().then(() => {
        document.body.removeChild(container);
        if (typeof showToast === 'function') showToast(`Downloaded PDF Template: ${filename}`);
      }).catch(err => {
        console.warn('html2pdf error', err);
        document.body.removeChild(container);
      });
    } else {
      document.body.removeChild(container);
      if (typeof showToast === 'function') showToast('PDF export library not ready.');
    }
  };

  // Universal Table Image Generator (High contrast Canvas PNG)
  window.generateTableImage = function(title, subtitle, headers, dataRows, filename, colWidths = null) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const numCols = headers.length;
    const paddingX = 40;
    const paddingY = 40;
    const headerHeight = 90;
    const tableHeaderHeight = 44;
    const rowHeight = 36;
    const numBlankRows = 3;
    const totalRows = dataRows.length + numBlankRows;

    let calculatedWidths = colWidths;
    if (!calculatedWidths || calculatedWidths.length !== numCols) {
      const baseW = 120;
      calculatedWidths = headers.map(h => Math.max(h.length * 11 + 30, baseW));
    }
    const tableWidth = calculatedWidths.reduce((a, b) => a + b, 0);
    const canvasWidth = Math.max(tableWidth + paddingX * 2, 1200);
    const footerHeight = 80;
    const canvasHeight = paddingY * 2 + headerHeight + tableHeaderHeight + (totalRows * rowHeight) + footerHeight;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Crisp white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Top Title Banner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(paddingX, paddingY, tableWidth, 42);

    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BVC INSTITUTE OF TECHNOLOGY & SCIENCE — ' + title.toUpperCase(), paddingX + tableWidth / 2, paddingY + 21);

    // Subtitle
    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText(subtitle + '  |  Standard Format Accepted by Bulk Upload Scanner (OCR & Text)', paddingX + 4, paddingY + 60);

    // Table Header Row
    const startY = paddingY + headerHeight;
    let currentX = paddingX;

    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(paddingX, startY, tableWidth, tableHeaderHeight);

    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let c = 0; c < numCols; c++) {
      const w = calculatedWidths[c];
      ctx.fillText(headers[c], currentX + w / 2, startY + tableHeaderHeight / 2);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.strokeRect(currentX, startY, w, tableHeaderHeight);
      currentX += w;
    }

    // Table Data Rows
    let currentY = startY + tableHeaderHeight;
    ctx.font = '12px Arial, sans-serif';

    for (let r = 0; r < dataRows.length; r++) {
      const isEven = r % 2 === 0;
      ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
      ctx.fillRect(paddingX, currentY, tableWidth, rowHeight);

      currentX = paddingX;
      for (let c = 0; c < numCols; c++) {
        const w = calculatedWidths[c];
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(currentX, currentY, w, rowHeight);

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cellVal = String(dataRows[r][c] ?? '');
        ctx.fillText(cellVal, currentX + w / 2, currentY + rowHeight / 2);
        currentX += w;
      }
      currentY += rowHeight;
    }

    // Blank Rows
    for (let b = 0; b < numBlankRows; b++) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(paddingX, currentY, tableWidth, rowHeight);
      currentX = paddingX;
      for (let c = 0; c < numCols; c++) {
        const w = calculatedWidths[c];
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(currentX, currentY, w, rowHeight);
        currentX += w;
      }
      currentY += rowHeight;
    }

    // Footer Instructions Box
    currentY += 15;
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(paddingX, currentY, tableWidth, 42);
    ctx.strokeStyle = '#fde68a';
    ctx.strokeRect(paddingX, currentY, tableWidth, 42);

    ctx.font = '11px Arial, sans-serif';
    ctx.fillStyle = '#92400e';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('NOTE: Fill data according to column headers. High-contrast image format ensures 100% OCR detection in Bulk Upload.', paddingX + 16, currentY + 21);

    canvas.toBlob(blob => {
      if (!blob) return;
      triggerDownload(blob, filename, 'image/png');
      if (typeof showToast === 'function') showToast(`Downloaded Image Template: ${filename}`);
    }, 'image/png');
  };

  // =========================================================================
  // 2. STANDARDIZED TEMPLATE DOWNLOADS
  // =========================================================================

  // A. Student Template
  window.downloadStudentTemplate = function (type) {
    const headers = ['S.No', 'Register No', 'Student Name', 'Branch', 'Phone Number', 'Section', 'Year'];
    const dataRows = [
      ['1', '21CSE001', 'Aditya Verma', 'CSE', '9876543210', 'A', '3'],
      ['2', '21CSE002', 'Bhavya Sri', 'CSE', '9876543211', 'A', '3'],
      ['3', '21ECE001', 'Chaitanya Kumar', 'ECE', '9876543212', 'B', '2']
    ];

    if (type === 'excel' && window.XLSX) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Students');
      XLSX.writeFile(wb, 'bvc_student_registration_template.xlsx');
      showToast('Downloaded Excel Student Template.');
    } else if (type === 'pdf') {
      window.generateTablePDF('Student Registration Format', 'Official Student Directory & Bulk Upload Template', headers, dataRows, 'bvc_student_registration_template.pdf', 'landscape');
    } else if (type === 'image') {
      window.generateTableImage('Student Registration Format', 'Official Student Directory & Bulk Upload Template', headers, dataRows, 'bvc_student_registration_template.png');
    } else {
      const csv = [headers, ...dataRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      triggerDownload(csv, 'bvc_student_registration_template.csv', 'text/csv');
      showToast('Downloaded CSV Student Template.');
    }
  };

  // B. Faculty Template
  window.downloadFacultyTemplate = function (type) {
    const headers = ['Faculty ID', 'Faculty Name', 'Branch', 'Phone Number', 'Section'];
    const dataRows = [
      ['FAC001', 'Krishnaveni Madam', 'CSE', '9876543210', 'CSE-A'],
      ['FAC002', 'Santoshi Madam', 'CSE', '9876543211', 'CSE-A'],
      ['FAC003', 'M Raju Sir', 'CSE', '9876543212', 'CSE-B'],
      ['FAC004', 'Revathi Madam', 'ECE', '9876543213', 'ECE-A']
    ];

    if (type === 'excel' && window.XLSX) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Faculty');
      XLSX.writeFile(wb, 'bvc_faculty_registration_template.xlsx');
      showToast('Downloaded Excel Faculty Template.');
    } else if (type === 'pdf') {
      window.generateTablePDF('Faculty Registration Format', 'Official Faculty Registry & Timetable Mapping', headers, dataRows, 'bvc_faculty_registration_template.pdf', 'landscape');
    } else if (type === 'image') {
      window.generateTableImage('Faculty Registration Format', 'Official Faculty Registry & Timetable Mapping', headers, dataRows, 'bvc_faculty_registration_template.png');
    } else {
      const csv = [headers, ...dataRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      triggerDownload(csv, 'bvc_faculty_registration_template.csv', 'text/csv');
      showToast('Downloaded CSV Faculty Template.');
    }
  };

  // C. HOD Template
  window.downloadHodTemplate = function (type) {
    const headers = ['Register No', 'HOD Name', 'Branch', 'Phone Number'];
    const dataRows = [
      ['HODCSE', 'Dr. Rama Rao', 'CSE', '9876543210'],
      ['HODECE', 'Dr. Prasad', 'ECE', '9876543211'],
      ['HODEEE', 'Dr. Suresh Babu', 'EEE', '9876543212'],
      ['HODMECH', 'Dr. K. Srinivas', 'MECH', '9876543213']
    ];

    if (type === 'excel' && window.XLSX) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'HODs');
      XLSX.writeFile(wb, 'bvc_hod_registration_template.xlsx');
      showToast('Downloaded Excel HOD Template.');
    } else if (type === 'pdf') {
      window.generateTablePDF('HOD Configuration Format', 'Official Department Heads & Roles Mapping', headers, dataRows, 'bvc_hod_registration_template.pdf', 'portrait');
    } else if (type === 'image') {
      window.generateTableImage('HOD Configuration Format', 'Official Department Heads & Roles Mapping', headers, dataRows, 'bvc_hod_registration_template.png');
    } else {
      const csv = [headers, ...dataRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      triggerDownload(csv, 'bvc_hod_registration_template.csv', 'text/csv');
      showToast('Downloaded CSV HOD Template.');
    }
  };

  // D. Attendance Template
  window.downloadAttendanceTemplate = function (type) {
    const headers = ['Register No', 'Subject', 'Total Classes', 'Attended Classes', 'Section'];
    const dataRows = [
      ['21CSE001', 'OOPS', '45', '42', 'CSE-A'],
      ['21CSE002', 'OOPS', '45', '40', 'CSE-A'],
      ['21CSE003', 'OOPS', '45', '38', 'CSE-A'],
      ['21CSE004', 'OOPS', '45', '44', 'CSE-A'],
      ['21CSE005', 'OOPS', '45', '35', 'CSE-A']
    ];

    if (type === 'excel' && window.XLSX) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      XLSX.writeFile(wb, 'bvc_attendance_template.xlsx');
      showToast('Downloaded Excel Attendance Template.');
    } else if (type === 'pdf') {
      window.generateTablePDF('Attendance Record Sheet', 'Official Student Attendance & Working Hours Roster', headers, dataRows, 'bvc_attendance_template.pdf', 'portrait');
    } else if (type === 'image') {
      window.generateTableImage('Attendance Record Sheet', 'Official Student Attendance & Working Hours Roster', headers, dataRows, 'bvc_attendance_template.png');
    } else {
      const csv = [headers, ...dataRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      triggerDownload(csv, 'bvc_attendance_template.csv', 'text/csv');
      showToast('Downloaded CSV Attendance Template.');
    }
  };

  // E. Subject Allotment Template
  window.downloadSubjectAllotmentTemplate = function (type) {
    const headers = ['Section', 'Subject_Code', 'Subject_Name', 'Faculty_Name', 'Room_No'];
    const dataRows = [
      ['I CSE-A', 'C PROG', 'Programming in C', 'Dr. K. Sharma', 'Lab-1'],
      ['I CSE-A', 'ENG', 'Professional English', 'Mrs. R. Devi', 'Room-101'],
      ['II CSE-B', 'OS', 'Operating Systems', 'Mr. V. Prasad', 'Room-204'],
      ['III ECE-A', 'VLSI', 'VLSI Design', 'Dr. M. Reddy', 'Lab-3'],
      ['IV MECH-C', 'CAD/CAM', 'Computer Aided Manufacturing', 'Prof. S. Rao', 'Workshop-2']
    ];

    if (type === 'excel' && window.XLSX) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Subject_Allotment');
      XLSX.writeFile(wb, 'bvc_subject_allotment_template.xlsx');
      showToast('Downloaded Excel Subject Allotment Template.');
    } else if (type === 'pdf') {
      window.generateTablePDF('Subject & Faculty Allotment Format', 'Official Curriculum & Subject Allocation Register', headers, dataRows, 'bvc_subject_allotment_template.pdf', 'portrait');
    } else if (type === 'image') {
      window.generateTableImage('Subject & Faculty Allotment Format', 'Official Curriculum & Subject Allocation Register', headers, dataRows, 'bvc_subject_allotment_template.png');
    } else {
      const csv = [headers, ...dataRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      triggerDownload(csv, 'bvc_subject_allotment_template.csv', 'text/csv');
      showToast('Downloaded CSV Subject Allotment Template.');
    }
  };

  // =========================================================================
  // 3. BULK UPLOAD PROCESSORS
  // =========================================================================

  // A. Student Bulk Upload
  window.processStudentBulkUpload = async function () {
    const input = $('bulk-student-file'), prog = $('stu-bulk-progress');
    if (!input?.files?.length) return showToast('Please select a student bulk-upload file.');
    const file = input.files[0];
    if (prog) { prog.style.display = 'block'; prog.textContent = 'Reading student records…'; }

    try {
      const rawRows = await extractFileRows(file);
      const students = [];

      for (const parts of rawRows) {
        if (!parts || !parts.length) continue;
        const lineStr = parts.join(' ').toLowerCase();
        if (lineStr.includes('register no') || lineStr.includes('reg no') || lineStr.includes('student name')) continue;

        let reg = '', name = '', branch = '', phone = '', section = '', year = '';
        if (parts.length >= 7) {
          reg = parts[1]; name = parts[2]; branch = parts[3]; phone = parts[4]; section = parts[5]; year = parts[6];
        } else if (parts.length >= 5) {
          if (/^\d+$/.test(String(parts[0]).trim()) && parts[0].length <= 3) {
            reg = parts[1]; name = parts[2]; branch = parts[3]; phone = parts[4];
          } else {
            reg = parts[0]; name = parts[1]; branch = parts[2]; phone = parts[3]; section = parts[4];
          }
        } else if (parts.length === 4) {
          [reg, name, branch, phone] = parts;
        }

        const cleanReg = String(reg || '').trim();
        const cleanPhone = String(phone || '').replace(/\D/g, '');
        const cleanName = String(name || '').trim();
        const cleanBranch = String(branch || '').trim().toUpperCase();

        if (cleanReg && cleanName && cleanBranch) {
          students.push({
            regNo: cleanReg,
            name: cleanName,
            branch: cleanBranch,
            phone: cleanPhone.length === 10 ? cleanPhone : '1234567890',
            section: String(section || '').trim() || 'A',
            year_of_study: parseInt(year) || 3
          });
        }
      }

      const unique = [];
      const seen = new Set();
      for (const st of students) {
        if (!seen.has(st.regNo)) { seen.add(st.regNo); unique.push(st); }
      }

      if (!unique.length) { showToast('No valid student records found in file.'); return; }
      if (prog) prog.textContent = `Importing ${unique.length} student records…`;

      const d = await post('/admin/register/student_bulk', { students: unique });
      showToast(d.message || `Successfully registered ${unique.length} students.`);
      input.value = '';
      if (typeof loadAdminRegistryData === 'function') loadAdminRegistryData();
    } catch (e) {
      showToast('Student upload error: ' + (e.message || 'Failed to process file.'));
    } finally {
      if (prog) prog.style.display = 'none';
    }
  };

  // B. Faculty Bulk Upload
  window.processFacultyRegistryBulkUpload = async function () {
    const input = $('bulk-faculty-file'), prog = $('fac-bulk-progress');
    if (!input?.files?.length) return showToast('Please select a faculty bulk-upload file.');
    const file = input.files[0];
    if (prog) { prog.style.display = 'block'; prog.textContent = 'Processing faculty records…'; }

    try {
      const rawRows = await extractFileRows(file);
      const faculty = [];

      for (const parts of rawRows) {
        if (!parts || !parts.length) continue;
        const lineStr = parts.join(' ').toLowerCase();
        if (lineStr.includes('faculty id') || lineStr.includes('faculty name') || lineStr.includes('phone number')) continue;

        let regNo = '', name = '', branch = '', phone = '', section = '';
        if (parts.length >= 5) {
          [regNo, name, branch, phone, section] = parts;
        } else if (parts.length === 4) {
          [regNo, name, branch, phone] = parts;
        } else if (parts.length === 3) {
          [regNo, name, branch] = parts;
          phone = '1234567890';
        }

        const cleanReg = String(regNo || '').trim();
        const cleanName = String(name || '').trim();
        const cleanBranch = String(branch || '').trim().toUpperCase();
        const cleanPhone = String(phone || '').replace(/\D/g, '') || '1234567890';

        if (cleanReg && cleanName && cleanBranch) {
          faculty.push({
            regNo: cleanReg,
            name: cleanName,
            branch: cleanBranch,
            phone: cleanPhone.length === 10 ? cleanPhone : '1234567890',
            section: String(section || '').trim() || (cleanBranch + '-A')
          });
        }
      }

      if (!faculty.length) { showToast('No valid faculty records found in file.'); return; }
      if (prog) prog.textContent = `Registering ${faculty.length} faculty members…`;

      const d = await post('/admin/register/faculty_bulk', { faculty });
      showToast(d.message || `Registered ${faculty.length} faculty accounts.`);
      input.value = '';
      if (typeof loadAdminRegistryData === 'function') loadAdminRegistryData();
    } catch (e) {
      showToast('Faculty upload error: ' + (e.message || 'Failed to process file.'));
    } finally {
      if (prog) prog.style.display = 'none';
    }
  };

  // C. HOD Bulk Upload
  window.processHodBulkUpload = async function () {
    const input = $('bulk-hod-file');
    if (!input?.files?.length) return showToast('Please select an HOD bulk file.');
    const file = input.files[0];

    try {
      const rawRows = await extractFileRows(file);
      const hods = [];

      for (const parts of rawRows) {
        if (!parts || !parts.length) continue;
        const lineStr = parts.join(' ').toLowerCase();
        if (lineStr.includes('register no') || lineStr.includes('hod name') || lineStr.includes('branch')) continue;

        let regNo = '', name = '', branch = '', phone = '';
        if (parts.length >= 4) {
          if (String(parts[0]).toLowerCase().startsWith('hod') || parts[0].length >= 4) {
            [regNo, name, branch, phone] = parts;
          } else {
            // S.No, Name, Branch, Phone, RegNo
            name = parts[1]; branch = parts[2]; phone = parts[3]; regNo = parts[4] || ('HOD' + branch);
          }
        } else if (parts.length === 3) {
          [regNo, name, branch] = parts;
          phone = '1234567890';
        }

        const cleanReg = String(regNo || '').trim();
        const cleanName = String(name || '').trim();
        const cleanBranch = String(branch || '').trim().toUpperCase();
        const cleanPhone = String(phone || '').replace(/\D/g, '') || '1234567890';

        if (cleanName && cleanBranch) {
          hods.push({
            regNo: cleanReg || ('HOD' + cleanBranch),
            name: cleanName,
            branch: cleanBranch,
            phone: cleanPhone.length === 10 ? cleanPhone : '1234567890'
          });
        }
      }

      if (!hods.length) { showToast('No valid HOD records found in file.'); return; }
      const d = await post('/admin/register/hod_bulk', { hods });
      showToast(d.message || `Imported ${hods.length} HOD accounts.`);
      input.value = '';
      if (typeof loadAdminRegistryData === 'function') loadAdminRegistryData();
    } catch (e) {
      showToast('HOD upload error: ' + (e.message || 'Failed to process file.'));
    }
  };

  // D. Attendance Bulk Upload
  window.processAttendanceBulkUpload = async function () {
    const input = $('bulk-attendance-file'), prog = $('att-bulk-progress');
    if (!input?.files?.length) return showToast('Please select an attendance bulk file.');
    const file = input.files[0];
    if (prog) { prog.style.display = 'block'; prog.textContent = 'Parsing attendance records…'; }

    try {
      const rawRows = await extractFileRows(file);
      const records = [];

      for (const parts of rawRows) {
        if (!parts || !parts.length) continue;
        const lineStr = parts.join(' ').toLowerCase();
        if (lineStr.includes('register no') || lineStr.includes('subject') || lineStr.includes('total classes')) continue;

        let regNo = '', subject = '', total = 0, attended = 0, section = '';
        if (parts.length >= 4) {
          regNo = parts[0];
          subject = parts[1];
          total = parseInt(parts[2]) || 0;
          attended = parseInt(parts[3]) || 0;
          section = parts[4] || '';
        }

        const cleanReg = String(regNo || '').trim().toUpperCase();
        const cleanSub = String(subject || '').trim();

        if (cleanReg && cleanSub && total > 0) {
          records.push({
            regNo: cleanReg,
            subject: cleanSub,
            total_classes: total,
            attended_classes: Math.min(attended, total),
            section: String(section || '').trim()
          });
        }
      }

      if (!records.length) { showToast('No valid attendance records found in file.'); return; }
      if (prog) prog.textContent = `Saving ${records.length} attendance records…`;

      const d = await post('/attendance/bulk', { records });
      showToast(d.message || `Successfully updated ${records.length} attendance entries.`);
      input.value = '';
      if (typeof window.loadFacultyAttendanceRoster === 'function') window.loadFacultyAttendanceRoster();
    } catch (e) {
      showToast('Attendance bulk upload error: ' + (e.message || 'Failed to upload.'));
    } finally {
      if (prog) prog.style.display = 'none';
    }
  };

  // E. Subject Allotment Bulk Upload
  window.processSubjectAllotmentBulkUpload = async function () {
    const input = $('bulk-subject-file'), prog = $('sub-bulk-progress');
    if (!input?.files?.length) return showToast('Please select a subject allotment bulk file.');
    const file = input.files[0];
    if (prog) { prog.style.display = 'block'; prog.textContent = 'Parsing subject allotment records…'; }

    try {
      const rawRows = await extractFileRows(file);
      const allotments = [];

      for (const parts of rawRows) {
        if (!parts || !parts.length) continue;
        const lineStr = parts.join(' ').toLowerCase();
        if (lineStr.includes('section') && (lineStr.includes('subject') || lineStr.includes('code'))) continue;

        let section = '', subCode = '', subName = '', facName = '', room = '';
        if (parts.length >= 5) {
          [section, subCode, subName, facName, room] = parts;
        } else if (parts.length === 4) {
          [section, subCode, subName, facName] = parts;
        } else if (parts.length === 3) {
          [section, subCode, subName] = parts;
        } else if (parts.length === 2) {
          [section, subCode] = parts;
        }

        const cleanSec = String(section || '').trim();
        const cleanCode = String(subCode || '').trim();
        const cleanName = String(subName || '').trim();
        const cleanFac = String(facName || '').trim();
        const cleanRoom = String(room || '').trim();

        if (cleanSec && cleanCode) {
          allotments.push({
            section: cleanSec,
            subject_code: cleanCode,
            subject_name: cleanName,
            faculty_name: cleanFac,
            room: cleanRoom
          });
        }
      }

      if (!allotments.length) { showToast('No valid subject allotment records found in file.'); return; }
      if (prog) prog.textContent = `Allotting ${allotments.length} subjects to sections…`;

      const d = await post('/sections/subjects/bulk', { allotments });
      showToast(d.message || `Successfully allotted ${allotments.length} subjects!`);
      input.value = '';
      $('admin-sub-file-chip')?.classList.add('hidden');
      if (typeof initAdminDashboard === 'function') initAdminDashboard();
    } catch (e) {
      showToast('Subject allotment error: ' + (e.message || 'Failed to process file.'));
    } finally {
      if (prog) prog.style.display = 'none';
    }
  };

  // =========================================================================
  // 4. ATTENDANCE INTERFACE CONTROLS & ROSTER
  // =========================================================================
  window.initAttendanceSection = function () {
    const role = window.currentUser ? window.currentUser.role : 'student';
    const stuView = $('student-attendance-view');
    const facView = $('faculty-attendance-view');

    if (role === 'student') {
      if (stuView) stuView.classList.remove('hidden');
      if (facView) facView.classList.add('hidden');
      loadStudentAttendance();
    } else {
      if (stuView) stuView.classList.add('hidden');
      if (facView) facView.classList.remove('hidden');
      populateAttendanceSections();
    }
  };

  // =========================================================================
  // 4. ATTENDANCE WORKFLOW & DAILY CLASS ADMISSION PORTAL
  // =========================================================================
  async function loadStudentAttendance() {
    const tb = $('student-attendance-table-body');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading attendance details...</td></tr>';

    try {
      const res = await api('/attendance');
      const rows = res.attendance || [];
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No attendance records found.</td></tr>';
        return;
      }

      let totalClasses = 0, attendedClasses = 0;
      let stuSection = (window.currentUser && window.currentUser.section) || rows[0]?.section || 'CSE-A';
      if ($('stu-att-section-badge')) $('stu-att-section-badge').textContent = stuSection;

      // Also get section student strength
      try {
        const secRes = await api('/attendance/sections');
        const matchSec = (secRes.sections || []).find(s => s.section && s.section.toLowerCase() === stuSection.toLowerCase());
        if (matchSec && $('stu-att-class-strength')) {
          $('stu-att-class-strength').textContent = `${matchSec.student_count || 30} Students`;
        }
      } catch (err) {}

      tb.innerHTML = rows.map(r => {
        const tot = Number(r.total_classes) || 0;
        const att = Number(r.attended_classes) || 0;
        totalClasses += tot;
        attendedClasses += att;
        const pct = tot > 0 ? Math.round((att * 100) / tot) : 0;
        const isGood = pct >= 75;
        const isCond = pct >= 65 && pct < 75;
        let standingBadge = '';
        if (isGood) {
          standingBadge = `<span class="standing-pill standing-good">Satisfactory (${pct}%)</span>`;
        } else if (isCond) {
          standingBadge = `<span class="standing-pill standing-condonation">Condonation (${pct}%)</span>`;
        } else {
          standingBadge = `<span class="standing-pill standing-detained">Shortage (${pct}%)</span>`;
        }

        return `<tr>
          <td style="padding:10px; font-weight:600;">${esc(r.subject)}</td>
          <td style="padding:10px; color:var(--text-muted);">${esc(r.marked_by || 'Assigned Faculty')}</td>
          <td style="padding:10px;">${tot}</td>
          <td style="padding:10px; color:#43e97b; font-weight:600;">${att}</td>
          <td style="padding:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="flex:1; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:${isGood ? '#43e97b' : (isCond ? '#f59e0b' : '#ff4757')};"></div>
              </div>
              <span style="font-size:12px; font-weight:bold;">${pct}%</span>
            </div>
          </td>
          <td style="padding:10px;">${standingBadge}</td>
        </tr>`;
      }).join('');

      const overallPct = totalClasses > 0 ? Math.round((attendedClasses * 100) / totalClasses) : 0;
      if ($('att-summary-pct')) $('att-summary-pct').textContent = `${overallPct}%`;
      if ($('att-summary-attended')) $('att-summary-attended').textContent = attendedClasses;
      if ($('att-summary-total')) $('att-summary-total').textContent = totalClasses;
      if ($('att-summary-eligibility')) {
        const el = $('att-summary-eligibility');
        if (overallPct >= 75) {
          el.textContent = 'Eligible for Exams';
          el.style.color = '#43e97b';
        } else if (overallPct >= 65) {
          el.textContent = 'Condonation Required';
          el.style.color = '#f59e0b';
        } else {
          el.textContent = 'Detained / Severe Shortage';
          el.style.color = '#ff4757';
        }
      }

      // Update 75% Exam Eligibility Target Forecast
      const pBadge = $('att-planner-badge');
      const pMsg = $('att-planner-message');
      if (pBadge && pMsg) {
        if (overallPct >= 75) {
          const maxCanMiss = Math.floor((attendedClasses - 0.75 * totalClasses) / 0.75);
          pBadge.innerHTML = `<i class="fas fa-shield-alt"></i> Safe Standing (${overallPct}%)`;
          pBadge.style.background = 'rgba(16, 185, 129, 0.15)';
          pBadge.style.color = '#10b981';
          pBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          pMsg.innerHTML = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-check-circle"></i> Examination Safe Zone:</span> You currently have <strong>${overallPct}%</strong> overall attendance across ${totalClasses} lectures (${attendedClasses} attended). You can safely afford to miss up to <strong style="color:#10b981; font-size:14px;">${maxCanMiss} upcoming class hours</strong> while still remaining strictly above the university mandatory 75% examination threshold.`;
        } else {
          const needed = Math.ceil((0.75 * totalClasses - attendedClasses) / 0.25);
          pBadge.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Shortage Alert (${overallPct}%)`;
          pBadge.style.background = 'rgba(239, 68, 68, 0.15)';
          pBadge.style.color = '#ef4444';
          pBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
          pMsg.innerHTML = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-exclamation-circle"></i> Attendance Shortage Alert:</span> Your attendance is currently at <strong>${overallPct}%</strong> (below 75% minimum). You must attend the next <strong style="color:#ef4444; font-size:14px;">${needed} consecutive class hours</strong> without missing any to restore your examination eligibility status.`;
        }
      }
    } catch (e) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#ff4757;">Unable to load attendance records.</td></tr>';
    }
  }

  async function populateAttendanceSections() {
    const sel = $('att-filter-section');
    if (!sel) return;

    // Set today's date in date picker if empty
    const dateInput = $('att-daily-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    try {
      let res = await api('/attendance/sections');
      let sections = res.sections || [];
      if (!sections.length) {
        const mRes = await api('/marks/my-sections');
        sections = mRes.sections || [];
      }

      if (sections.length) {
        sel.innerHTML = sections.map(s => {
          const val = s.section;
          const count = s.student_count || 0;
          const lbl = `${s.section} (${count} Students Enrolled)`;
          return `<option value="${esc(val)}" data-count="${count}" data-branch="${esc(s.branch || '')}">${esc(lbl)}</option>`;
        }).join('');
      } else {
        sel.innerHTML = `
          <option value="CSE-A" data-count="31">CSE-A (31 Students Enrolled)</option>
          <option value="CSE-B" data-count="15">CSE-B (15 Students Enrolled)</option>
          <option value="ECE-A" data-count="10">ECE-A (10 Students Enrolled)</option>
        `;
      }
      loadFacultyAttendanceRoster();
    } catch (e) {
      sel.innerHTML = `
        <option value="CSE-A" data-count="31">CSE-A (31 Students Enrolled)</option>
        <option value="CSE-B" data-count="15">CSE-B (15 Students Enrolled)</option>
        <option value="ECE-A" data-count="10">ECE-A (10 Students Enrolled)</option>
      `;
      loadFacultyAttendanceRoster();
    }
  }

  window.currentRosterStudents = [];

  window.loadFacultyAttendanceRoster = async function () {
    const sel = $('att-filter-section');
    const tb = $('faculty-attendance-roster-body');
    if (!sel || !tb) return;

    const secVal = sel.value || 'CSE-A';
    const subVal = $('att-filter-subject')?.value || 'OOPS';
    const dateVal = $('att-daily-date')?.value || new Date().toISOString().split('T')[0];
    const periodVal = $('att-daily-period')?.value || 'Period 1 (09:00 AM - 10:00 AM)';

    tb.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x" style="display:block; margin-bottom:10px; color:#10b981;"></i> Loading enrolled students roster as per student registration...</td></tr>';

    try {
      const [stuRes, attRes, histRes] = await Promise.all([
        api(`/marks/students?section=${encodeURIComponent(secVal)}`),
        api(`/attendance?section=${encodeURIComponent(secVal)}`),
        api(`/attendance/daily_history?section=${encodeURIComponent(secVal)}&date=${encodeURIComponent(dateVal)}&subject=${encodeURIComponent(subVal)}`)
      ]);

      const students = stuRes.students || [];
      const attMap = {};
      (attRes.attendance || []).forEach(a => {
        if (a.subject === subVal) {
          attMap[a.reg_no.toUpperCase()] = a;
        }
      });

      // Check if session exists in history for today's selected period
      const existingSession = (histRes.history || []).find(h => h.period === periodVal);
      let recordedMap = {};
      if (existingSession && existingSession.student_details) {
        try {
          const parsed = JSON.parse(existingSession.student_details);
          parsed.forEach(item => {
            recordedMap[item.reg_no.toUpperCase()] = item.status;
          });
        } catch (err) {}
      }

      if (!students.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fas fa-user-slash fa-2x" style="opacity:0.3; margin-bottom:10px; display:block;"></i> No registered students found in section ' + esc(secVal) + '.</td></tr>';
        window.currentRosterStudents = [];
        updateAttendanceHUD(0, 0, 0, 0);
        return;
      }

      window.currentRosterStudents = students.map((s, idx) => {
        const att = attMap[s.reg_no.toUpperCase()] || { total_classes: 40, attended_classes: 36 };
        const initialStatus = recordedMap[s.reg_no.toUpperCase()] || 'Present';
        return {
          idx: idx + 1,
          regNo: s.reg_no,
          name: s.name,
          branch: s.branch || 'CSE',
          section: s.section || secVal,
          total: Number(att.total_classes) || 40,
          attended: Number(att.attended_classes) || 36,
          status: initialStatus
        };
      });

      renderFacultyAttendanceTable();
    } catch (e) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#ff4757;"><i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:10px; display:block;"></i> Failed to load attendance roster: ' + esc(e.message || 'Server error') + '</td></tr>';
    }
  };

  function updateAttendanceHUD(total, present, absent, od) {
    if ($('hud-total-enrolled')) $('hud-total-enrolled').textContent = total;
    if ($('hud-present-count')) $('hud-present-count').textContent = present;
    if ($('hud-absent-count')) $('hud-absent-count').textContent = absent;
    if ($('hud-od-count')) $('hud-od-count').textContent = od;

    const rate = total > 0 ? Math.round(((present + od) * 100) / total) : 0;
    if ($('hud-rate-bar')) $('hud-rate-bar').style.width = `${rate}%`;
    if ($('hud-rate-label')) $('hud-rate-label').textContent = `${rate}%`;
  }

  function renderFacultyAttendanceTable(studentsToRender) {
    const tb = $('faculty-attendance-roster-body');
    if (!tb) return;

    const list = studentsToRender || window.currentRosterStudents || [];
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No matching students.</td></tr>';
      return;
    }

    // Calculate overall stats from current roster
    const all = window.currentRosterStudents || [];
    const totalEnrolled = all.length;
    const presentCount = all.filter(s => s.status === 'Present').length;
    const absentCount = all.filter(s => s.status === 'Absent').length;
    const odCount = all.filter(s => s.status === 'OD').length;
    updateAttendanceHUD(totalEnrolled, presentCount, absentCount, odCount);

    tb.innerHTML = list.map(st => {
      const pct = st.total > 0 ? Math.round((st.attended * 100) / st.total) : 0;
      let standingBadge = '';
      if (pct >= 75) {
        standingBadge = `<span class="standing-pill standing-good">Good (${pct}%)</span>`;
      } else if (pct >= 65) {
        standingBadge = `<span class="standing-pill standing-condonation">Condonation (${pct}%)</span>`;
      } else {
        standingBadge = `<span class="standing-pill standing-detained">Detained (${pct}%)</span>`;
      }

      return `<tr id="roster-row-${st.regNo}" class="roster-row-highlight" style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td style="padding:12px; color:var(--text-muted); font-size:12px;">${st.idx}</td>
        <td style="padding:12px; font-weight:700; color:#fff;">
          <span style="font-family:monospace; font-size:13px; cursor:pointer;" title="Click to copy" onclick="navigator.clipboard && navigator.clipboard.writeText('${st.regNo}'); showToast('Copied ${st.regNo}');">
            ${esc(st.regNo)} <i class="fas fa-copy" style="font-size:10px; opacity:0.5; margin-left:4px;"></i>
          </span>
        </td>
        <td style="padding:12px; font-weight:600;">${esc(st.name)}</td>
        <td style="padding:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:70px; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:${pct >= 75 ? '#10b981' : (pct >= 65 ? '#f59e0b' : '#ef4444')};"></div>
            </div>
            <span style="font-size:12px; font-weight:600;">${st.attended}/${st.total} (${pct}%)</span>
          </div>
        </td>
        <td style="padding:12px;">${standingBadge}</td>
        <td style="padding:12px; text-align:center;">
          <div class="att-status-group" id="btn-group-${st.regNo}">
            <button type="button" class="att-status-btn ${st.status === 'Present' ? 'active-present' : ''}" onclick="setStudentAttendanceStatus('${st.regNo}', 'Present')">
              <i class="fas fa-check"></i> Present
            </button>
            <button type="button" class="att-status-btn ${st.status === 'Absent' ? 'active-absent' : ''}" onclick="setStudentAttendanceStatus('${st.regNo}', 'Absent')">
              <i class="fas fa-times"></i> Absent
            </button>
            <button type="button" class="att-status-btn ${st.status === 'OD' ? 'active-od' : ''}" onclick="setStudentAttendanceStatus('${st.regNo}', 'OD')">
              <i class="fas fa-id-badge"></i> OD
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  window.setStudentAttendanceStatus = function (regNo, newStatus) {
    const st = (window.currentRosterStudents || []).find(s => s.regNo === regNo);
    if (!st) return;
    st.status = newStatus;

    // Fast DOM button update
    const grp = $(`btn-group-${regNo}`);
    if (grp) {
      const btns = grp.querySelectorAll('.att-status-btn');
      btns.forEach(btn => {
        btn.classList.remove('active-present', 'active-absent', 'active-od');
        if (newStatus === 'Present' && btn.textContent.includes('Present')) btn.classList.add('active-present');
        if (newStatus === 'Absent' && btn.textContent.includes('Absent')) btn.classList.add('active-absent');
        if (newStatus === 'OD' && btn.textContent.includes('OD')) btn.classList.add('active-od');
      });
    }

    // Update HUD counters
    const all = window.currentRosterStudents || [];
    const totalEnrolled = all.length;
    const presentCount = all.filter(s => s.status === 'Present').length;
    const absentCount = all.filter(s => s.status === 'Absent').length;
    const odCount = all.filter(s => s.status === 'OD').length;
    updateAttendanceHUD(totalEnrolled, presentCount, absentCount, odCount);
  };

  window.markAllAttendanceStatus = function (status) {
    if (!window.currentRosterStudents || !window.currentRosterStudents.length) {
      return showToast('No students loaded in roster.');
    }
    window.currentRosterStudents.forEach(st => {
      st.status = status;
    });
    renderFacultyAttendanceTable();
    showToast(`Marked all ${window.currentRosterStudents.length} students as ${status}.`);
  };

  window.filterFacultyAttendanceRoster = function () {
    const q = ($('att-roster-search')?.value || '').trim().toLowerCase();
    if (!q) {
      renderFacultyAttendanceTable(window.currentRosterStudents);
      return;
    }
    const filtered = (window.currentRosterStudents || []).filter(st => {
      return (st.regNo && st.regNo.toLowerCase().includes(q)) || (st.name && st.name.toLowerCase().includes(q));
    });
    renderFacultyAttendanceTable(filtered);
  };

  window.submitDailyClassAttendance = async function () {
    if (!window.currentRosterStudents || !window.currentRosterStudents.length) {
      return showToast('No students loaded in roster.');
    }

    const secVal = $('att-filter-section')?.value || 'CSE-A';
    const subVal = $('att-filter-subject')?.value || 'OOPS';
    const dateVal = $('att-daily-date')?.value || new Date().toISOString().split('T')[0];
    const periodVal = $('att-daily-period')?.value || 'Period 1 (09:00 AM - 10:00 AM)';
    const btn = $('btn-submit-daily-att');

    const studentsPayload = window.currentRosterStudents.map(st => ({
      regNo: st.regNo,
      name: st.name,
      status: st.status || 'Present'
    }));

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting Attendance...';
    }

    try {
      const res = await post('/attendance/daily_submit', {
        date: dateVal,
        period: periodVal,
        subject: subVal,
        section: secVal,
        students: studentsPayload
      });

      if (res.success) {
        showToast(res.message || 'Daily attendance recorded successfully!');

        // Update local cumulative counts (+1 total, +1 attended if Present or OD)
        window.currentRosterStudents.forEach(st => {
          st.total += 1;
          if (st.status === 'Present' || st.status === 'OD') {
            st.attended += 1;
          }
        });
        renderFacultyAttendanceTable();
      } else {
        showToast(res.message || 'Failed to submit attendance.');
      }
    } catch (e) {
      showToast('Error recording daily attendance: ' + (e.message || 'Server error'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Submit &amp; Record Daily Attendance';
      }
    }
  };

  // Aliases for backward compatibility with existing buttons/scripts
  window.markAllAttendance = function (isPresent) {
    window.markAllAttendanceStatus(isPresent ? 'Present' : 'Absent');
  };
  window.saveFacultyAttendanceRoster = window.submitDailyClassAttendance;
  window.toggleStudentAttendance = function (regNo) {
    const st = (window.currentRosterStudents || []).find(s => s.regNo === regNo);
    if (!st) return;
    const next = st.status === 'Present' ? 'Absent' : (st.status === 'Absent' ? 'OD' : 'Present');
    window.setStudentAttendanceStatus(regNo, next);
  };

  window.openDailyAttendanceHistory = async function () {
    const modal = $('daily-attendance-history-modal');
    const content = $('daily-attendance-history-content');
    if (!modal || !content) return;

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    content.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Loading attendance session history...</div>';

    const secVal = $('att-filter-section')?.value || 'CSE-A';
    try {
      const res = await api(`/attendance/daily_history?section=${encodeURIComponent(secVal)}`);
      const logs = res.history || [];
      if (!logs.length) {
        content.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fas fa-clipboard-list fa-2x" style="opacity:0.3; margin-bottom:10px; display:block;"></i>No previous attendance sessions found for section ${esc(secVal)}.</div>`;
        return;
      }

      content.innerHTML = `
        <div style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="border-bottom:2px solid rgba(255,255,255,0.1); text-align:left; background:rgba(255,255,255,0.03);">
                <th style="padding:10px;">Date</th>
                <th style="padding:10px;">Period</th>
                <th style="padding:10px;">Subject</th>
                <th style="padding:10px;">Class Strength</th>
                <th style="padding:10px;">Present</th>
                <th style="padding:10px;">Absent</th>
                <th style="padding:10px;">OD</th>
                <th style="padding:10px;">Admitted %</th>
                <th style="padding:10px;">Marked By</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(log => {
                const rate = log.admit_rate !== undefined ? log.admit_rate : (log.total_enrolled > 0 ? Math.round(((log.present_count + (log.od_count || 0)) * 100) / log.total_enrolled) : 0);
                return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:10px; font-weight:700; color:#fff;">${esc(log.date)}</td>
                  <td style="padding:10px; font-size:12px;">${esc(log.period)}</td>
                  <td style="padding:10px; font-weight:600; color:#38ef7d;">${esc(log.subject)}</td>
                  <td style="padding:10px; font-weight:700;">${log.total_enrolled}</td>
                  <td style="padding:10px; color:#10b981; font-weight:700;">${log.present_count}</td>
                  <td style="padding:10px; color:#ef4444; font-weight:700;">${log.absent_count}</td>
                  <td style="padding:10px; color:#f59e0b; font-weight:700;">${log.od_count || 0}</td>
                  <td style="padding:10px;">
                    <span style="font-weight:700; color:${rate >= 75 ? '#10b981' : '#ef4444'};">${rate}%</span>
                  </td>
                  <td style="padding:10px; color:var(--text-muted); font-size:12px;">${esc(log.marked_by || 'Faculty')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div style="text-align:center; padding:30px; color:#ff4757;">Failed to load session history: ${esc(err.message || 'Server error')}</div>`;
    }
  };

  window.closeDailyAttendanceHistory = function () {
    const modal = $('daily-attendance-history-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
  };

  // =========================================================================
  // 5. CHANGE PASSWORD & ACCOUNT SETTINGS
  // =========================================================================
  window.openChangePasswordModal = function () {
    const modal = $('change-password-modal');
    if (!modal) return;
    if ($('cp-old-password')) $('cp-old-password').value = '';
    if ($('cp-new-password')) $('cp-new-password').value = '';
    if ($('cp-confirm-password')) $('cp-confirm-password').value = '';
    const statusMsg = $('cp-status-msg');
    if (statusMsg) { statusMsg.style.display = 'none'; statusMsg.textContent = ''; }
    modal.classList.remove('hidden');
  };

  window.submitPasswordChange = async function () {
    const oldPw = ($('cp-old-password')?.value || '').trim();
    const newPw = ($('cp-new-password')?.value || '').trim();
    const confPw = ($('cp-confirm-password')?.value || '').trim();
    const statusMsg = $('cp-status-msg');

    const showMsg = (msg, isErr) => {
      if (!statusMsg) return;
      statusMsg.style.display = 'block';
      statusMsg.style.color = isErr ? '#ff4757' : '#43e97b';
      statusMsg.textContent = msg;
    };

    if (!oldPw || !newPw || !confPw) {
      return showMsg('All password fields are required.', true);
    }
    if (newPw.length < 4) {
      return showMsg('New password must be at least 4 characters long.', true);
    }
    if (newPw !== confPw) {
      return showMsg('New password and confirmation do not match.', true);
    }

    try {
      const res = await post('/auth/change_password', {
        old_password: oldPw,
        new_password: newPw
      });

      if (res.success) {
        showMsg(res.message || 'Password changed successfully!', false);
        showToast('Password changed successfully.');
        setTimeout(() => {
          closeModal('change-password-modal');
        }, 1200);
      } else {
        showMsg(res.message || 'Failed to change password.', true);
      }
    } catch (e) {
      showMsg('Failed to change password. Please verify current password.', true);
    }
  };

  // =========================================================================
  // 6. SECTION CHANGE HOOK & INITIALIZATION
  // =========================================================================
  const prevShowSection = window.showSection;
  window.showSection = function (sectionId) {
    if (typeof prevShowSection === 'function') {
      try { prevShowSection(sectionId); } catch (e) { console.warn('prevShowSection error:', e); }
    } else {
      document.querySelectorAll('.content-section').forEach(el => el.classList.add('hidden'));
      const targetSec = $(`sec-${sectionId}`);
      if (targetSec) targetSec.classList.remove('hidden');
    }

    try {
      if (sectionId === 'attendance' && typeof window.initAttendanceSection === 'function') {
        window.initAttendanceSection();
      } else if (sectionId === 'results' && typeof window.initFacultyResultsUI === 'function') {
        window.initFacultyResultsUI();
      } else if (sectionId === 'events' && typeof window.loadEvents === 'function') {
        window.loadEvents();
      } else if (sectionId === 'leave' && typeof window.loadLeaveRequests === 'function') {
        window.loadLeaveRequests();
      }
    } catch(e) { console.warn('section init error:', e); }
  };

  // =========================================================================
  // 1. NOTIFICATIONS CENTER & LIVE BADGE COUNTER
  // =========================================================================
  let currentNotifsList = [];
  let currentNotifFilter = 'all';

  window.updateNotificationBadge = async function () {
    try {
      const d = await api('/notifications');
      const notifs = d.notifications || [];
      const unread = notifs.filter(n => !n.is_read).length;
      
      const badge = $('faculty-notification-count');
      if (badge) {
        badge.innerText = unread;
        badge.classList.toggle('has-unread', unread > 0);
        badge.style.display = unread > 0 ? 'inline-flex' : 'none';
      }
      const modalPill = $('notif-center-unread-pill');
      if (modalPill) {
        modalPill.innerText = `${unread} New`;
        modalPill.style.display = unread > 0 ? 'inline-block' : 'none';
      }
    } catch(e) {}
  };

  window.openNotifications = async function () {
    $('notification-center-modal')?.classList.remove('hidden');
    try {
      const d = await api('/notifications');
      currentNotifsList = d.notifications || [];
      window.renderNotificationList();
      window.updateNotificationBadge();
    } catch (e) {
      const box = $('notification-center-list');
      if (box) box.innerHTML = '<div class="state-box"><i class="fas fa-exclamation-circle"></i> Unable to load notifications.</div>';
    }
  };

  window.filterNotifications = function(tag, btn) {
    currentNotifFilter = tag || 'all';
    document.querySelectorAll('.notif-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window.renderNotificationList();
  };

  window.renderNotificationList = function() {
    const box = $('notification-center-list');
    if (!box) return;

    let filtered = currentNotifsList;
    if (currentNotifFilter === 'event') {
      filtered = filtered.filter(n => (n.category_tag || '').toLowerCase().includes('event'));
    } else if (currentNotifFilter === 'leave') {
      filtered = filtered.filter(n => (n.category_tag || '').toLowerCase().includes('leave') || (n.category_tag || '').toLowerCase().includes('sub'));
    } else if (currentNotifFilter === 'emergency') {
      filtered = filtered.filter(n => (n.category_tag || '').toLowerCase().includes('emergency') || (n.category_tag || '').toLowerCase().includes('exam') || (n.category_tag || '').toLowerCase().includes('alert'));
    }

    if (!filtered || !filtered.length) {
      box.innerHTML = `<div class="state-box" style="text-align:center; padding:30px 10px; color:var(--text-muted);"><i class="fas fa-bell-slash" style="font-size:32px; margin-bottom:10px;"></i><p>No notifications in this category.</p></div>`;
      return;
    }

    box.innerHTML = filtered.map(n => {
      const tagLower = (n.category_tag || '').toLowerCase();
      let icon = 'fa-bell';
      let iconGrad = 'grad-purple';
      let targetSection = '';

      if (tagLower.includes('event')) { icon = 'fa-ticket-alt'; iconGrad = 'grad-pink'; targetSection = 'events'; }
      else if (tagLower.includes('leave') || tagLower.includes('sub')) { icon = 'fa-file-signature'; iconGrad = 'grad-blue'; targetSection = 'leave'; }
      else if (tagLower.includes('exam')) { icon = 'fa-graduation-cap'; iconGrad = 'grad-orange'; targetSection = 'results'; }
      else if (tagLower.includes('emergency')) { icon = 'fa-exclamation-triangle'; iconGrad = 'grad-red'; }

      return `
        <div class="list-item notification-row ${n.is_read ? 'notification-read' : 'unread-item'}" 
             style="margin-bottom:10px; cursor:pointer; align-items:flex-start; padding:12px; border-radius:12px; transition:all 0.2s ease;"
             onclick="handleNotificationClick(${n.id}, '${targetSection}')">
          <div class="list-icon ${iconGrad}" style="padding:10px; border-radius:10px; margin-right:12px; font-size:16px;">
            <i class="fas ${icon}"></i>
          </div>
          <div class="list-content" style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
              <h4 style="margin:0; font-size:13px; font-weight:700;">${esc(n.category_tag)}</h4>
              <small style="color:${n.is_read ? 'var(--text-muted)' : '#8b5cf6'}; font-size:10px; font-weight:700;">
                ${n.is_read ? 'Read' : '● NEW'}
              </small>
            </div>
            <p style="margin:0 0 6px; font-size:12px; color:var(--text-main, #e2e8f0); line-height:1.4;">${esc(n.message)}</p>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <small style="color:var(--text-muted); font-size:10px;"><i class="far fa-clock"></i> ${n.timestamp || 'Recent'}</small>
              ${targetSection ? `<span style="font-size:10px; color:var(--primary-color); font-weight:600;"><i class="fas fa-arrow-right"></i> Open</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  window.handleNotificationClick = async function(id, targetSection) {
    try {
      await post('/notifications/read', { id });
      const item = currentNotifsList.find(n => n.id === id);
      if (item) item.is_read = 1;
      window.updateNotificationBadge();
      window.renderNotificationList();
    } catch(e) {}

    if (targetSection) {
      closeModal('notification-center-modal');
      showSection(targetSection);
    }
  };

  window.readNotification = async function (id) {
    try { 
      await post('/notifications/read', { id }); 
      window.openNotifications(); 
      window.updateNotificationBadge();
    } catch (e) {}
  };

  window.markAllNotificationsRead = async function () {
    try {
      const d = await post('/notifications/read', { id: 'all' });
      showToast(d.message || 'All notifications marked as read.');
      currentNotifsList.forEach(n => n.is_read = 1);
      window.renderNotificationList();
      window.updateNotificationBadge();
    } catch (e) {
      showToast('Unable to update notifications.');
    }
  };

  // Periodic badge poller
  setInterval(window.updateNotificationBadge, 15000);
  setTimeout(window.updateNotificationBadge, 2000);

  // =========================================================================
  // 2. UPGRADED EVENT HUB & FEST MANAGEMENT SYSTEM
  // =========================================================================
  let loadedEvents = [];
  let currentEventCategory = 'all';

  window.loadEvents = async function() {
    try {
      const res = await fetch(`${API_BASE}/events/list`);
      const data = await res.json();
      if (data.success && Array.isArray(data.events)) {
        loadedEvents = data.events;
        if (typeof globalData !== 'undefined') globalData.events = data.events;
      } else if (typeof globalData !== 'undefined' && Array.isArray(globalData.events)) {
        loadedEvents = globalData.events;
      }
    } catch(e) {
      if (typeof globalData !== 'undefined' && Array.isArray(globalData.events)) {
        loadedEvents = globalData.events;
      }
    }
    window.renderEvents();
  };

  window.selectEventCategory = function(cat, el) {
    currentEventCategory = cat;
    document.querySelectorAll('.event-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    window.filterEventsUI();
  };

  window.filterEventsUI = function() {
    const searchVal = ($('event-search-input')?.value || '').toLowerCase().trim();
    const timingVal = $('event-timing-filter')?.value || 'all';
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const filtered = loadedEvents.filter(ev => {
      if (currentEventCategory !== 'all') {
        const catStr = (ev.category || '').toLowerCase();
        if (!catStr.includes(currentEventCategory.toLowerCase())) return false;
      }
      if (searchVal) {
        const fullStr = `${ev.title || ''} ${ev.category || ''} ${ev.organizer || ''} ${ev.venue || ''} ${ev.description || ''}`.toLowerCase();
        if (!fullStr.includes(searchVal)) return false;
      }
      if (timingVal === 'today') {
        if (ev.date && !ev.date.includes(todayStr)) return false;
      } else if (timingVal === 'upcoming') {
        if (ev.date && new Date(ev.date) < new Date(todayStr)) return false;
      }
      return true;
    });

    window.renderEventCards(filtered);
  };

  window.renderEvents = function() {
    window.filterEventsUI();
    const totalBadge = $('event-total-badge');
    if (totalBadge) totalBadge.innerText = `${loadedEvents.length} Active Events`;
    
    const addBtn = $('btn-admin-add-event');
    if (addBtn) {
      const canManage = currentUser && ['admin', 'principal', 'faculty'].includes(currentUser.role);
      addBtn.style.display = canManage ? 'inline-flex' : 'none';
    }
    const ticketsBtn = $('btn-my-tickets');
    if (ticketsBtn) {
      ticketsBtn.style.display = 'inline-flex';
    }
  };

  window.renderEventCards = function(list) {
    const container = $('events-container');
    if (!container) return;

    if (!list || !list.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:50px 20px; color:var(--text-muted); background:rgba(255,255,255,0.02); border-radius:18px; border:1px dashed rgba(255,255,255,0.1);">
          <i class="fas fa-calendar-times" style="font-size:36px; margin-bottom:12px; color:var(--primary-color);"></i>
          <h3 style="color:#fff; margin-bottom:6px;">No Events Found</h3>
          <p style="font-size:13px; margin:0;">Try adjusting your category filters or search query.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(ev => {
      const d = ev.date ? new Date(ev.date) : new Date();
      const monthStr = isNaN(d) ? 'OCT' : d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const dayNum = isNaN(d) ? '15' : d.getDate();

      let daysBadge = '';
      if (!isNaN(d)) {
        const today = new Date();
        today.setHours(0,0,0,0);
        d.setHours(0,0,0,0);
        const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) daysBadge = `<span class="pill ok" style="font-size:10px;">🟢 TODAY</span>`;
        else if (diffDays > 0) daysBadge = `<span class="pill" style="background:rgba(59,130,246,0.2); color:#60a5fa; font-size:10px;">in ${diffDays}d</span>`;
        else daysBadge = `<span class="pill" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:10px;">Completed</span>`;
      }

      const catLower = (ev.category || '').toLowerCase();
      let tagClass = 'technical';
      let tagIcon = 'fa-laptop-code';
      if (catLower.includes('hackathon')) { tagClass = 'hackathon'; tagIcon = 'fa-code'; }
      else if (catLower.includes('workshop') || catLower.includes('ai')) { tagClass = 'workshop'; tagIcon = 'fa-tools'; }
      else if (catLower.includes('cultural') || catLower.includes('fest')) { tagClass = 'cultural'; tagIcon = 'fa-theater-masks'; }
      else if (catLower.includes('sports')) { tagClass = 'sports'; tagIcon = 'fa-trophy'; }

      const maxSeats = ev.max_seats || 100;
      const count = ev.registrations_count || 0;
      const pct = Math.min(100, Math.round((count / maxSeats) * 100));

      const isStudent = currentUser && currentUser.role === 'student';
      const canManage = currentUser && ['admin', 'principal', 'faculty'].includes(currentUser.role);
      const isRegistered = ev.is_registered;

      return `
        <div class="event-card">
          <div>
            <div class="event-card-head">
              <div class="event-date-box">
                <div class="month">${monthStr}</div>
                <div class="day">${dayNum}</div>
              </div>
              <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                <span class="event-tag ${tagClass}"><i class="fas ${tagIcon}"></i> ${esc(ev.category || 'Event')}</span>
                ${daysBadge}
              </div>
            </div>

            <h3 class="event-title">${esc(ev.title)}</h3>
            <div class="event-meta-line"><i class="far fa-clock"></i> <span>${esc(ev.time || '10:00 AM')}</span></div>
            <div class="event-meta-line"><i class="fas fa-map-marker-alt"></i> <span>${esc(ev.venue || 'Campus Auditorium')}</span></div>
            <div class="event-meta-line"><i class="fas fa-user-shield"></i> <span>By: ${esc(ev.organizer || 'BVC College')}</span></div>

            <p class="event-desc">${esc(ev.description || 'Join this exciting event to gain practical experience, interact with industry professionals, and showcase your skills.')}</p>
            
            <div class="event-capacity-box">
              <div class="event-cap-text">
                <span><i class="fas fa-users"></i> ${count} Registered</span>
                <span>${maxSeats} Max Seats</span>
              </div>
              <div class="event-cap-bar">
                <div class="event-cap-fill" style="width: ${pct}%;"></div>
              </div>
            </div>
          </div>

          <div class="event-actions">
            ${isStudent ? (isRegistered ? `
              <button class="btn-primary" style="flex:1; padding:8px 12px; font-size:11px; font-weight:700; border-radius:12px; background:linear-gradient(90deg, #10b981, #059669);" 
                      onclick="loadMyTickets()">
                <i class="fas fa-check-circle"></i> View My Pass
              </button>
            ` : `
              <button class="btn-success" style="flex:1; padding:8px 12px; font-size:11px; font-weight:700; border-radius:12px;" 
                      onclick="openRegistrationModal(${ev.id}, '${esc(ev.title).replace(/'/g, "\\'")}')">
                <i class="fas fa-ticket-alt"></i> Register (Free Pass)
              </button>
            `) : ''}

            ${canManage ? `
              <button class="btn-secondary" style="flex:1; padding:8px 12px; font-size:11px; border-radius:12px;" 
                      onclick="viewEventAttendees(${ev.id}, '${esc(ev.title).replace(/'/g, "\\'")}')">
                <i class="fas fa-users"></i> Attendees (${count})
              </button>
              <button class="icon-btn" style="color:#ef4444; padding:8px;" title="Delete Event" 
                      onclick="deleteEvent(${ev.id}, '${esc(ev.title).replace(/'/g, "\\'")}')">
                <i class="fas fa-trash-alt"></i>
              </button>
            ` : ''}

            <button class="icon-btn" style="padding:8px;" title="Add to Calendar (.ics)" onclick="downloadEventCalendar(${ev.id})">
              <i class="fas fa-calendar-plus"></i>
            </button>
            <button class="icon-btn" style="padding:8px;" title="Share Event" onclick="shareEvent(${ev.id})">
              <i class="fas fa-share-alt"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  };

  window.openRegistrationModal = function(id, title) {
    if ($('reg-event-id')) $('reg-event-id').value = id;
    if ($('reg-event-title')) $('reg-event-title').value = title;
    if ($('reg-no-display')) $('reg-no-display').value = currentUser?.reg_no || '';
    if ($('reg-domain')) $('reg-domain').value = '';
    if ($('reg-info')) $('reg-info').value = '';
    $('registration-modal')?.classList.remove('hidden');
  };

  window.submitRegistration = async function() {
    const event_id = $('reg-event-id')?.value;
    const domain = $('reg-domain')?.value;
    const pitch = $('reg-info')?.value || '';

    if (!domain) return showToast('Please select your preferred track / domain.');

    try {
      const res = await fetch(`${API_BASE}/events/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id, domain, pitch })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Registration confirmed! Digital Pass generated.');
        closeModal('registration-modal');
        await window.loadEvents();
        window.loadMyTickets();
      } else {
        showToast(data.message || 'Unable to register for event.');
      }
    } catch(e) {
      showToast('Network error while submitting registration.');
    }
  };

  window.loadMyTickets = async function() {
    const list = $('ticket-list');
    if (!list) return;

    list.innerHTML = `<div class="skel mb-2"></div><div class="skel"></div>`;
    $('ticket-modal')?.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE}/events/my_tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regNo: currentUser?.reg_no })
      });
      const data = await res.json();
      const tickets = data.tickets || [];

      if (!tickets.length) {
        list.innerHTML = `
          <div class="state-box" style="text-align:center; padding:40px 10px;">
            <i class="fas fa-ticket-alt" style="font-size:36px; margin-bottom:12px; color:var(--primary-color);"></i>
            <h3 style="color:#fff;">No Event Passes Found</h3>
            <p style="color:var(--text-muted); font-size:13px;">Browse the Event Hub to register for upcoming hackathons, workshops, and fests!</p>
          </div>
        `;
        return;
      }

      list.innerHTML = tickets.map(t => `
        <div class="digital-pass mb-2" id="ticket-pass-${t.ticket_no}">
          <div class="pass-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <i class="fas fa-university" style="font-size:16px;"></i>
              <strong style="font-size:13px; letter-spacing:0.5px;">BONAM VENKATA CHALAMAYYA ENGINEERING COLLEGE</strong>
            </div>
            <span class="pill ok" style="font-size:10px; background:rgba(255,255,255,0.25); color:#fff;">OFFICIAL PASS</span>
          </div>

          <div class="pass-body">
            <div>
              <div class="pass-field">
                <label>Event Name</label>
                <val style="font-size:17px; color:#a78bfa;">${esc(t.title)}</val>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="pass-field">
                  <label>Date &amp; Time</label>
                  <val>${esc(t.date)} | ${esc(t.time || '10:00 AM')}</val>
                </div>
                <div class="pass-field">
                  <label>Venue / Hall</label>
                  <val>${esc(t.venue || 'Campus Auditorium')}</val>
                </div>
                <div class="pass-field">
                  <label>Passholder Name</label>
                  <val>${esc(currentUser?.name || 'Student')}</val>
                </div>
                <div class="pass-field">
                  <label>Registration Number</label>
                  <val>${esc(currentUser?.reg_no || '--')}</val>
                </div>
                <div class="pass-field">
                  <label>Track / Domain</label>
                  <val>${esc(t.domain || 'General')}</val>
                </div>
                <div class="pass-field">
                  <label>Organized By</label>
                  <val>${esc(t.organizer || 'BVC')}</val>
                </div>
              </div>
            </div>

            <div class="pass-qr-box">
              <i class="fas fa-qrcode" style="font-size:68px; color:#fff; margin-bottom:8px;"></i>
              <span style="font-size:11px; font-weight:800; color:#38ef7d; letter-spacing:1px;">VERIFIED PASS</span>
              <span style="font-size:10px; color:var(--text-muted); margin-top:4px;">${t.ticket_no || 'BVC-TKT'}</span>
            </div>
          </div>

          <div class="pass-footer">
            <span class="barcode-sim">|||||| | |||| || | |||||||| ||||</span>
            <button class="btn-secondary" style="width:auto; padding:6px 14px; font-size:11px;" onclick="window.print()">
              <i class="fas fa-print"></i> Print / Download PDF
            </button>
          </div>
        </div>
      `).join('');

    } catch(e) {
      list.innerHTML = `<div class="state-box"><i class="fas fa-exclamation-circle"></i> Unable to fetch tickets.</div>`;
    }
  };

  window.downloadEventCalendar = function(id) {
    const ev = loadedEvents.find(e => e.id === id);
    if (!ev) return;
    const dateFormatted = (ev.date || '2026-10-25').replace(/-/g, '');
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BVC Smart Portal//Campus Events//EN",
      "BEGIN:VEVENT",
      `SUMMARY:${ev.title}`,
      `DESCRIPTION:${ev.description || ''}`,
      `LOCATION:${ev.venue || 'BVC Engineering College'}`,
      `DTSTART:${dateFormatted}T043000Z`,
      `DTEND:${dateFormatted}T110000Z`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${ev.title.replace(/\s+/g, '_')}.ics`;
    link.click();
    showToast('Calendar (.ics) invite downloaded.');
  };

  window.shareEvent = function(id) {
    const ev = loadedEvents.find(e => e.id === id);
    if (!ev) return;
    const text = `🎉 Upcoming BVC Event: ${ev.title}\n📅 Date: ${ev.date} (${ev.time || '10:00 AM'})\n📍 Venue: ${ev.venue}\nRegister now on BVC Smart Portal!`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast('Event details copied to clipboard!');
    } else {
      prompt('Copy event details:', text);
    }
  };

  window.toggleAddEventForm = function() {
    $('admin-add-event-box')?.classList.toggle('hidden');
  };

  window.submitNewEvent = async function() {
    const title = $('ev-title')?.value.trim();
    const cat = $('ev-cat')?.value;
    const date = $('ev-date')?.value;
    const time_str = $('ev-time')?.value.trim() || '10:00 AM';
    const venue = $('ev-venue')?.value.trim();
    const org = $('ev-org')?.value.trim();
    const max_seats = $('ev-capacity')?.value || 100;
    const desc = $('ev-desc')?.value.trim();

    if (!title || !date || !venue) return showToast('Title, Date, and Venue are required!');

    try {
      const res = await fetch(`${API_BASE}/events/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category: cat, date, time: time_str, venue, organizer: org, max_seats, description: desc })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Event published successfully!');
        window.toggleAddEventForm();
        if ($('ev-title')) $('ev-title').value = '';
        if ($('ev-desc')) $('ev-desc').value = '';
        await window.loadEvents();
        window.updateNotificationBadge();
      } else {
        showToast(data.message || 'Failed to publish event.');
      }
    } catch(e) {
      showToast('Error connecting to server.');
    }
  };

  window.deleteEvent = async function(id, title) {
    if (!confirm(`Are you sure you want to cancel and delete the event: "${title}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/events/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Event deleted.');
        await window.loadEvents();
        window.updateNotificationBadge();
      } else {
        showToast(data.message || 'Failed to delete event.');
      }
    } catch(e) {
      showToast('Error deleting event.');
    }
  };

  window.viewEventAttendees = async function(eventId, eventTitle) {
    $('attendees-modal-event-title').innerText = eventTitle;
    const tbody = $('attendees-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center;">Loading attendee data...</td></tr>`;
    $('event-attendees-modal')?.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE}/events/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId })
      });
      const data = await res.json();
      const attendees = data.attendees || [];
      window.currentAttendeesList = attendees;

      if (!attendees.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">No student registrations recorded yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = attendees.map((a, i) => `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:8px 10px;">${i+1}</td>
          <td style="padding:8px 10px; font-weight:700; color:var(--primary-color);">${esc(a.reg_no)}</td>
          <td style="padding:8px 10px;">${esc(a.name || '--')}</td>
          <td style="padding:8px 10px;">${esc(a.branch || '--')} ${a.section ? `(${a.section})` : ''}</td>
          <td style="padding:8px 10px;"><span class="pill" style="font-size:10px; background:rgba(255,255,255,0.08);">${esc(a.domain || 'Track')}</span></td>
          <td style="padding:8px 10px; font-family:monospace; color:#38ef7d;">${esc(a.ticket_no || 'TKT')}</td>
        </tr>
      `).join('');
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#ef4444;">Failed to load attendees.</td></tr>`;
    }
  };

  window.exportAttendeesCSV = function() {
    const list = window.currentAttendeesList || [];
    if (!list.length) return showToast('No attendees to export.');
    let csv = "SNo,RegNo,Name,Branch,Section,Domain,TicketNo,Timestamp\n";
    list.forEach((a, i) => {
      csv += `${i+1},"${a.reg_no}","${a.name || ''}","${a.branch || ''}","${a.section || ''}","${a.domain || ''}","${a.ticket_no || ''}","${a.timestamp || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Attendees_${Date.now()}.csv`;
    link.click();
    showToast('Attendees CSV exported.');
  };

  window.printAttendeesList = function() {
    window.print();
  };

  // =========================================================================
  // 3. FACULTY MULTI-TIER LEAVE APPROVAL WORKFLOW (Substitute -> HOD -> Principal)
  // =========================================================================
  window.loadLeaveRequests = async function() {
    const container = $('leave-requests-container');
    const title = $('leave-board-title');
    if (!container) return;

    try {
      const res = await fetch(`${API_BASE}/leave/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: currentUser.role, branch: currentUser.branch, name: currentUser.name, regNo: currentUser.reg_no })
      });
      const data = await res.json();
      const displayReqs = data.leaves || data.requests || [];

      if (title) {
        if (currentUser.role === 'student') title.innerText = "My Leave & Permission Applications";
        else if (currentUser.role === 'faculty') title.innerText = "My Leaves, Substitution Requests & Student Approvals";
        else if (currentUser.role === 'hod') title.innerText = `${currentUser.branch || 'Department'} Leave Approval Queue`;
        else if (currentUser.role === 'principal') title.innerText = "Principal Executive Leave Sanction Queue";
        else title.innerText = "All Leave & Permission Records";
      }

      if (!displayReqs.length) {
        container.innerHTML = `<div class="state-box" style="text-align:center; padding:30px;"><i class="fas fa-clipboard-check" style="font-size:32px; margin-bottom:8px;"></i><p>No pending leave requests in your queue.</p></div>`;
        return;
      }

      container.innerHTML = displayReqs.map(r => {
        let actionBtn = '';
        let statusColor = '#f39c12';
        const isStudentReq = Boolean(r.is_student_req);
        const userName = (currentUser.name || '').toLowerCase();
        const subName = (r.substitute || '').toLowerCase();
        const isMySub = subName && (subName.includes(userName) || userName.includes(subName));

        // State detection
        const status = r.status || '';
        const isPendingSub = status === 'Pending with Substitute Faculty' || status === 'PENDING_SUB';
        const isAcceptedSub = status.includes('Accepted by Substitute') || status === 'PENDING_HOD';
        const isPendingHOD = isAcceptedSub || status === 'Approved by Class Teacher — Pending with HOD';
        const isPendingPrin = status.includes('Pending with Principal') || status === 'PENDING_PRIN';
        const isApproved = status === 'Approved by Principal' || status === 'APPROVED' || (isStudentReq && status === 'Approved by HOD');
        const isRejected = status.includes('Rejected') || status === 'REJECTED';

        // 1. Substitute Faculty Stage
        if (isPendingSub) {
          statusColor = '#f39c12';
          if (currentUser.role === 'faculty' && isMySub) {
            actionBtn = `
              <button class="btn-success" style="font-size:12px; padding:7px 14px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:5px;" onclick="openSignatureModal('${r.id}', 'substitute')">
                <i class="fas fa-check-circle"></i> Accept Sub (Sign &amp; Forward to HOD)
              </button>
              <button class="btn-danger" style="margin-left:8px; font-size:12px; padding:7px 14px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:5px;" onclick="rejectLeave('${r.id}', 'substitute')">
                <i class="fas fa-times-circle"></i> Reject Sub
              </button>
            `;
          }
        } 
        // 2. Class Teacher Stage for Student
        else if ((status === 'Pending with Class Teacher' || status === 'PENDING_CT') && isStudentReq) {
          statusColor = '#f39c12';
          if (currentUser.role === 'faculty' && (currentUser.name === r.teacher || !r.teacher)) {
            actionBtn = `
              <button class="btn-success" style="font-size:12px; padding:7px 14px; border-radius:10px;" onclick="openSignatureModal('${r.id}', 'ct')">CT Approve</button>
              <button class="btn-danger" style="margin-left:8px; font-size:12px; padding:7px 14px; border-radius:10px;" onclick="rejectLeave('${r.id}', 'ct')">Reject</button>
            `;
          }
        }
        // 3. HOD Stage
        else if (isPendingHOD) {
          statusColor = '#3b82f6';
          if (currentUser.role === 'hod' && (!r.branch || !currentUser.branch || r.branch.toLowerCase() === currentUser.branch.toLowerCase())) {
            actionBtn = `
              <button class="btn-success" style="font-size:12px; padding:7px 14px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:5px;" onclick="openSignatureModal('${r.id}', 'hod')">
                <i class="fas fa-check-double"></i> ${isStudentReq ? 'HOD Approve' : 'HOD Approve &amp; Forward to Principal'}
              </button>
              <button class="btn-danger" style="margin-left:8px; font-size:12px; padding:7px 14px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:5px;" onclick="rejectLeave('${r.id}', 'hod')">
                <i class="fas fa-times"></i> Reject
              </button>
            `;
          }
        }
        // 4. Principal Stage
        else if (isPendingPrin) {
          statusColor = '#8b5cf6';
          if (currentUser.role === 'principal' || currentUser.role === 'admin') {
            actionBtn = `
              <button class="btn-success" style="font-size:12px; padding:7px 16px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:5px; background:linear-gradient(90deg, #10b981, #059669);" onclick="openSignatureModal('${r.id}', 'principal')">
                <i class="fas fa-stamp"></i> Sanction &amp; Approve (Principal Sign)
              </button>
              <button class="btn-danger" style="margin-left:8px; font-size:12px; padding:7px 14px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:5px;" onclick="rejectLeave('${r.id}', 'principal')">
                <i class="fas fa-times"></i> Reject
              </button>
            `;
          }
        }
        // 5. Approved Final Stage
        else if (isApproved) {
          statusColor = '#10b981';
          actionBtn = `
            <button class="btn-primary" style="font-size:11px; padding:7px 14px; border-radius:10px; display:inline-flex; align-items:center; gap:5px;" onclick="${r.is_student_req ? 'viewStudentCertificate' : 'viewCertificate'}('${r.id}')">
              <i class="fas fa-file-contract"></i> View Official Leave Slip (All Signatures)
            </button>
          `;
        }
        // 6. Rejected Stage
        else if (isRejected) {
          statusColor = '#ef4444';
        }

        // Multi-tier visual workflow steps for faculty leaves
        let chainHTML = '';
        if (!isStudentReq) {
          const subDone = r.sub_signature || status.includes('Accepted by Substitute') || isPendingHOD || isPendingPrin || isApproved;
          const subRej = status === 'Rejected by Substitute Faculty';
          const subStageClass = subDone ? 'approved-stage' : (subRej ? 'rejected-stage' : (isPendingSub ? 'active-stage' : ''));

          const hodDone = r.hod_signature || isPendingPrin || isApproved;
          const hodRej = status === 'Rejected by HOD';
          const hodStageClass = hodDone ? 'approved-stage' : (hodRej ? 'rejected-stage' : (isPendingHOD ? 'active-stage' : ''));

          const prinDone = isApproved;
          const prinRej = status === 'Rejected by Principal' || status === 'REJECTED';
          const prinStageClass = prinDone ? 'approved-stage' : (prinRej ? 'rejected-stage' : (isPendingPrin ? 'active-stage' : ''));

          chainHTML = `
            <div class="leave-approval-chain">
              <div class="chain-node ${subStageClass}">
                <span class="role-title"><i class="fas fa-user-friends"></i> 1. Substitute Faculty</span>
                <span class="signer-name">${esc(r.substitute || 'Colleague Assigned')}</span>
                <span class="stage-status" style="color:${subDone ? '#10b981' : (subRej ? '#ef4444' : (isPendingSub ? '#f59e0b' : 'var(--text-muted)'))};">
                  ${subDone ? '✔ Accepted &amp; Signed' : (subRej ? '✖ Rejected' : (isPendingSub ? '⏳ Awaiting Decision' : 'Pending'))}
                </span>
                ${r.sub_remarks ? `<small style="color:var(--text-muted); font-size:10px; font-style:italic;">"${esc(r.sub_remarks)}"</small>` : ''}
              </div>

              <div class="chain-node ${hodStageClass}">
                <span class="role-title"><i class="fas fa-building"></i> 2. Head of Dept (HOD)</span>
                <span class="signer-name">${esc(r.branch || 'Department')} HOD</span>
                <span class="stage-status" style="color:${hodDone ? '#10b981' : (hodRej ? '#ef4444' : (isPendingHOD ? '#3b82f6' : 'var(--text-muted)'))};">
                  ${hodDone ? '✔ Approved &amp; Signed' : (hodRej ? '✖ Rejected' : (isPendingHOD ? '⏳ Awaiting Review' : 'Pending'))}
                </span>
                ${r.hod_remarks ? `<small style="color:var(--text-muted); font-size:10px; font-style:italic;">"${esc(r.hod_remarks)}"</small>` : ''}
              </div>

              <div class="chain-node ${prinStageClass}">
                <span class="role-title"><i class="fas fa-landmark"></i> 3. College Principal</span>
                <span class="signer-name">Principal Sanction</span>
                <span class="stage-status" style="color:${prinDone ? '#10b981' : (prinRej ? '#ef4444' : (isPendingPrin ? '#8b5cf6' : 'var(--text-muted)'))};">
                  ${prinDone ? '🎉 Sanctioned &amp; Approved' : (prinRej ? '✖ Rejected' : (isPendingPrin ? '⏳ Awaiting Final Sanction' : 'Pending'))}
                </span>
                ${r.prin_remarks ? `<small style="color:var(--text-muted); font-size:10px; font-style:italic;">"${esc(r.prin_remarks)}"</small>` : ''}
              </div>
            </div>
          `;
        }

        let typeBadge = `<span class="pill" style="background:rgba(255,255,255,0.1); font-size:11px;">${esc(r.type || 'Leave')}</span>`;
        if (isStudentReq) typeBadge += `<span class="pill" style="background:rgba(139,92,246,0.25); color:#a78bfa; font-size:11px; margin-left:6px;">Student</span>`;

        return `
          <div class="list-item mb-2" style="border-left: 4px solid ${statusColor}; flex-direction:column; padding:16px; border-radius:14px; background:rgba(255,255,255,0.03);">
            <div style="width:100%; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
              <div>
                <h4 style="margin:0 0 4px; font-size:15px; color:#fff;">
                  ${esc(r.requester)} ${typeBadge}
                </h4>
                <p style="margin:0 0 4px; font-size:12px; color:var(--text-muted);">
                  ${r.designation ? `<strong>${esc(r.designation)}</strong> | ` : ''}
                  ${r.branch ? `Dept: <strong>${esc(r.branch)}</strong> | ` : ''}
                  Period: <strong>${esc(r.details || r.leave_from || 'Scheduled Absence')}</strong>
                </p>
                <p style="margin:4px 0; font-size:13px; color:var(--text-main);">
                  <strong>Reason:</strong> ${esc(r.reason || 'None provided')}
                </p>
              </div>
              <div style="text-align:right;">
                <span class="pill" style="background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}55; font-size:11px; font-weight:700;">
                  ${esc(r.status)}
                </span>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Date: ${r.date_requested || 'Recent'}</div>
              </div>
            </div>

            ${chainHTML}

            ${actionBtn ? `
              <div style="display:flex; justify-content:flex-end; width:100%; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06);">
                ${actionBtn}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

    } catch(e) {
      container.innerHTML = `<div class="state-box"><i class="fas fa-exclamation-circle"></i> Error fetching leave requests.</div>`;
    }
  };

  window.rejectLeave = async function(id, roleStr) {
    const remarks = prompt(`Please enter the rejection reason for this request:`);
    if (remarks === null) return;
    try {
      const res = await fetch(`${API_BASE}/leave/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role: roleStr, action: 'reject', remarks: remarks.trim() })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Request marked as Rejected.');
        window.loadLeaveRequests();
        window.updateNotificationBadge();
      } else {
        showToast(data.message || 'Unable to update request.');
      }
    } catch(e) {
      showToast('Error connecting to server.');
    }
  };

  window.openGrievance = function () {
    if ($('grievance-subject')) $('grievance-subject').value = '';
    if ($('grievance-message')) $('grievance-message').value = '';
    $('grievance-modal')?.classList.remove('hidden');
  };

  window.submitGrievance = async function () {
    const subject = ($('grievance-subject')?.value || '').trim();
    const message = ($('grievance-message')?.value || '').trim();
    if (!subject || !message) return showToast('Please enter a subject and details.');
    try {
      const d = await post('/grievance/create', { subject, message });
      showToast(d.message || 'Grievance submitted.');
      if (d.success) closeModal('grievance-modal');
    } catch (e) {
      showToast('Unable to submit grievance.');
    }
  };

  // Wire AI training
  window.submitAITraining = async function () {
    const tags = ($('ai-train-tags')?.value || '').trim();
    const response = ($('ai-train-response')?.value || '').trim();
    if (!tags || !response) return showToast('Keywords and AI response are required.');
    try {
      const d = await post('/ai/train', { tags, response });
      showToast(d.message || 'Knowledge base updated.');
      if ($('ai-train-tags')) $('ai-train-tags').value = '';
      if ($('ai-train-response')) $('ai-train-response').value = '';
    } catch (e) {
      showToast('Unable to update Campus AI.');
    }
  };

  // Ensure button stylings for toggle attendance pills
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .btn-present { background: rgba(56, 239, 125, 0.15) !important; color: #38ef7d !important; border: 1px solid rgba(56, 239, 125, 0.4) !important; }
    .btn-present:hover { background: rgba(56, 239, 125, 0.25) !important; }
    .btn-absent { background: rgba(255, 71, 87, 0.15) !important; color: #ff4757 !important; border: 1px solid rgba(255, 71, 87, 0.4) !important; }
    .btn-absent:hover { background: rgba(255, 71, 87, 0.25) !important; }
  `;
  document.head.appendChild(styleEl);

  // Initialize event and leave listeners on load
  document.addEventListener('DOMContentLoaded', () => {
    window.updateNotificationBadge();
  });

})();

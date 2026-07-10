export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const escapeCell = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown) {
  const text = value == null ? "" : String(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isLeaveLikeStatus(status: string) {
  const lower = status.toLowerCase();
  return lower.includes("leave") || lower.includes("lop");
}

export function downloadExcel(
  filename: string,
  rows: Array<Record<string, unknown>>,
  options?: { highlightStatus?: (status: string) => boolean },
) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const shouldHighlight =
    options?.highlightStatus ??
    ((status: string) => isLeaveLikeStatus(status));

  const headerRow = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const bodyRows = rows
    .map((row) => {
      const status = String(row.status ?? "");
      const style = shouldHighlight(status) ? ' style="background:#fecaca;color:#991b1b;"' : "";
      const cells = headers
        .map((header) => `<td${style}>${escapeHtml(row[header])}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body><table border="1"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename.replace(/\.xlsx?$/i, "")}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadAttendanceExcel(
  filename: string,
  rows: Array<{
    employee: string;
    employeeId: string;
    date: string;
    status: string;
    homeBranch: string;
    actualBranch: string;
    punchIn: string;
    punchOut: string;
    source: string;
  }>,
) {
  if (rows.length === 0) return;

  const escapeXml = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  };

  const summaryMap = new Map<string, {
    name: string;
    code: string;
    present: number;
    absent: number;
    total: number;
    records: typeof rows;
  }>();

  for (const row of rows) {
    const key = row.employeeId || row.employee;
    let stats = summaryMap.get(key);
    if (!stats) {
      stats = {
        name: row.employee,
        code: row.employeeId,
        present: 0,
        absent: 0,
        total: 0,
        records: [],
      };
      summaryMap.set(key, stats);
    }
    
    stats.records.push(row);
    stats.total++;
    const statusLower = row.status.toLowerCase();
    if (statusLower.includes("absent") || statusLower.includes("leave") || statusLower.includes("lop")) {
      stats.absent++;
    } else {
      stats.present++;
    }
  }

  const summaries = Array.from(summaryMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  let overviewRowsXml = `
    <Row ss:Height="22">
      <Cell ss:StyleID="Header"><Data ss:Type="String">Employee Name</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Employee ID</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Days Present</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Days Absent/Leave</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Total Days</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Attendance Rate</Data></Cell>
    </Row>
  `;

  for (const s of summaries) {
    const rate = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0;
    const rateStyle = rate < 85 ? "LowRate" : rate > 95 ? "HighRate" : "Default";
    overviewRowsXml += `
      <Row ss:Height="18">
        <Cell><Data ss:Type="String">${escapeXml(s.name)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(s.code)}</Data></Cell>
        <Cell ss:StyleID="PresentCell"><Data ss:Type="Number">${s.present}</Data></Cell>
        <Cell ss:StyleID="AbsentCell"><Data ss:Type="Number">${s.absent}</Data></Cell>
        <Cell><Data ss:Type="Number">${s.total}</Data></Cell>
        <Cell ss:StyleID="${rateStyle}"><Data ss:Type="String">${rate}%</Data></Cell>
      </Row>
    `;
  }

  let worksheetsXml = `
    <Worksheet ss:Name="Overview">
      <Table>
        <Column ss:Width="160"/>
        <Column ss:Width="100"/>
        <Column ss:Width="90"/>
        <Column ss:Width="120"/>
        <Column ss:Width="80"/>
        <Column ss:Width="110"/>
        ${overviewRowsXml}
      </Table>
    </Worksheet>
  `;

  for (const s of summaries) {
    let tabName = s.name.replace(/[:\\/?*\[\]]/g, "").slice(0, 30);
    if (!tabName) tabName = s.code || "Employee";

    let empRowsXml = `
      <Row ss:Height="22">
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Date</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Status</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Home Branch</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Actual Branch</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Punch In</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Punch Out</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Source</Data></Cell>
      </Row>
    `;

    const sortedRecords = [...s.records].sort((a, b) => b.date.localeCompare(a.date));

    for (const row of sortedRecords) {
      const statusLower = row.status.toLowerCase();
      const isAbsent = statusLower.includes("absent") || statusLower.includes("leave") || statusLower.includes("lop");
      const statusStyle = isAbsent ? "AbsentCell" : "Default";
      
      empRowsXml += `
        <Row ss:Height="18">
          <Cell><Data ss:Type="String">${escapeXml(row.date)}</Data></Cell>
          <Cell ss:StyleID="${statusStyle}"><Data ss:Type="String">${escapeXml(row.status)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(row.homeBranch)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(row.actualBranch)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(row.punchIn)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(row.punchOut)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(row.source)}</Data></Cell>
        </Row>
      `;
    }

    worksheetsXml += `
      <Worksheet ss:Name="${escapeXml(tabName)}">
        <Table>
          <Column ss:Width="100"/>
          <Column ss:Width="100"/>
          <Column ss:Width="120"/>
          <Column ss:Width="120"/>
          <Column ss:Width="90"/>
          <Column ss:Width="90"/>
          <Column ss:Width="140"/>
          ${empRowsXml}
        </Table>
      </Worksheet>
    `;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>Anytime Diesel HRMS</Author>
    <Created>${new Date().toISOString()}</Created>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
      <Interior ss:Color="#2563EB" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="DetailHeader">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
      <Interior ss:Color="#475569" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="PresentCell">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#16A34A" ss:Bold="1"/>
    </Style>
    <Style ss:ID="AbsentCell">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#DC2626" ss:Bold="1"/>
      <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="LowRate">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#EF4444" ss:Bold="1"/>
      <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="HighRate">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#22C55E" ss:Bold="1"/>
      <Interior ss:Color="#F0FDF4" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${worksheetsXml}
</Workbook>
`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename.replace(/\.xlsx?$/i, "")}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

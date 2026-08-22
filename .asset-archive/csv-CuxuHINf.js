import{n as e,r as t}from"./india-date--DPZONQO.js";function n(e,t){if(t.length===0)return;let n=Object.keys(t[0]),r=e=>{let t=e==null?``:String(e);return/^[=+\-@\t\r]/.test(t)&&(t=`'${t}`),`"${t.replaceAll(`"`,`""`)}"`},i=[n.map(r).join(`,`),...t.map(e=>n.map(t=>r(e[t])).join(`,`))].join(`\r
`),a=new Blob([i],{type:`text/csv;charset=utf-8`}),o=URL.createObjectURL(a),s=document.createElement(`a`);s.href=o,s.download=e,s.click(),URL.revokeObjectURL(o)}function r(e){let t=Math.max(0,Math.round(e));return[Math.floor(t/3600),Math.floor(t%3600/60),t%60].map(e=>String(e).padStart(2,`0`)).join(`:`)}function i(e,t){return!Number.isFinite(e)||t<=0?0:Math.max(0,e)/t}function a(e,t){let n=e.trim().toLowerCase();return n===`full day`||n===`half day`||n.startsWith(`present`)||t>0}function o(n,o,s){if(o.length===0)return;let c=e=>(e==null?``:String(e)).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&apos;`),l=[s?.periodLabel?`Pay period: ${s.periodLabel}`:null,s?.from||s?.to?`Range: ${t(s.from,s.to)}`:null].filter(Boolean).join(` · `),u=new Map;for(let e of o){let t=e.employeeId||e.employee,n=u.get(t);n||(n={name:e.employee,code:e.employeeId,present:0,absent:0,total:0,workedSeconds:0,records:[]},u.set(t,n)),n.records.push(e),n.total++,n.workedSeconds+=e.workedSeconds;let r=e.status.toLowerCase();a(e.status,e.workedSeconds)?n.present++:(r.includes(`absent`)||r.includes(`leave`)||r.includes(`lop`))&&n.absent++}let d=Array.from(u.values()).sort((e,t)=>e.name.localeCompare(t.name)),f=l?`
    <Row ss:Height="20">
      <Cell ss:MergeAcross="6" ss:StyleID="Meta"><Data ss:Type="String">${c(l)}</Data></Cell>
    </Row>
  `:``;f+=`
    <Row ss:Height="22">
      <Cell ss:StyleID="Header"><Data ss:Type="String">Employee Name</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Employee ID</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Days Present</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Days Absent/Leave</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Total Days</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Average Working Time Per Day (HH:MM:SS)</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Attendance Rate</Data></Cell>
    </Row>
  `;for(let e of d){let t=e.total>0?Math.round(e.present/e.total*100):0,n=t<85?`LowRate`:t>95?`HighRate`:`Default`;f+=`
      <Row ss:Height="18">
        <Cell><Data ss:Type="String">${c(e.name)}</Data></Cell>
        <Cell><Data ss:Type="String">${c(e.code)}</Data></Cell>
        <Cell ss:StyleID="PresentCell"><Data ss:Type="Number">${e.present}</Data></Cell>
        <Cell ss:StyleID="AbsentCell"><Data ss:Type="Number">${e.absent}</Data></Cell>
        <Cell><Data ss:Type="Number">${e.total}</Data></Cell>
        <Cell><Data ss:Type="String">${r(i(e.workedSeconds,e.present))}</Data></Cell>
        <Cell ss:StyleID="${n}"><Data ss:Type="String">${t}%</Data></Cell>
      </Row>
    `}let p=`
    <Worksheet ss:Name="Overview">
      <Table>
        <Column ss:Width="160"/>
        <Column ss:Width="100"/>
        <Column ss:Width="90"/>
        <Column ss:Width="120"/>
        <Column ss:Width="80"/>
        <Column ss:Width="210"/>
        <Column ss:Width="110"/>
        ${f}
      </Table>
    </Worksheet>
  `;for(let t of d){let n=t.name.replace(/[:\\/?*[\]]/g,``).slice(0,30);n||=t.code||`Employee`;let i=`
      <Row ss:Height="22">
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Date</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Status</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Home Branch</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Actual Branch</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Punch In</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Punch Out</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Worked Time (HH:MM:SS)</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Source In</Data></Cell>
        <Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Source Out</Data></Cell>
      </Row>
    `,a=[...t.records].sort((e,t)=>t.date.localeCompare(e.date));for(let t of a){let n=t.status.toLowerCase(),a=n.includes(`absent`)||n.includes(`leave`)||n.includes(`lop`)?`AbsentCell`:`Default`;i+=`
        <Row ss:Height="18">
          <Cell><Data ss:Type="String">${c(e(t.date))}</Data></Cell>
          <Cell ss:StyleID="${a}"><Data ss:Type="String">${c(t.status)}</Data></Cell>
          <Cell><Data ss:Type="String">${c(t.homeBranch)}</Data></Cell>
          <Cell><Data ss:Type="String">${c(t.actualBranch)}</Data></Cell>
          <Cell><Data ss:Type="String">${c(t.punchIn)}</Data></Cell>
          <Cell><Data ss:Type="String">${c(t.punchOut)}</Data></Cell>
          <Cell><Data ss:Type="String">${r(t.workedSeconds)}</Data></Cell>
          <Cell><Data ss:Type="String">${c(t.sourceIn)}</Data></Cell>
          <Cell><Data ss:Type="String">${c(t.sourceOut)}</Data></Cell>
        </Row>
      `}p+=`
      <Worksheet ss:Name="${c(n)}">
        <Table>
          <Column ss:Width="100"/>
          <Column ss:Width="100"/>
          <Column ss:Width="120"/>
          <Column ss:Width="120"/>
          <Column ss:Width="90"/>
          <Column ss:Width="90"/>
          <Column ss:Width="110"/>
          <Column ss:Width="140"/>
          ${i}
        </Table>
      </Worksheet>
    `}let m=`<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>AnyTime Diesel Workforce</Author>
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
    <Style ss:ID="Meta">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#475569" ss:Bold="1"/>
    </Style>
  </Styles>
  ${p}
</Workbook>
`,h=new Blob([m],{type:`application/vnd.ms-excel;charset=utf-8`}),g=URL.createObjectURL(h),_=document.createElement(`a`);_.href=g,_.download=n.endsWith(`.xls`)?n:`${n.replace(/\.xlsx?$/i,``)}.xls`,_.click(),URL.revokeObjectURL(g)}export{n,o as t};
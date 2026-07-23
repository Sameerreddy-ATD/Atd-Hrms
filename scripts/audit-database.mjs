import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const checks = [];
const warnings = [];

function serialize(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item)),
  );
}

function quote(identifier) {
  return `\`${String(identifier).replaceAll("`", "``")}\``;
}

async function countCheck(name, sql, message, severity = "error") {
  const rows = await prisma.$queryRawUnsafe(sql);
  const count = Number(rows[0]?.count ?? 0);
  const result = { name, ok: count === 0, count, message };
  checks.push(result);
  if (count > 0 && severity === "warning") warnings.push(result);
  return result;
}

function hasCycle(nodes, idKey, parentKey) {
  const parents = new Map(nodes.map((node) => [node[idKey], node[parentKey]]));
  for (const node of nodes) {
    const seen = new Set();
    let current = node[idKey];
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parents.get(current);
    }
  }
  return false;
}

try {
  const databaseRows = await prisma.$queryRawUnsafe("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRows[0]?.databaseName;
  if (!databaseName) throw new Error("DATABASE_URL does not select a database");

  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name AS tableName, engine AS tableEngine, table_collation AS collation, table_rows AS estimatedRows
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tableNames = new Set(tables.map((table) => table.tableName));
  const rowCounts = {};
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS count FROM ${quote(table.tableName)}`,
    );
    rowCounts[table.tableName] = Number(rows[0]?.count ?? 0);
  }

  const nonTransactional = tables.filter((table) => table.tableEngine !== "InnoDB");
  checks.push({
    name: "transactional table engines",
    ok: nonTransactional.length === 0,
    count: nonTransactional.length,
    message: "Every application table must use InnoDB for transactions and foreign keys",
  });
  const nonUtf8 = tables.filter((table) => !String(table.collation ?? "").startsWith("utf8mb4"));
  checks.push({
    name: "utf8mb4 table collations",
    ok: nonUtf8.length === 0,
    count: nonUtf8.length,
    message: "Every application table should support full Unicode",
  });

  const foreignKeyRows = await prisma.$queryRawUnsafe(`
    SELECT k.constraint_name AS constraintName,
           k.table_name AS childTable,
           k.column_name AS childColumn,
           k.referenced_table_name AS parentTable,
           k.referenced_column_name AS parentColumn,
           k.ordinal_position AS ordinalPosition,
           r.delete_rule AS deleteRule,
           r.update_rule AS updateRule
    FROM information_schema.key_column_usage k
    JOIN information_schema.referential_constraints r
      ON r.constraint_schema = k.constraint_schema
     AND r.constraint_name = k.constraint_name
     AND r.table_name = k.table_name
    WHERE k.constraint_schema = DATABASE()
      AND k.referenced_table_name IS NOT NULL
    ORDER BY k.table_name, k.constraint_name, k.ordinal_position
  `);
  const foreignKeys = new Map();
  for (const row of foreignKeyRows) {
    const key = `${row.childTable}.${row.constraintName}`;
    const entry = foreignKeys.get(key) ?? {
      constraintName: row.constraintName,
      childTable: row.childTable,
      parentTable: row.parentTable,
      deleteRule: row.deleteRule,
      updateRule: row.updateRule,
      columns: [],
    };
    entry.columns.push({ child: row.childColumn, parent: row.parentColumn });
    foreignKeys.set(key, entry);
  }
  for (const foreignKey of foreignKeys.values()) {
    const join = foreignKey.columns
      .map(({ child, parent }) => `child.${quote(child)} = parent.${quote(parent)}`)
      .join(" AND ");
    const populated = foreignKey.columns
      .map(({ child }) => `child.${quote(child)} IS NOT NULL`)
      .join(" AND ");
    const missing = foreignKey.columns
      .map(({ parent }) => `parent.${quote(parent)} IS NULL`)
      .join(" AND ");
    await countCheck(
      `foreign key ${foreignKey.constraintName}`,
      `SELECT COUNT(*) AS count FROM ${quote(foreignKey.childTable)} child LEFT JOIN ${quote(foreignKey.parentTable)} parent ON ${join} WHERE ${populated} AND ${missing}`,
      `${foreignKey.childTable} must not reference a missing ${foreignKey.parentTable}`,
    );
  }

  if (tableNames.has("_prisma_migrations")) {
    await countCheck(
      "finished Prisma migrations",
      "SELECT COUNT(*) AS count FROM `_prisma_migrations` WHERE finished_at IS NULL AND rolled_back_at IS NULL",
      "No migration may remain unfinished",
    );
  } else {
    checks.push({
      name: "Prisma migration history",
      ok: false,
      count: 1,
      message: "_prisma_migrations is missing",
    });
  }

  await countCheck(
    "employee and account profile sync",
    `SELECT COUNT(*) AS count FROM employees e JOIN users u ON u.employee_id = e.employee_id
     WHERE NOT (e.name <=> u.name) OR NOT (e.email <=> u.email) OR NOT (e.phone <=> u.phone)`,
    "Linked employee and user name, email, and phone must match",
  );
  await countCheck(
    "employee and account status sync",
    `SELECT COUNT(*) AS count FROM employees e JOIN users u ON u.employee_id = e.employee_id
     WHERE (e.status = 'ACTIVE' AND u.status <> 'ACTIVE') OR (e.status <> 'ACTIVE' AND u.status = 'ACTIVE')`,
    "Linked employee and login status must agree",
  );
  await countCheck(
    "employee versions",
    "SELECT COUNT(*) AS count FROM employees WHERE version < 1",
    "Employee versions must be positive for safe API synchronization",
  );
  await countCheck(
    "employee manager self-reference",
    "SELECT COUNT(*) AS count FROM employees WHERE manager_id = employee_id",
    "An employee cannot manage themselves",
  );
  await countCheck(
    "employee shift ranges",
    "SELECT COUNT(*) AS count FROM employees WHERE shift_start_minutes NOT BETWEEN 0 AND 1439 OR shift_end_minutes NOT BETWEEN 0 AND 1439",
    "Shift minutes must be valid minutes within a day",
  );
  await countCheck(
    "employee company assignments",
    `SELECT COUNT(*) AS count FROM employees
     WHERE company_entity NOT IN (
       'ROYAL_PETRO_PARK_PRIVATE_LIMITED',
       'ANYTIME_DIESEL',
       'FUELISTIC_INNOVATIONS_PRIVATE_LIMITED'
     )`,
    "Every employee must reference a supported legal company entity",
  );
  await countCheck(
    "employee blood groups",
    `SELECT COUNT(*) AS count FROM employees
     WHERE blood_group IS NOT NULL AND blood_group NOT IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')`,
    "Blood group values must use the supported medical notation",
  );
  await countCheck(
    "employee private field encryption",
    `SELECT COUNT(*) AS count FROM employees
     WHERE (bank_account_number_encrypted IS NOT NULL AND bank_account_number_encrypted NOT LIKE 'v1.%')
        OR (pan_number_encrypted IS NOT NULL AND pan_number_encrypted NOT LIKE 'v1.%')
        OR (aadhaar_number_encrypted IS NOT NULL AND aadhaar_number_encrypted NOT LIKE 'v1.%')
        OR (uan_number_encrypted IS NOT NULL AND uan_number_encrypted NOT LIKE 'v1.%')`,
    "Bank account, PAN, Aadhaar, and UAN values must use the versioned encrypted envelope",
  );
  await countCheck(
    "employee private field masks",
    `SELECT COUNT(*) AS count FROM employees
     WHERE (bank_account_number_encrypted IS NULL) <> (bank_account_number_last4 IS NULL)
        OR (pan_number_encrypted IS NULL) <> (pan_number_last4 IS NULL)
        OR (aadhaar_number_encrypted IS NULL) <> (aadhaar_number_last4 IS NULL)
        OR (uan_number_encrypted IS NULL) <> (uan_number_last4 IS NULL)`,
    "Every encrypted employee identifier must have a matching last-four display value",
  );

  const managerRows = await prisma.employee.findMany({
    select: { employeeId: true, managerId: true },
  });
  checks.push({
    name: "employee manager hierarchy cycles",
    ok: !hasCycle(managerRows, "employeeId", "managerId"),
    count: hasCycle(managerRows, "employeeId", "managerId") ? 1 : 0,
    message: "The reporting hierarchy must be acyclic",
  });
  const departmentRows = await prisma.department.findMany({
    select: { departmentId: true, parentDepartmentId: true },
  });
  checks.push({
    name: "department hierarchy cycles",
    ok: !hasCycle(departmentRows, "departmentId", "parentDepartmentId"),
    count: hasCycle(departmentRows, "departmentId", "parentDepartmentId") ? 1 : 0,
    message: "The department hierarchy must be acyclic",
  });

  await countCheck(
    "branch coordinates",
    `SELECT COUNT(*) AS count FROM branches
     WHERE (latitude IS NULL) <> (longitude IS NULL)
        OR latitude NOT BETWEEN -90 AND 90
        OR longitude NOT BETWEEN -180 AND 180
        OR attendance_radius_meters NOT BETWEEN 25 AND 5000`,
    "Branch coordinates must be paired and geofence values must be in range",
  );
  await countCheck(
    "attendance numeric totals",
    `SELECT COUNT(*) AS count FROM attendance_daily_summary
     WHERE total_hours < 0 OR office_hours < 0 OR field_hours < 0 OR client_visit_hours < 0
        OR branch_movement_count < 0 OR field_visit_count < 0 OR client_visit_count < 0`,
    "Attendance totals and counts cannot be negative",
  );
  await countCheck(
    "field attendance time order",
    "SELECT COUNT(*) AS count FROM field_attendance WHERE check_out_time IS NOT NULL AND check_out_time < check_in_time",
    "Field check-out cannot occur before check-in",
  );
  await countCheck(
    "paired field checkout coordinates",
    "SELECT COUNT(*) AS count FROM field_attendance WHERE (check_out_latitude IS NULL) <> (check_out_longitude IS NULL)",
    "Field check-out latitude and longitude must be stored together",
  );

  await countCheck(
    "leave request ranges",
    "SELECT COUNT(*) AS count FROM leave_requests WHERE to_date < from_date OR days <= 0",
    "Leave requests require an ordered date range and positive day count",
  );
  await countCheck(
    "leave balance arithmetic",
    `SELECT COUNT(*) AS count FROM leave_balances
     WHERE ABS(balance - (entitled + manual_adjustment - used)) > 0.01 OR used < 0`,
    "Leave balances must equal entitlement plus adjustment minus usage",
    "warning",
  );

  await countCheck(
    "expense claim domain values",
    `SELECT COUNT(*) AS count FROM expense_claims
     WHERE amount <= 0 OR claim_type NOT IN ('ADVANCE','EXPENSE') OR status NOT IN ('PENDING','UNPAID','REJECTED','PAID')`,
    "Expense amount, type, and workflow status must be valid",
  );
  await countCheck(
    "expense required fields",
    `SELECT COUNT(*) AS count FROM expense_claims
     WHERE (claim_type = 'ADVANCE' AND (remark IS NULL OR TRIM(remark) = ''))
        OR (claim_type = 'EXPENSE' AND (title IS NULL OR expense_date IS NULL OR description IS NULL OR receipt_url IS NULL))`,
    "Advance and expense records must retain their required business fields",
  );
  await countCheck(
    "expense attachment sharing confirmation",
    "SELECT COUNT(*) AS count FROM expense_claims WHERE receipt_url IS NOT NULL AND receipt_access_confirmed = 0",
    "Every stored expense attachment must have sharing confirmation",
  );
  await countCheck(
    "expense payment timestamps",
    "SELECT COUNT(*) AS count FROM expense_claims WHERE (status = 'PAID' AND paid_at IS NULL) OR (status <> 'PAID' AND paid_at IS NOT NULL)",
    "Paid status and paid timestamp must agree",
  );
  await countCheck(
    "HR document workflow values",
    `SELECT COUNT(*) AS count FROM certificate_requests
     WHERE status NOT IN ('PENDING','IN_PROGRESS','READY','REJECTED','COLLECTED')
        OR delivery_mode NOT IN ('DIGITAL','PHYSICAL')`,
    "HR document status and delivery mode must be valid",
  );
  await countCheck(
    "digital HR document completion",
    `SELECT COUNT(*) AS count FROM certificate_requests
     WHERE delivery_mode = 'DIGITAL' AND status IN ('READY','COLLECTED') AND document_url IS NULL`,
    "Ready digital HR documents require a document link",
  );

  await countCheck(
    "asset assignment state",
    `SELECT COUNT(*) AS count FROM company_assets
     WHERE (assigned_employee_id IS NOT NULL AND status <> 'ASSIGNED')
        OR (status = 'ASSIGNED' AND assigned_employee_id IS NULL)
        OR (assignment_scope = 'COMPANY' AND assigned_employee_id IS NOT NULL)`,
    "Asset status, scope, and employee assignment must agree",
  );
  await countCheck(
    "asset financial values",
    "SELECT COUNT(*) AS count FROM company_assets WHERE purchase_value < 0",
    "Asset purchase value cannot be negative",
  );

  await countCheck(
    "task assignments",
    `SELECT COUNT(*) AS count FROM work_tasks t
     WHERE t.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.task_id)`,
    "Every active task must have at least one assignee",
  );
  await countCheck(
    "task stage board match",
    `SELECT COUNT(*) AS count FROM work_tasks t JOIN task_stages s ON s.stage_id = t.stage_id
     WHERE t.board_id IS NULL OR t.board_id <> s.board_id`,
    "A task stage must belong to the task board",
  );
  await countCheck(
    "task stage and status sync",
    `SELECT COUNT(*) AS count FROM work_tasks t JOIN task_stages s ON s.stage_id = t.stage_id
     WHERE t.status <> s.status`,
    "Task status must match its workflow stage",
  );
  await countCheck(
    "task completion state",
    `SELECT COUNT(*) AS count FROM work_tasks
     WHERE progress NOT BETWEEN 0 AND 100 OR version < 1
        OR (status = 'COMPLETED' AND (progress <> 100 OR completed_at IS NULL))
        OR (status <> 'COMPLETED' AND completed_at IS NOT NULL)`,
    "Task progress, version, status, and completion timestamp must agree",
  );
  await countCheck(
    "task date ranges",
    "SELECT COUNT(*) AS count FROM work_tasks WHERE start_date IS NOT NULL AND due_date IS NOT NULL AND due_date < start_date",
    "Task due date cannot be before its start date",
  );
  await countCheck(
    "task update ranges",
    `SELECT COUNT(*) AS count FROM task_updates
     WHERE (progress IS NOT NULL AND progress NOT BETWEEN 0 AND 100)
        OR (minutes_worked IS NOT NULL AND minutes_worked NOT BETWEEN 0 AND 1440)`,
    "Task activity progress and time values must be valid",
  );
  await countCheck(
    "board workflow endpoints",
    `SELECT COUNT(*) AS count FROM task_boards b
     WHERE NOT EXISTS (SELECT 1 FROM task_stages s WHERE s.board_id = b.board_id AND s.status = 'TODO')
        OR (SELECT COUNT(*) FROM task_stages s WHERE s.board_id = b.board_id AND s.status = 'COMPLETED') <> 1`,
    "Every task board requires a to-do stage and exactly one completed stage",
  );
  await countCheck(
    "board versions",
    "SELECT COUNT(*) AS count FROM task_boards WHERE version < 1",
    "Task board versions must be positive for safe concurrent administration",
  );
  await countCheck(
    "board access policy rows",
    `SELECT COUNT(*) AS count FROM task_boards b
     WHERE (b.access_type = 'OPEN' AND (
              EXISTS (SELECT 1 FROM task_board_roles r WHERE r.board_id = b.board_id)
              OR EXISTS (SELECT 1 FROM task_board_members m WHERE m.board_id = b.board_id)
            ))
        OR (b.access_type = 'ROLE_GATED' AND (
              NOT EXISTS (SELECT 1 FROM task_board_roles r WHERE r.board_id = b.board_id)
              OR EXISTS (SELECT 1 FROM task_board_members m WHERE m.board_id = b.board_id)
            ))
        OR (b.access_type = 'MEMBER_GATED' AND (
              NOT EXISTS (SELECT 1 FROM task_board_members m WHERE m.board_id = b.board_id)
              OR EXISTS (SELECT 1 FROM task_board_roles r WHERE r.board_id = b.board_id)
            ))`,
    "Board role/member rows must match the selected access policy",
  );
  await countCheck(
    "board assignment access",
    `SELECT COUNT(*) AS count
     FROM task_assignments a
     JOIN work_tasks t ON t.task_id = a.task_id
     JOIN task_boards b ON b.board_id = t.board_id
     JOIN employees e ON e.employee_id = a.employee_id
     LEFT JOIN users u ON u.employee_id = e.employee_id
     WHERE (b.access_type = 'MEMBER_GATED' AND NOT EXISTS (
              SELECT 1 FROM task_board_members m
              WHERE m.board_id = b.board_id AND m.employee_id = a.employee_id
            ))
        OR (b.access_type = 'ROLE_GATED' AND (
              u.id IS NULL OR NOT EXISTS (
                SELECT 1 FROM task_board_roles r
                WHERE r.board_id = b.board_id AND r.role = u.role
              )
            ))`,
    "Every task assignee must remain eligible under the board access policy",
  );
  await countCheck(
    "completed stage flags",
    `SELECT COUNT(*) AS count FROM task_stages
     WHERE (status = 'COMPLETED' AND is_completed = 0) OR (status <> 'COMPLETED' AND is_completed = 1)`,
    "Legacy completion flags must remain consistent with canonical stage status",
  );

  const sensitiveColumns = await prisma.$queryRawUnsafe(`
    SELECT table_name AS tableName, column_name AS columnName, data_type AS dataType
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND (column_name LIKE '%password%' OR column_name LIKE '%secret%' OR column_name LIKE '%token%')
    ORDER BY table_name, column_name
  `);
  const plainPasswordColumns = sensitiveColumns.filter((column) =>
    ["password", "secret", "token"].includes(String(column.columnName).toLowerCase()),
  );
  checks.push({
    name: "sensitive credential column naming",
    ok: plainPasswordColumns.length === 0,
    count: plainPasswordColumns.length,
    message: "Credential columns must explicitly store hashes, never plaintext values",
  });

  const failures = checks.filter((check) => !check.ok && !warnings.includes(check));
  const result = serialize({
    database: databaseName,
    auditedAt: new Date().toISOString(),
    summary: {
      tables: tables.length,
      rows: Object.values(rowCounts).reduce((total, value) => total + value, 0),
      foreignKeys: foreignKeys.size,
      checks: checks.length,
      failures: failures.length,
      warnings: warnings.length,
    },
    storage: {
      tables: tables.map(({ tableName, tableEngine, collation }) => ({
        table: tableName,
        rows: rowCounts[tableName],
        engine: tableEngine,
        collation,
      })),
      sensitiveColumns,
    },
    checks,
  });
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify(
      { reachable: false, error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

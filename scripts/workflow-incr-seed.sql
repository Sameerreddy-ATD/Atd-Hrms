INSERT INTO users (id, email, name, role, status, password_hash, created_at, updated_at)
VALUES
  ('u_wf_accept_admin', 'wf-accept-admin@test.local', 'WF Accept Admin', 'DEVELOPER_ADMIN', 'ACTIVE', 'x', NOW(3), NOW(3)),
  ('u_wf_accept_member', 'wf-accept-member@test.local', 'WF Accept Member', 'EMPLOYEE', 'ACTIVE', 'x', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO employees (employee_id, employee_code, name, email, status, created_at, updated_at)
VALUES
  ('e_wf_accept_lead', 'WF-ACCEPT-L', 'WF Accept Lead', 'wf-accept-lead@test.local', 'ACTIVE', NOW(3), NOW(3)),
  ('e_wf_accept_member', 'WF-ACCEPT-M', 'WF Accept Member', 'wf-accept-member@test.local', 'ACTIVE', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE name=VALUES(name);

UPDATE users SET employee_id='e_wf_accept_member' WHERE id='u_wf_accept_member';

INSERT INTO task_boards (
  board_id, name, key_prefix, next_issue_number, description, access_type, archived, version,
  created_by_user_id, lead_employee_id, created_at, updated_at
) VALUES (
  'b_wf_accept', 'Accept Project', 'ACC', 3, 'Incremental acceptance seed', 'MEMBER_GATED', 0, 1,
  'u_wf_accept_admin', 'e_wf_accept_lead', NOW(3), NOW(3)
) ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO task_stages (stage_id, board_id, name, color, sort_order, is_completed, status, status_category)
VALUES
  ('s_wf_todo', 'b_wf_accept', 'Custom Intake', 'SLATE', 0, 0, 'TODO', 'TODO'),
  ('s_wf_doing', 'b_wf_accept', 'Custom Build', 'AMBER', 1, 0, 'IN_PROGRESS', 'IN_PROGRESS'),
  ('s_wf_done', 'b_wf_accept', 'Custom Ship', 'EMERALD', 2, 1, 'COMPLETED', 'DONE')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO task_board_members (board_id, employee_id, role)
VALUES
  ('b_wf_accept', 'e_wf_accept_lead', 'PROJECT_LEAD'),
  ('b_wf_accept', 'e_wf_accept_member', 'MEMBER')
ON DUPLICATE KEY UPDATE role=VALUES(role);

INSERT INTO work_tasks (
  task_id, title, description, status, priority, progress, version, `rank`,
  board_id, stage_id, issue_number, issue_key, issue_type,
  created_by_user_id, reporter_user_id, parent_task_id, archived_at,
  last_activity_at, created_at, updated_at
) VALUES
  ('t_wf_epic', 'Seed Epic', 'epic desc', 'TODO', 'HIGH', 0, 1, 1000,
   'b_wf_accept', 's_wf_todo', 1, 'ACC-1', 'EPIC',
   'u_wf_accept_admin', 'u_wf_accept_admin', NULL, NULL, NOW(3), NOW(3), NOW(3)),
  ('t_wf_story', 'Seed Story', 'story desc', 'IN_PROGRESS', 'MEDIUM', 40, 2, 2500,
   'b_wf_accept', 's_wf_doing', 2, 'ACC-2', 'STORY',
   'u_wf_accept_admin', 'u_wf_accept_member', 't_wf_epic', NULL, NOW(3), NOW(3), NOW(3)),
  ('t_wf_arch', 'Seed Archived', 'archived', 'IN_PROGRESS', 'LOW', 10, 1, 3000,
   'b_wf_accept', 's_wf_doing', 3, 'ACC-3', 'TASK',
   'u_wf_accept_admin', 'u_wf_accept_admin', NULL, NOW(3), NOW(3), NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE title=VALUES(title);

INSERT INTO task_assignments (assignment_id, task_id, employee_id, assigned_by_user_id, assigned_at)
VALUES ('as_wf_story', 't_wf_story', 'e_wf_accept_member', 'u_wf_accept_admin', NOW(3))
ON DUPLICATE KEY UPDATE assigned_by_user_id=VALUES(assigned_by_user_id);

INSERT INTO task_updates (update_id, task_id, author_user_id, activity_type, message, created_at)
VALUES ('u_wf_comment', 't_wf_story', 'u_wf_accept_member', 'COMMENT', 'preserve this comment', NOW(3))
ON DUPLICATE KEY UPDATE message=VALUES(message);

INSERT INTO task_attachments (attachment_id, task_id, file_name, mime_type, size_bytes, storage_key, uploaded_by_id, created_at)
VALUES ('a_wf_file', 't_wf_story', 'seed.txt', 'text/plain', 11, 'wf-accept-seed.txt', 'u_wf_accept_admin', NOW(3))
ON DUPLICATE KEY UPDATE file_name=VALUES(file_name);

CREATE TABLE IF NOT EXISTS _wf_accept_snapshot (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT NOT NULL
);
DELETE FROM _wf_accept_snapshot;
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'issue_keys', GROUP_CONCAT(issue_key ORDER BY issue_key) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'stages', GROUP_CONCAT(CONCAT(task_id, ':', stage_id, ':', status) ORDER BY task_id) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'ranks', GROUP_CONCAT(CONCAT(task_id, ':', `rank`) ORDER BY task_id) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'comments', GROUP_CONCAT(update_id ORDER BY update_id) FROM task_updates WHERE task_id IN (SELECT task_id FROM work_tasks WHERE board_id='b_wf_accept');
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'attachments', GROUP_CONCAT(attachment_id ORDER BY attachment_id) FROM task_attachments WHERE task_id IN (SELECT task_id FROM work_tasks WHERE board_id='b_wf_accept');
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'archived', GROUP_CONCAT(CONCAT(task_id, ':', IF(archived_at IS NULL,'0','1')) ORDER BY task_id) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'attendance_count', CAST(COUNT(*) AS CHAR) FROM attendance_events;
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'leave_count', CAST(COUNT(*) AS CHAR) FROM leave_requests;

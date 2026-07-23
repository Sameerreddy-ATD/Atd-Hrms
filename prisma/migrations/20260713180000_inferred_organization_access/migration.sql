INSERT IGNORE INTO `departments` (`department_id`, `name`, `unit_type`, `sort_order`)
VALUES ('org_executive_leadership', 'Executive Leadership', 'TEAM', 1);

INSERT IGNORE INTO `departments` (`department_id`, `name`, `unit_type`, `sort_order`)
VALUES ('org_human_resources', 'Human Resources', 'SUBTEAM', 41);

UPDATE `departments` child
JOIN `departments` parent ON parent.`name` = 'Administration'
SET child.`parent_department_id` = parent.`department_id`
WHERE child.`name` = 'Human Resources';

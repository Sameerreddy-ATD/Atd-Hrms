-- Point onboarding checklist away from removed Document Vault route.
UPDATE `checklist_template_items`
SET `link_path` = '/announcements',
    `title` = 'Read company announcements'
WHERE `item_id` = 'tmpl_on_item_4'
   OR (`link_path` = '/documents' AND `title` LIKE '%document%');

UPDATE `checklist_item_states`
SET `link_path` = '/announcements',
    `title` = CASE
      WHEN `title` LIKE '%Acknowledge company documents%' THEN 'Read company announcements'
      ELSE `title`
    END
WHERE `link_path` = '/documents'
  AND `completed` = 0;

-- Per-department face verification. Default stays on so existing units keep
-- the current org-wide behaviour; Developer Admin can turn a unit off when
-- that team should punch without the camera.

ALTER TABLE `departments`
  ADD COLUMN `face_verification_enabled` BOOLEAN NOT NULL DEFAULT true;

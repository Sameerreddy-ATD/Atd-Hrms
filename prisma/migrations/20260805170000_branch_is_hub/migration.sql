-- Parking hubs reuse branches with a flag for geofence + attendance labels.
ALTER TABLE `branches`
  ADD COLUMN `is_hub` BOOLEAN NOT NULL DEFAULT false;

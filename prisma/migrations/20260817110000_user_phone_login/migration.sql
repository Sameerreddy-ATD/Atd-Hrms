-- Unique phone on logins so drivers can sign in with mobile instead of email.
-- Multiple NULLs remain allowed (accounts that still use email only).

CREATE UNIQUE INDEX `users_phone_key` ON `users`(`phone`);

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DEVELOPER_ADMIN', 'MAIN_ADMIN', 'CEO', 'HR', 'MANAGER', 'EMPLOYEE', 'SALES', 'DRIVER', 'FIELD_STAFF');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('THUMB_ONLY', 'MOBILE_GPS_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('BRANCH', 'FIELD', 'CLIENT_VISIT', 'WORK_FROM_HOME', 'LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('THUMB_SCANNER', 'MOBILE_GPS', 'MANUAL_CORRECTION', 'LEAVE', 'HOLIDAY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('OFFICE_IN', 'OFFICE_OUT', 'BRANCH_IN', 'BRANCH_OUT', 'FIELD_CHECK_IN', 'FIELD_CHECK_OUT', 'CLIENT_CHECK_IN', 'CLIENT_CHECK_OUT', 'BREAK_OUT', 'BREAK_IN', 'MANUAL_ADJUSTMENT', 'LEAVE_MARK', 'HOLIDAY_MARK');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'MANAGER_APPROVED', 'HR_VERIFIED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "first_login_password_change_required" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "employee_id" TEXT NOT NULL,
    "employee_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department_id" TEXT,
    "designation" TEXT,
    "home_branch_id" TEXT,
    "manager_id" TEXT,
    "joining_date" DATE,
    "employment_type" TEXT,
    "attendance_mode" "AttendanceMode" NOT NULL DEFAULT 'THUMB_ONLY',
    "is_field_employee" BOOLEAN NOT NULL DEFAULT false,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "departments" (
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("department_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "branch_id" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("branch_id")
);

-- CreateTable
CREATE TABLE "biometric_devices" (
    "device_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "device_code" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "device_ip" TEXT,
    "port" INTEGER,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_sync_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "biometric_employee_mapping" (
    "mapping_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "biometric_user_id" TEXT NOT NULL,
    "device_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "biometric_employee_mapping_pkey" PRIMARY KEY ("mapping_id")
);

-- CreateTable
CREATE TABLE "employee_branch_schedule" (
    "schedule_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scheduled_branch_id" TEXT,
    "work_type" "WorkType" NOT NULL,
    "assigned_by" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_branch_schedule_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "event_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "event_time" TIMESTAMP(3) NOT NULL,
    "event_source" "EventSource" NOT NULL,
    "event_type" "EventType" NOT NULL,
    "branch_id" TEXT,
    "device_id" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "address" TEXT,
    "client_name" TEXT,
    "client_location_name" TEXT,
    "work_type" "WorkType",
    "mobile_device_id" TEXT,
    "photo_url" TEXT,
    "remarks" TEXT,
    "raw_payload" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "attendance_daily_summary" (
    "attendance_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "first_check_in" TIMESTAMP(3),
    "last_check_out" TIMESTAMP(3),
    "total_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "office_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "field_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "client_visit_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "attendance_source_summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "home_branch_id" TEXT,
    "scheduled_branch_id" TEXT,
    "primary_attended_branch_id" TEXT,
    "actual_attended_branch_ids" JSONB NOT NULL,
    "visited_branch_ids" JSONB NOT NULL,
    "visited_locations" JSONB NOT NULL,
    "branch_movement_count" INTEGER NOT NULL DEFAULT 0,
    "field_visit_count" INTEGER NOT NULL DEFAULT 0,
    "client_visit_count" INTEGER NOT NULL DEFAULT 0,
    "field_check_in_latitude" DECIMAL(10,7),
    "field_check_in_longitude" DECIMAL(10,7),
    "field_check_out_latitude" DECIMAL(10,7),
    "field_check_out_longitude" DECIMAL(10,7),
    "is_branch_mismatch" BOOLEAN NOT NULL DEFAULT false,
    "is_location_flagged" BOOLEAN NOT NULL DEFAULT false,
    "has_office_and_field" BOOLEAN NOT NULL DEFAULT false,
    "has_missing_out_event" BOOLEAN NOT NULL DEFAULT false,
    "has_missed_checkout" BOOLEAN NOT NULL DEFAULT false,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_daily_summary_pkey" PRIMARY KEY ("attendance_id")
);

-- CreateTable
CREATE TABLE "field_attendance" (
    "field_attendance_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "check_in_time" TIMESTAMP(3) NOT NULL,
    "check_in_latitude" DECIMAL(10,7) NOT NULL,
    "check_in_longitude" DECIMAL(10,7) NOT NULL,
    "check_in_address" TEXT,
    "check_out_time" TIMESTAMP(3),
    "check_out_latitude" DECIMAL(10,7),
    "check_out_longitude" DECIMAL(10,7),
    "check_out_address" TEXT,
    "work_type" "WorkType" NOT NULL,
    "client_name" TEXT,
    "client_location_name" TEXT,
    "vehicle_number" TEXT,
    "task_id" TEXT,
    "remarks" TEXT,
    "selfie_url" TEXT,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "manager_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_attendance_pkey" PRIMARY KEY ("field_attendance_id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "leave_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("leave_type_id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "leave_balance_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "entitled" DECIMAL(8,2) NOT NULL,
    "used" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("leave_balance_id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "leave_request_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "days" DECIMAL(8,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "manager_id" TEXT,
    "hr_verified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("leave_request_id")
);

-- CreateTable
CREATE TABLE "profile_edit_requests" (
    "request_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "requested_data" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_edit_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "employee_id" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternate_phone" TEXT,
    "address" TEXT,
    "blood_group" TEXT,
    "medical_notes" TEXT,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "audit_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performed_by_user_id" TEXT,
    "affected_user_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "branches_branch_code_key" ON "branches"("branch_code");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_devices_device_code_key" ON "biometric_devices"("device_code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_branch_schedule_employee_id_date_key" ON "employee_branch_schedule"("employee_id", "date");

-- CreateIndex
CREATE INDEX "attendance_events_employee_id_event_date_event_time_idx" ON "attendance_events"("employee_id", "event_date", "event_time");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_daily_summary_employee_id_date_key" ON "attendance_daily_summary"("employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_name_key" ON "leave_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_type_id_key" ON "leave_balances"("employee_id", "leave_type_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_home_branch_id_fkey" FOREIGN KEY ("home_branch_id") REFERENCES "branches"("branch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_devices" ADD CONSTRAINT "biometric_devices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_employee_mapping" ADD CONSTRAINT "biometric_employee_mapping_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_employee_mapping" ADD CONSTRAINT "biometric_employee_mapping_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "biometric_devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branch_schedule" ADD CONSTRAINT "employee_branch_schedule_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branch_schedule" ADD CONSTRAINT "employee_branch_schedule_scheduled_branch_id_fkey" FOREIGN KEY ("scheduled_branch_id") REFERENCES "branches"("branch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("branch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "biometric_devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summary" ADD CONSTRAINT "attendance_daily_summary_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_attendance" ADD CONSTRAINT "field_attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("leave_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("leave_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_affected_user_id_fkey" FOREIGN KEY ("affected_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


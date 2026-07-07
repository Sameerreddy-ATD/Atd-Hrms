import { EventType, Role, WorkType } from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(255),
  phone: z.string().max(30).optional(),
  password: z.string().min(10).max(200),
  role: z.nativeEnum(Role),
  employeeId: z.string().optional(),
});

export const thumbEventSchema = z.object({
  employeeId: z.string(),
  branchId: z.string(),
  deviceId: z.string().optional(),
  eventTime: z.coerce.date().optional(),
  eventType: z.nativeEnum(EventType).optional(),
  biometricUserId: z.string().optional(),
  rawPayload: z.unknown().optional(),
});

export const mobileEventSchema = z.object({
  employeeId: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(500).optional(),
  mobileDeviceId: z.string().min(3).max(200),
  remarks: z.string().max(1000).optional(),
  eventTime: z.coerce.date().optional(),
});

export const clientEventSchema = mobileEventSchema.extend({
  clientName: z.string().min(1).max(200),
  clientLocationName: z.string().max(200).optional(),
  photoUrl: z.string().url().optional(),
});

export const leaveRequestSchema = z.object({
  leaveTypeId: z.string(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  days: z.number().positive().max(365),
  reason: z.string().min(3).max(1000),
});

export const profileEditSchema = z.object({
  requestedData: z.object({
    phone: z.string().max(30).optional(),
    address: z.string().max(500).optional(),
    emergencyContact: z.unknown().optional(),
    profilePhoto: z.string().url().optional(),
    personalEmail: z.string().email().optional(),
    bloodGroup: z.string().max(10).optional(),
  }),
});

export const correctionSchema = z.object({
  employeeId: z.string(),
  date: z.coerce.date(),
  remarks: z.string().min(3).max(1000),
  eventType: z.nativeEnum(EventType).optional(),
  workType: z.nativeEnum(WorkType).optional(),
});

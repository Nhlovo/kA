import { z } from 'zod';

export const emailSchema = z.string().email();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string(),
});

export const mfaSchema = z.object({
  token: z.string().length(6, 'MFA token must be 6 digits'),
});

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.string().default('employee'),
});

export const createMasterFileSchema = z.object({
  claimantId: z.string().uuid().optional(),
  referringAttorneyId: z.string().uuid(),
  matterType: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  idNumber: z.string().optional(),
});

export const createAppointmentSchema = z.object({
  masterFileId: z.string().uuid(),
  expertId: z.string().uuid(),
  assessmentType: z.string(),
  appointmentDate: z.string().datetime(),
  location: z.string(),
});

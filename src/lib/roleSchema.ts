import { z } from "zod";

/** Input for creating or editing a custom admin role (a named permission set). */
export const roleSchema = z.object({
  name: z.string().trim().min(2, "Name the role").max(40),
  description: z.string().trim().max(160).optional(),
  permissions: z.array(z.string().max(60)).max(50),
  password: z.string(),
});

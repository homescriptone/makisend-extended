import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(120);
const emailSchema = z.string().trim().min(3).max(320).email();
const variablesSchema = z
  .record(z.string().max(64), z.string().max(2000))
  .nullable()
  .optional();

export const CreateAudienceListDto = z
  .object({
    name: nameSchema,
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const UpdateAudienceListDto = z
  .object({
    name: nameSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "At least one field is required",
  });

export const AudienceContactDto = z
  .object({
    email: emailSchema,
    name: z.string().trim().max(120).nullable().optional(),
    variables: variablesSchema,
  })
  .strict();

export const ImportAudienceContactsDto = z
  .object({
    contacts: z.array(AudienceContactDto).min(1).max(5000),
  })
  .strict();

export type CreateAudienceListDto = z.infer<typeof CreateAudienceListDto>;
export type UpdateAudienceListDto = z.infer<typeof UpdateAudienceListDto>;
export type ImportAudienceContactsDto = z.infer<typeof ImportAudienceContactsDto>;

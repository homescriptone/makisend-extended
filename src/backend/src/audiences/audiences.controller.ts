import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { pinoLogger } from "@/core/logger";
import { MAX_ID_LENGTH } from "@/core/validation";
import type { Bindings, UserInfoVariables } from "@/app/env";
import {
  CreateAudienceListDto,
  ImportAudienceContactsDto,
  UpdateAudienceListDto,
} from "./audiences.dto";
import type { AudienceService } from "./audiences.service";

const IdParam = z.object({ id: z.string().min(1).max(MAX_ID_LENGTH) });
const ContactParam = z.object({
  id: z.string().min(1).max(MAX_ID_LENGTH),
  contactId: z.string().min(1).max(MAX_ID_LENGTH),
});

export function createAudiencesController(
  getService: () => AudienceService,
): Hono<{ Bindings: Bindings; Variables: UserInfoVariables }> {
  const controller = new Hono<{ Bindings: Bindings; Variables: UserInfoVariables }>();

  controller.get("", async (c) => {
    const userId = c.get("userId");
    const lists = await getService().listLists(userId);
    return c.json({ lists }, 200);
  });

  controller.post(
    "",
    zValidator("json", CreateAudienceListDto, (result, c) => {
      if (!result.success) {
        const errors = z.flattenError(result.error);
        pinoLogger.error({ errors }, "POST /audiences - validation failed");
        return c.json(
          { error: "Validation failed", details: { fieldErrors: errors.fieldErrors, formErrors: errors.formErrors } },
          400,
        );
      }
    }),
    async (c) => {
      const userId = c.get("userId");
      const list = await getService().createList(userId, c.req.valid("json"));
      return c.json({ list }, 201);
    },
  );

  controller.get("/:id", zValidator("param", IdParam), async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.valid("param");
    const list = await getService().getList(id, userId);
    return c.json({ list }, 200);
  });

  controller.put(
    "/:id",
    zValidator("param", IdParam),
    zValidator("json", UpdateAudienceListDto, (result, c) => {
      if (!result.success) {
        const errors = z.flattenError(result.error);
        pinoLogger.error({ errors }, "PUT /audiences/:id - validation failed");
        return c.json(
          { error: "Validation failed", details: { fieldErrors: errors.fieldErrors, formErrors: errors.formErrors } },
          400,
        );
      }
    }),
    async (c) => {
      const userId = c.get("userId");
      const { id } = c.req.valid("param");
      const list = await getService().updateList(id, userId, c.req.valid("json"));
      return c.json({ list }, 200);
    },
  );

  controller.delete("/:id", zValidator("param", IdParam), async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.valid("param");
    await getService().deleteList(id, userId);
    return c.body(null, 204);
  });

  controller.get("/:id/contacts", zValidator("param", IdParam), async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.valid("param");
    const contacts = await getService().listContacts(id, userId);
    return c.json({ contacts }, 200);
  });

  controller.post(
    "/:id/import",
    zValidator("param", IdParam),
    zValidator("json", ImportAudienceContactsDto, (result, c) => {
      if (!result.success) {
        const errors = z.flattenError(result.error);
        pinoLogger.error({ errors }, "POST /audiences/:id/import - validation failed");
        return c.json(
          { error: "Validation failed", details: { fieldErrors: errors.fieldErrors, formErrors: errors.formErrors } },
          400,
        );
      }
    }),
    async (c) => {
      const userId = c.get("userId");
      const { id } = c.req.valid("param");
      const { contacts } = c.req.valid("json");
      const result = await getService().importContacts(id, userId, contacts);
      pinoLogger.info({ userId, listId: id, ...result }, "POST /audiences/:id/import - imported contacts");
      return c.json(result, 200);
    },
  );

  controller.delete(
    "/:id/contacts/:contactId",
    zValidator("param", ContactParam),
    async (c) => {
      const userId = c.get("userId");
      const { id, contactId } = c.req.valid("param");
      await getService().deleteContact(id, contactId, userId);
      return c.body(null, 204);
    },
  );

  return controller;
}

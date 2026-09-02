import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  UserNotFoundError,
  createUser,
  getRoles,
  getUser,
  isRoleId,
  isUserStatus,
  listUsers,
  updateUser,
  type RoleId,
  type UserStatus,
} from "../services/users.js";

const roleIdSchema = z.enum([
  "admin",
  "accountant",
  "storekeeper",
  "shop_supervisor",
  "sales",
  "viewer",
]);

const createBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  roleIds: z.array(roleIdSchema).min(1),
  status: z.enum(["active", "invited", "disabled"]).optional(),
});

const updateBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().nullable().optional(),
    roleIds: z.array(roleIdSchema).min(1).optional(),
    status: z.enum(["active", "invited", "disabled"]).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.phone !== undefined ||
      body.roleIds !== undefined ||
      body.status !== undefined,
    { message: "at_least_one_field" },
  );

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { status?: string; role?: string } }>(
    "/v1/users",
    async (request, reply) => {
      const { status, role } = request.query;
      if (status !== undefined && !isUserStatus(status)) {
        return reply.code(400).send({ error: "invalid_status" });
      }
      if (role !== undefined && !isRoleId(role)) {
        return reply.code(400).send({ error: "invalid_role" });
      }
      const users = await listUsers(app.db, request.orgId, {
        ...(status ? { status: status as UserStatus } : {}),
        ...(role ? { role: role as RoleId } : {}),
      });
      return { users };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/users/:id",
    async (request, reply) => {
      const user = await getUser(app.db, request.orgId, request.params.id);
      if (!user) {
        return reply.code(404).send({ error: "not_found" });
      }
      return { user };
    },
  );

  app.post<{ Body: z.infer<typeof createBodySchema> }>(
    "/v1/users",
    async (request, reply) => {
      const parsed = createBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const user = await createUser(app.db, request.orgId, {
          email: parsed.data.email,
          name: parsed.data.name,
          roleIds: parsed.data.roleIds,
          ...(parsed.data.phone !== undefined
            ? { phone: parsed.data.phone }
            : {}),
          ...(parsed.data.status !== undefined
            ? { status: parsed.data.status }
            : {}),
        });
        return reply.code(201).send({ user });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: number }).code === 11000
        ) {
          return reply.code(409).send({ error: "email_exists" });
        }
        throw err;
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: z.infer<typeof updateBodySchema>;
  }>("/v1/users/:id", async (request, reply) => {
    const parsed = updateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    try {
      const user = await updateUser(app.db, request.orgId, request.params.id, {
        ...(parsed.data.name !== undefined
          ? { name: parsed.data.name }
          : {}),
        ...(parsed.data.phone !== undefined
          ? { phone: parsed.data.phone }
          : {}),
        ...(parsed.data.roleIds !== undefined
          ? { roleIds: parsed.data.roleIds }
          : {}),
        ...(parsed.data.status !== undefined
          ? { status: parsed.data.status }
          : {}),
      });
      return { user };
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return reply.code(404).send({ error: "not_found" });
      }
      throw err;
    }
  });

  app.get("/v1/roles", async () => {
    return { roles: getRoles() };
  });
};

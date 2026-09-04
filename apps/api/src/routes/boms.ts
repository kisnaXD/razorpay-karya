import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  BomNotEditableError,
  BomNotFoundError,
  activateBom,
  createBom,
  deactivateBom,
  getBom,
  listBoms,
  updateBom,
  type BomLine,
} from "../services/boms.js";

const bomLineSchema = z.object({
  lineNo: z.number().int().positive(),
  itemKey: z.string().min(1),
  itemName: z.string().min(1),
  itemType: z.enum([
    "raw_material",
    "sub_assembly",
    "consumable",
    "packing",
  ]),
  quantity: z.number().positive(),
  uom: z.string().min(1),
  ratePaise: z.number().int().nonnegative(),
  amountPaise: z.number().int().nonnegative(),
});

const bomOperationSchema = z.object({
  sequence: z.number().int().positive(),
  operationName: z.string().min(1),
  workCenter: z.string().min(1),
  timeMinutes: z.number().positive(),
  hourlyRatePaise: z.number().int().nonnegative(),
  operatingCostPaise: z.number().int().nonnegative(),
});

const createBodySchema = z.object({
  itemKey: z.string().min(1),
  itemName: z.string().min(1),
  quantity: z.number().positive().optional(),
  uom: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  lines: z.array(bomLineSchema).optional(),
  operations: z.array(bomOperationSchema).optional(),
  rawMaterialCostPaise: z.number().int().nonnegative().optional(),
  operationCostPaise: z.number().int().nonnegative().optional(),
  totalCostPaise: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

const simpleCreateBodySchema = z.object({
  name: z.string().min(1),
  skuKey: z.string().min(1),
  components: z
    .array(
      z.object({
        materialKey: z.string().min(1),
        qty: z.number().positive(),
        unit: z.string().min(1),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});

const updateBodySchema = z.object({
  itemKey: z.string().min(1).optional(),
  itemName: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  uom: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  lines: z.array(bomLineSchema).optional(),
  operations: z.array(bomOperationSchema).optional(),
  rawMaterialCostPaise: z.number().int().nonnegative().optional(),
  operationCostPaise: z.number().int().nonnegative().optional(),
  totalCostPaise: z.number().int().nonnegative().optional(),
});

const statusSchema = z.enum(["draft", "active", "inactive"]);

function inferItemType(itemKey: string): BomLine["itemType"] {
  if (itemKey.startsWith("Packing:")) return "packing";
  if (itemKey.startsWith("Consumable:")) return "consumable";
  if (itemKey.startsWith("SKU:")) return "sub_assembly";
  return "raw_material";
}

function labelFromKey(key: string): string {
  const idx = key.indexOf(":");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

export const bomsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { status?: string } }>(
    "/v1/boms",
    async (request, reply) => {
      const statusRaw = request.query.status;
      if (statusRaw !== undefined) {
        const parsed = statusSchema.safeParse(statusRaw);
        if (!parsed.success) {
          return reply.code(400).send({ error: "invalid_status" });
        }
        const boms = await listBoms(app.db, request.orgId, {
          status: parsed.data,
        });
        return { boms };
      }
      const boms = await listBoms(app.db, request.orgId);
      return { boms };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/boms/:id",
    async (request, reply) => {
      const bom = await getBom(app.db, request.orgId, request.params.id);
      if (!bom) {
        return reply.code(404).send({ error: "not_found" });
      }
      return { bom };
    },
  );

  app.post("/v1/boms", async (request, reply) => {
    const simple = simpleCreateBodySchema.safeParse(request.body);
    if (simple.success) {
      const d = simple.data;
      const lines: BomLine[] = d.components.map((c, i) => ({
        lineNo: i + 1,
        itemKey: c.materialKey,
        itemName: labelFromKey(c.materialKey),
        itemType: inferItemType(c.materialKey),
        quantity: c.qty,
        uom: c.unit,
        ratePaise: 0,
        amountPaise: 0,
      }));
      const bom = await createBom(app.db, request.orgId, {
        itemKey: d.skuKey,
        itemName: d.name,
        lines,
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
      });
      return reply.code(201).send({ bom });
    }

    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    const d = parsed.data;
    const bom = await createBom(app.db, request.orgId, {
      itemKey: d.itemKey,
      itemName: d.itemName,
      ...(d.quantity !== undefined ? { quantity: d.quantity } : {}),
      ...(d.uom !== undefined ? { uom: d.uom } : {}),
      ...(d.isDefault !== undefined ? { isDefault: d.isDefault } : {}),
      ...(d.lines !== undefined ? { lines: d.lines } : {}),
      ...(d.operations !== undefined ? { operations: d.operations } : {}),
      ...(d.rawMaterialCostPaise !== undefined
        ? { rawMaterialCostPaise: d.rawMaterialCostPaise }
        : {}),
      ...(d.operationCostPaise !== undefined
        ? { operationCostPaise: d.operationCostPaise }
        : {}),
      ...(d.totalCostPaise !== undefined
        ? { totalCostPaise: d.totalCostPaise }
        : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    });
    return reply.code(201).send({ bom });
  });

  app.patch<{
    Params: { id: string };
    Body: z.infer<typeof updateBodySchema>;
  }>("/v1/boms/:id", async (request, reply) => {
    const parsed = updateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    const d = parsed.data;
    try {
      const bom = await updateBom(app.db, request.orgId, request.params.id, {
        ...(d.itemKey !== undefined ? { itemKey: d.itemKey } : {}),
        ...(d.itemName !== undefined ? { itemName: d.itemName } : {}),
        ...(d.quantity !== undefined ? { quantity: d.quantity } : {}),
        ...(d.uom !== undefined ? { uom: d.uom } : {}),
        ...(d.isDefault !== undefined ? { isDefault: d.isDefault } : {}),
        ...(d.lines !== undefined ? { lines: d.lines } : {}),
        ...(d.operations !== undefined ? { operations: d.operations } : {}),
        ...(d.rawMaterialCostPaise !== undefined
          ? { rawMaterialCostPaise: d.rawMaterialCostPaise }
          : {}),
        ...(d.operationCostPaise !== undefined
          ? { operationCostPaise: d.operationCostPaise }
          : {}),
        ...(d.totalCostPaise !== undefined
          ? { totalCostPaise: d.totalCostPaise }
          : {}),
      });
      return { bom };
    } catch (err) {
      if (err instanceof BomNotFoundError) {
        return reply.code(404).send({ error: "not_found" });
      }
      if (err instanceof BomNotEditableError) {
        return reply.code(409).send({ error: "not_editable" });
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>(
    "/v1/boms/:id/activate",
    async (request, reply) => {
      try {
        const bom = await activateBom(
          app.db,
          request.orgId,
          request.params.id,
        );
        return { bom };
      } catch (err) {
        if (err instanceof BomNotFoundError) {
          return reply.code(404).send({ error: "not_found" });
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/v1/boms/:id/deactivate",
    async (request, reply) => {
      try {
        const bom = await deactivateBom(
          app.db,
          request.orgId,
          request.params.id,
        );
        return { bom };
      } catch (err) {
        if (err instanceof BomNotFoundError) {
          return reply.code(404).send({ error: "not_found" });
        }
        throw err;
      }
    },
  );
};

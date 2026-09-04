import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getBom } from "../services/boms.js";
import {
  InvalidJobCardStatusTransitionError,
  InvalidWoStatusTransitionError,
  JobCardNotFoundError,
  WorkOrderNotFoundError,
  createWorkOrder,
  getWorkOrder,
  listWorkOrders,
  updateJobCardStatus,
  updateWorkOrderStatus,
  type JobCardStatus,
  type Priority,
  type WoStatus,
} from "../services/work-orders.js";

const woStatusSchema = z.enum([
  "draft",
  "not_started",
  "in_progress",
  "completed",
  "stopped",
  "cancelled",
]);

const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const uiPrioritySchema = z.enum(["low", "medium", "high", "urgent", "normal"]);

const materialStatusSchema = z.enum([
  "available",
  "partial",
  "not_available",
]);

const jobCardStatusSchema = z.enum([
  "open",
  "wip",
  "completed",
  "on_hold",
  "cancelled",
]);

const materialLineSchema = z.object({
  itemKey: z.string().min(1),
  itemName: z.string().min(1),
  requiredQty: z.number().nonnegative(),
  transferredQty: z.number().nonnegative().default(0),
  consumedQty: z.number().nonnegative().default(0),
  availableQty: z.number().nonnegative().default(0),
  uom: z.string().min(1),
  ratePaise: z.number().int().nonnegative().default(0),
});

const jobCardSchema = z.object({
  jcId: z.string().min(1),
  jcNo: z.string().min(1),
  operationName: z.string().min(1),
  workCenter: z.string().min(1),
  assignedTo: z.string().nullable().default(null),
  status: jobCardStatusSchema.default("open"),
  forQuantity: z.number().nonnegative(),
  completedQty: z.number().nonnegative().default(0),
  timeMinutes: z.number().nonnegative().default(0),
});

const createBodySchema = z.object({
  itemKey: z.string().min(1),
  itemName: z.string().min(1),
  bomId: z.string().nullable().optional(),
  bomNo: z.string().nullable().optional(),
  quantity: z.number().positive(),
  uom: z.string().min(1).optional(),
  priority: prioritySchema.optional(),
  materialStatus: materialStatusSchema.optional(),
  materialNote: z.string().nullable().optional(),
  plannedStartDate: z.string().nullable().optional(),
  plannedEndDate: z.string().nullable().optional(),
  salesOrderKey: z.string().nullable().optional(),
  materials: z.array(materialLineSchema).optional(),
  jobCards: z.array(jobCardSchema).optional(),
  plannedMaterialCostPaise: z.number().int().nonnegative().optional(),
  plannedOperationCostPaise: z.number().int().nonnegative().optional(),
});

const simpleCreateBodySchema = z.object({
  bomId: z.string().min(1),
  qty: z.number().positive(),
  priority: uiPrioritySchema,
  dueDate: z.string().min(1),
  notes: z.string().optional(),
});

const statusBodySchema = z.object({
  status: woStatusSchema,
});

const jobCardStatusBodySchema = z.object({
  status: jobCardStatusSchema,
  completedQty: z.number().nonnegative().optional(),
});

function mapPriority(priority: z.infer<typeof uiPrioritySchema>): Priority {
  return priority === "medium" ? "normal" : priority;
}

export const workOrdersRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: { status?: string; priority?: string };
  }>("/v1/work-orders", async (request, reply) => {
    const statusRaw = request.query.status;
    const priorityRaw = request.query.priority;

    let status: WoStatus | undefined;
    let priority: Priority | undefined;

    if (statusRaw !== undefined) {
      const parsed = woStatusSchema.safeParse(statusRaw);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_status" });
      }
      status = parsed.data;
    }
    if (priorityRaw !== undefined) {
      const parsed = prioritySchema.safeParse(priorityRaw);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_priority" });
      }
      priority = parsed.data;
    }

    const workOrders = await listWorkOrders(app.db, request.orgId, {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
    });
    return { workOrders };
  });

  app.get<{ Params: { id: string } }>(
    "/v1/work-orders/:id",
    async (request, reply) => {
      const workOrder = await getWorkOrder(
        app.db,
        request.orgId,
        request.params.id,
      );
      if (!workOrder) {
        return reply.code(404).send({ error: "work_order_not_found" });
      }
      return { workOrder };
    },
  );

  app.post("/v1/work-orders", async (request, reply) => {
    const simple = simpleCreateBodySchema.safeParse(request.body);
    if (simple.success) {
      const d = simple.data;
      const bom = await getBom(app.db, request.orgId, d.bomId);
      if (!bom) {
        return reply.code(404).send({ error: "bom_not_found" });
      }
      const workOrder = await createWorkOrder(app.db, request.orgId, {
        itemKey: bom.itemKey,
        itemName: bom.itemName,
        bomId: bom._id,
        bomNo: bom.bomNo,
        quantity: d.qty,
        uom: bom.uom,
        priority: mapPriority(d.priority),
        plannedEndDate: d.dueDate,
        ...(d.notes !== undefined ? { materialNote: d.notes } : {}),
        materials: bom.lines.map((line) => ({
          itemKey: line.itemKey,
          itemName: line.itemName,
          requiredQty: line.quantity * d.qty,
          transferredQty: 0,
          consumedQty: 0,
          availableQty: 0,
          uom: line.uom,
          ratePaise: line.ratePaise,
        })),
        plannedMaterialCostPaise: bom.rawMaterialCostPaise * d.qty,
        plannedOperationCostPaise: bom.operationCostPaise * d.qty,
      });
      return reply.code(201).send({ workOrder });
    }

    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    const d = parsed.data;
    const workOrder = await createWorkOrder(app.db, request.orgId, {
      itemKey: d.itemKey,
      itemName: d.itemName,
      quantity: d.quantity,
      ...(d.bomId !== undefined ? { bomId: d.bomId } : {}),
      ...(d.bomNo !== undefined ? { bomNo: d.bomNo } : {}),
      ...(d.uom !== undefined ? { uom: d.uom } : {}),
      ...(d.priority !== undefined ? { priority: d.priority } : {}),
      ...(d.materialStatus !== undefined
        ? { materialStatus: d.materialStatus }
        : {}),
      ...(d.materialNote !== undefined
        ? { materialNote: d.materialNote }
        : {}),
      ...(d.plannedStartDate !== undefined
        ? { plannedStartDate: d.plannedStartDate }
        : {}),
      ...(d.plannedEndDate !== undefined
        ? { plannedEndDate: d.plannedEndDate }
        : {}),
      ...(d.salesOrderKey !== undefined
        ? { salesOrderKey: d.salesOrderKey }
        : {}),
      ...(d.materials !== undefined ? { materials: d.materials } : {}),
      ...(d.jobCards !== undefined ? { jobCards: d.jobCards } : {}),
      ...(d.plannedMaterialCostPaise !== undefined
        ? { plannedMaterialCostPaise: d.plannedMaterialCostPaise }
        : {}),
      ...(d.plannedOperationCostPaise !== undefined
        ? { plannedOperationCostPaise: d.plannedOperationCostPaise }
        : {}),
    });
    return reply.code(201).send({ workOrder });
  });

  app.post<{
    Params: { id: string };
    Body: z.infer<typeof statusBodySchema>;
  }>("/v1/work-orders/:id/status", async (request, reply) => {
    const parsed = statusBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    try {
      const workOrder = await updateWorkOrderStatus(
        app.db,
        request.orgId,
        request.params.id,
        parsed.data.status,
      );
      return { workOrder };
    } catch (err) {
      if (err instanceof WorkOrderNotFoundError) {
        return reply.code(404).send({ error: "work_order_not_found" });
      }
      if (err instanceof InvalidWoStatusTransitionError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post<{
    Params: { id: string; jcId: string };
    Body: z.infer<typeof jobCardStatusBodySchema>;
  }>("/v1/work-orders/:id/job-cards/:jcId/status", async (request, reply) => {
    const parsed = jobCardStatusBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    try {
      const workOrder = await updateJobCardStatus(
        app.db,
        request.orgId,
        request.params.id,
        request.params.jcId,
        parsed.data.status as JobCardStatus,
        ...(parsed.data.completedQty !== undefined
          ? [parsed.data.completedQty]
          : []),
      );
      return { workOrder };
    } catch (err) {
      if (err instanceof WorkOrderNotFoundError) {
        return reply.code(404).send({ error: "work_order_not_found" });
      }
      if (err instanceof JobCardNotFoundError) {
        return reply.code(404).send({ error: "job_card_not_found" });
      }
      if (err instanceof InvalidJobCardStatusTransitionError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });
};

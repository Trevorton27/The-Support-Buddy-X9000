import { z } from "zod";

export const RealismConfigSchema = z.object({
  misleadingLogs: z.boolean().default(false),
  noiseLevel: z.enum(["none", "low", "medium", "high"]).default("none"),
  herringCount: z.number().int().min(0).max(3).default(0),
});

export const GenerationParamsSchema = z.object({
  mode: z.enum(["wizard", "autonomous", "incident"]),
  count: z.number().int().min(1).max(200),
  products: z.array(z.string()).min(1),
  categories: z.array(z.string()).min(1),
  severityWeights: z.object({
    critical: z.number().min(0).max(100),
    high: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    low: z.number().min(0).max(100),
  }),
  customerId: z.string().optional(),
  realism: RealismConfigSchema,
  incidentScenario: z
    .object({
      name: z.string(),
      description: z.string(),
      products: z.array(z.string()),
      region: z.string(),
      ticketCount: z.number().int().min(2).max(20),
      rootCause: z.string(),
    })
    .optional(),
});

export type GenerationParamsInput = z.infer<typeof GenerationParamsSchema>;

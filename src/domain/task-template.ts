import { z } from "zod";
import { boardInputSchema, type BoardInput } from "./task-board";
import { projectInputSchema } from "./tasks";

export const templateLayoutSchema = z
  .array(boardInputSchema)
  .min(1)
  .max(12)
  .refine(
    (boards) => boards.filter((b) => b.isDefault).length === 1,
    "O modelo precisa de um bloco principal.",
  );
export const taskTemplateSchema = z.object({
  name: projectInputSchema.shape.name,
  color: projectInputSchema.shape.color,
  boards: templateLayoutSchema,
});
export type TaskTemplate = {
  id: string;
  name: string;
  color: z.infer<typeof projectInputSchema>["color"];
  boards: BoardInput[];
  version: number;
};

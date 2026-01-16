"use server";

import { z } from "zod";
import { projectsService } from "@/features/projects/services/projects-service";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "请输入项目名称"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export async function createProjectAction(input: CreateProjectInput) {
  const { name } = createProjectSchema.parse(input);
  return projectsService.createProject(name);
}

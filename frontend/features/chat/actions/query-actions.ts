import { z } from "zod";
import { chatService } from "@/features/chat/services/chat-service";

const listSessionsSchema = z.object({
  userId: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

const sessionIdSchema = z.object({
  sessionId: z.string().trim().min(1, "缺少会话 ID"),
});

const getMessagesSchema = sessionIdSchema.extend({
  realUserMessageIds: z.array(z.number().int()).optional(),
});

const executionSessionSchema = sessionIdSchema.extend({
  currentProgress: z.number().min(0).optional(),
});

export type ListSessionsInput = z.infer<typeof listSessionsSchema>;
export type GetExecutionSessionInput = z.infer<typeof executionSessionSchema>;
export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
export type GetFilesInput = z.infer<typeof sessionIdSchema>;
export type GetRunsBySessionInput = z.infer<typeof sessionIdSchema>;

const getMessagesSinceSchema = z.object({
  sessionId: z.string().trim().min(1),
  afterId: z.number().int(),
});

export type GetMessagesSinceInput = z.infer<typeof getMessagesSinceSchema>;

export async function listSessionsAction(input?: ListSessionsInput) {
  const { userId, limit, offset } = listSessionsSchema.parse(input ?? {});
  return chatService.listSessions({ user_id: userId, limit, offset });
}

export async function getExecutionSessionAction(
  input: GetExecutionSessionInput,
) {
  const { sessionId, currentProgress } = executionSessionSchema.parse(input);
  return chatService.getExecutionSession(sessionId, currentProgress);
}

export async function getMessagesAction(input: GetMessagesInput) {
  const { sessionId, realUserMessageIds } = getMessagesSchema.parse(input);
  return chatService.getMessages(sessionId, { realUserMessageIds });
}

export async function getFilesAction(input: GetFilesInput) {
  const { sessionId } = sessionIdSchema.parse(input);
  return chatService.getFiles(sessionId);
}

export async function getRunsBySessionAction(input: GetRunsBySessionInput) {
  const { sessionId } = sessionIdSchema.parse(input);
  return chatService.getRunsBySession(sessionId, { limit: 1000, offset: 0 });
}

export async function getMessagesSinceAction(input: GetMessagesSinceInput) {
  const { sessionId, afterId } = getMessagesSinceSchema.parse(input);
  return chatService.getMessagesSince(sessionId, afterId);
}

/** Host-provided reference lookup; independent of any agent framework. */
export interface SkillResourceRequest {
  skill: string;
  path?: string;
  offset: number;
  limit: number;
}

export type SkillResourceReader = (input: SkillResourceRequest) => unknown;

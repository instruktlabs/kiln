/** Node embedding API. The stdio executable retains its separate lazy entry. */
export { createKilnMcpServer, createKilnToolHost, kilnMcpToolDefs } from './mcp-engine';
export type { KilnMcpCompatibilityOptions, KilnToolResult } from './mcp-engine';
export type { KilnMcpHost, KilnContentBlock, KilnResourceContents } from './mcp-core';
export type { KilnToolContext, KilnToolDef } from './tools/registry';

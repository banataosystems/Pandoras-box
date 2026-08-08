import {
  handleProjectOsMcp,
  projectOsMcpVercelConfig,
} from '../src/projectos-mcp-handler.js';

// Keep the canonical remote MCP entrypoint explicit for Vercel exact-head previews.
export const config = projectOsMcpVercelConfig;
export default handleProjectOsMcp;

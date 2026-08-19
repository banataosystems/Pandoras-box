# Pandora Skill System v1

This catalog contains **51 governed foundation skills** for Pandora's path from human intent to trusted working digital systems.

- Canonical source base: `c2cc635383b78d457d1731294a6f5b306d85f6be`
- Strategy source SHA-256: `6118eb2872c9d2d3f4b9bcd1d1f36450e445a12a029b97ebcd251bd2540d0eed`
- Registry: `registry.json`
- Registry schema: `registry.schema.json`
- Shared operating contract: `../AGENTS.md`
- Static validator: `scripts/validate-pandora-skills.mjs`
- Runtime activation: **not proven**
- Production activation: **not authorized**

Compatible agent runtimes may discover the `.agents/skills/<name>/SKILL.md` layout. Other runtimes can package the same entrypoints, but repository presence alone is not activation evidence.

Every skill is intentionally concise. Shared authority, proof, autonomy, security, and reporting rules live in `.agents/AGENTS.md`; skill files contain the workflow-specific instructions.

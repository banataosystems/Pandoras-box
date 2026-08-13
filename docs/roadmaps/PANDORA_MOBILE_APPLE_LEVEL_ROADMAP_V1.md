# Pandora Mobile — Apple-Level Product Roadmap & Execution Plan v1.0

**Status:** Owner-approved roadmap source candidate  
**Created:** 2026-08-14 Asia/Manila  
**Project:** MCPMaster / Pandora's Box  
**Canonical application repository:** `banataosystems/Pandoras-box`  
**Roadmap baseline:** `main@1cfccdc37f77a314f2afb5f56a2f23f953e19f8b`  
**Canonical mobile source:** `apps/pandora-mobile`  
**Current mobile package version:** `0.1.1+2`  
**Primary audience:** Pandora owner/operator on Android first, then adaptive tablet/web/iOS-compatible architecture  
**Product standard:** Apple-level clarity, restraint, trust, interaction quality, accessibility, and finish without imitating iOS literally.

---

## 1. Executive intent

Pandora Mobile must evolve from a secure functional operator prototype into the owner's calm, premium operating system for the entire Banatao Systems project portfolio.

The product must let the owner understand the whole system in seconds, make high-risk decisions with complete context, instruct Pandora naturally, and inspect evidence without being forced to understand backend implementation details.

The defining transformation is:

> **Raw system data → owner understanding → safe decision → governed action → verifiable evidence.**

The redesign is not a cosmetic reskin. It is a product, information-architecture, interaction, design-system, application-architecture, accessibility, testing, and release-engineering program.

The target experience is:

- calm rather than cinematic;
- human-readable rather than API-shaped;
- evidence-first rather than confidence-theater;
- decision-first rather than dashboard-first;
- progressive rather than overwhelming;
- premium without ornamental excess;
- adaptive to Android while preserving a coherent cross-platform product identity;
- secure without forcing the owner to reason about internal IDs, JSON, providers, or transport mechanics.

---

## 2. Current authoritative baseline

### 2.1 Canonical source

Current source authority is:

`banataosystems/Pandoras-box main@1cfccdc37f77a314f2afb5f56a2f23f953e19f8b`

The current mobile client is under:

`apps/pandora-mobile`

The current merge includes the Android owner-API 404 repair. The client targets the existing Supabase `pandora-owner-api` as its primary owner API and retains the Vercel compatibility route as a future fallback.

### 2.2 Current verification state

The current corrected Android client has reached:

#**Documented → Implemented → Tested → Merged**

It is **not yet production-verified on device**. The remaining proof gate is a successful authenticated owner journey using the corrected APK and live owner API.

No future roadmap milestone may collapse the following states into one generic “done” value:

1. Documented
2. Implemented
3. Tested
4. Deployed / distributed
5. Production verified

### 2.3 Existing product capability

The current app already has valuable primitives:

- Supabase authentication;
- owner API integration;
- Home / project / action / approval / connection / activity / safety data access;
- Ask Pandora;
- governed action initiation;
- approval decisions;
- explicit organization binding;
- fail-closed authentication and backend authorization;
- CI that runs Flutter dependency resolution, analysis, tests, Web build, and Android APKbuild;
- ProjectOS security regression coverage.

The redesign must preserve those capabilities while changing how they are presented and orchestrated.

### 2.4 Current weaknesses to eliminate

The prototype currently exposes system machinery instead of owner meaning:

- raw JSON is the default UI for major screens; 
- API field names are exposed directly;
- technical IDs are manually entered;
- approvals lack sufficient contextual review;
- a monolithic `main.dart` owns too much product behavior;
- API responses are handled too dynamically;
- dark mode is forced;
- runtime endpoints and source details occupy primary product space;
- loading, empty, stale, and failure states are generic;
- interaction motion and haptics are largely default;
- brand assets and launcher identity are unfinished;
- accessibility has not been acceptance-tested;
- phone, large-screen, and tablet adaptations are not proven;
- the distributed Android build remains a large debug/test artifact rather than an optimized release-signed product.

---

## 3. Source-recovery and design-work preservation policy

The redesign must waste none of the useful prior work, but it must also preserve source authority.

### 3.1 Open PR #8 — premium FlutterFlow owner-app candidate

Open PR #8, `feature/flutterflow-pandora-mobile-v1@f73c477d6eb2e287c59c895bc1c5017ab4b17980`, contains useful conceptual work:

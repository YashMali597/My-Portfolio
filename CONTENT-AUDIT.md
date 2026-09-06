# Content Audit

All hard-coded content has been extracted into [src/data/content.ts](src/data/content.ts), and every component now reads from it. The build (`npm run build`) passes cleanly. No visual/behavioral changes were made — this is a pure data-extraction refactor.

## Profile
- **Name:** Yash Mali
- **Navbar brand:** "Yash Mali | Data → Solutions"
- **Roles (typewriter):** AI Engineer, Data Scientist, AI Product Manager
- **Tagline:** "Transforming data and software into intelligent, AI-driven product solutions"
- **About:** 4 paragraphs (AI engineering focus, ETL/LLM assistant work, ML/GenAI/behavioral analytics interests, cross-functional collaboration)
- **Contact:** yashmali597@gmail.com · +12144754785 · [LinkedIn](https://www.linkedin.com/in/yash-v-mali/) · [GitHub](https://github.com/YashMali597)
- **Footer:** "© 2026 Yash Mali | Data-Driven Portfolio"

## Work Experience
1. **Graduate Software Engineer Trainee** — Emerson (6 bullets: ETL/.NET migration pipelines, MODBUS/HART workflows, LLM analytics assistant, Azure DevOps CI/CD automation, data validation rules, KPI/test scenario work)
2. **Deep Learning Intern** — Wizphys AI (3 bullets: PoseNet/PyTorch exercise detection, skeletal keypoint pipeline tuning, production ML deployment)

## Education
1. **MS in Management of Information Systems** — University of Texas at Dallas, GPA 3.75/4.0, 2025–2027
2. **Bachelor of Technology** — VIT Pune, India, CGPA 8.77/10.0, 2020–2024

## Skills (visible, 5 categories)
Programming & Development · AI & Machine Learning · Frameworks & Tools · Data & Analytics · Product Skills

## Projects (visible, 4)
1. SupplySightAI – Agentic Supply Chain Intelligence
2. ParcelPal – Route Optimization
3. AI-Enabled Customer Segmentation & Churn Prediction System
4. AI Causal Intelligence System

## Draft content added from notes (not yet rendered in UI)
These were added to `src/data/content.ts` as `draftProjects` and `draftSkills` so nothing is lost, but the current UI still renders exactly as before (pixel-identical). They include `pipelineStages` and `architectureNotes` fields for future architecture-diagram rendering:

- **Commodity Intelligence Platform** — Fabric medallion (bronze → silver → gold) pipeline surfacing Direct Lake Power BI dashboards
- **SAP BW data integration** — SAP BW as a source system feeding the same Fabric medallion pipeline
- **Applied AI & Enterprise Integration** (draft skill category) — Azure AI Search indexers, Copilot Studio integrations, LLM failure benchmarking

## Please confirm
- Is there any other project, role, certification, or metric not listed above that should be added?
- Should the two draft projects and the draft skill category be promoted into the visible UI now, or held back until the redesign pass?

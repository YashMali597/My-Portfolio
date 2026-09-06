---
slug: sap-bw-data-integration
title: "SAP BW data integration"
oneLiner: "Integrates SAP BW as a source system into the same Fabric-based pipeline, handling extraction and transformation into the medallion layers feeding downstream reporting."
skills: ["Data Engineering", "Enterprise System Integration", "Medallion Architecture", "ETL"]
stack: ["SAP BW", "Microsoft Fabric", "Medallion Architecture (Bronze/Silver/Gold)"]
timeframe: ""
links: { repo: "", demo: "", writeup: "" }
categories: ["Data"]
tech: "SAP BW, Microsoft Fabric, Medallion Architecture (Bronze/Silver/Gold)"
pipelineLegend: ["SAP BW source", "shared medallion pipeline"]
relatedProjects: ["commodity-intelligence-platform"]
# Structured stages for the interactive pipeline diagram. Mirrors the
# Architecture section below — keep the two in sync when editing either.
pipeline:
  - id: sap-bw
    label: "SAP BW Source"
    icon: Server
    status: idle
    description: "`SAP BW` acts as the upstream enterprise source system, supplying the data this pipeline extracts and feeds into the same Fabric-based medallion architecture used across the platform."
  - id: bronze
    label: "Bronze — Raw Ingest"
    icon: Layers
    status: idle
    description: "Data extracted from SAP BW lands in the `bronze` layer as raw, unmodified records — the same shared landing zone used by the platform's other source feeds."
  - id: silver
    label: "Silver — Transformed"
    icon: Filter
    status: idle
    description: "Raw SAP BW extracts are transformed and conformed into a consistent schema in the `silver` layer, aligning them with the rest of the medallion pipeline."
  - id: gold
    label: "Gold — Curated"
    icon: Gem
    status: idle
    description: "Transformed data is curated into business-ready tables in the `gold` layer, ready to feed downstream consumers."
  - id: reporting
    label: "Downstream Reporting"
    icon: BarChart3
    status: active
    description: "Gold-layer data feeds downstream reporting — the same shared pipeline used by the platform's other dashboards."
---
<!-- VERIFY: timeframe and links (repo/demo/writeup) were not present on the previous site — fill in or confirm they should stay empty -->

# SAP BW data integration

Integrates SAP BW as a source system into the Fabric-based pipeline,
handling extraction and transformation into the medallion layers feeding
downstream reporting.
Implemented cost analytics , of 50+ plants , analysing and giving cost breakdown of future and current cost of products according to raw materials

## Problem

Enterprise reporting data doesn't only come from external feeds — a large share
of it lives in SAP BW, behind its own extraction model and semantics. 

The work here was to bring SAP BW in as *source* on the
medallion pipeline.

## Architecture

Five stages sharing the same Fabric medallion pipeline used by the
[Commodity Intelligence Platform](./commodity-intelligence-platform.md). These
stage descriptions are migrated verbatim from the interactive pipeline diagram on
the previous site.

**1. SAP BW Source** *(icon: Server)*
`SAP BW` acts as the upstream enterprise source system, supplying the data this
pipeline extracts and feeds into the same Fabric-based medallion architecture
used across the platform.

**2. Bronze — Raw Ingest** *(icon: Layers)*
Data extracted from SAP BW lands in the `bronze` layer as raw, unmodified
records — the same shared landing zone used by the platform's other source
feeds.

**3. Silver — Transformed** *(icon: Filter)*
Raw SAP BW extracts are transformed and conformed into a consistent schema in
the `silver` layer, aligning them with the rest of the medallion pipeline.

**4. Gold — Curated** *(icon: Gem)*
Transformed data is curated into business-ready tables in the `gold` layer, ready
to feed downstream consumers.

**5. Downstream Reporting** *(icon: BarChart3, status: active)*
Gold-layer data feeds downstream reporting — the same shared pipeline used by the
platform's other dashboards.

## Key decisions

**One pipeline, many sources.** The defining decision: SAP BW is onboarded as a
source feed into the bronze layer . Transformation logic, curation rules, and the reporting layer are
shared, so a business definition lives in exactly one place.

**Conform to the shared schema in silver.** SAP BW's native structures are
absorbed and aligned at the silver stage, which is what lets everything
downstream stay source-agnostic.

**Bronze stays raw for SAP BW too.** The same append-only, unmodified landing
rule applies, preserving the original extracts for lineage and reprocessing.

## Challenges

**SAP BW's extraction model is its own discipline.** Getting data out of BW
faithfully — with its InfoProviders, hierarchies, and extractor semantics —
is a different problem from reading a flat external feed, and the fidelity of
everything downstream depends on it.
<!-- VERIFY: the specific SAP BW objects and extraction method (e.g. InfoProvider/ODP/OpenHub) were not documented on the previous site — confirm and name them -->

**Conforming enterprise semantics ** SAP BW carries its own
naming and modeling conventions; reconciling them with the schema used by the
platform's other sources is the substance of the bronze → silver transformation.


## Impact

Brought an enterprise SAP BW source into the Fabric medallion pipeline
without standing up a parallel stack, so downstream reporting consumes SAP BW
data through the same curated gold layer as every other source.
<!-- VERIFY: no quantified outcome (data volume, number of reports served, time saved vs. a separate pipeline) was documented on the previous site. Add real numbers if they exist. -->

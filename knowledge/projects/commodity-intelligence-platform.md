---
slug: commodity-intelligence-platform
title: "Commodity Intelligence Platform"
oneLiner: "An automated pipeline that extracts raw commodity/market data, processes it through a Microsoft Fabric medallion architecture (bronze → silver → gold), and surfaces it in Direct Lake mode Power BI dashboards for near-real-time decision-making."
skills: ["Data Engineering", "Medallion Architecture", "ETL", "Dashboarding", "Data Modeling"]
stack: ["Microsoft Fabric", "Power BI (Direct Lake)", "Medallion Architecture (Bronze/Silver/Gold)"]
timeframe: ""
links: { repo: "", demo: "", writeup: "" }
categories: ["Data", "AI"]
tech: "Microsoft Fabric, Power BI (Direct Lake), Medallion Architecture (Bronze/Silver/Gold)"
pipelineLegend: ["Direct Lake mode", "near real-time"]
# Structured stages for the interactive pipeline diagram on the projects page.
# Same content as the Architecture section below, in the shape the diagram
# needs. Keep the two in sync when editing either.
pipeline:
  - id: extract
    label: "Raw Extraction"
    icon: Database
    status: idle
    description: "Raw commodity and market data is pulled from source feeds into the pipeline, unchanged and untransformed — the entry point for everything downstream."
  - id: bronze
    label: "Bronze — Raw Ingest"
    icon: Layers
    status: idle
    description: "Extracted data lands in the `bronze` layer exactly as received — a raw, append-only landing zone that preserves the original records for lineage and reprocessing."
  - id: silver
    label: "Silver — Cleansed"
    icon: Filter
    status: idle
    description: "Bronze records are cleaned, validated, and conformed into a consistent schema in the `silver` layer, removing duplicates and standardizing formats."
  - id: gold
    label: "Gold — Curated"
    icon: Gem
    status: idle
    description: "Silver data is aggregated into business-ready tables in the `gold` layer — the curated, query-optimized layer that reporting tools read from."
  - id: direct-lake
    label: "Direct Lake Dashboards"
    icon: LayoutDashboard
    status: active
    description: "Power BI queries the `gold` layer directly in `Direct Lake` mode — no import or scheduled refresh — so dashboards reflect near-real-time data for decision-making."
---
<!-- VERIFY: timeframe and links (repo/demo/writeup) were not present on the previous site — fill in or confirm they should stay empty -->

# Commodity Intelligence Platform

An automated pipeline that extracts raw commodity/market data, processes it
through a Microsoft Fabric medallion architecture (bronze → silver → gold), and
surfaces it in Direct Lake mode Power BI dashboards for near-real-time
decision-making.

## Problem

Commodity and market data arrives continuously from external feeds, but the
decisions it should inform are time-sensitive. A traditional import-and-refresh
BI setup puts a scheduled refresh between the data and the decision — the
dashboard is always some hours behind reality, and the gap is invisible to
whoever is reading it.

The platform's job is to get raw market feeds into a trustworthy, query-ready
shape and in front of decision-makers with as little latency as the reporting
layer allows.

## Architecture

Five stages, implemented as a **Microsoft Fabric medallion architecture** with a
Direct Lake reporting layer. These stage descriptions are migrated verbatim from
the interactive pipeline diagram on the previous site.

**1. Raw Extraction** *(icon: Database)*
Raw commodity and market data is pulled from source feeds into the pipeline,
unchanged and untransformed — the entry point for everything downstream.

**2. Bronze — Raw Ingest** *(icon: Layers)*
Extracted data lands in the `bronze` layer exactly as received — a raw,
append-only landing zone that preserves the original records for lineage and
reprocessing.

**3. Silver — Cleansed** *(icon: Filter)*
Bronze records are cleaned, validated, and conformed into a consistent schema in
the `silver` layer, removing duplicates and standardizing formats.

**4. Gold — Curated** *(icon: Gem)*
Silver data is aggregated into business-ready tables in the `gold` layer — the
curated, query-optimized layer that reporting tools read from.

**5. Direct Lake Dashboards** *(icon: LayoutDashboard, status: active)*
Power BI queries the `gold` layer directly in `Direct Lake` mode — no import or
scheduled refresh — so dashboards reflect near-real-time data for
decision-making.

## Key decisions

**Direct Lake instead of Import mode.** This is the decision that makes the
"near-real-time" claim true rather than aspirational. Import mode would put a
scheduled refresh between the gold layer and the dashboard; Direct Lake has
Power BI read the gold tables in place, so there is no refresh window to fall
behind in.

**Append-only bronze.** Landing data exactly as received — untransformed — costs
storage but buys lineage and full reprocessing. If a transformation rule turns
out to be wrong, silver and gold can be rebuilt from bronze without going back
to the source feeds.

**Cleaning in silver, aggregation in gold.** Keeping deduplication and schema
conformance separate from business aggregation means each layer has one job, and
a bad number can be traced to the layer that produced it.

**Gold optimized for query, not for completeness.** The gold layer is shaped for
what the dashboards ask, which is what allows Direct Lake to stay fast.

## Challenges

**Direct Lake has constraints Import mode doesn't.** Reading gold tables in place
means the gold layer's physical shape directly determines dashboard performance
— modeling mistakes surface as slow visuals rather than slow refreshes.

**Schema drift from upstream feeds.** External commodity/market sources change
shape without notice, and an append-only bronze layer means the drift lands
intact and has to be absorbed in the bronze → silver transformation.

**Deduplication across an append-only landing zone.** Because bronze never
overwrites, silver carries the full burden of resolving duplicate and superseded
records into a single consistent view.
<!-- VERIFY: this section is drafted from the architecture rather than documented specifics. Replace with the challenges actually hit during the build. -->

## Impact

Delivered near-real-time commodity and market visibility to decision-makers by
removing the scheduled-refresh lag between the curated data layer and the
dashboards reading it.
<!-- VERIFY: no quantified outcome (latency reduction, number of dashboards or users, decisions affected) was documented on the previous site. Add real numbers if they exist. -->

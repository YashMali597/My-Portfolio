---
slug: ai-causal-intelligence-system
title: "AI Causal Intelligence System"
oneLiner: "Built an uplift-based targeting system using causal inference on 100K+ user A/B simulation data to identify high-impact segments and optimize budget allocation, simulating $684K+ incremental revenue."
skills: ["Causal Inference", "Uplift Modeling", "A/B Testing", "Predictive Modeling", "Data Analytics"]
stack: ["Python", "scikit-learn"]
timeframe: ""
links: { repo: "", demo: "", writeup: "" }
tech: "Python, scikit-learn, Causal Inference, A/B Testing, Predictive Modeling, Data Analytics"
categories: ["AI", "Data"]
---
<!-- VERIFY: timeframe and links (repo/demo/writeup) were not present on the previous site — fill in or confirm they should stay empty -->

# AI Causal Intelligence System

Built an uplift-based targeting system using causal inference on 100K+ user A/B
simulation data to identify high-impact segments and optimize budget allocation,
simulating $684K+ incremental revenue.

## Problem

Most targeting models answer the wrong question. A propensity model tells you
who is likely to convert — but a large share of those people would have
converted anyway, so spending budget on them buys nothing. The question that
actually determines ROI is *who converts **because** of the treatment*, which is
a causal question, not a predictive one.

This system was built to answer that: estimate per-segment uplift from A/B data
and allocate budget against incremental impact rather than raw likelihood.

## Architecture

An uplift-modeling pipeline over 100K+ users of A/B simulation data:

- **A/B simulation data layer** — treatment and control outcomes across 100K+
  users, forming the basis for causal estimation.
- **Uplift / causal inference models** — scikit-learn models estimating the
  incremental effect of treatment per user rather than the raw conversion
  probability.
- **Segment identification** — users grouped by estimated uplift, separating
  genuinely persuadable segments from those who convert regardless (or who react
  negatively to treatment).
- **Budget allocation layer** — spend directed toward high-uplift segments,
  producing the simulated incremental revenue figure.
<!-- VERIFY: the pipeline decomposition is inferred from the description's phrasing ("uplift-based targeting … identify high-impact segments … optimize budget allocation"). Confirm the actual model family used (e.g. two-model / T-learner, uplift trees, meta-learners). -->

## Key decisions

**Uplift over propensity.** The central decision of the project: model the
*incremental* effect of treatment, not the probability of conversion. This is
what makes the budget allocation defensible.

**Simulated A/B data as the substrate.** Working from A/B simulation data means
the ground-truth treatment effect is knowable, so the uplift estimator can be
evaluated against something rather than assumed correct — which is the hard part
of causal work on observational data.

**Allocate at the segment level.** Per-user uplift estimates are noisy;
aggregating into segments makes the allocation stable and gives the business a
unit it can act on.
<!-- VERIFY: the rationale in this section is reconstructed from the description. Confirm these were the actual decisions and tradeoffs. -->

## Challenges

**Uplift is unobservable per user.** You never see both the treated and untreated
outcome for the same person, so the target variable has to be constructed
indirectly — which makes both training and evaluation substantially harder than
standard classification.

**Noise dominates the signal.** Treatment effects are typically much smaller than
baseline conversion variation, so uplift estimates are low-signal and require
careful validation to avoid allocating budget against noise.

**Evaluating an uplift model.** Standard classification metrics don't apply;
assessment needs uplift-specific curves rather than accuracy or AUC.
<!-- VERIFY: this section is drafted from the problem shape rather than documented specifics. Replace with the challenges actually hit during the build. -->

## Impact

Simulated **$684K+ incremental revenue** by reallocating budget toward
high-uplift segments identified from **100K+ user A/B simulation data**.

Note that this figure is a **simulated** outcome from the A/B simulation dataset,
not a realized business result — it should always be described that way.

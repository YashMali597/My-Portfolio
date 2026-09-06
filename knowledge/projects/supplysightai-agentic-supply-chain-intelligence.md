---
slug: supplysightai-agentic-supply-chain-intelligence
title: "SupplySightAI – Agentic Supply Chain Intelligence"
oneLiner: "Built an agentic AI platform that autonomously analyzes supply chain data, detects risks, explains root causes, forecasts disruptions, and recommends prioritized actions."
skills: ["Multi-Agent AI", "Agentic Workflows", "Machine Learning", "Forecasting", "Root Cause Analysis", "Data Analytics"]
stack: ["Python", "Pandas", "Scikit-learn", "Streamlit", "Multi-Agent AI"]
timeframe: ""
links: { repo: "", demo: "", writeup: "" }
tech: "Python, Pandas, Scikit-learn, Streamlit, Multi-Agent AI"
categories: ["AI", "Software"]
---
<!-- VERIFY: timeframe and links (repo/demo/writeup) were not present on the previous site — fill in or confirm they should stay empty -->

# SupplySightAI – Agentic Supply Chain Intelligence

Built an agentic AI platform that autonomously analyzes supply chain data,
detects risks, explains root causes, forecasts disruptions, and recommends
prioritized actions.

## Problem

Supply chain teams sit on more operational data than they can read. The signal
that matters — a supplier slipping, a lane degrading, a stock position about to
go negative — is buried in tables that only get looked at after something has
already broken. The usual answer is a dashboard, but a dashboard only shows you
what you already thought to ask for. It doesn't tell you *why* a number moved,
what's likely to happen next, or which of the fifteen things now on fire you
should handle first.

SupplySightAI was built to close that gap: instead of a human driving the
analysis, agents drive it and hand the human a ranked set of actions.

## Architecture

The system is organized as a **multi-agent pipeline**, where each agent owns one
stage of the reasoning chain rather than one monolithic model trying to do
everything:

- **Analysis agent** — ingests supply chain data and computes the descriptive
  layer using Pandas: current state, deltas, and anomalies against baseline.
- **Risk detection agent** — flags where the data crosses into risk territory,
  turning raw anomalies into named risks.
- **Root cause agent** — explains *why* a flagged risk appeared, tracing it back
  through the contributing dimensions rather than just reporting the symptom.
- **Forecasting agent** — projects disruption forward using scikit-learn models,
  so the output is anticipatory rather than purely retrospective.
- **Recommendation agent** — ranks the resulting findings into a prioritized
  action list, which is what the user actually sees first.

**Streamlit** is the delivery layer: it hosts the interactive front end where a
user inspects the agents' findings and drills from the recommendation back down
to the evidence.

<!-- VERIFY: the five-agent decomposition above is inferred from the site's description ("analyzes … detects risks … explains root causes … forecasts … recommends"). Confirm the actual agent boundaries and names. -->

## Key decisions

**Agents over a single prompt.** Splitting analysis, risk, root cause,
forecasting, and recommendation into separate agents means each stage has a
narrow, checkable job. It also means a failure is localizable — a bad
recommendation can be traced to the specific upstream agent that produced the
faulty input.

**Classical ML for the numbers, agents for the reasoning.** Forecasting and
anomaly detection run on scikit-learn and Pandas rather than being asked of a
language model. The agentic layer orchestrates and explains; it doesn't do
arithmetic it can't be held to.

**Recommendations must be prioritized, not just produced.** An unranked list of
twelve risks is the same problem as the original dashboard. Ranking is treated
as a first-class output, not a presentation detail.

**Streamlit for the interface.** Chosen to keep the surface area small and the
iteration loop fast — the interesting work is the agent system, not the UI
framework.
<!-- VERIFY: the rationale in this section is reconstructed from the stack and description. Confirm these were the actual decisions and tradeoffs. -->

## Challenges

**Root cause is harder than detection.** Detecting that a metric moved is
mechanical; attributing it correctly is not. The explanation layer has to
distinguish a genuine driver from a correlated bystander, and a confidently
wrong root cause is worse than no root cause at all.

**Keeping agents grounded in the data.** Every claim an agent makes has to trace
back to a row it actually read. Without that constraint, an explanation layer
drifts into plausible-sounding narrative.

**Ranking across incomparable risks.** Prioritization requires putting a
forecast-driven risk and a currently-live anomaly on the same scale, which is a
judgment call encoded in the system rather than something the data hands you.
<!-- VERIFY: this section is drafted from the problem shape rather than documented specifics. Replace with the challenges actually hit during the build. -->

## Impact

The platform turns supply chain monitoring from a reactive dashboard-reading
exercise into an autonomous analysis loop that surfaces ranked, explained
actions.
<!-- VERIFY: no quantified outcome (adoption, time saved, risks caught) was documented on the previous site. Add real numbers here if they exist, or leave this qualitative. -->

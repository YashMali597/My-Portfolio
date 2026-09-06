---
slug: customer-segmentation-churn-prediction
title: "AI-Enabled Customer Segmentation & Churn Prediction System"
oneLiner: "Developed predictive models using EDA and behavioral analytics on 100K+ customer records to identify churn risk and enable next-best-action recommendations, improving targeted retention by 12%."
skills: ["Predictive Modeling", "EDA", "Classification", "Clustering", "Behavioral Analytics"]
stack: ["Python", "Pandas", "NumPy", "scikit-learn"]
timeframe: ""
links: { repo: "", demo: "", writeup: "" }
tech: "Python, Pandas, NumPy, scikit-learn, Predictive Modeling, EDA, Classification, Clustering"
categories: ["AI", "Data"]
---
<!-- VERIFY: timeframe and links (repo/demo/writeup) were not present on the previous site — fill in or confirm they should stay empty -->

# AI-Enabled Customer Segmentation & Churn Prediction System

Developed predictive models using EDA and behavioral analytics on 100K+ customer
records to identify churn risk and enable next-best-action recommendations,
improving targeted retention by 12%.

## Problem

Retention spend is usually distributed by intuition: everyone who "looks at
risk" gets the same offer, and the team finds out months later whether it
worked. With 100K+ customer records of behavioral data available, the better
question is which customers are actually likely to churn, which behavioral
patterns separate them, and what the appropriate next action is for each
segment — rather than one blanket campaign.

## Architecture

A two-stage modeling pipeline over behavioral customer data:

- **EDA layer** — exploratory analysis over 100K+ customer records in Pandas and
  NumPy to establish the behavioral features that actually separate retained
  from churned customers.
- **Clustering / segmentation** — unsupervised grouping of customers into
  behavioral segments, so downstream actions can be tailored per segment rather
  than per individual.
- **Churn classification** — supervised scikit-learn classifiers producing a
  churn-risk score per customer.
- **Next-best-action layer** — the segment and the risk score combine into a
  recommended retention action, which is what drives the targeting.
<!-- VERIFY: the stage decomposition is inferred from the listed techniques (EDA, Classification, Clustering) and the "next-best-action" phrasing. Confirm the actual pipeline structure and which specific algorithms were used. -->

## Key decisions

**Segment first, then score.** Clustering before classification means the churn
signal is interpreted in context — a drop in activity means something different
for a high-frequency segment than for an occasional one.

**Behavioral features over demographic ones.** The analysis leans on what
customers *do* rather than who they are, which generalizes better and is more
actionable for retention.

**Ship a next-best-action, not a risk score.** A probability column doesn't
change anyone's behavior. Mapping score plus segment onto a concrete recommended
action is what made the model usable for targeting.
<!-- VERIFY: the rationale in this section is reconstructed from the description. Confirm these were the actual decisions and tradeoffs. -->

## Challenges

**Class imbalance.** Churners are the minority class in most retention datasets,
which makes naive accuracy misleading and forces careful choice of evaluation
metric and sampling strategy.

**Defining churn.** "Churned" is a business definition, not a data one — the
window and the threshold have to be chosen before any model can be trained, and
the choice materially changes the label distribution.

**Making segments actionable.** Clusters that are statistically clean but don't
map to anything the retention team can actually do are a dead end; the
segmentation had to be legible as well as separable.
<!-- VERIFY: this section is drafted from the problem shape rather than documented specifics. Replace with the challenges actually hit during the build. -->

## Impact

Improved targeted retention by **12%**, driven by replacing untargeted retention
outreach with segment-aware, risk-scored next-best-action recommendations across
a base of **100K+ customer records**.

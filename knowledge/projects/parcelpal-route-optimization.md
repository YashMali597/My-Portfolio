---
slug: parcelpal-route-optimization
title: "ParcelPal – Route Optimization"
oneLiner: "Built a delivery route optimizer with Dijkstra’s Algorithm, improving efficiency and reducing operational costs."
skills: ["Algorithms", "Graph Search", "Full-Stack Development", "REST API Design"]
stack: ["JavaScript", "React", "Node.js", "Express", "MongoDB", "REST APIs"]
timeframe: ""
links: { repo: "", demo: "", writeup: "" }
tech: "JavaScript, React, Node.js, Express, MongoDB, REST APIs"
categories: ["Software", "Data"]
---
<!-- VERIFY: timeframe and links (repo/demo/writeup) were not present on the previous site — fill in or confirm they should stay empty -->

# ParcelPal – Route Optimization

Built a delivery route optimizer with Dijkstra's Algorithm, improving efficiency
and reducing operational costs.

## Problem

Delivery routing done by hand — or by "whatever order the addresses came in" —
burns time and fuel on paths nobody chose deliberately. For a small delivery
operation, the cost shows up as longer routes, more driver hours, and higher
per-parcel operating cost, all of which are avoidable with a proper shortest-path
computation over the delivery network.

ParcelPal exists to compute those routes automatically and expose them through
an interface a dispatcher can actually use.

## Architecture

A conventional **MERN-shaped full-stack application** with the optimization
logic on the server:

- **React front end** — where routes are entered, computed, and displayed.
- **Node.js + Express API** — the REST layer between the client and the routing
  engine, exposing route-computation and data endpoints.
- **Dijkstra's Algorithm** on the server — the delivery network is modeled as a
  weighted graph, and shortest paths are computed across it to produce the
  optimized route.
- **MongoDB** — persistence for the delivery/route data the graph is built from.
<!-- VERIFY: the layer breakdown above is inferred from the stack list (React / Node / Express / MongoDB / REST APIs). Confirm the actual service boundaries. -->

## Key decisions

**Dijkstra rather than a heuristic solver.** For a weighted, non-negative
delivery graph, Dijkstra gives a provably optimal shortest path without the
tuning burden of a metaheuristic. The correctness guarantee was worth more than
the extra flexibility of an approximate optimizer at this scale.

**Routing on the server, not the client.** Keeping the graph and the algorithm
behind the REST API means the client stays thin and the optimization logic can
change without shipping a new front end.

**MongoDB for the data layer.** A document store fits delivery records that vary
in shape better than a rigid relational schema for a project at this size.
<!-- VERIFY: the rationale in this section is reconstructed from the stack. Confirm these were the actual decisions. -->

## Challenges

**Modeling the delivery network as a graph.** The real work in a Dijkstra-based
optimizer isn't the algorithm — it's deciding what the nodes and edge weights
actually are (distance? time? cost?) so that "shortest" means the thing the
business cares about.

**Keeping the graph and the stored data in sync.** Route data lives in MongoDB
and has to be projected into a graph structure on each computation, which
constrains how large the network can get before the projection itself becomes
the bottleneck.
<!-- VERIFY: this section is drafted from the problem shape rather than documented specifics. Replace with the challenges actually hit during the build. -->

## Impact

Improved delivery efficiency and reduced operational costs by replacing manual
route selection with computed shortest paths.
<!-- VERIFY: no quantified efficiency or cost figure was documented on the previous site. Add real numbers if they exist. -->

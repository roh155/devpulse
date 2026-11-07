# ⚡ DevPulse — High-Throughput API Observability & Telemetry Engine

> A lightweight, zero-dependency API observability, latency waterfall, and anomaly detection micro-service built in public over a 14-day backend engineering sprint.

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange.svg)](#architecture)

---

## 🏛️ System Architecture Overview
[ Inbound Probes / HTTP Clients ]
│
▼
[ Rate Limiter (Sliding Window Log) ] ── (429 Throttling)
│
▼
[ Distributed Tracer ] ────────────── (X-Correlation-ID Context)
│
┌────────┴────────┐
▼                 ▼
[ Worker Pool ]   [ Circuit Breaker ] ──── (State Machine: Closed/Open/Half-Open)
│                 │
├─────────────────┘
▼
[ Statistical Anomaly Engine ] ────────── (Z-Score & Outlier Exclusion)
│
├───────────────────────────────┐
▼                               ▼
[ SSE Real-Time Stream ]     [ HMAC Signed Webhook ]
(text/event-stream)          (SHA-256 Alert Dispatch)
---

## 🎯 14-Day Engineering Roadmap & Implemented Modules

| Day | Module / Pattern | Focus Area |
| :--- | :--- | :--- |
| **Day 01** | **Core HTTP Telemetry Probe** | Native socket-level metrics: DNS, TCP, TLS, TTFB |
| **Day 02** | **Sliding-Window Rate Limiter** | Boundary-burst attack mitigation without heavy packages |
| **Day 03** | **Tail Latency Engine** | Tracking real SLA metrics: p50, p95, and p99 spikes |
| **Day 04** | **State-Machine Circuit Breaker** | CLOSED/OPEN/HALF-OPEN states with exponential jitter |
| **Day 05** | **Real-Time SSE Streamer** | Low-overhead unidirectional `text/event-stream` broadcast |
| **Day 06** | **HMAC-SHA256 Signed Alerts** | Cryptographic webhook payloads & replay attack protection |
| **Day 07** | **MongoDB Query Optimization** | B-Tree Compound Indexing (`IXSCAN`) & automated TTL logs |
| **Day 08** | **Decoupled Job Queue Workers** | Producer-Consumer concurrency throttling with auto-retries |
| **Day 09** | **React Flame-Graph Inspector** | Visualizing socket lifecycle waterfalls & TTFB overhead |
| **Day 10** | **Statistical Anomaly Engine** | Dynamic Z-Score baselines with outlier variance guards |
| **Day 11** | **Multi-Region Geo-Latency** | Cross-region fiber RTT variance & Edge POP savings |
| **Day 12** | **Distributed Tracing** | Hierarchical span propagation with `X-Correlation-ID` |
| **Day 13** | **Container Health Probes** | Decoupling K8s Liveness, Readiness, & Graceful Shutdown |
| **Day 14** | **Multi-Stage Dockerization** | Minimal alpine build (<120MB) & production orchestration |

---

## 🚀 Quickstart & Local Verification

Clone the repository and run the entire telemetry stack:

```bash
git clone [https://github.com/roh155/devpulse.git](https://github.com/roh155/devpulse.git)
cd devpulse

# Run any module directly via Node.js
node Day-10-AnomalyDetection/anomalyDetector.js

# Or spin up the containerized engine
docker-compose up --build
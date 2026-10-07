# SaaS Revenue Intelligence

A full-stack Revenue Intelligence platform built to help Revenue, Customer Success, and Sales teams understand revenue performance, identify retention risks, uncover expansion opportunities, and prioritize customer actions.

The project combines a modern React application, an Express API, Databricks analytics, explainable scoring models, and a conversational AI experience powered by Databricks Genie.

---

## Business Problem

SaaS teams often have customer, usage, support, revenue, and feedback data spread across different systems.

This makes it difficult to answer questions such as:

- Which customers require immediate retention attention?
- How much ARR is currently exposed to elevated risk?
- Which accounts show the strongest expansion signals?
- Which customers are renewing soon?
- What action should a Customer Success or Revenue team prioritize next?

This project centralizes those signals into a single Revenue Intelligence application.

---

## Application

The application includes five main experiences:

### Executive Overview

A high-level view of revenue performance and business priorities.

Key metrics include:

- Annual Recurring Revenue
- MRR Growth
- Net Revenue Retention
- Priority ARR at Risk
- Expansion Priority Accounts

The page also includes:

- Monthly Recurring Revenue Trend
- Monthly Revenue Movements
- Top Retention Priorities
- Top Expansion Priorities

---

### Customer Risk

Identifies and prioritizes customers with elevated churn and retention risk.

The page includes:

- Priority ARR at Risk
- Critical Risk Accounts
- High Risk Accounts
- Renewals in the Next 30 Days
- Risk Distribution
- ARR by Risk Level
- Risk Score Contribution
- Renewal Urgency
- Searchable and paginated priority account table

The risk score is explainable and based on customer signals rather than a black-box churn probability.

---

### Expansion Opportunities

Identifies customers showing strong signals for account expansion.

The page includes:

- Expansion Priority Accounts
- ARR in Expansion Accounts
- Very High Priority Opportunities
- High Priority Opportunities
- Opportunity Distribution
- ARR by Opportunity Level
- Expansion Score Contribution
- Expansion Opportunities by Plan
- Searchable, filterable, sortable, and paginated account table

---

### Customer 360

Provides a complete customer-level view.

Users can search and select any active customer and analyze:

- ARR
- Risk Score
- Opportunity Score
- Days to Renewal
- License Utilization
- Revenue History
- Product Usage
- Support Activity
- Customer Feedback
- Account Profile
- Recommended Next Action

---

### Ask RevenueAI

A conversational Revenue Intelligence assistant powered by Databricks Genie.

Users can ask questions such as:

- Which customers should I prioritize this week?
- Which accounts have the highest revenue risk?
- Where are the strongest expansion opportunities?
- Which customers are renewing in the next 30 days?

RevenueAI supports conversational follow-up questions while querying the underlying analytics environment.

---
## Application Preview

### Executive Overview

![Executive Overview](docs/screenshots/overview.png)

### Customer Risk

![Customer Risk](docs/screenshots/customer-risk.png)

### Expansion Opportunities

![Expansion Opportunities](docs/screenshots/expansion.png)

### Customer 360

![Customer 360](docs/screenshots/customer-360.png)

### Ask RevenueAI

![Ask RevenueAI](docs/screenshots/ask-revenueai.png)

## Key Business Metrics

Data snapshot: **August 31, 2026**

| Metric | Value |
|---|---:|
| Active Customers | 1,500 |
| Annual Recurring Revenue | $14.30M |
| Monthly Recurring Revenue | $1.19M |
| MRR Growth | 3.03% |
| Net Revenue Retention | 101.46% |
| Priority ARR at Risk | $246.05K |
| Critical Risk Accounts | 4 |
| High Risk Accounts | 40 |
| Expansion Priority Accounts | 452 |
| ARR in Expansion Accounts | $3.47M |

The dataset contains **1,620 historical SaaS customers**, including 1,500 active accounts.

---

## Architecture

```mermaid
flowchart LR
    A[React + TypeScript] -->|HTTP / JSON| B[Node.js + Express]
    B --> C[Databricks SQL Warehouse]
    C --> D[Unity Catalog]
    D --> E[Silver / Core Tables]
    D --> F[Gold Analytics Tables]

    A -->|Ask RevenueAI| B
    B --> G[Databricks Genie]
    G --> F
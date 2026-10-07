-- =========================================================
-- V2 · Étape 1 — gold_customer_monthly_health
-- Grain : 1 ligne = 1 client × 1 mois
-- Source de vérité de la Time Machine.
--
-- Validation (6 oct. 2026) :
--   24 146 lignes (= revenue_monthly)
--   Août 2026 : MRR 1 191 393 $ · 1 500 clients actifs
--   3 785 tickets · 1 323 feedbacks
-- =========================================================

USE workspace.saas_revenue_intelligence;

CREATE OR REPLACE TABLE gold_customer_monthly_health AS

-- 1. Tickets regroupés par client et par mois
WITH tickets AS (
  SELECT
    customer_id,
    DATE_TRUNC('MONTH', opened_date) AS month,
    COUNT(*)                                   AS tickets_opened,
    COUNT_IF(severity = 'Critical')            AS critical_tickets,
    COUNT_IF(severity IN ('Critical', 'High')) AS high_severity_tickets
  FROM support_tickets
  GROUP BY customer_id, DATE_TRUNC('MONTH', opened_date)
),

-- 2. Feedbacks regroupés par client et par mois
feedback AS (
  SELECT
    customer_id,
    DATE_TRUNC('MONTH', feedback_date) AS month,
    COUNT(*)                         AS feedback_count,
    AVG(score)                       AS avg_feedback_score,
    COUNT_IF(sentiment = 'Negative') AS negative_feedback
  FROM customer_feedback
  GROUP BY customer_id, DATE_TRUNC('MONTH', feedback_date)
)

-- 3. On assemble tout autour de revenue_monthly
SELECT
  r.customer_id,
  r.month,

  -- Revenus
  r.opening_mrr,
  r.new_mrr,
  r.expansion_mrr,
  r.contraction_mrr,
  r.churn_mrr,
  r.ending_mrr,

  -- Utilisation
  u.licensed_seats,
  u.active_users,
  u.login_count,
  u.license_utilization_pct,
  u.feature_adoption_pct,

  -- Support
  COALESCE(t.tickets_opened, 0)        AS tickets_opened,
  COALESCE(t.critical_tickets, 0)      AS critical_tickets,
  COALESCE(t.high_severity_tickets, 0) AS high_severity_tickets,

  -- Feedback (pas de COALESCE sur la note : « aucun feedback » ≠ « note 0 »)
  COALESCE(f.feedback_count, 0)    AS feedback_count,
  f.avg_feedback_score,
  COALESCE(f.negative_feedback, 0) AS negative_feedback

FROM revenue_monthly r
LEFT JOIN product_usage_monthly u
  ON r.customer_id = u.customer_id AND r.month = u.month
LEFT JOIN tickets t
  ON r.customer_id = t.customer_id AND r.month = t.month
LEFT JOIN feedback f
  ON r.customer_id = f.customer_id AND r.month = f.month;

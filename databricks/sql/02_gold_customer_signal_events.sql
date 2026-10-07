-- =========================================================
-- V2 · Étape 2 — gold_customer_signal_events
-- Grain : 1 ligne = 1 événement (client × mois × type de signal)
-- event_id déterministe → table idempotente (aucun doublon si relancée).
--
-- Principe : une alerte se déclenche quand la situation COMMENCE,
-- pas tant qu'elle dure (état ≠ événement).
--
-- Validation (6 oct. 2026) : 1 218 événements, 1 218 event_id uniques,
--   0 événement à 0 $. Churn = 120 (= clients churnés V1).
--   Usage Drop 418 · Negative Feedback 338 · Expansion Ready 252
--   Churn 120 · Support Spike 60 · Downgrade 30
-- =========================================================

USE workspace.saas_revenue_intelligence;

CREATE OR REPLACE TABLE gold_customer_signal_events AS

-- 1. Historique de chaque client (window functions)
WITH base AS (
  SELECT
    customer_id,
    month,
    license_utilization_pct AS util,
    AVG(license_utilization_pct) OVER (
      PARTITION BY customer_id ORDER BY month
      ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING
    ) AS util_prev_3m_avg,
    LAG(license_utilization_pct, 1) OVER (
      PARTITION BY customer_id ORDER BY month
    ) AS util_prev_1,
    LAG(license_utilization_pct, 2) OVER (
      PARTITION BY customer_id ORDER BY month
    ) AS util_prev_2,
    critical_tickets,
    SUM(critical_tickets) OVER (
      PARTITION BY customer_id ORDER BY month
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS critical_tickets_3m,
    negative_feedback,
    avg_feedback_score,
    opening_mrr,
    contraction_mrr,
    churn_mrr,
    ending_mrr
  FROM gold_customer_monthly_health
),

-- 2. Baisses d'utilisation + savoir si le mois d'avant en était déjà une
flags AS (
  SELECT
    *,
    COALESCE(util_prev_3m_avg - util >= 20, FALSE) AS is_usage_drop
  FROM base
),
flags_with_history AS (
  SELECT
    *,
    LAG(is_usage_drop) OVER (
      PARTITION BY customer_id ORDER BY month
    ) AS was_usage_drop
  FROM flags
),

-- 3. Les 6 règles
events AS (

  -- Usage Drop : utilisation −20 pts vs moyenne 3 mois, PREMIER mois seulement
  SELECT
    customer_id, month,
    'Usage Drop' AS signal_type,
    'Risk'       AS signal_direction,
    'Leading'    AS signal_timing,
    'High'       AS severity,
    CONCAT('License utilization fell to ', ROUND(util, 0),
           '% vs a 3-month average of ', ROUND(util_prev_3m_avg, 0), '%') AS description,
    GREATEST(opening_mrr, ending_mrr) AS mrr_at_stake
  FROM flags_with_history
  WHERE is_usage_drop
    AND NOT COALESCE(was_usage_drop, FALSE)

  UNION ALL

  -- Support Spike : nouveau ticket critique + au moins 2 sur 3 mois
  SELECT
    customer_id, month,
    'Support Spike', 'Risk', 'Leading', 'High',
    CONCAT(critical_tickets_3m, ' critical tickets in the last 3 months'),
    GREATEST(opening_mrr, ending_mrr)
  FROM base
  WHERE critical_tickets >= 1 AND critical_tickets_3m >= 2

  UNION ALL

  -- Negative Feedback : ≥ 1 négatif et note moyenne ≤ 2
  SELECT
    customer_id, month,
    'Negative Feedback', 'Risk', 'Leading', 'Medium',
    CONCAT(negative_feedback, ' negative feedback(s), average score ',
           ROUND(avg_feedback_score, 1), '/5'),
    GREATEST(opening_mrr, ending_mrr)
  FROM base
  WHERE negative_feedback >= 1 AND avg_feedback_score <= 2

  UNION ALL

  -- Downgrade : réduction ≥ 10 % du MRR d'ouverture
  SELECT
    customer_id, month,
    'Downgrade', 'Risk', 'Lagging', 'Medium',
    CONCAT('MRR reduced by $', contraction_mrr, ' (',
           ROUND(100 * contraction_mrr / opening_mrr, 0), '% of opening MRR)'),
    contraction_mrr
  FROM base
  WHERE opening_mrr > 0 AND contraction_mrr >= 0.10 * opening_mrr

  UNION ALL

  -- Churn
  SELECT
    customer_id, month,
    'Churn', 'Risk', 'Lagging', 'Critical',
    CONCAT('Customer churned, $', churn_mrr, ' MRR lost'),
    churn_mrr
  FROM base
  WHERE churn_mrr > 0

  UNION ALL

  -- Expansion Ready : devient ≥ 90 % deux mois de suite (événement, pas état)
  SELECT
    customer_id, month,
    'Expansion Ready', 'Opportunity', 'Leading', 'Medium',
    CONCAT('License utilization at ', ROUND(util, 0),
           '% for 2 consecutive months'),
    GREATEST(opening_mrr, ending_mrr)
  FROM base
  WHERE util >= 90
    AND util_prev_1 >= 90
    AND (util_prev_2 < 90 OR util_prev_2 IS NULL)
)

-- 4. Identifiant déterministe (idempotence)
SELECT
  CONCAT(
    customer_id, '-',
    DATE_FORMAT(month, 'yyyy-MM'), '-',
    REPLACE(LOWER(signal_type), ' ', '_')
  ) AS event_id,
  *
FROM events;

import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type SubscriptionRow = {
  id: string;
  name: string;
  provider: string;
  companyCode: string;
  isShared: boolean;
  monthlyCost: string;
  annualCost: string;
  billingCycle: string;
  nextBillingDate: string;
  autoRenew: boolean;
  contractEndDate: string;
  category: string;
  status: string;
};

export type SubscriptionAlertRow = {
  id: string;
  subscriptionName: string;
  alertType: string;
  message: string;
  triggeredAt: string;
};

export type SubscriptionMonthlySummary = {
  totalMonthly: number;
  totalAnnualized: number;
  byEntity: { companyCode: string; monthlyTotal: number }[];
  byCategory: { category: string; monthlyTotal: number }[];
  renewingSoon: number;
};

export async function getSubscriptions(): Promise<SubscriptionRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    name: string;
    provider: string;
    company_code: string | null;
    is_shared: boolean;
    monthly_cost: string;
    annual_cost: string;
    billing_cycle: string;
    next_billing_date: string | null;
    auto_renew: boolean;
    contract_end_date: string | null;
    category: string;
    status: string;
  }>(
    `select s.id, s.name, s.provider, c.code::text as company_code,
            s.is_shared, s.monthly_cost, s.annual_cost, s.billing_cycle,
            s.next_billing_date::text, s.auto_renew, s.contract_end_date::text,
            s.category, s.status
     from subscriptions s
     left join companies c on c.id = s.company_id
     where s.status != 'cancelled'
     order by s.monthly_cost desc`
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    provider: r.provider,
    companyCode: r.company_code ?? "Shared",
    isShared: r.is_shared,
    monthlyCost: formatCurrency(r.monthly_cost),
    annualCost: formatCurrency(r.annual_cost),
    billingCycle: r.billing_cycle.replace(/_/g, " "),
    nextBillingDate: formatDateLabel(r.next_billing_date),
    autoRenew: r.auto_renew,
    contractEndDate: formatDateLabel(r.contract_end_date),
    category: r.category.replace(/_/g, " "),
    status: r.status
  }));
}

export async function getSubscriptionSummary(): Promise<SubscriptionMonthlySummary> {
  if (getBackend() !== "database") {
    return { totalMonthly: 0, totalAnnualized: 0, byEntity: [], byCategory: [], renewingSoon: 0 };
  }

  const [totals, byEntity, byCategory, renewals] = await Promise.all([
    queryRows<{ total_monthly: string; total_annualized: string }>(
      `select
         coalesce(sum(monthly_cost), 0)::numeric(14,2)::text as total_monthly,
         coalesce(sum(annual_cost), 0)::numeric(14,2)::text as total_annualized
       from subscriptions where status = 'active'`
    ),
    queryRows<{ company_code: string; monthly_total: string }>(
      `select coalesce(c.code::text, 'Shared') as company_code,
              sum(s.monthly_cost)::numeric(14,2)::text as monthly_total
       from subscriptions s
       left join companies c on c.id = s.company_id
       where s.status = 'active'
       group by c.code
       order by monthly_total desc`
    ),
    queryRows<{ category: string; monthly_total: string }>(
      `select category::text,
              sum(monthly_cost)::numeric(14,2)::text as monthly_total
       from subscriptions where status = 'active'
       group by category
       order by monthly_total desc`
    ),
    queryRows<{ cnt: string }>(
      `select count(*)::text as cnt
       from subscriptions
       where status = 'active'
         and next_billing_date is not null
         and next_billing_date <= current_date + 30`
    )
  ]);

  return {
    totalMonthly: Number(totals[0]?.total_monthly ?? 0),
    totalAnnualized: Number(totals[0]?.total_annualized ?? 0),
    byEntity: byEntity.map((r) => ({ companyCode: r.company_code, monthlyTotal: Number(r.monthly_total) })),
    byCategory: byCategory.map((r) => ({ category: r.category.replace(/_/g, " "), monthlyTotal: Number(r.monthly_total) })),
    renewingSoon: Number(renewals[0]?.cnt ?? 0)
  };
}

export async function getSubscriptionAlerts(): Promise<SubscriptionAlertRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    subscription_name: string;
    alert_type: string;
    message: string;
    triggered_at: string;
  }>(
    `select sa.id, s.name as subscription_name, sa.alert_type, sa.message,
            sa.triggered_at::text
     from subscription_alerts sa
     join subscriptions s on s.id = sa.subscription_id
     where sa.is_dismissed = false
     order by sa.triggered_at desc
     limit 50`
  );

  return rows.map((r) => ({
    id: r.id,
    subscriptionName: r.subscription_name,
    alertType: r.alert_type.replace(/_/g, " "),
    message: r.message,
    triggeredAt: formatDateLabel(r.triggered_at)
  }));
}

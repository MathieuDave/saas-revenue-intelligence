import "./CustomerProfile.css";

import type { CustomerProfileData } from "../pages/Customer360Page";

type Props = {
  data: CustomerProfileData;
};

function formatDate(value: string) {
  if (!value || value === "N/A") {
    return "N/A";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CustomerProfile({ data }: Props) {
  return (
    <div className="customer-profile">
      <div>
        <span>Customer</span>
        <strong>{data.companyName}</strong>
      </div>

      <div>
        <span>Plan</span>
        <strong>{data.plan}</strong>
      </div>

      <div>
        <span>Industry</span>
        <strong>{data.industry}</strong>
      </div>

      <div>
        <span>Company Size</span>
        <strong>{data.companySize}</strong>
      </div>

      <div>
        <span>Employees</span>
        <strong>
          {data.employeeCount.toLocaleString()}
        </strong>
      </div>

      <div>
        <span>Seats Purchased</span>
        <strong>
          {data.seatsPurchased.toLocaleString()}
        </strong>
      </div>

      <div>
        <span>Country</span>
        <strong>{data.country}</strong>
      </div>

      <div>
        <span>Customer Since</span>
        <strong>{formatDate(data.customerSince)}</strong>
      </div>

      <div>
        <span>Renewal Date</span>
        <strong>{formatDate(data.renewalDate)}</strong>
      </div>

      <div>
        <span>Status</span>
        <strong>{data.customerStatus}</strong>
      </div>
    </div>
  );
}

export default CustomerProfile;
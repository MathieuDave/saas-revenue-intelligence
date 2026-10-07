import "./Sidebar.css";
import { NavLink } from "react-router-dom";
import type { NavLinkRenderProps } from "react-router-dom";

function getNavClass({ isActive }: NavLinkRenderProps) {
  return `nav-item ${isActive ? "nav-item--active" : ""}`;
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h2>RevenueAI</h2>
        <p>Intelligence Platform</p>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/brief"
          className={getNavClass}
        >
          Morning Brief
        </NavLink>

        <NavLink
          to="/"
          end
          className={getNavClass}
        >
          Overview
        </NavLink>

        <NavLink
          to="/risk"
          className={getNavClass}
        >
          Customer Risk
        </NavLink>

        <NavLink
          to="/expansion"
          className={getNavClass}
        >
          Expansion
        </NavLink>

        <NavLink
          to="/customers"
          className={getNavClass}
        >
          Customer 360
        </NavLink>

        <NavLink
          to="/copilot"
          className={getNavClass}
        >
          Ask RevenueAI
        </NavLink>
      </nav>
    </aside>
  );
}

export default Sidebar;
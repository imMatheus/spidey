import { useState } from "react";
import { Layout } from "../components/Layout";
import { Tabs } from "../components/Tabs";
import { Toggle } from "../components/Toggle";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import {
  BellIcon,
  CheckIcon,
  PackageIcon,
  SettingsIcon,
  UserIcon,
} from "../icons";

const TABS = [
  { id: "overview", label: "Overview", icon: <UserIcon width={14} height={14} /> },
  { id: "security", label: "Security", icon: <SettingsIcon width={14} height={14} /> },
  { id: "notifications", label: "Notifications", icon: <BellIcon width={14} height={14} /> },
  { id: "billing", label: "Billing", icon: <PackageIcon width={14} height={14} /> },
];

export function Profile() {
  const [tab, setTab] = useState("overview");
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);
  const [marketingNotif, setMarketingNotif] = useState(true);
  const [twoFA, setTwoFA] = useState(false);

  return (
    <Layout>
      <div className="profile-head">
        <Avatar name="Jamie Park" size="xl" status="online" />
        <div className="profile-head-info">
          <h1>Jamie Park</h1>
          <p className="profile-head-sub">
            jamie.park@lattice.dev · Member since 2024
          </p>
          <div className="profile-head-tags">
            <Badge tone="brand">Pro</Badge>
            <Badge tone="success" dot>Active</Badge>
          </div>
        </div>
        <div className="profile-head-actions">
          <Button variant="ghost">Sign out</Button>
          <Button>Save changes</Button>
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="tab-panel">
        {tab === "overview" && (
          <div className="form-grid">
            <Card title="Personal information" subtitle="Visible to teammates">
              <div className="form-row">
                <label>Display name</label>
                <input type="text" defaultValue="Jamie Park" />
              </div>
              <div className="form-row">
                <label>Email</label>
                <input type="email" defaultValue="jamie.park@lattice.dev" />
              </div>
              <div className="form-row">
                <label>Bio</label>
                <textarea
                  rows={4}
                  defaultValue="Designer at Lattice. Color theory enjoyer, type snob, sometimes ships."
                />
              </div>
              <div className="form-row">
                <label>Time zone</label>
                <select defaultValue="UTC-7">
                  <option>UTC-12</option>
                  <option>UTC-8</option>
                  <option>UTC-7</option>
                  <option>UTC-5</option>
                  <option>UTC+0</option>
                  <option>UTC+1</option>
                  <option>UTC+9</option>
                </select>
              </div>
            </Card>
            <Card title="Avatar" subtitle="JPG, PNG up to 2MB">
              <div className="avatar-upload">
                <Avatar name="Jamie Park" size="xl" />
                <div>
                  <Button variant="outline" size="sm">Upload new</Button>
                  <Button variant="ghost" size="sm">Remove</Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {tab === "security" && (
          <div className="form-grid">
            <Card title="Password" subtitle="Use a strong, unique password">
              <div className="form-row">
                <label>Current password</label>
                <input type="password" placeholder="••••••••" />
              </div>
              <div className="form-row">
                <label>New password</label>
                <input type="password" placeholder="At least 12 characters" />
              </div>
              <div className="form-row">
                <label>Confirm new password</label>
                <input type="password" />
              </div>
              <Button>Update password</Button>
            </Card>
            <Card title="Two-factor authentication">
              <div className="kv-row">
                <div>
                  <div className="kv-label">Authenticator app</div>
                  <div className="kv-sub">
                    Use a TOTP app like 1Password or Authy
                  </div>
                </div>
                <Toggle checked={twoFA} onChange={setTwoFA} />
              </div>
              <div className="kv-row">
                <div>
                  <div className="kv-label">Recovery codes</div>
                  <div className="kv-sub">
                    Generate one-time codes for account recovery
                  </div>
                </div>
                <Button variant="outline" size="sm" disabled={!twoFA}>
                  Generate
                </Button>
              </div>
            </Card>
            <Card title="Active sessions" className="span-2">
              <ul className="sessions">
                <li>
                  <div>
                    <div className="kv-label">
                      macOS · Chrome 134{" "}
                      <Badge tone="success">this device</Badge>
                    </div>
                    <div className="kv-sub">
                      San Francisco · last active 2 minutes ago
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" disabled>Active</Button>
                </li>
                <li>
                  <div>
                    <div className="kv-label">iOS · Safari Mobile</div>
                    <div className="kv-sub">
                      San Francisco · last active 3 hours ago
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">Sign out</Button>
                </li>
                <li>
                  <div>
                    <div className="kv-label">Windows · Firefox 122</div>
                    <div className="kv-sub">
                      London · last active 4 days ago
                    </div>
                  </div>
                  <Button variant="danger" size="sm">Revoke</Button>
                </li>
              </ul>
            </Card>
          </div>
        )}

        {tab === "notifications" && (
          <Card title="How we reach you" subtitle="Choose channels for each event">
            <div className="kv-row">
              <div>
                <div className="kv-label">Email digests</div>
                <div className="kv-sub">
                  A weekly summary of activity in your spaces
                </div>
              </div>
              <Toggle checked={emailNotif} onChange={setEmailNotif} />
            </div>
            <div className="kv-row">
              <div>
                <div className="kv-label">Push notifications</div>
                <div className="kv-sub">Real-time alerts on this device</div>
              </div>
              <Toggle checked={pushNotif} onChange={setPushNotif} />
            </div>
            <div className="kv-row">
              <div>
                <div className="kv-label">Product updates</div>
                <div className="kv-sub">
                  Occasional emails about new features
                </div>
              </div>
              <Toggle
                checked={marketingNotif}
                onChange={setMarketingNotif}
              />
            </div>
            <div className="kv-row">
              <div>
                <div className="kv-label">SMS</div>
                <div className="kv-sub">Critical security alerts only</div>
              </div>
              <Toggle checked={false} onChange={() => {}} disabled />
            </div>
          </Card>
        )}

        {tab === "billing" && (
          <div className="form-grid">
            <Card title="Current plan" elevated>
              <div className="plan">
                <div className="plan-head">
                  <span className="plan-name">Pro</span>
                  <Badge tone="brand">Annual</Badge>
                </div>
                <div className="plan-price">
                  <span>$24</span>
                  <span className="plan-price-unit">/ month</span>
                </div>
                <ul className="plan-features">
                  <li>
                    <CheckIcon width={12} height={12} /> Unlimited captures
                  </li>
                  <li>
                    <CheckIcon width={12} height={12} /> Up to 10 collaborators
                  </li>
                  <li>
                    <CheckIcon width={12} height={12} /> Priority support
                  </li>
                </ul>
                <Button fullWidth>Upgrade</Button>
              </div>
            </Card>
            <Card title="Payment method">
              <div className="card-row">
                <span className="card-brand">VISA</span>
                <span>•••• 4242</span>
                <span className="card-exp">expires 09/28</span>
              </div>
              <Button variant="outline" size="sm">Update card</Button>
            </Card>
            <Card title="Invoices" className="span-2">
              <table className="dash-tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {["Apr 1, 2026", "Mar 1, 2026", "Feb 1, 2026"].map((d) => (
                    <tr key={d}>
                      <td>{d}</td>
                      <td className="mono">$24.00</td>
                      <td><Badge tone="success">Paid</Badge></td>
                      <td>
                        <a href="#" className="dash-card-link">
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}

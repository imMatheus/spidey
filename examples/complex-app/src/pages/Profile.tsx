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

const FORM_LABEL =
  "text-xs font-medium text-zinc-500 dark:text-zinc-400";
const INPUT =
  "px-2.5 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-[13px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";
const KV_ROW =
  "flex justify-between items-center gap-4 py-3 border-b border-zinc-200 dark:border-zinc-800 last:border-b-0";
const KV_LABEL =
  "text-[13px] font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2";
const KV_SUB = "text-xs text-zinc-500 dark:text-zinc-400 mt-0.5";

export function Profile() {
  const [tab, setTab] = useState("overview");
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);
  const [marketingNotif, setMarketingNotif] = useState(true);
  const [twoFA, setTwoFA] = useState(false);

  return (
    <Layout>
      <div className="flex items-center gap-6 py-6 border-b border-zinc-200 dark:border-zinc-800 mb-6">
        <Avatar name="Jamie Park" size="xl" status="online" />
        <div className="flex-1">
          <h1 className="m-0 mb-1 text-2xl text-zinc-900 dark:text-zinc-100 font-semibold">
            Jamie Park
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 m-0 mb-2">
            jamie.park@lattice.dev · Member since 2024
          </p>
          <div className="flex gap-1.5">
            <Badge tone="brand">Pro</Badge>
            <Badge tone="success" dot>
              Active
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost">Sign out</Button>
          <Button>Save changes</Button>
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="py-2 pb-8">
        {tab === "overview" && (
          <div className="grid grid-cols-2 gap-4">
            <Card title="Personal information" subtitle="Visible to teammates">
              <div className="flex flex-col gap-1.5">
                <label className={FORM_LABEL}>Display name</label>
                <input type="text" defaultValue="Jamie Park" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={FORM_LABEL}>Email</label>
                <input
                  type="email"
                  defaultValue="jamie.park@lattice.dev"
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={FORM_LABEL}>Bio</label>
                <textarea
                  rows={4}
                  defaultValue="Designer at Lattice. Color theory enjoyer, type snob, sometimes ships."
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={FORM_LABEL}>Time zone</label>
                <select defaultValue="UTC-7" className={INPUT}>
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
              <div className="flex gap-4 items-center">
                <Avatar name="Jamie Park" size="xl" />
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm">
                    Upload new
                  </Button>
                  <Button variant="ghost" size="sm">
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {tab === "security" && (
          <div className="grid grid-cols-2 gap-4">
            <Card title="Password" subtitle="Use a strong, unique password">
              <div className="flex flex-col gap-1.5">
                <label className={FORM_LABEL}>Current password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={FORM_LABEL}>New password</label>
                <input
                  type="password"
                  placeholder="At least 12 characters"
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={FORM_LABEL}>Confirm new password</label>
                <input type="password" className={INPUT} />
              </div>
              <Button>Update password</Button>
            </Card>
            <Card title="Two-factor authentication">
              <div className={KV_ROW}>
                <div>
                  <div className={KV_LABEL}>Authenticator app</div>
                  <div className={KV_SUB}>
                    Use a TOTP app like 1Password or Authy
                  </div>
                </div>
                <Toggle checked={twoFA} onChange={setTwoFA} />
              </div>
              <div className={KV_ROW}>
                <div>
                  <div className={KV_LABEL}>Recovery codes</div>
                  <div className={KV_SUB}>
                    Generate one-time codes for account recovery
                  </div>
                </div>
                <Button variant="outline" size="sm" disabled={!twoFA}>
                  Generate
                </Button>
              </div>
            </Card>
            <Card title="Active sessions" className="col-span-2">
              <ul className="list-none p-0 m-0">
                <li className="flex justify-between items-center py-3 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <div className={KV_LABEL}>
                      macOS · Chrome 134{" "}
                      <Badge tone="success">this device</Badge>
                    </div>
                    <div className={KV_SUB}>
                      San Francisco · last active 2 minutes ago
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" disabled>
                    Active
                  </Button>
                </li>
                <li className="flex justify-between items-center py-3 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <div className={KV_LABEL}>iOS · Safari Mobile</div>
                    <div className={KV_SUB}>
                      San Francisco · last active 3 hours ago
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Sign out
                  </Button>
                </li>
                <li className="flex justify-between items-center py-3">
                  <div>
                    <div className={KV_LABEL}>Windows · Firefox 122</div>
                    <div className={KV_SUB}>
                      London · last active 4 days ago
                    </div>
                  </div>
                  <Button variant="danger" size="sm">
                    Revoke
                  </Button>
                </li>
              </ul>
            </Card>
          </div>
        )}

        {tab === "notifications" && (
          <Card
            title="How we reach you"
            subtitle="Choose channels for each event"
          >
            <div className={KV_ROW}>
              <div>
                <div className={KV_LABEL}>Email digests</div>
                <div className={KV_SUB}>
                  A weekly summary of activity in your spaces
                </div>
              </div>
              <Toggle checked={emailNotif} onChange={setEmailNotif} />
            </div>
            <div className={KV_ROW}>
              <div>
                <div className={KV_LABEL}>Push notifications</div>
                <div className={KV_SUB}>Real-time alerts on this device</div>
              </div>
              <Toggle checked={pushNotif} onChange={setPushNotif} />
            </div>
            <div className={KV_ROW}>
              <div>
                <div className={KV_LABEL}>Product updates</div>
                <div className={KV_SUB}>
                  Occasional emails about new features
                </div>
              </div>
              <Toggle checked={marketingNotif} onChange={setMarketingNotif} />
            </div>
            <div className={KV_ROW}>
              <div>
                <div className={KV_LABEL}>SMS</div>
                <div className={KV_SUB}>Critical security alerts only</div>
              </div>
              <Toggle checked={false} onChange={() => {}} disabled />
            </div>
          </Card>
        )}

        {tab === "billing" && (
          <div className="grid grid-cols-2 gap-4">
            <Card title="Current plan" elevated>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    Pro
                  </span>
                  <Badge tone="brand">Annual</Badge>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                    $24
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400 text-[13px]">
                    / month
                  </span>
                </div>
                <ul className="list-none p-0 m-0 mb-1 flex flex-col gap-1.5">
                  {[
                    "Unlimited captures",
                    "Up to 10 collaborators",
                    "Priority support",
                  ].map((f) => (
                    <li
                      key={f}
                      className="text-[13px] text-zinc-700 dark:text-zinc-300 flex items-center gap-2"
                    >
                      <CheckIcon
                        width={12}
                        height={12}
                        className="text-green-600 dark:text-green-400"
                      />{" "}
                      {f}
                    </li>
                  ))}
                </ul>
                <Button fullWidth>Upgrade</Button>
              </div>
            </Card>
            <Card title="Payment method">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md text-[13px] text-zinc-900 dark:text-zinc-100">
                <span className="bg-[#1a1f71] text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-widest">
                  VISA
                </span>
                <span>•••• 4242</span>
                <span className="text-zinc-500 dark:text-zinc-400 text-xs">
                  expires 09/28
                </span>
              </div>
              <Button variant="outline" size="sm">
                Update card
              </Button>
            </Card>
            <Card title="Invoices" className="col-span-2">
              <table className="w-full border-collapse">
                <thead className="border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    {["Date", "Amount", "Status", ""].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["Apr 1, 2026", "Mar 1, 2026", "Feb 1, 2026"].map((d) => (
                    <tr
                      key={d}
                      className="border-b border-zinc-200 dark:border-zinc-800 last:border-b-0"
                    >
                      <td className="px-3 py-2.5 text-[13px] text-zinc-900 dark:text-zinc-100">
                        {d}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] font-mono text-zinc-900 dark:text-zinc-100">
                        $24.00
                      </td>
                      <td className="px-3 py-2.5 text-[13px]">
                        <Badge tone="success">Paid</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-[13px]">
                        <a
                          href="#"
                          className="text-indigo-600 dark:text-indigo-400 no-underline text-xs"
                        >
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

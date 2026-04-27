import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { AlertIcon } from "../icons";

export function NotFound() {
  return (
    <Layout>
      <EmptyState
        icon={<AlertIcon width={32} height={32} />}
        title="Page not found"
        description="The route doesn't exist. Maybe you'd like the home page?"
        action={
          <Link to="/">
            <Button>Take me home</Button>
          </Link>
        }
      />
    </Layout>
  );
}

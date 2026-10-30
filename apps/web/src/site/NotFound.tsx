import { Link } from "react-router";
import { Empty } from "../ui";

export default function NotFound() {
  return (
    <div className="container-page py-16">
      <Empty title="Page not found" text="The page you are looking for does not exist or was moved." action={<Link to="/" className="font-semibold text-brand-700">Go to the home page</Link>} />
    </div>
  );
}

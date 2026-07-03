import { ensureSeed } from "../lib/bootstrap.js";
import Feed from "../components/Feed.jsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Home() {
  // Zero-config: seeds default interests (+ demo videos) and marks onboarded,
  // so the user lands straight on a working feed with nothing to set up.
  ensureSeed();
  return <Feed />;
}

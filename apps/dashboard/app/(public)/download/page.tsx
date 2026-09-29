import type { Metadata } from "next";
import { DownloadView } from "@/modules/download/download-view";

export const metadata: Metadata = {
  title: "Download Agent | HyperCore",
  description:
    "Download the Hypercore Agent installer for Windows.",
};

export default function Page() {
  return <DownloadView />;
}

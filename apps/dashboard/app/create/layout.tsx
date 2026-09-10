import { CreateLayout } from "@/modules/create/create-layout";

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <CreateLayout>{children}</CreateLayout>;
}

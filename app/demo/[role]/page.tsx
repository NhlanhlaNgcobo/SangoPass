import { notFound } from "next/navigation";
import DemoWorkspace from "@/components/demo/DemoWorkspace";
import { PERSONAS } from "@/lib/demo/world";

export const metadata = {
  title: "SangoPass demo workspace",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return PERSONAS.map((persona) => ({ role: persona.role }));
}

export default async function DemoRolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const persona = PERSONAS.find((p) => p.role === role);
  if (!persona) notFound();
  return <DemoWorkspace persona={persona} />;
}

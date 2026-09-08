import RecoveryForm from "@/components/workspace/RecoveryForm";
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <RecoveryForm token={(await searchParams).token || "invalid"} />;
}

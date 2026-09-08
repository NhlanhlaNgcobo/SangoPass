import AuthForm from "@/components/workspace/AuthForm";
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <AuthForm mode="join" token={(await searchParams).token || ""} />;
}

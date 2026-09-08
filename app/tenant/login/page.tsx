import AuthForm from "@/components/workspace/AuthForm";
export const metadata = { title: "Tenant sign in | SangoPass" };
export default async function TenantLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  return (
    <AuthForm
      mode="tenant-login"
      propertyCode={(await searchParams).property || ""}
    />
  );
}

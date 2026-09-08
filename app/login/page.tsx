import AuthForm from "@/components/workspace/AuthForm";
import { demoMode } from "@/lib/server/config";
export default function LoginPage() {
  return <AuthForm mode="login" showcase={demoMode()} />;
}

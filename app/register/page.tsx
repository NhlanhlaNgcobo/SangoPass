import AuthForm from "@/components/workspace/AuthForm";
import { demoMode } from "@/lib/server/config";
export default function RegisterPage() {
  return <AuthForm mode="register" showcase={demoMode()} />;
}

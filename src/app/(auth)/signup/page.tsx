import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Criar conta" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return <AuthForm mode="signup" />;
}

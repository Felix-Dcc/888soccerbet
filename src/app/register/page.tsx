import { RegisterForm } from "./RegisterForm";
import { nigeriaOpen } from "@/lib/wallet";

export const dynamic = "force-dynamic"; // Nigeria opens when an admin sets the Naira rate

export default async function RegisterPage() {
  return <RegisterForm nigeria={await nigeriaOpen()} />;
}

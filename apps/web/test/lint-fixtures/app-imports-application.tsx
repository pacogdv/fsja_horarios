import { login } from "@/application/auth/login";
import { createContainer } from "@/lib/container";

export default function Page() {
  return <p>{String(login)}{String(createContainer)}</p>;
}

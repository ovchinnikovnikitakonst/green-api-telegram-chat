import { useState } from "react";
import type { Credentials } from "./types";
import { CredentialsForm } from "./components/CredentialsForm";
import { Messenger } from "./components/Messenger";

export default function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  return credentials ? (
    <Messenger
      credentials={credentials}
      onDisconnect={() => setCredentials(null)}
    />
  ) : (
    <CredentialsForm onConnect={setCredentials} />
  );
}

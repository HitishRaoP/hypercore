import { Link, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Input } from "./ui/Input";
export function RegistrationForm({
  onRegister,
}: {
  onRegister: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("http://127.0.0.1:8080");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await onRegister(url);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-sm font-medium text-zinc-100">
          Register this node
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Join a coordinator to begin scheduling workloads. No API keys or
          broker credentials needed — the agent opens an outbound event
          stream to the coordinator.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs text-zinc-400">
          <span className="mb-2 flex items-center gap-2">
            <Link className="size-3.5" />
            Coordinator URL
          </span>
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
        </label>
        <Button loading={loading} className="w-full" type="submit">
          <Send className="size-3.5" />
          {loading ? "Negotiating handshake…" : "Register Node"}
        </Button>
      </form>
    </Card>
  );
}
